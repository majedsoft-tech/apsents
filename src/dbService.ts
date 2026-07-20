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
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord, RegisteredUser } from "./types";

// Fallback user proxy to support unauthenticated public access
const auth = {
  get currentUser() {
    return firebaseAuth.currentUser || {
      uid: "QgOSyBcP28MzmbJT92aH8vdgAG33",
      email: "majedsoft@gmail.com",
      displayName: "زائر عام"
    };
  }
};

// Collection Names
const GRADES_COLL = "grades";
const CLASSES_COLL = "classes";
const TEACHERS_COLL = "teachers";
const STUDENTS_COLL = "students";
const ATTENDANCE_COLL = "attendance";
const BEHAVIORS_COLL = "behaviors";

// Helper to fetch entire collection and filter client-side based on UID, email, and legacy fallbacks
async function fetchAndFilterCollection(colName: string): Promise<any[]> {
  const user = auth.currentUser;
  if (!user) return [];
  
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  try {
    const querySnapshot = await getDocs(collection(db, colName));
    const results: any[] = [];
    const seenIds = new Set<string>();
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      // 1. Direct match by UID
      if (data.userId === currentUid) {
        belongs = true;
      }
      // 2. Direct match by Email
      else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      }
      // 3. Fallbacks for majedsoft@gmail.com
      else if (currentEmail.includes("majedsoft")) {
        // If document has no userId and no userEmail (legacy global data)
        if (!data.userId && !data.userEmail) {
          belongs = true;
        }
        // If document has known previous UIDs of majedsoft
        else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        results.push({ id: docSnap.id, ...data });
      }
    });

    return results;
  } catch (err) {
    console.error(`Error fetching or filtering collection "${colName}":`, err);
    return [];
  }
}

// Fetch All Grades
export async function getGrades(): Promise<Grade[]> {
  return fetchAndFilterCollection(GRADES_COLL) as Promise<Grade[]>;
}

// Fetch All Classes
export async function getClasses(): Promise<Class[]> {
  return fetchAndFilterCollection(CLASSES_COLL) as Promise<Class[]>;
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
  const user = auth.currentUser;
  if (!user) {
    callback(null);
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, ATTENDANCE_COLL);
  return onSnapshot(q, (snapshot) => {
    let found: AttendanceRecord | null = null;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      if (data.userId === currentUid) {
        belongs = true;
      } else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      } else if (currentEmail.includes("majedsoft")) {
        if (!data.userId && !data.userEmail) {
          belongs = true;
        } else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && data.date === date && data.period === period && data.gradeId === gradeId && data.classId === classId) {
        found = { id: docSnap.id, ...data } as AttendanceRecord;
      }
    });
    callback(found);
  }, onError);
}

// Save Attendance Record
export async function saveAttendanceRecord(record: Omit<AttendanceRecord, "id" | "timestamp">): Promise<void> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  
  // Check if a record already exists for this slot
  const existing = await getAttendanceRecord(record.date, record.period, record.gradeId, record.classId);
  
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
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, BEHAVIORS_COLL);
  return onSnapshot(q, (snapshot) => {
    const records: BehaviorRecord[] = [];
    const seenIds = new Set<string>();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      if (data.userId === currentUid) {
        belongs = true;
      } else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      } else if (currentEmail.includes("majedsoft")) {
        if (!data.userId && !data.userEmail) {
          belongs = true;
        } else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && data.studentId === studentId && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        records.push({ id: docSnap.id, ...data } as BehaviorRecord);
      }
    });
    records.sort((a, b) => b.date.localeCompare(a.date));
    callback(records);
  }, onError);
}

// Save Behavior Record
export async function saveBehaviorRecord(record: Omit<BehaviorRecord, "id" | "timestamp">): Promise<string> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const collRef = collection(db, BEHAVIORS_COLL);
  const docRef = await addDoc(collRef, {
    ...record,
    userId: uid,
    userEmail: email,
    timestamp: serverTimestamp()
  });
  return docRef.id;
}

// Delete Behavior Record
export async function deleteBehaviorRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, BEHAVIORS_COLL, id));
}

// --- ADMIN WRITES ---

// Add Grade
export async function addGrade(name: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, GRADES_COLL), { 
    name,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  });
  return docRef.id;
}

// Delete Grade
export async function deleteGrade(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  batch.delete(doc(db, GRADES_COLL, id));
  
  // Clean up associated classes (unique gradeId)
  const classesQuery = query(collection(db, CLASSES_COLL), where("gradeId", "==", id));
  const classesSnap = await getDocs(classesQuery);
  classesSnap.docs.forEach(cDoc => {
    batch.delete(doc(db, CLASSES_COLL, cDoc.id));
  });

  // Clean up associated students (unique gradeId)
  const studentsQuery = query(collection(db, STUDENTS_COLL), where("gradeId", "==", id));
  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach(sDoc => {
    batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
  });

  await batch.commit();
}

// Add Class
export async function addClass(name: string, gradeId: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, CLASSES_COLL), { 
    name, 
    gradeId, 
    userId: uid,
    userEmail: email
  });
  return docRef.id;
}

// Delete Class
export async function deleteClass(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  batch.delete(doc(db, CLASSES_COLL, id));
  
  // Clean up associated students of this class (unique classId)
  const studentsQuery = query(collection(db, STUDENTS_COLL), where("classId", "==", id));
  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach(sDoc => {
    batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
  });
  
  await batch.commit();
}

// Add Teacher
export async function addTeacher(name: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, TEACHERS_COLL), { 
    name, 
    userId: uid,
    userEmail: email
  });
  return docRef.id;
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  names.forEach(name => {
    const docRef = doc(collection(db, TEACHERS_COLL));
    batch.set(docRef, { 
      name, 
      userId: uid,
      userEmail: email
    });
  });
  await batch.commit();
}

// Delete Teacher
export async function deleteTeacher(id: string): Promise<void> {
  await deleteDoc(doc(db, TEACHERS_COLL, id));
}

// Delete Multiple Teachers in a Batch
export async function deleteTeachersBatch(ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach(id => {
    batch.delete(doc(db, TEACHERS_COLL, id));
  });
  await batch.commit();
}

// Add Student
export async function addStudent(name: string, gradeId: string, classId: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, STUDENTS_COLL), { 
    name, 
    gradeId, 
    classId, 
    userId: uid,
    userEmail: email
  });
  return docRef.id;
}

// Add Multiple Students in a Batch
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  studentsList.forEach(s => {
    const docRef = doc(collection(db, STUDENTS_COLL));
    batch.set(docRef, { 
      name: s.name, 
      gradeId: s.gradeId, 
      classId: s.classId, 
      userId: uid,
      userEmail: email
    });
  });
  await batch.commit();
}

// Delete Student
export async function deleteStudent(id: string): Promise<void> {
  await deleteDoc(doc(db, STUDENTS_COLL, id));
}

// Delete Multiple Students in a Batch
export async function deleteStudentsBatch(ids: string[]): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach(id => {
    batch.delete(doc(db, STUDENTS_COLL, id));
  });
  await batch.commit();
}

// Fetch all attendance for statistics
export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  return fetchAndFilterCollection(ATTENDANCE_COLL) as Promise<AttendanceRecord[]>;
}

// Subscribe to all attendance for real-time statistics
export function subscribeToAllAttendanceRecords(callback: (records: AttendanceRecord[]) => void, onError?: (error: any) => void) {
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, ATTENDANCE_COLL);
  return onSnapshot(q, (snapshot) => {
    const records: AttendanceRecord[] = [];
    const seenIds = new Set<string>();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      if (data.userId === currentUid) {
        belongs = true;
      } else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      } else if (currentEmail.includes("majedsoft")) {
        if (!data.userId && !data.userEmail) {
          belongs = true;
        } else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        records.push({ id: docSnap.id, ...data } as AttendanceRecord);
      }
    });
    callback(records);
  }, onError);
}

// Fetch all behavior records for statistics
export async function getAllBehaviorRecords(): Promise<BehaviorRecord[]> {
  return fetchAndFilterCollection(BEHAVIORS_COLL) as Promise<BehaviorRecord[]>;
}

// Subscribe to all behavior records for real-time statistics
export function subscribeToAllBehaviorRecords(callback: (records: BehaviorRecord[]) => void, onError?: (error: any) => void) {
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, BEHAVIORS_COLL);
  return onSnapshot(q, (snapshot) => {
    const records: BehaviorRecord[] = [];
    const seenIds = new Set<string>();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      if (data.userId === currentUid) {
        belongs = true;
      } else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      } else if (currentEmail.includes("majedsoft")) {
        if (!data.userId && !data.userEmail) {
          belongs = true;
        } else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        records.push({ id: docSnap.id, ...data } as BehaviorRecord);
      }
    });
    callback(records);
  }, onError);
}

// --- DATABASE AUTO-SEEDING ---
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  
  const email = user.email.toLowerCase();
  // Only seed if the user has "majedsoft" in their email
  if (!email.includes("majedsoft")) {
    return false;
  }

  const uid = user.uid;

  // Use the new email/UID aware helper to check if grades already exist for this user
  const grades = await getGrades();
  if (grades.length > 0) {
    // Database already has data for this user
    return false;
  }

  // Start the batch write
  const batch = writeBatch(db);

  // 1. Seed Grades
  const gradesToSeed = [
    { name: "الصف الأول الثانوي" },
    { name: "الصف الثاني الثانوي" },
    { name: "الصف الثالث الثانوي" }
  ];

  const gradeRefs: { name: string; ref: any; id: string }[] = [];
  gradesToSeed.forEach(g => {
    const ref = doc(collection(db, GRADES_COLL));
    batch.set(ref, {
      name: g.name,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
    gradeRefs.push({ name: g.name, ref, id: ref.id });
  });

  // 2. Seed Classes for each Grade
  const classRefs: { name: string; gradeId: string; ref: any; id: string }[] = [];
  gradeRefs.forEach(g => {
    const classNames = ["الفصل 1", "الفصل 2", "الفصل 3"];
    classNames.forEach(cName => {
      const ref = doc(collection(db, CLASSES_COLL));
      batch.set(ref, {
        name: cName,
        gradeId: g.id,
        userId: uid,
        userEmail: email
      });
      classRefs.push({ name: cName, gradeId: g.id, ref, id: ref.id });
    });
  });

  // 3. Seed Teachers
  const teachersToSeed = [
    "أ/ أحمد المحمد",
    "أ/ خالد عبد العزيز",
    "أ/ محمد السديري",
    "أ/ فهد الدوسري",
    "أ/ ياسر الحربي"
  ];
  teachersToSeed.forEach(tName => {
    const ref = doc(collection(db, TEACHERS_COLL));
    batch.set(ref, {
      name: tName,
      userId: uid,
      userEmail: email
    });
  });

  // 4. Seed Students
  const studentNamesPool = [
    "عبد الله بن علي العتيبي",
    "سليمان بن محمد النخيل",
    "عبد الرحمن بن فهد الحربي",
    "عبد العزيز بن صالح الشمري",
    "فيصل بن خالد الدوسري",
    "ماجد بن أحمد القحطاني",
    "بدر بن عبد الله المطيري",
    "نايف بن محمد السبيعي",
    "محمد بن صالح الخالدي",
    "صالح بن علي السبيعي",
    "أحمد بن عبد العزيز اليوسف",
    "خالد بن محمد السديري",
    "فهد بن سليمان الدوسري",
    "sلطان بن فهد العتيبي",
    "يوسف بن عبد الله الخالدي",
    "مشعل بن عبد العزيز السبيعي",
    "تركي بن فهد الحارثي",
    "رائد بن صالح الزهراني",
    "عبد الإله بن خالد العنزي",
    "سلمان بن محمد الغامدي",
    "نواف بن فهد الحربي",
    "عبد الله بن سعيد الشهري",
    "مهند بن عبد العزيز المطيري",
    "فواز بن صالح الدوسري"
  ];

  // Distribute 5 students to each class
  let nameIndex = 0;
  classRefs.forEach(cls => {
    for (let i = 0; i < 5; i++) {
      const sName = studentNamesPool[nameIndex % studentNamesPool.length];
      nameIndex++;
      const sRef = doc(collection(db, STUDENTS_COLL));
      batch.set(sRef, {
        name: sName,
        gradeId: cls.gradeId,
        classId: cls.id,
        userId: uid,
        userEmail: email
      });
    }
  });

  await batch.commit();
  return true;
}

// --- SCHOOL SETTINGS ---
const SETTINGS_COLL = "settings";

export async function getSchoolName(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return "";
  const uid = user.uid;
  const email = user.email?.toLowerCase() || "";
  
  try {
    // 1. query by userId
    const q1 = query(collection(db, SETTINGS_COLL), where("userId", "==", uid));
    const s1 = await getDocs(q1);
    if (!s1.empty) {
      return s1.docs[0].data().schoolName || "";
    }
    
    // 2. query by email
    if (email) {
      const q2 = query(collection(db, SETTINGS_COLL), where("userEmail", "==", email));
      const s2 = await getDocs(q2);
      if (!s2.empty) {
        return s2.docs[0].data().schoolName || "";
      }
    }
    
    // 3. legacy global data fallback for majedsoft@gmail.com
    if (email.includes("majedsoft")) {
      for (const legacyUid of ["QgOSyBcP28MzmbJT92aH8vdgAG33", "D0GoJniRN0T4poH8RMgY9OjVJ5H3"]) {
        const qLegacy = query(collection(db, SETTINGS_COLL), where("userId", "==", legacyUid));
        const sLegacy = await getDocs(qLegacy);
        if (!sLegacy.empty) {
          return sLegacy.docs[0].data().schoolName || "";
        }
      }
    }
  } catch (err) {
    console.error("Error getting school name:", err);
  }
  return "";
}

export async function saveSchoolName(schoolName: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email?.toLowerCase() || "";
  if (!uid) return;
  try {
    const q = query(collection(db, SETTINGS_COLL), where("userId", "==", uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docRef = doc(db, SETTINGS_COLL, querySnapshot.docs[0].id);
      await setDoc(docRef, { schoolName, userId: uid, userEmail: email }, { merge: true });
    } else {
      // Direct query by email instead of fetchAndFilterCollection
      const qEmail = query(collection(db, SETTINGS_COLL), where("userEmail", "==", email));
      const emailSnapshot = await getDocs(qEmail);
      if (!emailSnapshot.empty) {
        const docRef = doc(db, SETTINGS_COLL, emailSnapshot.docs[0].id);
        await setDoc(docRef, { schoolName, userId: uid, userEmail: email }, { merge: true });
      } else {
        await addDoc(collection(db, SETTINGS_COLL), { schoolName, userId: uid, userEmail: email });
      }
    }
  } catch (err) {
    console.error("Error saving school name:", err);
  }
}

// Generic live subscription helper matching fetchAndFilterCollection logic
function subscribeToCollection(colName: string, callback: (data: any[]) => void, onError?: (error: any) => void) {
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, colName);
  return onSnapshot(q, (snapshot) => {
    const results: any[] = [];
    const seenIds = new Set<string>();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      let belongs = false;

      // 1. Direct match by UID
      if (data.userId === currentUid) {
        belongs = true;
      }
      // 2. Direct match by Email
      else if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
        belongs = true;
      }
      // 3. Fallbacks for majedsoft@gmail.com
      else if (currentEmail.includes("majedsoft")) {
        if (!data.userId && !data.userEmail) {
          belongs = true;
        } else if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          belongs = true;
        }
      }

      if (belongs && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        results.push({ id: docSnap.id, ...data });
      }
    });
    callback(results);
  }, onError);
}

// Subscribe All Grades in real-time
export function subscribeToGrades(callback: (grades: Grade[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(GRADES_COLL, callback, onError);
}

// Subscribe All Classes in real-time
export function subscribeToClasses(callback: (classes: Class[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(CLASSES_COLL, callback, onError);
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
  const user = auth.currentUser;
  if (!user) {
    callback("");
    return () => {};
  }
  const currentUid = user.uid;
  const currentEmail = user.email?.toLowerCase() || "";

  const q = collection(db, SETTINGS_COLL);
  return onSnapshot(q, (snapshot) => {
    let schoolNameVal = "";
    let found = false;

    // 1. Check direct match by UID
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.userId === currentUid) {
        schoolNameVal = data.schoolName || "";
        found = true;
      }
    });

    // 2. Check match by email if not found
    if (!found && currentEmail) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.userEmail && data.userEmail.toLowerCase() === currentEmail) {
          schoolNameVal = data.schoolName || "";
          found = true;
        }
      });
    }

    // 3. Legacy global data fallback for majedsoft@gmail.com
    if (!found && currentEmail.includes("majedsoft")) {
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.userId === "QgOSyBcP28MzmbJT92aH8vdgAG33" || data.userId === "D0GoJniRN0T4poH8RMgY9OjVJ5H3") {
          schoolNameVal = data.schoolName || "";
          found = true;
        }
      });
    }

    callback(schoolNameVal);
  }, onError);
}

// --- REGISTERED USERS SYSTEM ---
const USERS_COLL = "registered_users";

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
    const docRef = doc(db, USERS_COLL, user.uid);
    const docSnap = await getDocs(query(collection(db, USERS_COLL), where("uid", "==", user.uid)));
    
    let existingData: any = null;
    if (!docSnap.empty) {
      existingData = docSnap.docs[0].data();
    }

    const payload: Partial<RegisteredUser> = {
      uid: user.uid,
      email: email,
      displayName: user.displayName || email.split("@")[0],
      photoURL: user.photoURL || "",
      lastLogin: Date.now(),
      schoolName: currentSchoolName || existingData?.schoolName || "",
      status: existingData?.status || "نشط"
    };

    if (!existingData) {
      payload.createdAt = Date.now();
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.error("Error registering user in DB:", err);
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



