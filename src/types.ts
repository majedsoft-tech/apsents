export interface Grade {
  id: string;
  name: string;
}

export interface Class {
  id: string;
  name: string;
  gradeId: string;
}

export interface Teacher {
  id: string;
  name: string;
}

export interface Student {
  id: string;
  name: string;
  gradeId: string;
  classId: string;
}

export interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  period: string; // e.g., "حصة 1", "حصة 2", ...
  gradeId: string;
  classId: string;
  teacherId: string;
  present: string[]; // List of Student IDs
  absent: string[];  // List of Student IDs
  late?: string[];   // List of Student IDs
  isNoAbsence: boolean;
  timestamp: any;
}

export interface BehaviorRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  period: string;
  teacherId: string;
  teacherName: string;
  violation: string;
  timestamp: any;
}

export interface RegisteredUser {
  id: string; // corresponds to uid
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastLogin: number;
  createdAt: number;
  schoolName: string;
  status: "نشط" | "موقوف";
  // Counters for display
  gradesCount?: number;
  classesCount?: number;
  teachersCount?: number;
  studentsCount?: number;
}

