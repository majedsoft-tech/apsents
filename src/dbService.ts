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
import { db, auth } from "./firebase";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord } from "./types";

// Collection Names
const GRADES_COLL = "grades";
const CLASSES_COLL = "classes";
const TEACHERS_COLL = "teachers";
const STUDENTS_COLL = "students";
const ATTENDANCE_COLL = "attendance";
const BEHAVIORS_COLL = "behaviors";

// Fetch All Grades
export async function getGrades(): Promise<Grade[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, GRADES_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
}

// Fetch All Classes
export async function getClasses(): Promise<Class[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, CLASSES_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
}

// Fetch All Teachers
export async function getTeachers(): Promise<Teacher[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, TEACHERS_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
}

// Fetch All Students
export async function getStudents(): Promise<Student[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, STUDENTS_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
}

// Fetch Students by Grade and Class
export async function getStudentsByClass(gradeId: string, classId: string): Promise<Student[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(
    collection(db, STUDENTS_COLL),
    where("userId", "==", uid),
    where("gradeId", "==", gradeId),
    where("classId", "==", classId)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
}

// Fetch Attendance Record for a specific date, period, grade, class
export async function getAttendanceRecord(
  date: string,
  period: string,
  gradeId: string,
  classId: string
): Promise<AttendanceRecord | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const q = query(
    collection(db, ATTENDANCE_COLL),
    where("userId", "==", uid),
    where("date", "==", date),
    where("period", "==", period),
    where("gradeId", "==", gradeId),
    where("classId", "==", classId)
  );
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  const docSnap = querySnapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as AttendanceRecord;
}

// Save Attendance Record
export async function saveAttendanceRecord(record: Omit<AttendanceRecord, "id" | "timestamp">): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  
  // Check if a record already exists for this slot
  const existing = await getAttendanceRecord(record.date, record.period, record.gradeId, record.classId);
  
  if (existing) {
    const docRef = doc(db, ATTENDANCE_COLL, existing.id);
    await setDoc(docRef, {
      ...record,
      userId: uid,
      timestamp: serverTimestamp()
    }, { merge: true });
  } else {
    const collRef = collection(db, ATTENDANCE_COLL);
    await addDoc(collRef, {
      ...record,
      userId: uid,
      timestamp: serverTimestamp()
    });
  }
}

// Fetch Behavior Records for a student
export async function getBehaviorRecords(studentId: string): Promise<BehaviorRecord[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(
    collection(db, BEHAVIORS_COLL),
    where("userId", "==", uid),
    where("studentId", "==", studentId)
  );
  const querySnapshot = await getDocs(q);
  const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
  // Sort on client side to avoid index creation requirements during first run
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

// Save Behavior Record
export async function saveBehaviorRecord(record: Omit<BehaviorRecord, "id" | "timestamp">): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const collRef = collection(db, BEHAVIORS_COLL);
  const docRef = await addDoc(collRef, {
    ...record,
    userId: uid,
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
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, GRADES_COLL), { 
    name,
    userId: uid,
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
  
  // Clean up associated classes
  const classesQuery = query(collection(db, CLASSES_COLL), where("userId", "==", uid), where("gradeId", "==", id));
  const classesSnap = await getDocs(classesQuery);
  classesSnap.docs.forEach(cDoc => {
    batch.delete(doc(db, CLASSES_COLL, cDoc.id));
  });

  // Clean up associated students
  const studentsQuery = query(collection(db, STUDENTS_COLL), where("userId", "==", uid), where("gradeId", "==", id));
  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach(sDoc => {
    batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
  });

  await batch.commit();
}

// Add Class
export async function addClass(name: string, gradeId: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, CLASSES_COLL), { name, gradeId, userId: uid });
  return docRef.id;
}

// Delete Class
export async function deleteClass(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  batch.delete(doc(db, CLASSES_COLL, id));
  
  // Clean up associated students of this class
  const studentsQuery = query(collection(db, STUDENTS_COLL), where("userId", "==", uid), where("classId", "==", id));
  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach(sDoc => {
    batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
  });
  
  await batch.commit();
}

// Add Teacher
export async function addTeacher(name: string): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, TEACHERS_COLL), { name, userId: uid });
  return docRef.id;
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  names.forEach(name => {
    const docRef = doc(collection(db, TEACHERS_COLL));
    batch.set(docRef, { name, userId: uid });
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
  if (!uid) throw new Error("Unauthenticated");
  const docRef = await addDoc(collection(db, STUDENTS_COLL), { name, gradeId, classId, userId: uid });
  return docRef.id;
}

// Add Multiple Students in a Batch
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const batch = writeBatch(db);
  studentsList.forEach(s => {
    const docRef = doc(collection(db, STUDENTS_COLL));
    batch.set(docRef, { name: s.name, gradeId: s.gradeId, classId: s.classId, userId: uid });
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
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, ATTENDANCE_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
}

// Subscribe to all attendance for real-time statistics
export function subscribeToAllAttendanceRecords(callback: (records: AttendanceRecord[]) => void, onError?: (error: any) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, ATTENDANCE_COLL), where("userId", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
    callback(records);
  }, onError);
}

// Fetch all behavior records for statistics
export async function getAllBehaviorRecords(): Promise<BehaviorRecord[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q = query(collection(db, BEHAVIORS_COLL), where("userId", "==", uid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
}

// Subscribe to all behavior records for real-time statistics
export function subscribeToAllBehaviorRecords(callback: (records: BehaviorRecord[]) => void, onError?: (error: any) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, BEHAVIORS_COLL), where("userId", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
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

  // Check if we already have grades in the database for this specific user
  const gradesQuery = query(collection(db, GRADES_COLL), where("userId", "==", uid));
  const gradesSnap = await getDocs(gradesQuery);
  if (!gradesSnap.empty) {
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
        userId: uid
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
      userId: uid
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
    "سلطان بن فهد العتيبي",
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
        userId: uid
      });
    }
  });

  await batch.commit();
  return true;
}
