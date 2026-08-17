import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  writeBatch,
  serverTimestamp,
  onSnapshot
} from "firebase/firestore";
import { db, auth as firebaseAuth } from "./firebase";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord, MorningDelayRecord, RegisteredUser } from "./types";

// Active user proxy for unauthenticated direct links
let activeUserProxy: any = null;

export function setActiveUser(user: any) {
  activeUserProxy = user;
}

export function getEffectiveUidAndEmail(): { uid: string; email: string; isGuest?: boolean } {
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  let ownerParam = urlParams?.get("owner");
  if (!ownerParam && typeof window !== "undefined" && window.location.hash.includes("owner=")) {
    const hashIndex = window.location.hash.indexOf("?");
    if (hashIndex !== -1) {
      const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
      ownerParam = hashParams.get("owner");
    }
  }

  if (ownerParam) {
    const isOwnerMyself = firebaseAuth.currentUser && firebaseAuth.currentUser.uid === ownerParam;
    return {
      uid: ownerParam,
      email: isOwnerMyself ? (firebaseAuth.currentUser?.email?.toLowerCase() || `owner_${ownerParam}@school.com`) : `owner_${ownerParam}@school.com`,
      isGuest: !isOwnerMyself
    };
  }

  if (firebaseAuth.currentUser) {
    return {
      uid: firebaseAuth.currentUser.uid,
      email: firebaseAuth.currentUser.email?.toLowerCase() || "",
      isGuest: false
    };
  }

  if (activeUserProxy && activeUserProxy.uid) {
    return {
      uid: activeUserProxy.uid,
      email: activeUserProxy.email?.toLowerCase() || `owner_${activeUserProxy.uid}@school.com`,
      isGuest: !!activeUserProxy.isGuest
    };
  }

  // Check stored ID in localStorage so write operations never fail
  if (typeof window !== "undefined") {
    let stored = localStorage.getItem("own_school_admin_id");
    if (!stored) {
      stored = "school_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("own_school_admin_id", stored);
    }
    return {
      uid: stored,
      email: `owner_${stored}@school.com`,
      isGuest: true
    };
  }

  return {
    uid: "school_default",
    email: "owner_school_default@school.com",
    isGuest: true
  };
}

// Auth proxy returning actual or effective user
const auth = {
  get currentUser() {
    const eff = getEffectiveUidAndEmail();
    if (eff) {
      return {
        uid: eff.uid,
        email: eff.email,
        displayName: activeUserProxy?.displayName || firebaseAuth.currentUser?.displayName || "زائر (مباشر)"
      };
    }
    return null;
  }
};

// Collection Names
const GRADES_COLL = "grades";
const CLASSES_COLL = "classes";
const TEACHERS_COLL = "teachers";
const STUDENTS_COLL = "students";
const ATTENDANCE_COLL = "attendance";
const BEHAVIORS_COLL = "behaviors";
const MORNING_DELAYS_COLL = "morning_delays";
const SETTINGS_COLL = "settings";
const USERS_COLL = "registered_users";

// --- ROBUST LOCAL CACHE & SYNC ENGINE ---
function getLocalStorageKey(colName: string): string {
  return `school_offline_cache_${colName}`;
}

function getLocalItems(colName: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(colName));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setLocalItems(colName: string, items: any[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getLocalStorageKey(colName), JSON.stringify(items));
  } catch (e) {}
}

function saveOrUpdateLocalItem(colName: string, item: any) {
  const items = getLocalItems(colName);
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else {
    items.push(item);
  }
  setLocalItems(colName, items);
}

function removeLocalItem(colName: string, id: string) {
  const items = getLocalItems(colName);
  const filtered = items.filter(i => i.id !== id);
  setLocalItems(colName, filtered);
}

function removeLocalItemsBy(colName: string, predicate: (item: any) => boolean) {
  const items = getLocalItems(colName);
  const filtered = items.filter(i => !predicate(i));
  setLocalItems(colName, filtered);
}

function generateLocalId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to check if a document belongs to a specific user/school (strict multi-tenant isolation)
export function isDocBelongingToUser(data: any, currentUid: string, currentEmail: string): boolean {
  if (!data) return false;
  const docUid = data.userId ? String(data.userId).trim() : "";
  const docEmail = data.userEmail ? String(data.userEmail).trim().toLowerCase() : "";
  const cUid = currentUid ? String(currentUid).trim() : "";
  const cEmail = currentEmail ? String(currentEmail).trim().toLowerCase() : "";

  // 1. Primary Email Match: If both have an email and they match, it belongs to the school account!
  if (docEmail && cEmail && docEmail === cEmail) {
    return true;
  }

  // 2. Primary UID Match: If document has a userId, and it matches currentUid
  if (docUid && cUid && (docUid === cUid || docUid.toLowerCase() === cUid.toLowerCase())) {
    return true;
  }

  // 3. Fallback if currentUid is formatted as an email (e.g. owner=school@mail.com)
  if (docEmail && cUid && cUid.includes("@") && docEmail === cUid.toLowerCase()) {
    return true;
  }

  // 4. Fallback if docUid is an email string matching currentEmail
  if (docUid && cEmail && docUid.includes("@") && docUid.toLowerCase() === cEmail) {
    return true;
  }

  return false;
}

// Helper to fetch entire collection and filter client-side based on strict multi-tenant user isolation
async function fetchAndFilterCollection(colName: string): Promise<any[]> {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email?.toLowerCase() || "";

  // Load from local storage cache first
  const localList = getLocalItems(colName).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));

  try {
    const querySnapshot = await getDocs(collection(db, colName));
    const results: any[] = [];
    const seenIds = new Set<string>();
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (isDocBelongingToUser(data, currentUid, currentEmail) && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        results.push({ id: docSnap.id, ...data });
      }
    });

    // Merge any locally created items that haven't been deleted
    localList.forEach(localItem => {
      if (!seenIds.has(localItem.id)) {
        results.push(localItem);
        seenIds.add(localItem.id);
      }
    });

    // Update local cache with latest full list
    setLocalItems(colName, results);

    return results;
  } catch (err: any) {
    // Graceful fallback to local cache on permission denial or offline
    return localList;
  }
}

// Fetch All Grades
export async function getGrades(): Promise<Grade[]> {
  const rawGrades = (await fetchAndFilterCollection(GRADES_COLL)) as Grade[];
  const seen = new Set<string>();
  const uniqueGrades: Grade[] = [];
  for (const g of rawGrades) {
    if (!g || !g.id) continue;
    const key = g.name?.trim();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueGrades.push(g);
    }
  }
  return uniqueGrades;
}

// Fetch All Classes
export async function getClasses(): Promise<Class[]> {
  const rawClasses = (await fetchAndFilterCollection(CLASSES_COLL)) as Class[];
  const seen = new Set<string>();
  const uniqueClasses: Class[] = [];
  for (const c of rawClasses) {
    if (!c || !c.id) continue;
    const key = `${c.gradeId}_${c.name?.trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueClasses.push(c);
    }
  }
  return uniqueClasses;
}

// Fetch All Teachers
export async function getTeachers(): Promise<Teacher[]> {
  return fetchAndFilterCollection(TEACHERS_COLL) as Promise<Teacher[]>;
}

// Fetch All Students
export async function getStudents(): Promise<Student[]> {
  return fetchAndFilterCollection(STUDENTS_COLL) as Promise<Student[]>;
}

// Fetch Students by Grade and Class
export async function getStudentsByClass(gradeId: string, classId: string): Promise<Student[]> {
  const students = await fetchAndFilterCollection(STUDENTS_COLL);
  return students.filter(s => s.gradeId === gradeId && s.classId === classId) as Student[];
}

// Fetch Attendance Record for a specific date, period, grade, class
export async function getAttendanceRecord(
  date: string,
  period: string,
  gradeId: string,
  classId: string
): Promise<AttendanceRecord | null> {
  const records = await fetchAndFilterCollection(ATTENDANCE_COLL);
  const found = records.find(r => r.date === date && r.period === period && r.gradeId === gradeId && r.classId === classId);
  return found ? (found as AttendanceRecord) : null;
}

// Subscribe to a specific Attendance Record in real-time
export function subscribeToAttendanceRecord(
  date: string,
  period: string,
  gradeId: string,
  classId: string,
  callback: (record: AttendanceRecord | null) => void,
  onError?: (error: any) => void
) {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  const localList = getLocalItems(ATTENDANCE_COLL).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
  const initial = localList.find(r => r.date === date && r.period === period && r.gradeId === gradeId && r.classId === classId) || null;
  callback(initial);

  try {
    const q = collection(db, ATTENDANCE_COLL);
    return onSnapshot(q, (snapshot) => {
      let found: AttendanceRecord | null = null;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (isDocBelongingToUser(data, currentUid, currentEmail) && data.date === date && data.period === period && data.gradeId === gradeId && data.classId === classId) {
          found = { id: docSnap.id, ...data } as AttendanceRecord;
        }
      });
      callback(found);
    }, (err) => {
      if (onError) onError(err);
    });
  } catch (e) {
    return () => {};
  }
}

// Save Attendance Record
export async function saveAttendanceRecord(record: Omit<AttendanceRecord, "id" | "timestamp">): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  
  // Check if a record already exists for this slot
  const existing = await getAttendanceRecord(record.date, record.period, record.gradeId, record.classId);
  const recordId = existing?.id || generateLocalId("att");

  const fullRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now()
  };

  // 1. Save to local storage cache immediately
  saveOrUpdateLocalItem(ATTENDANCE_COLL, fullRecord);

  // 2. Persist to Firestore
  try {
    if (existing) {
      const docRef = doc(db, ATTENDANCE_COLL, existing.id);
      await setDoc(docRef, {
        ...record,
        userId: uid,
        userEmail: email,
        timestamp: serverTimestamp()
      }, { merge: true });
    } else {
      const collRef = collection(db, ATTENDANCE_COLL);
      await addDoc(collRef, {
        ...record,
        userId: uid,
        userEmail: email,
        timestamp: serverTimestamp()
      });
    }
  } catch (err: any) {
    // Firestore error gracefully handled - local cache is already saved
  }
}

// Fetch Behavior Records for a student
export async function getBehaviorRecords(studentId: string): Promise<BehaviorRecord[]> {
  const records = await fetchAndFilterCollection(BEHAVIORS_COLL);
  const filtered = records.filter(r => r.studentId === studentId) as BehaviorRecord[];
  return filtered.sort((a, b) => b.date.localeCompare(a.date));
}

// Subscribe to Behavior Records for a student in real-time
export function subscribeToBehaviorRecords(
  studentId: string,
  callback: (records: BehaviorRecord[]) => void,
  onError?: (error: any) => void
) {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  const localList = getLocalItems(BEHAVIORS_COLL).filter(item => isDocBelongingToUser(item, currentUid, currentEmail) && item.studentId === studentId);
  localList.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  callback(localList);

  try {
    const q = collection(db, BEHAVIORS_COLL);
    return onSnapshot(q, (snapshot) => {
      const records: BehaviorRecord[] = [];
      const seenIds = new Set<string>();
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (isDocBelongingToUser(data, currentUid, currentEmail) && data.studentId === studentId && !seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          records.push({ id: docSnap.id, ...data } as BehaviorRecord);
        }
      });
      records.sort((a, b) => b.date.localeCompare(a.date));
      callback(records);
    }, (err) => {
      if (onError) onError(err);
    });
  } catch (e) {
    return () => {};
  }
}

// Save Behavior Record
export async function saveBehaviorRecord(record: Omit<BehaviorRecord, "id" | "timestamp">): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const newId = generateLocalId("beh");

  const fullRecord = {
    ...record,
    id: newId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now()
  };

  saveOrUpdateLocalItem(BEHAVIORS_COLL, fullRecord);

  try {
    const collRef = collection(db, BEHAVIORS_COLL);
    const docRef = await addDoc(collRef, {
      ...record,
      userId: uid,
      userEmail: email,
      timestamp: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    return newId;
  }
}

// Delete Behavior Record
export async function deleteBehaviorRecord(id: string): Promise<void> {
  removeLocalItem(BEHAVIORS_COLL, id);
  try {
    await deleteDoc(doc(db, BEHAVIORS_COLL, id));
  } catch (err) {}
}

// --- MORNING DELAY (التأخر الصباحي) ---

// Fetch Morning Delay Records (optionally filtered by date)
export async function getMorningDelayRecords(date?: string): Promise<MorningDelayRecord[]> {
  const records = (await fetchAndFilterCollection(MORNING_DELAYS_COLL)) as MorningDelayRecord[];
  if (date) {
    return records.filter(r => r.date === date).sort((a, b) => (b.arrivalTime || "").localeCompare(a.arrivalTime || ""));
  }
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

// Subscribe to Morning Delay Records in real-time
export function subscribeToMorningDelayRecords(
  date: string | undefined,
  callback: (records: MorningDelayRecord[]) => void,
  onError?: (error: any) => void
) {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  const localList = getLocalItems(MORNING_DELAYS_COLL).filter(item => isDocBelongingToUser(item, currentUid, currentEmail) && (!date || item.date === date));
  localList.sort((a, b) => {
    if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
    return (b.arrivalTime || "").localeCompare(a.arrivalTime || "");
  });
  callback(localList);

  try {
    const q = collection(db, MORNING_DELAYS_COLL);
    return onSnapshot(q, (snapshot) => {
      const records: MorningDelayRecord[] = [];
      const seenIds = new Set<string>();
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (isDocBelongingToUser(data, currentUid, currentEmail) && (!date || data.date === date) && !seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          records.push({ id: docSnap.id, ...data } as MorningDelayRecord);
        }
      });
      records.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.arrivalTime || "").localeCompare(a.arrivalTime || "");
      });
      callback(records);
    }, (err) => {
      if (onError) onError(err);
    });
  } catch (e) {
    return () => {};
  }
}

// Save Morning Delay Record
export async function saveMorningDelayRecord(record: Omit<MorningDelayRecord, "id" | "timestamp">): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  
  const existingRecords = await getMorningDelayRecords(record.date);
  const existing = existingRecords.find(r => r.studentId === record.studentId);
  const recordId = existing?.id || generateLocalId("delay");

  const fullRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now()
  };

  saveOrUpdateLocalItem(MORNING_DELAYS_COLL, fullRecord);

  try {
    if (existing) {
      const docRef = doc(db, MORNING_DELAYS_COLL, existing.id);
      await setDoc(docRef, {
        ...record,
        userId: uid,
        userEmail: email,
        timestamp: serverTimestamp()
      }, { merge: true });
      return existing.id;
    }

    const collRef = collection(db, MORNING_DELAYS_COLL);
    const docRef = await addDoc(collRef, {
      ...record,
      userId: uid,
      userEmail: email,
      timestamp: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    return recordId;
  }
}

// Save Multiple Morning Delay Records in Batch
export async function saveMorningDelaysBatch(records: Omit<MorningDelayRecord, "id" | "timestamp">[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  // Local cache update
  records.forEach(r => {
    saveOrUpdateLocalItem(MORNING_DELAYS_COLL, {
      ...r,
      id: generateLocalId("delay"),
      userId: uid,
      userEmail: email,
      timestamp: Date.now()
    });
  });

  try {
    const batch = writeBatch(db);
    for (const record of records) {
      const docRef = doc(collection(db, MORNING_DELAYS_COLL));
      batch.set(docRef, {
        ...record,
        userId: uid,
        userEmail: email,
        timestamp: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (err) {}
}

// Delete Morning Delay Record
export async function deleteMorningDelayRecord(id: string): Promise<void> {
  removeLocalItem(MORNING_DELAYS_COLL, id);
  try {
    await deleteDoc(doc(db, MORNING_DELAYS_COLL, id));
  } catch (err) {}
}

// Fetch all morning delay records for stats/reports
export async function getAllMorningDelayRecords(): Promise<MorningDelayRecord[]> {
  return fetchAndFilterCollection(MORNING_DELAYS_COLL) as Promise<MorningDelayRecord[]>;
}

// Subscribe to all morning delay records
export function subscribeToAllMorningDelayRecords(callback: (records: MorningDelayRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(MORNING_DELAYS_COLL, (records) => {
    records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    callback(records);
  }, onError);
}

// --- ADMIN WRITES ---

// Add Grade
export async function addGrade(name: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const existingGrades = await getGrades();
  const trimmedName = name.trim();
  const existing = existingGrades.find(g => g.name?.trim() === trimmedName);
  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("grd");
  const newGradeObj = {
    id: generatedId,
    name: trimmedName,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  // 1. Immediately write to local storage cache
  saveOrUpdateLocalItem(GRADES_COLL, newGradeObj);

  // 2. Persist to Firestore
  try {
    const docRef = await addDoc(collection(db, GRADES_COLL), { 
      name: trimmedName,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
    // Update local item with Firestore ID if different
    if (docRef.id !== generatedId) {
      removeLocalItem(GRADES_COLL, generatedId);
      saveOrUpdateLocalItem(GRADES_COLL, { ...newGradeObj, id: docRef.id });
    }
    return docRef.id;
  } catch (err: any) {
    // Firestore error gracefully caught, local cache preserves the grade!
    return generatedId;
  }
}

// Add Multiple Grades in a Batch
export async function addGradesBatch(names: string[]): Promise<{ id: string; name: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const existingGrades = await getGrades();
  const existingMap = new Map<string, string>();
  existingGrades.forEach(g => {
    if (g.name) existingMap.set(g.name.trim(), g.id);
  });

  const results: { id: string; name: string }[] = [];
  const toCreate: { id: string; name: string }[] = [];

  names.forEach(rawName => {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    if (existingMap.has(trimmed)) {
      results.push({ id: existingMap.get(trimmed)!, name: trimmed });
    } else {
      const generatedId = generateLocalId("grd");
      const gradeItem = { id: generatedId, name: trimmed };
      results.push(gradeItem);
      toCreate.push(gradeItem);
      // Save locally
      saveOrUpdateLocalItem(GRADES_COLL, {
        id: generatedId,
        name: trimmed,
        userId: uid,
        userEmail: email,
        createdAt: Date.now()
      });
    }
  });

  if (toCreate.length > 0) {
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      toCreate.forEach((item, idx) => {
        const docRef = doc(collection(db, GRADES_COLL));
        batch.set(docRef, {
          name: item.name,
          userId: uid,
          userEmail: email,
          createdAt: now + idx
        });
      });
      await batch.commit();
    } catch (err: any) {
      // Local cache already holds the grades safely
    }
  }

  return results;
}

// Delete Grade
export async function deleteGrade(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  // 1. Delete from local storage cache immediately
  removeLocalItem(GRADES_COLL, id);
  removeLocalItemsBy(CLASSES_COLL, (c) => c.gradeId === id);
  removeLocalItemsBy(STUDENTS_COLL, (s) => s.gradeId === id);

  // 2. Delete from Firestore
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, GRADES_COLL, id));
    
    // Clean up associated classes
    const classesQuery = query(collection(db, CLASSES_COLL), where("gradeId", "==", id));
    const classesSnap = await getDocs(classesQuery);
    classesSnap.docs.forEach(cDoc => {
      batch.delete(doc(db, CLASSES_COLL, cDoc.id));
    });

    // Clean up associated students
    const studentsQuery = query(collection(db, STUDENTS_COLL), where("gradeId", "==", id));
    const studentsSnap = await getDocs(studentsQuery);
    studentsSnap.docs.forEach(sDoc => {
      batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
    });

    await batch.commit();
  } catch (err: any) {}
}

// Add Class
export async function addClass(name: string, gradeId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const existingClasses = await getClasses();
  const trimmedName = name.trim();
  const existing = existingClasses.find(c => c.gradeId === gradeId && c.name?.trim() === trimmedName);
  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("cls");
  const newClassObj = {
    id: generatedId,
    name: trimmedName,
    gradeId,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(CLASSES_COLL, newClassObj);

  try {
    const docRef = await addDoc(collection(db, CLASSES_COLL), { 
      name: trimmedName, 
      gradeId, 
      userId: uid,
      userEmail: email
    });
    if (docRef.id !== generatedId) {
      removeLocalItem(CLASSES_COLL, generatedId);
      saveOrUpdateLocalItem(CLASSES_COLL, { ...newClassObj, id: docRef.id });
    }
    return docRef.id;
  } catch (err: any) {
    return generatedId;
  }
}

// Add Multiple Classes in a Batch (Ultra-fast atomic save)
export async function addClassesBatch(classesList: { name: string; gradeId: string }[]): Promise<{ id: string; name: string; gradeId: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const existingClasses = await getClasses();
  const existingKeySet = new Set<string>();
  existingClasses.forEach(c => {
    if (c.name && c.gradeId) existingKeySet.add(`${c.gradeId}__${c.name.trim()}`);
  });

  const results: { id: string; name: string; gradeId: string }[] = [];
  const toCreate: { id: string; name: string; gradeId: string }[] = [];

  classesList.forEach(item => {
    const trimmed = item.name.trim();
    if (!trimmed || !item.gradeId) return;
    const key = `${item.gradeId}__${trimmed}`;
    if (existingKeySet.has(key)) {
      const match = existingClasses.find(c => c.gradeId === item.gradeId && c.name?.trim() === trimmed);
      if (match) results.push({ id: match.id, name: trimmed, gradeId: item.gradeId });
    } else {
      const generatedId = generateLocalId("cls");
      const classObj = { id: generatedId, name: trimmed, gradeId: item.gradeId };
      results.push(classObj);
      toCreate.push(classObj);

      // Save locally immediately
      saveOrUpdateLocalItem(CLASSES_COLL, {
        id: generatedId,
        name: trimmed,
        gradeId: item.gradeId,
        userId: uid,
        userEmail: email,
        createdAt: Date.now()
      });
    }
  });

  if (toCreate.length > 0) {
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      toCreate.forEach((c, idx) => {
        const docRef = doc(collection(db, CLASSES_COLL));
        batch.set(docRef, {
          name: c.name,
          gradeId: c.gradeId,
          userId: uid,
          userEmail: email,
          createdAt: now + idx
        });
      });
      await batch.commit();
    } catch (err: any) {}
  }

  return results;
}

// Delete Class
export async function deleteClass(id: string): Promise<void> {
  removeLocalItem(CLASSES_COLL, id);
  removeLocalItemsBy(STUDENTS_COLL, (s) => s.classId === id);

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, CLASSES_COLL, id));
    
    const studentsQuery = query(collection(db, STUDENTS_COLL), where("classId", "==", id));
    const studentsSnap = await getDocs(studentsQuery);
    studentsSnap.docs.forEach(sDoc => {
      batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
    });
    
    await batch.commit();
  } catch (err: any) {}
}

// Add Teacher
export async function addTeacher(name: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const generatedId = generateLocalId("tch");

  const newTeacherObj = {
    id: generatedId,
    name: name.trim(),
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(TEACHERS_COLL, newTeacherObj);

  try {
    const docRef = await addDoc(collection(db, TEACHERS_COLL), { 
      name: name.trim(), 
      userId: uid,
      userEmail: email
    });
    if (docRef.id !== generatedId) {
      removeLocalItem(TEACHERS_COLL, generatedId);
      saveOrUpdateLocalItem(TEACHERS_COLL, { ...newTeacherObj, id: docRef.id });
    }
    return docRef.id;
  } catch (err: any) {
    return generatedId;
  }
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  names.forEach(name => {
    saveOrUpdateLocalItem(TEACHERS_COLL, {
      id: generateLocalId("tch"),
      name: name.trim(),
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  try {
    const batch = writeBatch(db);
    names.forEach(name => {
      const docRef = doc(collection(db, TEACHERS_COLL));
      batch.set(docRef, { 
        name: name.trim(), 
        userId: uid,
        userEmail: email
      });
    });
    await batch.commit();
  } catch (err: any) {}
}

// Delete Teacher
export async function deleteTeacher(id: string): Promise<void> {
  removeLocalItem(TEACHERS_COLL, id);
  try {
    await deleteDoc(doc(db, TEACHERS_COLL, id));
  } catch (err: any) {}
}

// Delete Multiple Teachers in a Batch
export async function deleteTeachersBatch(ids: string[]): Promise<void> {
  ids.forEach(id => removeLocalItem(TEACHERS_COLL, id));
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, TEACHERS_COLL, id));
    });
    await batch.commit();
  } catch (err: any) {}
}

// Add Student
export async function addStudent(name: string, gradeId: string, classId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const generatedId = generateLocalId("stu");

  const newStudentObj = {
    id: generatedId,
    name: name.trim(),
    gradeId,
    classId,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(STUDENTS_COLL, newStudentObj);

  try {
    const docRef = await addDoc(collection(db, STUDENTS_COLL), { 
      name: name.trim(), 
      gradeId, 
      classId, 
      userId: uid,
      userEmail: email
    });
    if (docRef.id !== generatedId) {
      removeLocalItem(STUDENTS_COLL, generatedId);
      saveOrUpdateLocalItem(STUDENTS_COLL, { ...newStudentObj, id: docRef.id });
    }
    return docRef.id;
  } catch (err: any) {
    return generatedId;
  }
}

// Add Multiple Students in a Batch
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  studentsList.forEach(s => {
    saveOrUpdateLocalItem(STUDENTS_COLL, {
      id: generateLocalId("stu"),
      name: s.name.trim(),
      gradeId: s.gradeId,
      classId: s.classId,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  try {
    const batch = writeBatch(db);
    studentsList.forEach(s => {
      const docRef = doc(collection(db, STUDENTS_COLL));
      batch.set(docRef, { 
        name: s.name.trim(), 
        gradeId: s.gradeId, 
        classId: s.classId, 
        userId: uid,
        userEmail: email
      });
    });
    await batch.commit();
  } catch (err: any) {}
}

// Delete Student
export async function deleteStudent(id: string): Promise<void> {
  removeLocalItem(STUDENTS_COLL, id);
  try {
    await deleteDoc(doc(db, STUDENTS_COLL, id));
  } catch (err: any) {}
}

// Delete Multiple Students in a Batch
export async function deleteStudentsBatch(ids: string[]): Promise<void> {
  ids.forEach(id => removeLocalItem(STUDENTS_COLL, id));
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, STUDENTS_COLL, id));
    });
    await batch.commit();
  } catch (err: any) {}
}

// Fetch all attendance for statistics
export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  return fetchAndFilterCollection(ATTENDANCE_COLL) as Promise<AttendanceRecord[]>;
}

// Subscribe to all attendance for real-time statistics
export function subscribeToAllAttendanceRecords(callback: (records: AttendanceRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(ATTENDANCE_COLL, callback, onError);
}

// Fetch all behavior records for statistics
export async function getAllBehaviorRecords(): Promise<BehaviorRecord[]> {
  return fetchAndFilterCollection(BEHAVIORS_COLL) as Promise<BehaviorRecord[]>;
}

// Subscribe to all behavior records for real-time statistics
export function subscribeToAllBehaviorRecords(callback: (records: BehaviorRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(BEHAVIORS_COLL, callback, onError);
}

// --- DATABASE AUTO-SEEDING ---
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  return false;
}

// --- SCHOOL SETTINGS ---
export async function getSchoolName(): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  if (!eff) return "";
  const uid = eff.uid;
  const email = eff.email;
  
  if (typeof window !== "undefined") {
    const localName = localStorage.getItem(`school_name_${uid}`) || localStorage.getItem(`school_name_${email}`);
    if (localName) return localName;
  }

  try {
    const querySnapshot = await getDocs(collection(db, SETTINGS_COLL));
    let schoolNameVal = "";
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (isDocBelongingToUser(data, uid, email) && data.schoolName) {
        schoolNameVal = data.schoolName;
      }
    });
    if (schoolNameVal && typeof window !== "undefined") {
      localStorage.setItem(`school_name_${uid}`, schoolNameVal);
    }
    return schoolNameVal;
  } catch (err) {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`school_name_${uid}`) || "";
    }
  }
  return "";
}

export async function saveSchoolName(schoolName: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff?.uid || auth.currentUser?.uid;
  const email = eff?.email || auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) return;

  if (typeof window !== "undefined") {
    localStorage.setItem(`school_name_${uid}`, schoolName);
    if (email) localStorage.setItem(`school_name_${email}`, schoolName);
  }

  try {
    const q = query(collection(db, SETTINGS_COLL), where("userId", "==", uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docRef = doc(db, SETTINGS_COLL, querySnapshot.docs[0].id);
      await setDoc(docRef, { schoolName, userId: uid, userEmail: email }, { merge: true });
    } else {
      const qEmail = query(collection(db, SETTINGS_COLL), where("userEmail", "==", email));
      const emailSnapshot = await getDocs(qEmail);
      if (!emailSnapshot.empty) {
        const docRef = doc(db, SETTINGS_COLL, emailSnapshot.docs[0].id);
        await setDoc(docRef, { schoolName, userId: uid, userEmail: email }, { merge: true });
      } else {
        await addDoc(collection(db, SETTINGS_COLL), { schoolName, userId: uid, userEmail: email });
      }
    }
  } catch (err) {}
}

// Generic live subscription helper matching fetchAndFilterCollection logic
function subscribeToCollection(colName: string, callback: (data: any[]) => void, onError?: (error: any) => void) {
  const eff = getEffectiveUidAndEmail();
  if (!eff) {
    callback([]);
    return () => {};
  }
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  // Immediately emit cached items so UI is instantly populated
  const localList = getLocalItems(colName).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
  if (localList.length > 0) {
    callback(localList);
  }

  try {
    const q = collection(db, colName);
    return onSnapshot(q, (snapshot) => {
      const results: any[] = [];
      const seenIds = new Set<string>();
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (isDocBelongingToUser(data, currentUid, currentEmail) && !seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          results.push({ id: docSnap.id, ...data });
        }
      });
      // Merge with any local cache items
      const currentLocals = getLocalItems(colName).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
      currentLocals.forEach(l => {
        if (!seenIds.has(l.id)) {
          results.push(l);
          seenIds.add(l.id);
        }
      });
      setLocalItems(colName, results);
      callback(results);
    }, (error) => {
      // On permission or network error, fallback silently to local cache without crashing UI
      const fallbackList = getLocalItems(colName).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
      callback(fallbackList);
      if (onError) onError(error);
    });
  } catch (err) {
    callback(localList);
    return () => {};
  }
}

// Subscribe All Grades in real-time
export function subscribeToGrades(callback: (grades: Grade[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(GRADES_COLL, (rawGrades) => {
    const seen = new Set<string>();
    const uniqueGrades: Grade[] = [];
    for (const g of rawGrades) {
      if (!g || !g.id) continue;
      const key = g.name?.trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueGrades.push(g);
      }
    }
    callback(uniqueGrades);
  }, onError);
}

// Subscribe All Classes in real-time
export function subscribeToClasses(callback: (classes: Class[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(CLASSES_COLL, (rawClasses) => {
    const seen = new Set<string>();
    const uniqueClasses: Class[] = [];
    for (const c of rawClasses) {
      if (!c || !c.id) continue;
      const key = `${c.gradeId}_${c.name?.trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueClasses.push(c);
      }
    }
    callback(uniqueClasses);
  }, onError);
}

// Subscribe All Teachers in real-time
export function subscribeToTeachers(callback: (teachers: Teacher[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(TEACHERS_COLL, callback, onError);
}

// Subscribe All Students in real-time
export function subscribeToStudents(callback: (students: Student[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(STUDENTS_COLL, callback, onError);
}

// Subscribe School Name in real-time
export function subscribeToSchoolName(callback: (schoolName: string) => void, onError?: (error: any) => void) {
  const eff = getEffectiveUidAndEmail();
  if (!eff) {
    callback("");
    return () => {};
  }
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  try {
    const q = collection(db, SETTINGS_COLL);
    return onSnapshot(q, (snapshot) => {
      let schoolNameVal = "";
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (isDocBelongingToUser(data, currentUid, currentEmail) && data.schoolName) {
          schoolNameVal = data.schoolName;
        }
      });
      callback(schoolNameVal);
    }, (err) => {
      if (onError) onError(err);
    });
  } catch (e) {
    return () => {};
  }
}

// --- REGISTERED USERS SYSTEM ---

/**
 * Registers or updates a user profile when they login or state checking occurs.
 */
export async function registerUserInDb(
  user: { uid: string; email: string; displayName?: string; photoURL?: string },
  currentSchoolName: string = ""
): Promise<void> {
  if (!user || !user.uid) return;
  const email = user.email?.toLowerCase() || "";
  if (!email || email === "majedsoft@gmail.com" && user.displayName === "زائر عام") {
    // Skip registering the guest general user
    return;
  }

  try {
    const payload: Partial<RegisteredUser> = {
      uid: user.uid,
      email: email,
      displayName: user.displayName || email.split("@")[0],
      photoURL: user.photoURL || "",
      lastLogin: Date.now(),
      schoolName: currentSchoolName || "",
      status: "نشط",
      createdAt: Date.now()
    };

    saveOrUpdateLocalItem(USERS_COLL, {
      id: user.uid,
      ...payload
    });

    const docRef = doc(db, USERS_COLL, user.uid);
    const docSnap = await getDocs(query(collection(db, USERS_COLL), where("uid", "==", user.uid)));
    
    let existingData: any = null;
    if (!docSnap.empty) {
      existingData = docSnap.docs[0].data();
    }

    if (existingData?.schoolName && !payload.schoolName) {
      payload.schoolName = existingData.schoolName;
    }
    if (existingData?.status) {
      payload.status = existingData.status;
    }
    if (existingData?.createdAt) {
      payload.createdAt = existingData.createdAt;
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    // Handled safely without noisy console errors
  }
}

/**
 * Loads all registered users from Firestore and retrieves statistics/counts of their database items
 */
export async function getRegisteredUsers(): Promise<RegisteredUser[]> {
  try {
    const querySnapshot = await getDocs(collection(db, USERS_COLL));
    const users: RegisteredUser[] = [];
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      users.push({
        id: docSnap.id,
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        photoURL: data.photoURL,
        lastLogin: data.lastLogin || Date.now(),
        createdAt: data.createdAt || Date.now(),
        schoolName: data.schoolName || "",
        status: data.status || "نشط"
      });
    });

    // To provide real statistics for the super admin, let's aggregate counts across all documents!
    // We will query all grades, classes, teachers, and students once and count them grouped by userId/userEmail.
    const [allGrades, allClasses, allTeachers, allStudents] = await Promise.all([
      getDocs(collection(db, GRADES_COLL)),
      getDocs(collection(db, CLASSES_COLL)),
      getDocs(collection(db, TEACHERS_COLL)),
      getDocs(collection(db, STUDENTS_COLL))
    ]);

    // Build user stats map
    const userStatsMap: Record<string, { grades: number; classes: number; teachers: number; students: number }> = {};
    
    const incrementStat = (userId: string, email: string, statType: "grades" | "classes" | "teachers" | "students") => {
      const key = userId || email?.toLowerCase();
      if (!key) return;
      if (!userStatsMap[key]) {
        userStatsMap[key] = { grades: 0, classes: 0, teachers: 0, students: 0 };
      }
      userStatsMap[key][statType]++;
    };

    allGrades.forEach(d => {
      const data = d.data();
      incrementStat(data.userId, data.userEmail, "grades");
    });
    allClasses.forEach(d => {
      const data = d.data();
      incrementStat(data.userId, data.userEmail, "classes");
    });
    allTeachers.forEach(d => {
      const data = d.data();
      incrementStat(data.userId, data.userEmail, "teachers");
    });
    allStudents.forEach(d => {
      const data = d.data();
      incrementStat(data.userId, data.userEmail, "students");
    });

    // Map counts back to each user
    users.forEach(u => {
      const statsByUid = userStatsMap[u.uid];
      const statsByEmail = userStatsMap[u.email?.toLowerCase()];
      const combinedStats = statsByUid || statsByEmail || { grades: 0, classes: 0, teachers: 0, students: 0 };
      
      u.gradesCount = combinedStats.grades;
      u.classesCount = combinedStats.classes;
      u.teachersCount = combinedStats.teachers;
      u.studentsCount = combinedStats.students;
    });

    // Sort by registration date descending (newest first)
    return users.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error("Error loading registered users:", err);
    return [];
  }
}

/**
 * Updates a user's account status (e.g. Suspend or Activate)
 */
export async function updateUserStatus(uid: string, status: "نشط" | "موقوف"): Promise<void> {
  try {
    const docRef = doc(db, USERS_COLL, uid);
    await setDoc(docRef, { status }, { merge: true });
  } catch (err) {
    console.error("Error updating user status:", err);
    throw err;
  }
}

/**
 * Deletes a registered user from the directory, and optionally wipes all their school data entirely.
 */
export async function deleteRegisteredUser(uid: string, email: string, wipeSchoolData: boolean = false): Promise<void> {
  try {
    // 1. Delete user registration document
    await deleteDoc(doc(db, USERS_COLL, uid));

    // 2. If wipe is requested, find and delete all associated records across ALL collections
    if (wipeSchoolData) {
      const batch = writeBatch(db);
      const emailLower = email?.toLowerCase() || "";

      const collectionsToClear = [
        GRADES_COLL,
        CLASSES_COLL,
        TEACHERS_COLL,
        STUDENTS_COLL,
        ATTENDANCE_COLL,
        BEHAVIORS_COLL,
        SETTINGS_COLL
      ];

      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        snap.forEach(docSnap => {
          const data = docSnap.data();
          let belongs = false;

          if (data.userId === uid) belongs = true;
          else if (data.userEmail && data.userEmail.toLowerCase() === emailLower) belongs = true;

          if (belongs) {
            batch.delete(docSnap.ref);
          }
        });
      }

      await batch.commit();
    }
  } catch (err) {
    console.error("Error deleting registered user and wiping data:", err);
    throw err;
  }
}



