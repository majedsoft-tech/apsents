import { 
  collection, 
  doc, 
  getDoc,
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

// In-memory alias cache for UID <-> Email <-> School Name mappings
const userProfileAliasCache = new Map<string, { uid: string; email: string; schoolName?: string }>();

export function setActiveUser(user: any) {
  activeUserProxy = user;
  if (user?.uid && user?.email) {
    userProfileAliasCache.set(user.uid.toLowerCase(), { uid: user.uid, email: user.email.toLowerCase(), schoolName: user.displayName });
    userProfileAliasCache.set(user.email.toLowerCase(), { uid: user.uid, email: user.email.toLowerCase(), schoolName: user.displayName });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`user_alias_${user.uid.toLowerCase()}`, JSON.stringify({ uid: user.uid, email: user.email.toLowerCase() }));
        localStorage.setItem(`user_alias_${user.email.toLowerCase()}`, JSON.stringify({ uid: user.uid, email: user.email.toLowerCase() }));
      } catch (e) {}
    }
  }
}

/**
 * Resolves the effective UID and Email from URL parameters, Firebase auth, or active session.
 */
export function getEffectiveUidAndEmail(): { uid: string; email: string; isGuest?: boolean } {
  let ownerParam: string | null = null;
  let emailParam: string | null = null;
  let schoolParam: string | null = null;

  if (typeof window !== "undefined") {
    // 1. Check window.location.search
    const urlParams = new URLSearchParams(window.location.search);
    ownerParam = urlParams.get("owner") || urlParams.get("ownerId") || urlParams.get("uid");
    emailParam = urlParams.get("email") || urlParams.get("ownerEmail") || urlParams.get("userEmail");
    schoolParam = urlParams.get("school") || urlParams.get("schoolName");

    // 2. Check window.location.hash for query params
    if ((!ownerParam || !emailParam) && window.location.hash.includes("?")) {
      const hashIndex = window.location.hash.indexOf("?");
      const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
      if (!ownerParam) ownerParam = hashParams.get("owner") || hashParams.get("ownerId") || hashParams.get("uid");
      if (!emailParam) emailParam = hashParams.get("email") || hashParams.get("ownerEmail") || hashParams.get("userEmail");
      if (!schoolParam) schoolParam = hashParams.get("school") || hashParams.get("schoolName");
    }
  }

  if (ownerParam || emailParam) {
    const rawOwner = ownerParam ? decodeURIComponent(ownerParam).trim() : "";
    const rawEmail = emailParam ? decodeURIComponent(emailParam).trim().toLowerCase() : "";

    const isOwnerMyself = !!(firebaseAuth.currentUser && (
      (rawOwner && firebaseAuth.currentUser.uid === rawOwner) ||
      (rawEmail && firebaseAuth.currentUser.email?.toLowerCase() === rawEmail)
    ));

    // Try resolving from alias cache or localStorage
    let cachedAlias: { uid: string; email: string } | null = null;
    if (rawOwner) {
      cachedAlias = userProfileAliasCache.get(rawOwner.toLowerCase()) || null;
      if (!cachedAlias && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`user_alias_${rawOwner.toLowerCase()}`);
          if (raw) cachedAlias = JSON.parse(raw);
        } catch (e) {}
      }
    }
    if (!cachedAlias && rawEmail) {
      cachedAlias = userProfileAliasCache.get(rawEmail.toLowerCase()) || null;
      if (!cachedAlias && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`user_alias_${rawEmail.toLowerCase()}`);
          if (raw) cachedAlias = JSON.parse(raw);
        } catch (e) {}
      }
    }

    let resolvedEmail = rawEmail;
    if (!resolvedEmail) {
      if (cachedAlias?.email) {
        resolvedEmail = cachedAlias.email;
      } else if (rawOwner.includes("@")) {
        resolvedEmail = rawOwner.toLowerCase();
      } else if (isOwnerMyself && firebaseAuth.currentUser?.email) {
        resolvedEmail = firebaseAuth.currentUser.email.toLowerCase();
      } else {
        resolvedEmail = `owner_${rawOwner}@school.com`;
      }
    }

    let resolvedUid = rawOwner;
    if (!resolvedUid) {
      if (cachedAlias?.uid) {
        resolvedUid = cachedAlias.uid;
      } else if (rawEmail) {
        resolvedUid = `user_${rawEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      } else if (isOwnerMyself && firebaseAuth.currentUser?.uid) {
        resolvedUid = firebaseAuth.currentUser.uid;
      } else {
        resolvedUid = "school_default";
      }
    }

    // Save alias mapping in memory for fast synchronous lookup
    if (resolvedUid && resolvedEmail && !resolvedEmail.endsWith("@school.com")) {
      userProfileAliasCache.set(resolvedUid.toLowerCase(), { uid: resolvedUid, email: resolvedEmail });
      userProfileAliasCache.set(resolvedEmail.toLowerCase(), { uid: resolvedUid, email: resolvedEmail });
    }

    return {
      uid: resolvedUid,
      email: resolvedEmail,
      isGuest: !isOwnerMyself
    };
  }

  if (firebaseAuth.currentUser) {
    const cUid = firebaseAuth.currentUser.uid;
    const cEmail = firebaseAuth.currentUser.email?.toLowerCase() || "";
    if (cUid && cEmail) {
      userProfileAliasCache.set(cUid.toLowerCase(), { uid: cUid, email: cEmail });
      userProfileAliasCache.set(cEmail.toLowerCase(), { uid: cUid, email: cEmail });
    }
    return {
      uid: cUid,
      email: cEmail,
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
    let linked = localStorage.getItem("linked_school_owner_id");
    if (linked) {
      return {
        uid: linked,
        email: `owner_${linked}@school.com`,
        isGuest: true
      };
    }
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

export function getOrCreateOwnSchoolAdminId(): string {
  if (typeof window !== "undefined") {
    let linked = localStorage.getItem("linked_school_owner_id");
    if (linked) return linked;
    let stored = localStorage.getItem("own_school_admin_id");
    if (!stored) {
      stored = "school_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("own_school_admin_id", stored);
    }
    return stored;
  }
  return "school_default";
}

export function setLinkedSchoolOwnerId(id: string): void {
  if (typeof window !== "undefined" && id) {
    const cleanId = id.trim();
    localStorage.setItem("linked_school_owner_id", cleanId);
    localStorage.setItem("own_school_admin_id", cleanId);
  }
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
function getLocalStorageKey(colName: string, uid?: string): string {
  const currentUid = uid || getEffectiveUidAndEmail().uid;
  return `school_offline_cache_${currentUid || "default"}_${colName}`;
}

function getLocalItems(colName: string, uid?: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(colName, uid));
    if (raw) return JSON.parse(raw);
    
    // Fallback check for legacy un-scoped cache key
    const legacyRaw = localStorage.getItem(`school_offline_cache_${colName}`);
    return legacyRaw ? JSON.parse(legacyRaw) : [];
  } catch (e) {
    return [];
  }
}

export function getLocalCollection<T = any>(colName: string, uid?: string): T[] {
  return getLocalItems(colName, uid) as T[];
}

function setLocalItems(colName: string, items: any[], uid?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getLocalStorageKey(colName, uid), JSON.stringify(items));
  } catch (e) {}
}

function saveOrUpdateLocalItem(colName: string, item: any, uid?: string) {
  const items = getLocalItems(colName, uid);
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...item };
  } else {
    items.push(item);
  }
  setLocalItems(colName, items, uid);
}

function removeLocalItem(colName: string, id: string, uid?: string) {
  const items = getLocalItems(colName, uid);
  const filtered = items.filter(i => i.id !== id);
  setLocalItems(colName, filtered, uid);
}

function removeLocalItemsBy(colName: string, predicate: (item: any) => boolean, uid?: string) {
  const items = getLocalItems(colName, uid);
  const filtered = items.filter(i => !predicate(i));
  setLocalItems(colName, filtered, uid);
}

function generateLocalId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to check if a document belongs to a specific user/school (strict multi-tenant isolation)
export function isDocBelongingToUser(data: any, currentUid: string, currentEmail: string): boolean {
  if (!data) return false;
  const docUid = data.userId ? String(data.userId).trim().toLowerCase() : "";
  const docEmail = data.userEmail ? String(data.userEmail).trim().toLowerCase() : "";
  const cUid = currentUid ? String(currentUid).trim().toLowerCase() : "";
  const cEmail = currentEmail ? String(currentEmail).trim().toLowerCase() : "";

  // 1. Primary UID Match
  if (docUid && cUid && docUid === cUid) {
    return true;
  }

  // 2. Primary Email Match
  if (docEmail && cEmail && docEmail === cEmail) {
    return true;
  }

  // 3. Email/UID Cross Match (e.g., owner param was UID but doc has Email, or owner param was Email but doc has UID)
  if (docEmail && cUid && (docEmail === cUid || docEmail.includes(cUid) || cUid.includes(docEmail))) {
    return true;
  }

  if (docUid && cEmail && (docUid === cEmail || docUid.includes(cEmail) || cEmail.includes(docUid))) {
    return true;
  }

  // 4. In-Memory Alias Cache Match (Resolves Google UID <-> Real Email)
  if (cUid && userProfileAliasCache.has(cUid)) {
    const alias = userProfileAliasCache.get(cUid)!;
    if (docEmail && alias.email && docEmail === alias.email) return true;
    if (docUid && alias.uid && docUid === alias.uid.toLowerCase()) return true;
  }
  if (cEmail && userProfileAliasCache.has(cEmail)) {
    const alias = userProfileAliasCache.get(cEmail)!;
    if (docEmail && alias.email && docEmail === alias.email) return true;
    if (docUid && alias.uid && docUid === alias.uid.toLowerCase()) return true;
  }
  if (docUid && userProfileAliasCache.has(docUid)) {
    const alias = userProfileAliasCache.get(docUid)!;
    if (cEmail && alias.email && cEmail === alias.email) return true;
    if (cUid && alias.uid && cUid === alias.uid.toLowerCase()) return true;
  }
  if (docEmail && userProfileAliasCache.has(docEmail)) {
    const alias = userProfileAliasCache.get(docEmail)!;
    if (cEmail && alias.email && cEmail === alias.email) return true;
    if (cUid && alias.uid && cUid === alias.uid.toLowerCase()) return true;
  }

  // 5. Check URL parameters directly in case state is in transition
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    let urlOwner = (urlParams.get("owner") || urlParams.get("ownerId") || urlParams.get("uid") || "").trim().toLowerCase();
    let urlEmail = (urlParams.get("email") || urlParams.get("ownerEmail") || urlParams.get("userEmail") || "").trim().toLowerCase();

    if ((!urlOwner || !urlEmail) && window.location.hash.includes("?")) {
      const hashIdx = window.location.hash.indexOf("?");
      const hashParams = new URLSearchParams(window.location.hash.substring(hashIdx));
      if (!urlOwner) urlOwner = (hashParams.get("owner") || hashParams.get("ownerId") || hashParams.get("uid") || "").trim().toLowerCase();
      if (!urlEmail) urlEmail = (hashParams.get("email") || hashParams.get("ownerEmail") || hashParams.get("userEmail") || "").trim().toLowerCase();
    }

    if (urlOwner && (docUid === urlOwner || docEmail === urlOwner || docEmail.includes(urlOwner) || docUid.includes(urlOwner))) {
      return true;
    }
    if (urlEmail && (docEmail === urlEmail || docUid === urlEmail || docEmail.includes(urlEmail) || docUid.includes(urlEmail))) {
      return true;
    }
  }

  // 6. If doc has matching school owner id prefix
  if (cUid.startsWith("school_") && (docUid === cUid || docEmail.includes(cUid))) {
    return true;
  }

  return false;
}

/**
 * Resolves the school owner profile from Firestore by UID or Email
 */
export async function resolveOwnerProfileFromDb(ownerIdOrEmail: string): Promise<{ uid: string; email: string; schoolName?: string } | null> {
  if (!ownerIdOrEmail) return null;
  const key = ownerIdOrEmail.trim().toLowerCase();
  
  if (userProfileAliasCache.has(key)) {
    return userProfileAliasCache.get(key)!;
  }

  try {
    // 1. Try querying registered_users by uid
    const qUid = query(collection(db, USERS_COLL), where("uid", "==", ownerIdOrEmail));
    const snapUid = await getDocs(qUid);
    if (!snapUid.empty) {
      const data = snapUid.docs[0].data();
      const profile = {
        uid: data.uid || ownerIdOrEmail,
        email: data.email?.toLowerCase() || "",
        schoolName: data.schoolName || ""
      };
      if (profile.uid) {
        userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      if (profile.email) {
        userProfileAliasCache.set(profile.email.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      return profile;
    }

    // 2. Try querying registered_users by email
    if (ownerIdOrEmail.includes("@")) {
      const qEmail = query(collection(db, USERS_COLL), where("email", "==", key));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const data = snapEmail.docs[0].data();
        const profile = {
          uid: data.uid || "",
          email: data.email?.toLowerCase() || key,
          schoolName: data.schoolName || ""
        };
        if (profile.uid) {
          userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
          try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
        }
        if (profile.email) {
          userProfileAliasCache.set(profile.email.toLowerCase(), profile);
          try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
        }
        return profile;
      }
    }

    // 3. Try checking settings document (e.g., settings_QgOSyBcP28MzmbJT92aH8vdgAG33)
    const settingsDoc = await getDoc(doc(db, SETTINGS_COLL, `settings_${ownerIdOrEmail}`));
    if (settingsDoc.exists()) {
      const sData = settingsDoc.data();
      const profile = {
        uid: sData.userId || ownerIdOrEmail,
        email: sData.userEmail?.toLowerCase() || "",
        schoolName: sData.schoolName || ""
      };
      if (profile.uid) {
        userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      if (profile.email) {
        userProfileAliasCache.set(profile.email.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      return profile;
    }
  } catch (e) {
    // Ignore and fallback gracefully
  }

  return null;
}

// Migrate guest records in Firestore to an authenticated user upon Google login
export async function migrateGuestDataToUser(guestUid: string, userUid: string, userEmail: string): Promise<void> {
  if (!guestUid || !userUid || guestUid === userUid) return;
  
  const collections = [
    GRADES_COLL,
    CLASSES_COLL,
    TEACHERS_COLL,
    STUDENTS_COLL,
    ATTENDANCE_COLL,
    BEHAVIORS_COLL,
    MORNING_DELAYS_COLL,
    SETTINGS_COLL
  ];

  try {
    for (const colName of collections) {
      const q = query(collection(db, colName), where("userId", "==", guestUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => {
          batch.set(doc(db, colName, d.id), {
            userId: userUid,
            userEmail: userEmail,
            updatedAt: Date.now()
          }, { merge: true });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.warn("Notice during guest data migration:", err);
  }
}

// Helper to fully synchronize all local cached records to Firestore
export async function syncAllLocalDataToFirestore(): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  if (!uid) return;

  const collections = [
    GRADES_COLL,
    CLASSES_COLL,
    TEACHERS_COLL,
    STUDENTS_COLL,
    ATTENDANCE_COLL,
    BEHAVIORS_COLL,
    MORNING_DELAYS_COLL
  ];

  try {
    for (const colName of collections) {
      const items = getLocalItems(colName, uid).filter(item => isDocBelongingToUser(item, uid, email));
      if (items.length === 0) continue;
      
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          if (!item || !item.id) return;
          const docRef = doc(db, colName, item.id);
          batch.set(docRef, {
            ...item,
            userId: item.userId || uid,
            userEmail: item.userEmail || email,
            updatedAt: Date.now()
          }, { merge: true });
        });
        await batch.commit().catch(() => {});
      }
    }

    const storedName = typeof window !== "undefined" 
      ? (localStorage.getItem(`school_name_${uid}`) || (email ? localStorage.getItem(`school_name_${email}`) : null)) 
      : null;
    if (storedName) {
      await saveSchoolName(storedName);
    }
  } catch (err) {
    console.error("Error syncing all local data to Firestore:", err);
  }
}

// Helper to fetch entire collection and filter client-side based on strict multi-tenant user isolation
async function fetchAndFilterCollection(colName: string): Promise<any[]> {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email?.toLowerCase() || "";

  // Load from local storage cache first as fallback
  const localList = getLocalItems(colName, currentUid).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));

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

    // Update local cache with authoritative Firestore data
    setLocalItems(colName, results, currentUid);

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
  
  // Deterministic clean ID per slot to prevent duplication and ensure 100% instant sync
  const sanitizedPeriod = (record.period || "1").replace(/\s+/g, '_');
  const recordId = `att_${uid}_${record.date}_${sanitizedPeriod}_${record.gradeId}_${record.classId}`;

  const fullRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now()
  };

  // 1. Save to local storage cache immediately
  saveOrUpdateLocalItem(ATTENDANCE_COLL, fullRecord, uid);

  // 2. Persist to Firestore with merge
  try {
    const docRef = doc(db, ATTENDANCE_COLL, recordId);
    await setDoc(docRef, {
      ...record,
      id: recordId,
      userId: uid,
      userEmail: email,
      timestamp: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err: any) {
    // Firestore error handled gracefully
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

  const localList = getLocalItems(BEHAVIORS_COLL, currentUid).filter(item => isDocBelongingToUser(item, currentUid, currentEmail) && item.studentId === studentId);
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
      setLocalItems(BEHAVIORS_COLL, records, currentUid);
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

  saveOrUpdateLocalItem(BEHAVIORS_COLL, fullRecord, uid);

  try {
    const docRef = doc(db, BEHAVIORS_COLL, newId);
    await setDoc(docRef, {
      ...record,
      id: newId,
      userId: uid,
      userEmail: email,
      timestamp: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });
    return newId;
  } catch (err) {
    return newId;
  }
}

// Delete Behavior Record
export async function deleteBehaviorRecord(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(BEHAVIORS_COLL, id, eff.uid);
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

// Save Morning Delay Record (Ultra-fast instant write with local-first optimistic cache)
export async function saveMorningDelayRecord(record: Omit<MorningDelayRecord, "id" | "timestamp">): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  
  // Instant lookup from local cache instead of slow network roundtrip
  const localList = getLocalItems(MORNING_DELAYS_COLL);
  const existing = localList.find(r => r.date === record.date && r.studentId === record.studentId && isDocBelongingToUser(r, uid, email));
  const recordId = existing?.id || generateLocalId("delay");

  const fullRecord: MorningDelayRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now()
  };

  // 1. Instant local cache update (0ms)
  saveOrUpdateLocalItem(MORNING_DELAYS_COLL, fullRecord);

  // 2. Background Firestore write
  const docRef = doc(db, MORNING_DELAYS_COLL, recordId);
  setDoc(docRef, {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now(),
    updatedAt: Date.now()
  }, { merge: true }).catch((err) => {
    console.warn("Background Firestore delay save notice:", err);
  });

  return recordId;
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

  // 2. Persist to Firestore with explicit document ID
  setDoc(doc(db, GRADES_COLL, generatedId), { 
    id: generatedId,
    name: trimmedName,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  }).catch(() => {});

  return generatedId;
}

// Add Multiple Grades in a Batch
export async function addGradesBatch(names: string[]): Promise<{ id: string; name: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localGrades = getLocalItems(GRADES_COLL).filter(g => isDocBelongingToUser(g, uid, email));
  const existingMap = new Map<string, string>();
  localGrades.forEach(g => {
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
      existingMap.set(trimmed, generatedId);
    }
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((item, idx) => {
          const docRef = doc(db, GRADES_COLL, item.id);
          batch.set(docRef, {
            id: item.id,
            name: item.name,
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {}
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

// Add Class (Instant optimistic return + background persistence)
export async function addClass(name: string, gradeId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const trimmedName = name.trim();
  const localClasses = getLocalItems(CLASSES_COLL).filter(c => isDocBelongingToUser(c, uid, email));
  const existing = localClasses.find(c => c.gradeId === gradeId && c.name?.trim() === trimmedName);
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

  // Firestore background write with deterministic document ID
  setDoc(doc(db, CLASSES_COLL, generatedId), { 
    id: generatedId,
    name: trimmedName, 
    gradeId, 
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  }).catch(() => {});

  return generatedId;
}

// Add Multiple Classes in a Batch (Ultra-fast atomic save)
export async function addClassesBatch(classesList: { name: string; gradeId: string }[]): Promise<{ id: string; name: string; gradeId: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localClasses = getLocalItems(CLASSES_COLL).filter(c => isDocBelongingToUser(c, uid, email));
  const existingKeySet = new Set<string>();
  localClasses.forEach(c => {
    if (c.name && c.gradeId) existingKeySet.add(`${c.gradeId}__${c.name.trim()}`);
  });

  const results: { id: string; name: string; gradeId: string }[] = [];
  const toCreate: { id: string; name: string; gradeId: string }[] = [];

  classesList.forEach(item => {
    const trimmed = item.name.trim();
    if (!trimmed || !item.gradeId) return;
    const key = `${item.gradeId}__${trimmed}`;
    if (existingKeySet.has(key)) {
      const match = localClasses.find(c => c.gradeId === item.gradeId && c.name?.trim() === trimmed);
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
      existingKeySet.add(key);
    }
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((c, idx) => {
          const docRef = doc(db, CLASSES_COLL, c.id);
          batch.set(docRef, {
            id: c.id,
            name: c.name,
            gradeId: c.gradeId,
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
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

  setDoc(doc(db, TEACHERS_COLL, generatedId), { 
    id: generatedId,
    name: name.trim(), 
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  }).catch(() => {});

  return generatedId;
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<Teacher[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const toCreate: Teacher[] = [];
  names.forEach(name => {
    const generatedId = generateLocalId("tch");
    const item: Teacher = { id: generatedId, name: name.trim() };
    toCreate.push(item);
    saveOrUpdateLocalItem(TEACHERS_COLL, {
      id: generatedId,
      name: item.name,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((t, idx) => {
          const docRef = doc(db, TEACHERS_COLL, t.id);
          batch.set(docRef, { 
            id: t.id,
            name: t.name, 
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {}
  }

  return toCreate;
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

// Add Student (Deduplicates automatically by classId and normalized student name)
export async function addStudent(name: string, gradeId: string, classId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const trimmedName = name.trim();

  // Normalize for robust duplicate checking
  const normName = trimmedName
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ");

  const localStudents = getLocalCollection<Student>(STUDENTS_COLL);
  const existing = localStudents.find(s => {
    if (s.classId !== classId) return false;
    const sNorm = (s.name || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");
    return sNorm === normName;
  });

  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("stu");

  const newStudentObj = {
    id: generatedId,
    name: trimmedName,
    gradeId,
    classId,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(STUDENTS_COLL, newStudentObj);

  setDoc(doc(db, STUDENTS_COLL, generatedId), { 
    id: generatedId,
    name: trimmedName, 
    gradeId, 
    classId, 
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  }).catch(() => {});

  return generatedId;
}

// Add Multiple Students in a Batch (Ignores duplicates, adds non-duplicates)
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<Student[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localStudents = getLocalCollection<Student>(STUDENTS_COLL);
  const seenClassAndNames = new Set<string>();

  localStudents.forEach(s => {
    const sNorm = (s.name || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");
    seenClassAndNames.add(`${s.classId}:::${sNorm}`);
  });

  const toCreate: Student[] = [];
  studentsList.forEach(s => {
    const trimmed = s.name.trim();
    if (!trimmed) return;

    const norm = trimmed
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");

    const key = `${s.classId}:::${norm}`;
    if (seenClassAndNames.has(key)) {
      // Ignore duplicate
      return;
    }

    seenClassAndNames.add(key);
    const generatedId = generateLocalId("stu");
    const item: Student = { id: generatedId, name: trimmed, gradeId: s.gradeId, classId: s.classId };
    toCreate.push(item);
    saveOrUpdateLocalItem(STUDENTS_COLL, {
      id: generatedId,
      name: item.name,
      gradeId: item.gradeId,
      classId: item.classId,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((s, idx) => {
          const docRef = doc(db, STUDENTS_COLL, s.id);
          batch.set(docRef, { 
            id: s.id,
            name: s.name, 
            gradeId: s.gradeId, 
            classId: s.classId, 
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {}
  }

  return toCreate;
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
    const docRef = doc(db, SETTINGS_COLL, `settings_${uid}`);
    await setDoc(docRef, { schoolName, userId: uid, userEmail: email, updatedAt: Date.now() }, { merge: true });
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
  const localList = getLocalItems(colName, currentUid).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
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
      
      // Update local storage cache with authoritative Firestore data
      setLocalItems(colName, results, currentUid);
      callback(results);
    }, (error) => {
      // On permission or network error, fallback silently to local cache without crashing UI
      const fallbackList = getLocalItems(colName, currentUid).filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
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



