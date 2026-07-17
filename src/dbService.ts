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
import { db } from "./firebase";
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
  const querySnapshot = await getDocs(collection(db, GRADES_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Grade));
}

// Fetch All Classes
export async function getClasses(): Promise<Class[]> {
  const querySnapshot = await getDocs(collection(db, CLASSES_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
}

// Fetch All Teachers
export async function getTeachers(): Promise<Teacher[]> {
  const querySnapshot = await getDocs(collection(db, TEACHERS_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
}

// Fetch All Students
export async function getStudents(): Promise<Student[]> {
  const querySnapshot = await getDocs(collection(db, STUDENTS_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
}

// Fetch Students by Grade and Class
export async function getStudentsByClass(gradeId: string, classId: string): Promise<Student[]> {
  const q = query(
    collection(db, STUDENTS_COLL),
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
  const q = query(
    collection(db, ATTENDANCE_COLL),
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
  // Check if a record already exists for this slot
  const existing = await getAttendanceRecord(record.date, record.period, record.gradeId, record.classId);
  
  if (existing) {
    const docRef = doc(db, ATTENDANCE_COLL, existing.id);
    await setDoc(docRef, {
      ...record,
      timestamp: serverTimestamp()
    }, { merge: true });
  } else {
    const collRef = collection(db, ATTENDANCE_COLL);
    await addDoc(collRef, {
      ...record,
      timestamp: serverTimestamp()
    });
  }
}

// Fetch Behavior Records for a student
export async function getBehaviorRecords(studentId: string): Promise<BehaviorRecord[]> {
  const q = query(
    collection(db, BEHAVIORS_COLL),
    where("studentId", "==", studentId)
  );
  const querySnapshot = await getDocs(q);
  const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
  // Sort on client side to avoid index creation requirements during first run
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

// Save Behavior Record
export async function saveBehaviorRecord(record: Omit<BehaviorRecord, "id" | "timestamp">): Promise<string> {
  const collRef = collection(db, BEHAVIORS_COLL);
  const docRef = await addDoc(collRef, {
    ...record,
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
  const docRef = await addDoc(collection(db, GRADES_COLL), { 
    name,
    createdAt: Date.now()
  });
  return docRef.id;
}

// Delete Grade
export async function deleteGrade(id: string): Promise<void> {
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
}

// Add Class
export async function addClass(name: string, gradeId: string): Promise<string> {
  const docRef = await addDoc(collection(db, CLASSES_COLL), { name, gradeId });
  return docRef.id;
}

// Delete Class
export async function deleteClass(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, CLASSES_COLL, id));
  
  // Clean up associated students of this class
  const studentsQuery = query(collection(db, STUDENTS_COLL), where("classId", "==", id));
  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach(sDoc => {
    batch.delete(doc(db, STUDENTS_COLL, sDoc.id));
  });
  
  await batch.commit();
}

// Add Teacher
export async function addTeacher(name: string): Promise<string> {
  const docRef = await addDoc(collection(db, TEACHERS_COLL), { name });
  return docRef.id;
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<void> {
  const batch = writeBatch(db);
  names.forEach(name => {
    const docRef = doc(collection(db, TEACHERS_COLL));
    batch.set(docRef, { name });
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
  const docRef = await addDoc(collection(db, STUDENTS_COLL), { name, gradeId, classId });
  return docRef.id;
}

// Add Multiple Students in a Batch
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<void> {
  const batch = writeBatch(db);
  studentsList.forEach(s => {
    const docRef = doc(collection(db, STUDENTS_COLL));
    batch.set(docRef, { name: s.name, gradeId: s.gradeId, classId: s.classId });
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
  const querySnapshot = await getDocs(collection(db, ATTENDANCE_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
}

// Subscribe to all attendance for real-time statistics
export function subscribeToAllAttendanceRecords(callback: (records: AttendanceRecord[]) => void, onError?: (error: any) => void) {
  return onSnapshot(collection(db, ATTENDANCE_COLL), (snapshot) => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
    callback(records);
  }, onError);
}

// Fetch all behavior records for statistics
export async function getAllBehaviorRecords(): Promise<BehaviorRecord[]> {
  const querySnapshot = await getDocs(collection(db, BEHAVIORS_COLL));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
}

// Subscribe to all behavior records for real-time statistics
export function subscribeToAllBehaviorRecords(callback: (records: BehaviorRecord[]) => void, onError?: (error: any) => void) {
  return onSnapshot(collection(db, BEHAVIORS_COLL), (snapshot) => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BehaviorRecord));
    callback(records);
  }, onError);
}

// --- DATABASE AUTO-SEEDING ---
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export async function seedDatabaseIfEmpty(): Promise<boolean> {
  const gradesSnap = await getDocs(collection(db, GRADES_COLL));
  if (!gradesSnap.empty) {
    return false; // Database is already seeded
  }

  const batch = writeBatch(db);

  // 1. Seed Grades
  const grades = [
    { id: "grade-1", name: "الصف الأول" },
    { id: "grade-2", name: "الصف الثاني" }
  ];
  for (const g of grades) {
    batch.set(doc(db, GRADES_COLL, g.id), { name: g.name });
  }

  // 2. Seed Classes
  const classes = [
    { id: "class-1-1", name: "الفصل الأول", gradeId: "grade-1" },
    { id: "class-2-2", name: "الفصل الثاني", gradeId: "grade-2" },
    { id: "class-2-3", name: "الفصل 3", gradeId: "grade-2" },
    { id: "class-2-5", name: "الفصل 5", gradeId: "grade-2" }
  ];
  for (const c of classes) {
    batch.set(doc(db, CLASSES_COLL, c.id), { name: c.name, gradeId: c.gradeId });
  }

  // 3. Seed Teachers
  const teachers = [
    { id: "teacher-1", name: "أ.احمد بزرون" },
    { id: "teacher-2", name: "أ.أمين البراك" },
    { id: "teacher-3", name: "أ.عادل العتيق" }
  ];
  for (const t of teachers) {
    batch.set(doc(db, TEACHERS_COLL, t.id), { name: t.name });
  }

  // 4. Seed Students
  const students = [
    // الصف الثاني - الفصل 5
    { id: "student-25-1", name: "بلال بن محمد بن صقر المنجور", gradeId: "grade-2", classId: "class-2-5" },
    { id: "student-25-2", name: "جواد بن حسين بن منصور ال امحيميد", gradeId: "grade-2", classId: "class-2-5" },
    { id: "student-25-3", name: "جواد بن محمد بن حسين آل اعبيد", gradeId: "grade-2", classId: "class-2-5" },
    { id: "student-25-4", name: "حسن بن علي بن إبراهيم آل حرز", gradeId: "grade-2", classId: "class-2-5" },
    { id: "student-25-5", name: "حسن بن علي بن قاسم الشبيب", gradeId: "grade-2", classId: "class-2-5" },
    { id: "student-25-6", name: "حسن بن محمد بن حسن الكعيبي", gradeId: "grade-2", classId: "class-2-5" },
    
    // الصف الثاني - الفصل 3
    { id: "student-23-1", name: "إبراهيم بن فؤاد بن ابراهيم المسبح", gradeId: "grade-2", classId: "class-2-3" },
    { id: "student-23-2", name: "أحمد بن أمين بن منصور الكعيبي", gradeId: "grade-2", classId: "class-2-3" },
    { id: "student-23-3", name: "أحمد بن جعفر بن حبيب المرهون", gradeId: "grade-2", classId: "class-2-3" },
    { id: "student-23-4", name: "أحمد بن صالح بن علي سقلب", gradeId: "grade-2", classId: "class-2-3" },

    // الصف الأول - الفصل الأول
    { id: "student-11-1", name: "احمد اسامه نصرالدين ابراهيم", gradeId: "grade-1", classId: "class-1-1" },
    { id: "student-11-2", name: "أحمد بن محمد بن حمود الجعيبي", gradeId: "grade-1", classId: "class-1-1" },
    { id: "student-11-3", name: "حسن بن حاتم بن علي الكعيبي", gradeId: "grade-1", classId: "class-1-1" },
    { id: "student-11-4", name: "حسن بن راضي بن علي العوامي", gradeId: "grade-1", classId: "class-1-1" },
    { id: "student-11-5", name: "حسن بن سعيد بن احمد آل ابريق", gradeId: "grade-1", classId: "class-1-1" }
  ];
  for (const s of students) {
    batch.set(doc(db, STUDENTS_COLL, s.id), { 
      name: s.name, 
      gradeId: s.gradeId, 
      classId: s.classId 
    });
  }

  // 5. Seed Pre-recorded Behaviors for "إبراهيم بن فؤاد بن ابراهيم المسبح"
  const behaviors = [
    {
      id: "behavior-1",
      studentId: "student-23-1",
      date: "2026-04-22",
      period: "الحصة: 3",
      teacherId: "teacher-2",
      teacherName: "أ.أمين البراك",
      violation: "النوم أثناء الحصة"
    },
    {
      id: "behavior-2",
      studentId: "student-23-1",
      date: "2026-05-04",
      period: "الحصة: 6",
      teacherId: "teacher-3",
      teacherName: "أ.عادل العتيق",
      violation: "النوم أثناء الحصة"
    }
  ];
  for (const b of behaviors) {
    batch.set(doc(db, BEHAVIORS_COLL, b.id), {
      studentId: b.studentId,
      date: b.date,
      period: b.period,
      teacherId: b.teacherId,
      teacherName: b.teacherName,
      violation: b.violation,
      timestamp: new Date(b.date)
    });
  }

  // 6. Seed Attendance record from screenshot 1
  // الصف الثاني | الفصل 5 | الحصة 4
  // 1: بلال - حاضر, 2: جواد بن حسين - غائب, 3: جواد بن محمد - حاضر, 4: حسن بن علي - حاضر, 5: حسن بن علي قاسم - حاضر, 6: حسن بن محمد - حاضر
  const attendance1 = {
    date: getTodayDateString(),
    period: "حصة 4",
    gradeId: "grade-2",
    classId: "class-2-5",
    teacherId: "teacher-1",
    present: ["student-25-1", "student-25-3", "student-25-4", "student-25-5", "student-25-6"],
    absent: ["student-25-2"],
    isNoAbsence: false
  };
  batch.set(doc(db, ATTENDANCE_COLL, "attendance-seed-1"), {
    ...attendance1,
    timestamp: new Date()
  });

  await batch.commit();
  return true;
}
