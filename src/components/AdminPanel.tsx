import React, { useState, useEffect } from "react";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord } from "../types";
import { 
  addGrade, 
  deleteGrade, 
  addClass, 
  deleteClass, 
  addTeacher, 
  deleteTeacher, 
  deleteTeachersBatch,
  addStudent, 
  deleteStudent,
  deleteStudentsBatch,
  getAllAttendanceRecords,
  getAllBehaviorRecords,
  addStudentsBatch,
  addTeachersBatch,
  subscribeToAllAttendanceRecords,
  subscribeToAllBehaviorRecords
} from "../dbService";
import { 
  Lock, 
  Unlock, 
  Trash2, 
  Plus, 
  Users, 
  UserPlus, 
  GraduationCap, 
  BarChart3, 
  Calendar, 
  ShieldAlert, 
  Search, 
  Briefcase, 
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  X,
  Check,
  Settings,
  Layers,
  AlertCircle,
  Key,
  Loader2
} from "lucide-react";

interface AdminPanelProps {
  grades: Grade[];
  classes: Class[];
  teachers: Teacher[];
  students: Student[];
  setGrades: React.Dispatch<React.SetStateAction<Grade[]>>;
  setClasses: React.Dispatch<React.SetStateAction<Class[]>>;
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  onRefreshData: () => Promise<void>;
  activeSubTab?: "stats" | "grades" | "teachers" | "students";
  setActiveSubTab?: (tab: "stats" | "grades" | "teachers" | "students") => void;
  isReadOnly?: boolean;
  onTodayStatsChange?: (stats: { absentCount: number; behaviorCount: number }) => void;
  schoolName?: string;
  onSchoolNameChange?: (name: string) => void;
  isSavingSchoolName?: boolean;
}

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayFormattedArabic = () => {
  const d = new Date();
  const weekday = d.toLocaleDateString('ar-SA', { weekday: 'long' });
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${weekday} ${year}/${month}/${day}`;
};

const normalizeArabic = (str: string): string => {
  if (!str) return "";
  return str
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .trim();
};

const getClassCode = (clsName: string) => {
  if (!clsName) return "";
  let name = clsName.replace("الفصل ", "ف").trim();
  const norm = normalizeArabic(name);
  if (norm.includes(normalizeArabic("الأول"))) return "ف1";
  if (norm.includes(normalizeArabic("الثاني"))) return "ف2";
  if (norm.includes(normalizeArabic("الثالث"))) return "ف3";
  if (norm.includes(normalizeArabic("الرابع"))) return "ف4";
  if (norm.includes(normalizeArabic("الخامس"))) return "ف5";
  if (norm.includes(normalizeArabic("السادس"))) return "ف6";
  if (norm.includes(normalizeArabic("السابع"))) return "ف7";
  
  const match = name.match(/\d+/);
  if (match) return `ف${match[0]}`;
  return name;
};

const getPeriodNum = (code: string) => {
  if (!code) return "";
  const match = code.match(/\d+/);
  return match ? match[0] : code;
};

const getClassNum = (code: string) => {
  if (!code) return "";
  const match = code.match(/\d+/);
  return match ? match[0] : code;
};

const getPeriodBadgeStyles = (num: string) => {
  switch (num) {
    case "1":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "2":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "3":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "4":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "5":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "6":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "7":
      return "bg-teal-100 text-teal-800 border-teal-200";
    default:
      return "bg-violet-100 text-violet-800 border-violet-200";
  }
};

const getClassBadgeStyles = (num: string) => {
  switch (num) {
    case "1":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "2":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "3":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "4":
      return "bg-lime-100 text-lime-800 border-lime-200";
    case "5":
      return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
    case "6":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "7":
      return "bg-violet-100 text-violet-800 border-violet-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export default function AdminPanel({ 
  grades, 
  classes, 
  teachers, 
  students, 
  setGrades,
  setClasses,
  setTeachers,
  setStudents,
  onRefreshData,
  activeSubTab: propActiveSubTab,
  setActiveSubTab: propSetActiveSubTab,
  isReadOnly = false,
  onTodayStatsChange,
  schoolName,
  onSchoolNameChange,
  isSavingSchoolName = false
}: AdminPanelProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [pin, setPin] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");

  // Custom Confirmation Dialog State
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const confirmAction = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmState({ title, message, onConfirm });
  };

  // Sub-tabs management
  const [localActiveSubTab, setLocalActiveSubTab] = useState<"stats" | "grades" | "teachers" | "students">("stats");
  const activeSubTab = propActiveSubTab !== undefined ? propActiveSubTab : localActiveSubTab;
  const setActiveSubTab = propSetActiveSubTab !== undefined ? propSetActiveSubTab : setLocalActiveSubTab;

  const [activeStatsTab, setActiveStatsTab] = useState<"attendance" | "selected_attendance" | "behavior" | "student_report">("attendance");
  const [todayStats, setTodayStats] = useState({
    absentCount: 0,
    behaviorCount: 0,
    grade1Entries: [] as any[],
    grade2Entries: [] as any[],
    grade3Entries: [] as any[],
    entriesByGrade: {} as Record<string, any[]>
  });

  // States for student report tab
  const [reportGradeId, setReportGradeId] = useState<string>("");
  const [reportClassId, setReportClassId] = useState<string>("");
  const [reportStudentId, setReportStudentId] = useState<string>("");
  const [studentReportData, setStudentReportData] = useState<{
    attendanceRate: number;
    absentCount: number;
    lateCount: number;
    behaviors: any[];
    history: { date: string; period: string; status: string; teacher: string }[];
  } | null>(null);

  // States for "غياب محدد" (Specific Absence Search)
  const [searchGradeId, setSearchGradeId] = useState<string>("");
  const [searchClassId, setSearchClassId] = useState<string>("");
  const [searchDate, setSearchDate] = useState<string>(getTodayDateString());
  const [searchAttendanceResult, setSearchAttendanceResult] = useState<any[]>([]);

  // Unified Student/Grade/Class selectors
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [showStructureManager, setShowStructureManager] = useState<boolean>(false);
  const [showAddStudentSection, setShowAddStudentSection] = useState<boolean>(false);

  // Student passwords local state (persisted in localStorage)
  const [studentPasswords, setStudentPasswords] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("student_passwords");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    const saved = localStorage.getItem("onboarding_guide_visible");
    return saved !== "false";
  });

  const [temporaryGlow, setTemporaryGlow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTemporaryGlow(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("student_passwords", JSON.stringify(studentPasswords));
  }, [studentPasswords]);

  const handleUpdatePassword = (studentId: string, value: string) => {
    setStudentPasswords(prev => ({
      ...prev,
      [studentId]: value
    }));
  };

  const handleAutoGeneratePasswords = () => {
    const currentClassStudents = students.filter(s => s.classId === selectedClassId);
    if (currentClassStudents.length === 0) {
      showMessage("لا يوجد طلاب في هذا الفصل لتوليد كلمات مرور لهم.", "error");
      return;
    }
    
    setStudentPasswords(prev => {
      const updated = { ...prev };
      currentClassStudents.forEach(st => {
        if (!updated[st.id]) {
          const rand = Math.floor(1000 + Math.random() * 9000).toString();
          updated[st.id] = rand;
        }
      });
      return updated;
    });
    showMessage("تم توليد كلمات مرور تلقائية بنجاح للطلاب الذين لم يمتلكوا واحدة بعد! 🔑");
  };

  const handleClearAllPasswords = () => {
    confirmAction(
      "مسح كلمات المرور",
      "هل أنت متأكد من رغبتك في مسح كافة كلمات المرور لطلاب هذا الفصل؟ لا يمكن التراجع عن هذا الإجراء.",
      () => {
        const currentClassStudents = students.filter(s => s.classId === selectedClassId);
        setStudentPasswords(prev => {
          const updated = { ...prev };
          currentClassStudents.forEach(st => {
            delete updated[st.id];
          });
          return updated;
        });
        showMessage("تم مسح كلمات مرور طلاب هذا الفصل بنجاح.");
      }
    );
  };

  // Sync selected grade
  useEffect(() => {
    if (grades.length > 0) {
      if (!selectedGradeId || !grades.some(g => g.id === selectedGradeId)) {
        setSelectedGradeId(grades[0].id);
      }
    } else {
      setSelectedGradeId("");
    }
  }, [grades, selectedGradeId]);

  // Sync selected class
  useEffect(() => {
    if (selectedGradeId) {
      const gradeClasses = classes.filter(c => c.gradeId === selectedGradeId);
      if (gradeClasses.length > 0) {
        if (!selectedClassId || !gradeClasses.some(c => c.id === selectedClassId)) {
          setSelectedClassId(gradeClasses[0].id);
        }
      } else {
        setSelectedClassId("");
      }
    } else {
      setSelectedClassId("");
    }
  }, [selectedGradeId, classes, selectedClassId]);

  // Manual input states
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  // Reset student selection when class changes
  useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedClassId]);

  // Reset teacher selection when tab changes
  useEffect(() => {
    setSelectedTeacherIds([]);
  }, [activeSubTab]);

  const [newGradeName, setNewGradeName] = useState<string>("");
  const [newClassName, setNewClassName] = useState<string>("");
  const [newClassGradeId, setNewClassGradeId] = useState<string>("");
  const [newTeacherName, setNewTeacherName] = useState<string>("");
  const [newStudentName, setNewStudentName] = useState<string>("");
  const [newStudentGradeId, setNewStudentGradeId] = useState<string>("");
  const [newStudentClassId, setNewStudentClassId] = useState<string>("");
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>("");
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>("");

  // Sync manual input targets with active selections for student forms
  useEffect(() => {
    if (selectedGradeId) {
      setNewStudentGradeId(selectedGradeId);
    }
  }, [selectedGradeId]);

  useEffect(() => {
    if (selectedClassId) {
      setNewStudentClassId(selectedClassId);
    }
  }, [selectedClassId]);

  // Visual customizer states for Grades & Classes (screenshot matching)
  const [selectedGradeIdForClasses, setSelectedGradeIdForClasses] = useState<string>("");
  const [selectedClassNumber, setSelectedClassNumber] = useState<number>(1);

  // Addition methods / modes (Individual form vs attached file Excel)
  const [studentAddMode, setStudentAddMode] = useState<"individual" | "excel">("individual");
  const [teacherAddMode, setTeacherAddMode] = useState<"individual" | "excel">("individual");
  const [gradesAddMode, setGradesAddMode] = useState<"individual" | "excel">("individual");

  const [hasClickedStudentSwitcher, setHasClickedStudentSwitcher] = useState<boolean>(false);
  const [hasClickedTeacherSwitcher, setHasClickedTeacherSwitcher] = useState<boolean>(false);

  useEffect(() => {
    setHasClickedStudentSwitcher(false);
    setHasClickedTeacherSwitcher(false);
  }, [activeSubTab]);

  // Copy and Paste text state
  const [pastedStudentsText, setPastedStudentsText] = useState<string>("");
  const [pastedTeachersText, setPastedTeachersText] = useState<string>("");

  // Drag and Drop files state
  const [attachedStudentFile, setAttachedStudentFile] = useState<File | null>(null);
  const [parsedStudentNames, setParsedStudentNames] = useState<string[]>([]);
  const [isStudentDragging, setIsStudentDragging] = useState<boolean>(false);

  const [attachedTeacherFile, setAttachedTeacherFile] = useState<File | null>(null);
  const [parsedTeacherNames, setParsedTeacherNames] = useState<string[]>([]);
  const [isTeacherDragging, setIsTeacherDragging] = useState<boolean>(false);

  const [attachedGradesFile, setAttachedGradesFile] = useState<File | null>(null);
  const [parsedGradesStructure, setParsedGradesStructure] = useState<{ gradeName: string; className?: string }[]>([]);
  const [isGradesDragging, setIsGradesDragging] = useState<boolean>(false);

  // Reactive parsing of pasted students list
  useEffect(() => {
    const lines = pastedStudentsText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("#"));
    setParsedStudentNames(lines);
  }, [pastedStudentsText]);

  // Reactive parsing of pasted teachers list
  useEffect(() => {
    const lines = pastedTeachersText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("#"));
    setParsedTeacherNames(lines);
  }, [pastedTeachersText]);

  // Statistics state
  const [stats, setStats] = useState({
    totalAbsencesCount: 0,
    totalBehaviorLogs: 0,
    absenteeRankings: [] as { name: string; count: number; className: string }[],
    violationRankings: [] as { name: string; count: number }[],
    recentLogs: [] as { type: "حضور" | "سلوك"; title: string; subtitle: string; date: string }[]
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  // Feedback Messages
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Custom Alert Modal State for duplicates
  const [alertState, setAlertState] = useState<{
    title: string;
    message: string;
    type?: "warning" | "info" | "success";
  } | null>(null);

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Set default selected grade for customizer
  useEffect(() => {
    if (grades.length > 0 && !selectedGradeIdForClasses) {
      setSelectedGradeIdForClasses(grades[0].id);
    }
  }, [grades, selectedGradeIdForClasses]);

  // Set default student grade & class
  useEffect(() => {
    if (grades.length > 0 && !newStudentGradeId) {
      setNewStudentGradeId(grades[0].id);
    }
  }, [grades, newStudentGradeId]);

  useEffect(() => {
    if (newStudentGradeId) {
      const filtered = classes.filter(c => c.gradeId === newStudentGradeId);
      if (filtered.length > 0) {
        setNewStudentClassId(filtered[0].id);
      } else {
        setNewStudentClassId("");
      }
    }
  }, [newStudentGradeId, classes]);

  // Submit PIN for authorization
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(prev => ({ ...prev, pin: true }));
    setTimeout(() => {
      if (pin === "1234") {
        setIsAuthenticated(true);
        setPinError("");
        loadStatistics();
      } else {
        setPinError("رمز المرور خاطئ! الرجاء المحاولة مرة أخرى.");
        setPin("");
      }
      setSubmitting(prev => ({ ...prev, pin: false }));
    }, 450);
  };

  // Delete specific student absence record
  const handleDeleteAbsence = async (recordId: string, studentId: string, isAbsentType: boolean) => {
    const isNoAbsenceDummy = studentId === "no-absence";
    const title = isNoAbsenceDummy ? "حذف التحضير بالكامل" : "حذف تسجيل الغياب";
    const message = isNoAbsenceDummy 
      ? "هل أنت متأكد من رغبتك في حذف سجل التحضير الكامل (حضور الجميع) لهذه الحصة؟"
      : "هل أنت متأكد من رغبتك في حذف تسجيل غياب هذا الطالب من هذه الحصة؟";

    confirmAction(
      title,
      message,
      async () => {
        try {
          setStatsLoading(true);
          const { db } = await import("../firebase");
          const { doc, getDoc, setDoc, deleteDoc } = await import("firebase/firestore");
          
          const docRef = doc(db, "attendance", recordId);

          if (isNoAbsenceDummy) {
            await deleteDoc(docRef);
            showMessage("تم حذف سجل التحضير بنجاح!");
            await loadStatistics();
            return;
          }

          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            let updatedAbsent = data.absent || [];
            let updatedLate = data.late || [];
            
            if (isAbsentType) {
              updatedAbsent = updatedAbsent.filter((id: string) => id !== studentId);
            } else {
              updatedLate = updatedLate.filter((id: string) => id !== studentId);
            }
            
            const isNoAbsence = updatedAbsent.length === 0 && updatedLate.length === 0;
            
            await setDoc(docRef, {
              absent: updatedAbsent,
              late: updatedLate,
              isNoAbsence
            }, { merge: true });
            
            showMessage("تم حذف تسجيل الغياب بنجاح!");
            await loadStatistics();
          }
        } catch (e) {
          console.error("Error deleting absence:", e);
          showMessage("حدث خطأ أثناء حذف الغياب", "error");
        } finally {
          setStatsLoading(false);
        }
      }
    );
  };

  const computeStatistics = (attendance: AttendanceRecord[], behaviors: BehaviorRecord[]) => {
    try {
      // Absences analysis
      let totalAbsCount = 0;
      const studentAbsMap: Record<string, number> = {};
      
      attendance.forEach(record => {
        if (!record.isNoAbsence && record.absent) {
          totalAbsCount += record.absent.length;
          record.absent.forEach(studentId => {
            studentAbsMap[studentId] = (studentAbsMap[studentId] || 0) + 1;
          });
        }
      });

      const absenteeRankings = Object.entries(studentAbsMap)
        .map(([studentId, count]) => {
          const student = students.find(s => s.id === studentId);
          const studentClass = classes.find(c => c.id === student?.classId)?.name || "بدون فصل";
          return {
            name: student ? student.name : "طالب غير معروف",
            count,
            className: studentClass
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Behavior violations frequencies
      const violationMap: Record<string, number> = {};
      behaviors.forEach(b => {
        violationMap[b.violation] = (violationMap[b.violation] || 0) + 1;
      });

      const violationRankings = Object.entries(violationMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Recent activities feed
      const recentLogs: typeof stats.recentLogs = [];
      const sortedAttendance = [...attendance]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      sortedAttendance.forEach(rec => {
        const gradeName = grades.find(g => g.id === rec.gradeId)?.name || "";
        const className = classes.find(c => c.id === rec.classId)?.name || "";
        const absentCount = rec.isNoAbsence ? 0 : (rec.absent?.length || 0);
        const lateCount = rec.late?.length || 0;
        
        recentLogs.push({
          type: "حضور",
          title: `تسجيل حضور ${gradeName} - ${className}`,
          subtitle: `غياب: ${absentCount} طلاب، متأخرين: ${lateCount} طلاب • الحصة: ${rec.period}`,
          date: rec.date
        });
      });

      const sortedBehaviors = [...behaviors]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      sortedBehaviors.forEach(b => {
        const studentName = students.find(s => s.id === b.studentId)?.name || "طالب";
        recentLogs.push({
          type: "سلوك",
          title: `سلوك سلبي: ${studentName}`,
          subtitle: `المخالفة: ${b.violation}`,
          date: b.date
        });
      });

      // Sort combined logs by date descending
      recentLogs.sort((a, b) => b.date.localeCompare(a.date));

      setStats({
        totalAbsencesCount: totalAbsCount,
        totalBehaviorLogs: behaviors.length,
        absenteeRankings,
        violationRankings,
        recentLogs: recentLogs.slice(0, 8)
      });

      // Calculate today stats
      const TODAY_DATE = getTodayDateString();
      const todayAttendance = attendance.filter(rec => rec.date === TODAY_DATE);
      const todayBehaviors = behaviors.filter(b => b.date === TODAY_DATE);

      // Absent today (unique student counts)
      const todayAbsentSet = new Set<string>();
      todayAttendance.forEach(rec => {
        if (!rec.isNoAbsence && rec.absent) {
          rec.absent.forEach(id => todayAbsentSet.add(id));
        }
      });
      const absentCount = todayAbsentSet.size;
      const behaviorCount = todayBehaviors.length;

      // Group attendance into columns
      const PERIOD_TIMES: Record<string, string> = {
        "الأولى": "08:00",
        "الثانية": "08:45",
        "الثالثة": "09:30",
        "الرابعة": "10:30",
        "الخامسة": "11:15",
        "السادسة": "12:00",
        "السابعة": "12:45"
      };

      const PERIOD_CODES: Record<string, string> = {
        "الأولى": "ح1",
        "الثانية": "ح2",
        "الثالثة": "ح3",
        "الرابعة": "ح4",
        "الخامسة": "ح5",
        "السادسة": "ح6",
        "السابعة": "ح7"
      };

      const getPeriodCode = (p: string) => PERIOD_CODES[p] || p;
      const getPeriodTime = (p: string) => PERIOD_TIMES[p] || "08:00";

      const g1Entries: any[] = [];
      const g2Entries: any[] = [];
      const g3Entries: any[] = [];
      const entriesByGrade: Record<string, any[]> = {};
      grades.forEach(g => {
        entriesByGrade[g.id] = [];
      });

      todayAttendance.forEach(rec => {
        const grade = grades.find(g => g.id === rec.gradeId);
        const cls = classes.find(c => c.id === rec.classId);
        if (!grade) return;

        const gradeName = grade.name;
        const className = cls?.name || "فصل";
        const teacherName = teachers.find(t => t.id === rec.teacherId)?.name || "غير محدد";

        const pCode = getPeriodCode(rec.period);
        const pTime = getPeriodTime(rec.period);
        const cCode = getClassCode(className);

        let actualTime = "";
        if (rec.timestamp) {
          try {
            let dateObj: Date | null = null;
            if (typeof rec.timestamp.toDate === "function") {
              dateObj = rec.timestamp.toDate();
            } else if (rec.timestamp.seconds) {
              dateObj = new Date(rec.timestamp.seconds * 1000);
            } else if (typeof rec.timestamp === "object" && rec.timestamp instanceof Date) {
              dateObj = rec.timestamp;
            } else if (typeof rec.timestamp === "number" || typeof rec.timestamp === "string") {
              dateObj = new Date(rec.timestamp);
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
              const h = String(dateObj.getHours()).padStart(2, '0');
              const m = String(dateObj.getMinutes()).padStart(2, '0');
              actualTime = `${h}:${m}`;
            }
          } catch (err) {
            console.error("Error parsing timestamp:", err);
          }
        }

        const displayTime = actualTime || pTime;

        // Process absent students
        if (!rec.isNoAbsence && rec.absent && rec.absent.length > 0) {
          rec.absent.forEach(stId => {
            const student = students.find(s => s.id === stId);
            if (student) {
              const entry = {
                id: `${rec.id}-${stId}-abs`,
                recordId: rec.id,
                studentId: stId,
                studentName: student.name,
                status: "غائب",
                periodCode: pCode,
                classCode: cCode,
                classId: rec.classId,
                gradeId: rec.gradeId,
                teacherName,
                time: displayTime,
                isAbsent: true
              };

              if (!entriesByGrade[rec.gradeId]) {
                entriesByGrade[rec.gradeId] = [];
              }
              entriesByGrade[rec.gradeId].push(entry);

              const normGrade = normalizeArabic(gradeName);
              if (normGrade.includes(normalizeArabic("الأول"))) {
                g1Entries.push(entry);
              } else if (normGrade.includes(normalizeArabic("الثاني"))) {
                g2Entries.push(entry);
              } else if (normGrade.includes(normalizeArabic("الثالث"))) {
                g3Entries.push(entry);
              }
            }
          });
        } else {
          // All students present / No absence
          const entry = {
            id: `${rec.id}-noabs`,
            recordId: rec.id,
            studentId: "no-absence",
            studentName: "لا يوجد غياب",
            status: "حضور كامل",
            periodCode: pCode,
            classCode: cCode,
            classId: rec.classId,
            gradeId: rec.gradeId,
            teacherName,
            time: displayTime,
            isAbsent: false,
            isNoAbsenceDummy: true
          };

          if (!entriesByGrade[rec.gradeId]) {
            entriesByGrade[rec.gradeId] = [];
          }
          entriesByGrade[rec.gradeId].push(entry);

          const normGrade = normalizeArabic(gradeName);
          if (normGrade.includes(normalizeArabic("الأول"))) {
            g1Entries.push(entry);
          } else if (normGrade.includes(normalizeArabic("الثاني"))) {
            g2Entries.push(entry);
          } else if (normGrade.includes(normalizeArabic("الثالث"))) {
            g3Entries.push(entry);
          }
        }
      });

      setTodayStats({
        absentCount,
        behaviorCount,
        grade1Entries: g1Entries,
        grade2Entries: g2Entries,
        grade3Entries: g3Entries,
        entriesByGrade
      });

      if (onTodayStatsChange) {
        onTodayStatsChange({ absentCount, behaviorCount });
      }
    } catch (e) {
      console.error("Error computing stats:", e);
    }
  };

  // Load stats from database
  const loadStatistics = async () => {
    setStatsLoading(true);
    try {
      const attendance = await getAllAttendanceRecords();
      const behaviors = await getAllBehaviorRecords();
      computeStatistics(attendance, behaviors);
    } catch (e) {
      console.error("Error loading stats:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  // Load specific student report
  const loadStudentReport = async (stId: string) => {
    if (!stId) {
      setStudentReportData(null);
      return;
    }
    try {
      const student = students.find(s => s.id === stId);
      if (!student) return;

      const attendance = await getAllAttendanceRecords();
      const behaviors = await getAllBehaviorRecords();

      const classRecords = attendance.filter(rec => rec.gradeId === student.gradeId && rec.classId === student.classId);
      const totalLessons = classRecords.length;

      let absentCount = 0;
      let lateCount = 0;
      const history: any[] = [];

      classRecords.forEach(rec => {
        const isStudentAbsent = !rec.isNoAbsence && rec.absent?.includes(stId);
        const isStudentLate = !rec.isNoAbsence && rec.late?.includes(stId);

        if (isStudentAbsent) {
          absentCount++;
          history.push({
            date: rec.date,
            period: rec.period,
            status: "غائب",
            teacher: teachers.find(t => t.id === rec.teacherId)?.name || "غير محدد"
          });
        } else if (isStudentLate) {
          lateCount++;
          history.push({
            date: rec.date,
            period: rec.period,
            status: "متأخر",
            teacher: teachers.find(t => t.id === rec.teacherId)?.name || "غير محدد"
          });
        }
      });

      history.sort((a, b) => b.date.localeCompare(a.date));
      const studentBehaviors = behaviors.filter(b => b.studentId === stId);
      const attendanceRate = totalLessons > 0 
        ? Math.round(((totalLessons - absentCount) / totalLessons) * 100) 
        : 100;

      setStudentReportData({
        attendanceRate,
        absentCount,
        lateCount,
        behaviors: studentBehaviors,
        history
      });
    } catch (e) {
      console.error("Error loading student report:", e);
    }
  };

  // Load specific absence search results
  const loadSpecificAbsenceSearch = async (gId: string, cId: string, dateStr: string) => {
    if (!gId || !cId) {
      setSearchAttendanceResult([]);
      return;
    }
    try {
      const attendance = await getAllAttendanceRecords();
      const records = attendance.filter(rec => rec.gradeId === gId && rec.classId === cId && rec.date === dateStr);
      
      const results: any[] = [];
      records.forEach(rec => {
        if (!rec.isNoAbsence) {
          (rec.absent || []).forEach(stId => {
            const student = students.find(s => s.id === stId);
            if (student) {
              results.push({
                id: `${rec.id}-${stId}-abs`,
                studentName: student.name,
                status: "غائب",
                period: rec.period,
                teacherName: teachers.find(t => t.id === rec.teacherId)?.name || "غير محدد"
              });
            }
          });
          (rec.late || []).forEach(stId => {
            const student = students.find(s => s.id === stId);
            if (student) {
              results.push({
                id: `${rec.id}-${stId}-late`,
                studentName: student.name,
                status: "متأخر",
                period: rec.period,
                teacherName: teachers.find(t => t.id === rec.teacherId)?.name || "غير محدد"
              });
            }
          });
        }
      });
      setSearchAttendanceResult(results);
    } catch (e) {
      console.error("Error loading specific absence search:", e);
    }
  };

  useEffect(() => {
    if (activeSubTab === "stats" && activeStatsTab === "student_report" && reportStudentId) {
      loadStudentReport(reportStudentId);
    }
  }, [reportStudentId, activeStatsTab, activeSubTab, students]);

  useEffect(() => {
    if (activeSubTab === "stats" && activeStatsTab === "selected_attendance" && searchGradeId && searchClassId && searchDate) {
      loadSpecificAbsenceSearch(searchGradeId, searchClassId, searchDate);
    }
  }, [searchGradeId, searchClassId, searchDate, activeStatsTab, activeSubTab, students]);

  useEffect(() => {
    if (grades.length > 0 && !reportGradeId) {
      setReportGradeId(grades[0].id);
    }
    if (grades.length > 0 && !searchGradeId) {
      setSearchGradeId(grades[0].id);
    }
  }, [grades]);

  useEffect(() => {
    if (reportGradeId) {
      const filtered = classes.filter(c => c.gradeId === reportGradeId);
      if (filtered.length > 0) {
        setReportClassId(filtered[0].id);
      } else {
        setReportClassId("");
        setReportStudentId("");
      }
    }
  }, [reportGradeId, classes]);

  useEffect(() => {
    if (reportClassId) {
      const filtered = students.filter(s => s.classId === reportClassId);
      if (filtered.length > 0) {
        setReportStudentId(filtered[0].id);
      } else {
        setReportStudentId("");
      }
    } else {
      setReportStudentId("");
    }
  }, [reportClassId, students]);

  useEffect(() => {
    if (searchGradeId) {
      const filtered = classes.filter(c => c.gradeId === searchGradeId);
      if (filtered.length > 0) {
        setSearchClassId(filtered[0].id);
      } else {
        setSearchClassId("");
      }
    }
  }, [searchGradeId, classes]);

  useEffect(() => {
    if ((isAuthenticated || isReadOnly) && activeSubTab === "stats") {
      setStatsLoading(true);
      
      let currentAttendance: AttendanceRecord[] = [];
      let currentBehaviors: BehaviorRecord[] = [];
      
      const runCompute = () => {
        computeStatistics(currentAttendance, currentBehaviors);
        setStatsLoading(false);
      };

      const unsubAttendance = subscribeToAllAttendanceRecords(
        (records) => {
          currentAttendance = records;
          runCompute();
        },
        (error) => {
          console.error("Error in attendance subscription:", error);
        }
      );

      const unsubBehaviors = subscribeToAllBehaviorRecords(
        (records) => {
          currentBehaviors = records;
          runCompute();
        },
        (error) => {
          console.error("Error in behaviors subscription:", error);
        }
      );

      return () => {
        unsubAttendance();
        unsubBehaviors();
      };
    }
  }, [isAuthenticated, isReadOnly, activeSubTab, students, classes, grades]);

  // --- CRUD HANDLERS (Grades & Classes) ---
  const handleAddGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGradeName.trim()) return;
    setSubmitting(prev => ({ ...prev, addGrade: true }));
    try {
      const newId = await addGrade(newGradeName.trim());
      setGrades(prev => {
        const updated = [...prev, { id: newId, name: newGradeName.trim(), createdAt: Date.now() }];
        return updated.sort((a, b) => {
          const timeA = (a as any).createdAt || 0;
          const timeB = (b as any).createdAt || 0;
          if (timeA !== timeB) return timeA - timeB; // oldest first
          return a.name.localeCompare(b.name, "ar");
        });
      });
      setNewGradeName("");
      setSelectedGradeIdForClasses(newId);
      showMessage("تم إضافة الصف بنجاح!");
      onRefreshData().catch(console.error);
    } catch (e) {
      showMessage("حدث خطأ أثناء إضافة الصف", "error");
    } finally {
      setSubmitting(prev => ({ ...prev, addGrade: false }));
    }
  };

  const handleDeleteGrade = (id: string, name: string) => {
    confirmAction(
      "حذف الصف الدراسي",
      `هل أنت متأكد من حذف ${name}؟ سيتم حذف جميع الفصول والطلاب التابعين له تلقائياً ولا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        setSubmitting(prev => ({ ...prev, ['deleteGrade_' + id]: true }));
        try {
          setGrades(prev => prev.filter(g => g.id !== id));
          setClasses(prev => prev.filter(c => c.gradeId !== id));
          setStudents(prev => prev.filter(s => s.gradeId !== id));
          if (selectedGradeIdForClasses === id) {
            setSelectedGradeIdForClasses("");
          }
          await deleteGrade(id);
          showMessage("تم حذف الصف وفصوله بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء الحذف", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, ['deleteGrade_' + id]: false }));
        }
      }
    );
  };

  // Automated/Sequence Class Adding (matching screenshot functionality)
  const handleAddClassSequence = async () => {
    if (!selectedGradeIdForClasses) {
      showMessage("الرجاء اختيار صف دراسي أولاً لتثبيت الفصول عليه", "error");
      return;
    }
    const className = `الفصل ${selectedClassNumber}`;
    // Check if class already exists in this grade
    const existsInGrade = classes.some(c => c.gradeId === selectedGradeIdForClasses && c.name === className);
    if (existsInGrade) {
      showMessage(`الفصل ${selectedClassNumber} مسجل مسبقاً في هذا الصف`, "error");
      return;
    }

    setSubmitting(prev => ({ ...prev, addClass: true }));
    try {
      const newId = await addClass(className, selectedGradeIdForClasses);
      setClasses(prev => {
        const updated = [...prev, { id: newId, name: className, gradeId: selectedGradeIdForClasses }];
        const getNumberFromName = (name: string): number => {
          const match = name.match(/\d+/);
          return match ? parseInt(match[0], 10) : 999999;
        };
        return updated.sort((a, b) => {
          const numA = getNumberFromName(a.name);
          const numB = getNumberFromName(b.name);
          if (numA !== numB) return numA - numB;
          return a.name.localeCompare(b.name, "ar");
        });
      });
      showMessage(`تم إضافة ${className} بنجاح!`);
      // Auto advance class sequence number for ease of configuration
      if (selectedClassNumber < 10) {
        setSelectedClassNumber(prev => prev + 1);
      }
      onRefreshData().catch(console.error);
    } catch (e) {
      showMessage("حدث خطأ أثناء إضافة الفصل", "error");
    } finally {
      setSubmitting(prev => ({ ...prev, addClass: false }));
    }
  };

  const handleDeleteClass = (id: string, name: string) => {
    confirmAction(
      "حذف الفصل الدراسي",
      `هل أنت متأكد من حذف فصل ${name}؟ لا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        setSubmitting(prev => ({ ...prev, ['deleteClass_' + id]: true }));
        try {
          setClasses(prev => prev.filter(c => c.id !== id));
          setStudents(prev => prev.filter(s => s.classId !== id));
          await deleteClass(id);
          showMessage("تم حذف الفصل بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء الحذف", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, ['deleteClass_' + id]: false }));
        }
      }
    );
  };

  // --- CRUD HANDLERS (Teachers) ---
  const handleAddTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTeacherName.trim();
    if (!trimmedName) return;

    // Duplicate check
    const isDuplicate = teachers.some(t => t.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (isDuplicate) {
      setAlertState({
        title: "تنبيه: المعلم مكرر ⚠️",
        message: `المعلم "${trimmedName}" مسجل بالفعل في النظام.\n\nتم تجاهل الإضافة لوجود تكرار (عدد التكرار: 1). تم تجاهل هذا الاسم لتفادي التكرار.`,
        type: "warning"
      });
      return;
    }

    setSubmitting(prev => ({ ...prev, addTeacher: true }));
    try {
      const newId = await addTeacher(trimmedName);
      setTeachers(prev => {
        const updated = [...prev, { id: newId, name: trimmedName }];
        return updated.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      });
      setNewTeacherName("");
      showMessage("تم إضافة المعلم بنجاح!");
      onRefreshData().catch(console.error);
    } catch (e) {
      showMessage("حدث خطأ أثناء إضافة المعلم", "error");
    } finally {
      setSubmitting(prev => ({ ...prev, addTeacher: false }));
    }
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    confirmAction(
      "حذف المعلم",
      `هل أنت متأكد من حذف المعلم ${name}؟ لا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        setSubmitting(prev => ({ ...prev, ['deleteTeacher_' + id]: true }));
        try {
          setSelectedTeacherIds(prev => prev.filter(tId => tId !== id));
          setTeachers(prev => prev.filter(t => t.id !== id));
          await deleteTeacher(id);
          showMessage("تم حذف المعلم بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء الحذف", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, ['deleteTeacher_' + id]: false }));
        }
      }
    );
  };

  // --- CRUD HANDLERS (Students) ---
  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newStudentName.trim();
    if (!trimmedName || !newStudentGradeId || !newStudentClassId) {
      showMessage("يرجى إدخال اسم الطالب واختيار الصف والفصل", "error");
      return;
    }

    // Duplicate check in this class
    const isDuplicate = students.some(
      s => s.name.trim().toLowerCase() === trimmedName.toLowerCase() && s.classId === newStudentClassId
    );
    if (isDuplicate) {
      const cls = classes.find(c => c.id === newStudentClassId);
      const className = cls ? cls.name : "الفصل المحدد";
      setAlertState({
        title: "تنبيه: الطالب مكرر ⚠️",
        message: `الطالب "${trimmedName}" مسجل بالفعل في ${className}.\n\nتم تجاهل الإضافة لوجود تكرار (عدد التكرار: 1). تم تجاهل هذا الاسم لتفادي التكرار.`,
        type: "warning"
      });
      return;
    }

    setSubmitting(prev => ({ ...prev, addStudent: true }));
    try {
      const newId = await addStudent(trimmedName, newStudentGradeId, newStudentClassId);
      setStudents(prev => [...prev, { id: newId, name: trimmedName, gradeId: newStudentGradeId, classId: newStudentClassId }].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setNewStudentName("");
      showMessage("تم إضافة الطالب بنجاح!");
      onRefreshData().catch(console.error);
    } catch (e) {
      showMessage("حدث خطأ أثناء إضافة الطالب", "error");
    } finally {
      setSubmitting(prev => ({ ...prev, addStudent: false }));
    }
  };

  const handleDeleteStudent = (id: string, name: string) => {
    confirmAction(
      "حذف الطالب",
      `هل أنت متأكد من حذف الطالب ${name}؟ لا يمكن التراجع عن هذا الإجراء.`,
      async () => {
        setSubmitting(prev => ({ ...prev, ['deleteStudent_' + id]: true }));
        try {
          setSelectedStudentIds(prev => prev.filter(sId => sId !== id));
          setStudents(prev => prev.filter(s => s.id !== id));
          await deleteStudent(id);
          showMessage("تم حذف الطالب بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء الحذف", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, ['deleteStudent_' + id]: false }));
        }
      }
    );
  };

  const handleDeleteSelectedStudents = () => {
    if (selectedStudentIds.length === 0) return;
    confirmAction(
      "حذف الطلاب المحددين",
      `هل أنت متأكد من حذف عدد ${selectedStudentIds.length} طالب دفعة واحدة؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف بياناتهم بشكل كامل.`,
      async () => {
        setSubmitting(prev => ({ ...prev, deleteSelectedStudents: true }));
        try {
          const idsToDelete = [...selectedStudentIds];
          setSelectedStudentIds([]);
          setStudents(prev => prev.filter(s => !idsToDelete.includes(s.id)));
          showMessage(`جاري حذف ${idsToDelete.length} طالب...`);
          
          await deleteStudentsBatch(idsToDelete);
          showMessage("تم حذف الطلاب المحددين بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء حذف الطلاب", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, deleteSelectedStudents: false }));
        }
      }
    );
  };

  const handleDeleteSelectedTeachers = () => {
    if (selectedTeacherIds.length === 0) return;
    confirmAction(
      "حذف المعلمين المحددين",
      `هل أنت متأكد من حذف عدد ${selectedTeacherIds.length} معلم دفعة واحدة؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف بياناتهم بشكل كامل.`,
      async () => {
        setSubmitting(prev => ({ ...prev, deleteSelectedTeachers: true }));
        try {
          const idsToDelete = [...selectedTeacherIds];
          setSelectedTeacherIds([]);
          setTeachers(prev => prev.filter(t => !idsToDelete.includes(t.id)));
          showMessage(`جاري حذف ${idsToDelete.length} معلم...`);
          
          await deleteTeachersBatch(idsToDelete);
          showMessage("تم حذف المعلمين المحددين بنجاح!");
          onRefreshData().catch(console.error);
        } catch (e) {
          showMessage("حدث خطأ أثناء حذف المعلمين", "error");
        } finally {
          setSubmitting(prev => ({ ...prev, deleteSelectedTeachers: false }));
        }
      }
    );
  };

  // --- DRAG AND DROP FILE PARSING & IMPORTING ---
  
  // Student File processing
  const handleStudentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processStudentFile(file);
  };

  const processStudentFile = (file: File) => {
    setAttachedStudentFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith("#"));
      setParsedStudentNames(lines);
    };
    reader.readAsText(file);
  };

  const handleStudentImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentGradeId || !newStudentClassId || parsedStudentNames.length === 0) {
      showMessage("يرجى التأكد من اختيار الصف والفصل ولصق أسماء الطلاب", "error");
      return;
    }
    setSubmitting(prev => ({ ...prev, importStudents: true }));
    try {
      setStatsLoading(true);
      
      const uniqueNamesInImport: string[] = [];
      const duplicatesInImport: string[] = [];
      const duplicatesWithDb: string[] = [];
      
      parsedStudentNames.forEach(name => {
        const trimmed = name.trim();
        if (!trimmed) return;
        
        // Check if duplicate in the same import file/pasted list
        const isDupImport = uniqueNamesInImport.some(un => un.toLowerCase() === trimmed.toLowerCase());
        // Check if duplicate with already registered students in this class
        const isDupDb = students.some(s => s.name.trim().toLowerCase() === trimmed.toLowerCase() && s.classId === newStudentClassId);
        
        if (isDupDb) {
          duplicatesWithDb.push(trimmed);
        } else if (isDupImport) {
          duplicatesInImport.push(trimmed);
        } else {
          uniqueNamesInImport.push(trimmed);
        }
      });
      
      const totalSkipped = duplicatesWithDb.length + duplicatesInImport.length;
      
      if (uniqueNamesInImport.length === 0) {
        setAlertState({
          title: "تنبيه: كافة الطلاب مكررين ⚠️",
          message: `جميع الأسماء المدخلة (${totalSkipped} طالب) مكررة ومسجلة بالفعل في هذا الفصل أو مكررة في القائمة المدخلة. تم تجاهل الإضافة لتفادي التكرار.`,
          type: "warning"
        });
        setPastedStudentsText("");
        setParsedStudentNames([]);
        return;
      }
      
      const studentsList = uniqueNamesInImport.map(name => ({
        name: name,
        gradeId: newStudentGradeId,
        classId: newStudentClassId
      }));
      
      await addStudentsBatch(studentsList);
      setPastedStudentsText("");
      setParsedStudentNames([]);
      await onRefreshData();
      
      if (totalSkipped > 0) {
        setAlertState({
          title: "تم الاستيراد بنجاح مع تجاهل المكررين 📋",
          message: `تم بنجاح استيراد وتسجيل عدد ${uniqueNamesInImport.length} طالب جديد بالفصل.\n\nتم تجاهل عدد ${totalSkipped} طالب مكرر ولم يتم إضافتهم منعاً للتكرار في قاعدة البيانات:\n• مكرر مع قاعدة البيانات: ${duplicatesWithDb.length > 0 ? duplicatesWithDb.join("، ") : "لا يوجد"}\n• مكرر في الملف المرفق: ${duplicatesInImport.length > 0 ? duplicatesInImport.join("، ") : "لا يوجد"}`,
          type: "warning"
        });
      } else {
        showMessage(`تم بنجاح استيراد وتسجيل ${uniqueNamesInImport.length} طالب للفصل المحدد!`);
      }
    } catch (err) {
      showMessage("حدث خطأ أثناء استيراد قائمة الطلاب", "error");
    } finally {
      setStatsLoading(false);
      setSubmitting(prev => ({ ...prev, importStudents: false }));
    }
  };

  // Teacher File processing
  const handleTeacherFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processTeacherFile(file);
  };

  const processTeacherFile = (file: File) => {
    setAttachedTeacherFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith("#"));
      setParsedTeacherNames(lines);
    };
    reader.readAsText(file);
  };

  const handleTeacherImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedTeacherNames.length === 0) {
      showMessage("يرجى لصق أسماء المعلمين أولاً", "error");
      return;
    }
    setSubmitting(prev => ({ ...prev, importTeachers: true }));
    try {
      setStatsLoading(true);
      
      const uniqueNamesInImport: string[] = [];
      const duplicatesInImport: string[] = [];
      const duplicatesWithDb: string[] = [];
      
      parsedTeacherNames.forEach(name => {
        const trimmed = name.trim();
        if (!trimmed) return;
        
        // Check if duplicate in the same import file/pasted list
        const isDupImport = uniqueNamesInImport.some(un => un.toLowerCase() === trimmed.toLowerCase());
        // Check if duplicate with already registered teachers in db
        const isDupDb = teachers.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase());
        
        if (isDupDb) {
          duplicatesWithDb.push(trimmed);
        } else if (isDupImport) {
          duplicatesInImport.push(trimmed);
        } else {
          uniqueNamesInImport.push(trimmed);
        }
      });
      
      const totalSkipped = duplicatesWithDb.length + duplicatesInImport.length;
      
      if (uniqueNamesInImport.length === 0) {
        setAlertState({
          title: "تنبيه: كافة المعلمين مكررين ⚠️",
          message: `جميع الأسماء المدخلة (${totalSkipped} معلم) مكررة ومسجلة بالفعل في المدرسة أو مكررة في القائمة المدخلة. تم تجاهل الإضافة لتفادي التكرار.`,
          type: "warning"
        });
        setPastedTeachersText("");
        setParsedTeacherNames([]);
        return;
      }
      
      await addTeachersBatch(uniqueNamesInImport);
      setPastedTeachersText("");
      setParsedTeacherNames([]);
      await onRefreshData();
      
      if (totalSkipped > 0) {
        setAlertState({
          title: "تم الاستيراد بنجاح مع تجاهل المكررين 📋",
          message: `تم بنجاح استيراد وتثبيت عدد ${uniqueNamesInImport.length} معلم جديد بالمدرسة.\n\nتم تجاهل عدد ${totalSkipped} معلم مكرر ولم يتم إضافتهم منعاً للتكرار في قاعدة البيانات:\n• مكرر مع قاعدة البيانات: ${duplicatesWithDb.length > 0 ? duplicatesWithDb.join("، ") : "لا يوجد"}\n• مكرر في الملف المرفق: ${duplicatesInImport.length > 0 ? duplicatesInImport.join("، ") : "لا يوجد"}`,
          type: "warning"
        });
      } else {
        showMessage(`تم بنجاح استيراد وإضافة ${uniqueNamesInImport.length} معلم في المدرسة!`);
      }
    } catch (err) {
      showMessage("حدث خطأ أثناء استيراد قائمة المعلمين", "error");
    } finally {
      setStatsLoading(false);
      setSubmitting(prev => ({ ...prev, importTeachers: false }));
    }
  };

  // Grades & Classes Structural File processing
  const handleGradesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processGradesFile(file);
  };

  const processGradesFile = (file: File) => {
    setAttachedGradesFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith("#"));
      
      const parsed = lines.map(line => {
        const parts = line.split(",").map(p => p.trim());
        return {
          gradeName: parts[0],
          className: parts[1] || undefined
        };
      }).filter(item => item.gradeName);
      
      setParsedGradesStructure(parsed);
    };
    reader.readAsText(file);
  };

  const handleGradesImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedGradesStructure.length === 0) {
      showMessage("يرجى إرفاق ملف الهيكل الأكاديمي المرفق أولاً", "error");
      return;
    }
    setSubmitting(prev => ({ ...prev, importGrades: true }));
    try {
      setStatsLoading(true);
      const gradeMap: Record<string, string> = {};
      grades.forEach(g => {
        gradeMap[g.name] = g.id;
      });

      for (const item of parsedGradesStructure) {
        let gradeId = gradeMap[item.gradeName];
        if (!gradeId) {
          gradeId = await addGrade(item.gradeName);
          gradeMap[item.gradeName] = gradeId;
        }
        if (item.className) {
          const classExists = classes.some(c => c.gradeId === gradeId && c.name === item.className);
          if (!classExists) {
            await addClass(item.className, gradeId);
          }
        }
      }
      setAttachedGradesFile(null);
      setParsedGradesStructure([]);
      await onRefreshData();
      showMessage("تم استيراد هيكل الصفوف والفصول المرفقة بنجاح!");
    } catch (err) {
      showMessage("حدث خطأ أثناء استيراد الهيكل الأكاديمي", "error");
    } finally {
      setStatsLoading(false);
      setSubmitting(prev => ({ ...prev, importGrades: false }));
    }
  };

  // Search filter
  const filteredStudents = students.filter(student => {
    const term = studentSearchQuery.trim().toLowerCase();
    if (!term) return true;
    return student.name.toLowerCase().includes(term);
  });

  // --- UNATHENTICATED PIN SCREEN ---
  if (!isAuthenticated && !isReadOnly) {
    return (
      <div id="admin-pin-screen" className="max-w-md mx-auto bg-white rounded-2xl shadow-md border border-slate-100 p-8 text-center space-y-6 mt-12">
        <div className="mx-auto bg-blue-50 text-blue-600 p-4 rounded-full w-fit">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800">صلاحيات الإدارة والتحكم</h2>
          <p className="text-xs text-slate-500 mt-2">يرجى إدخال رمز المرور السري للتحكم بإعدادات الفصول والطلاب</p>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-4">
          <input
            type="password"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-xl py-3 text-center text-lg font-bold text-slate-800 tracking-widest focus:outline-none"
          />
          {pinError && <p className="text-2xs text-rose-500 font-extrabold">{pinError}</p>}
          
          <button
            type="submit"
            disabled={submitting.pin}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 text-xs transition"
          >
            {submitting.pin ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            <span>{submitting.pin ? "جاري التحقق..." : "تأكيد تسجيل الدخول كمدير"}</span>
          </button>
        </form>

        <p className="text-3xs text-slate-400 font-semibold">رمز المرور الافتراضي للتقييم هو: 1234</p>
      </div>
    );
  }

  // Dynamic Onboarding Step Calculation
  let currentStep = 1;
  if (grades.length === 0 || classes.length === 0) {
    if (activeSubTab !== "students") {
      currentStep = 1;
    } else if (!showStructureManager) {
      currentStep = 2;
    } else if (grades.length === 0) {
      currentStep = 3;
    } else {
      currentStep = 4;
    }
  } else if (students.length === 0) {
    if (activeSubTab !== "students") {
      currentStep = 1;
    } else {
      currentStep = 6;
    }
  } else if (teachers.length === 0) {
    if (activeSubTab !== "teachers") {
      currentStep = 7;
    } else {
      currentStep = 7.5;
    }
  } else {
    currentStep = 8; // Completed all steps!
  }

  // --- MAIN ADMIN SYSTEM DISPLAY (WIDE RESPONSIVE SCREEN) ---
  return (
    <div id="admin-main-panel" className="w-full space-y-6 pb-12">
      
      {/* Toast Feedback */}
      {actionMessage && (
        <div className={`p-4 rounded-xl text-center text-sm font-bold border fixed top-4 left-4 right-4 z-50 shadow-md md:left-auto md:w-96 transition-all ${
          actionMessage.type === "success" 
            ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
            : "bg-rose-50 text-rose-800 border-rose-200"
        }`}>
          {actionMessage.text}
        </div>
      )}



      {/* Welcome & Empty State Info Interactive Banner */}
      {grades.length === 0 && students.length === 0 && teachers.length === 0 && (
        <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/70 to-slate-50/50 border-2 border-indigo-400/60 rounded-2xl p-6 text-right space-y-5 shadow-md print:hidden ring-4 ring-indigo-400/30 animate-pulse" dir="rtl">
          <div className="flex items-start gap-3.5">
            <span className="text-3xl mt-0.5 animate-bounce">🌱</span>
            <div>
              <h3 className="text-sm font-black text-slate-800">مرحباً بك في منصة SmartTeacher الرقمية الحية!</h3>
              <p className="text-3xs text-slate-500 font-bold mt-1 leading-relaxed">
                لقد قمت بتسجيل الدخول بنجاح. قاعدة بياناتك الحالية فارغة تماماً ومستقلة لتضمن خصوصية تامة لسجلاتك. اتبع الخطوات التفاعلية أدناه لتهيئة مدرستك وبدء العمل في دقائق معدودة:
              </p>
              <p className={`text-xs font-black text-rose-600 rounded-lg px-3.5 py-2.5 mt-3 inline-block transition-all duration-1000 ease-in-out transform ${
                temporaryGlow 
                  ? "bg-rose-100 border-2 border-rose-500 ring-4 ring-rose-400/50 scale-108 rotate-1 shadow-md animate-bounce" 
                  : "bg-rose-50/50 border border-rose-100 shadow-3xs animate-pulse"
              }`}>
                🚀 أنت على بعد خطوات للحصول على نظام متابعة ورصد الغياب بشكل مختلف
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: STATISTICS & ANALYTICS */}
      {activeSubTab === "stats" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Sub-navigation Tabs & Print bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-2 rounded-xl border border-slate-100 shadow-3xs print:hidden">
            {/* Condensed Tabs Selector */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg" dir="rtl">
              <button
                type="button"
                onClick={() => setActiveStatsTab("attendance")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-black flex items-center gap-1 transition-all duration-200 cursor-pointer ${
                  activeStatsTab === "attendance"
                    ? "bg-white text-rose-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span>الغياب</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStatsTab("selected_attendance")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-black flex items-center gap-1 transition-all duration-200 cursor-pointer ${
                  activeStatsTab === "selected_attendance"
                    ? "bg-white text-blue-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>🔍</span>
                <span>غياب محدد</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStatsTab("behavior")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-black flex items-center gap-1 transition-all duration-200 cursor-pointer ${
                  activeStatsTab === "behavior"
                    ? "bg-white text-amber-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>📝</span>
                <span>السلوك</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStatsTab("student_report")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-black flex items-center gap-1 transition-all duration-200 cursor-pointer ${
                  activeStatsTab === "student_report"
                    ? "bg-white text-emerald-700 shadow-3xs border border-slate-200/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>📋</span>
                <span>تقرير الطالب</span>
              </button>
            </div>

            {/* Print Action */}
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-98 transition-all cursor-pointer"
            >
              <span>🖨️</span>
              <span>طباعة الملخص</span>
            </button>
          </div>

          {/* TAB CONTENT: DAILY ATTENDANCE (DYNAMIC COLUMNS FOR ALL GRADES) */}
          {activeStatsTab === "attendance" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 animate-fadeIn">
              {grades.map(grade => {
                const gradeEntries = todayStats.entriesByGrade[grade.id] || [];
                const gradeClasses = classes.filter(c => c.gradeId === grade.id);
                return (
                  <div key={grade.id} className="flex flex-col">
                    <div className="bg-[#1e40af] text-white px-3 py-1.5 rounded-t-2xl flex items-center justify-between border-b border-blue-900/20">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black">{grade.name}</span>
                        <span className="bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {gradeEntries.length}
                        </span>
                      </div>
                      <span className="bg-blue-700/80 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                        {getTodayFormattedArabic()}
                      </span>
                    </div>

                    {/* All classrooms/sections list bar */}
                    <div className="bg-[#172554] px-3 py-1.5 flex items-center justify-center gap-1.5 border-b border-blue-900/40 flex-wrap">
                      {gradeClasses.length === 0 ? (
                        <span className="text-[9px] text-blue-300/80 font-bold">لا توجد فصول مسجلة</span>
                      ) : (
                        gradeClasses.map(cls => {
                          const cCode = getClassCode(cls.name);
                          const count = gradeEntries.filter((entry: any) => entry.classId === cls.id).length;
                          const hasAbsence = count > 0;
                          return (
                            <span
                              key={cls.id}
                              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border flex items-center gap-1 shadow-3xs transition ${
                                hasAbsence
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-50/10 text-slate-300 border-slate-700/50 hover:bg-slate-50/20"
                              }`}
                            >
                              <span>{cCode}:</span>
                              <span>({count})</span>
                            </span>
                          );
                        })
                      )}
                    </div>

                    <div className="bg-white rounded-b-2xl shadow-3xs border-x border-b border-slate-150 overflow-hidden flex-1">
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs" dir="rtl">
                          <thead className="bg-slate-50 text-slate-500 font-extrabold text-[11px] border-b border-slate-100">
                            <tr>
                              <th className="py-1.5 px-2 text-right">وقت</th>
                              <th className="py-1.5 px-2 text-right">طالب</th>
                              <th className="py-1.5 px-2 text-center">ح ص</th>
                              <th className="py-1.5 px-2 text-right">معلم</th>
                              {!isReadOnly && <th className="py-1.5 px-1.5 text-center">⚙️</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {gradeEntries.length === 0 ? (
                              <tr>
                                <td colSpan={isReadOnly ? 4 : 5} className="py-12 text-center text-slate-400 font-black">
                                  <span className="underline decoration-dashed underline-offset-4 decoration-slate-300">لا يوجد غياب مسجل</span>
                                </td>
                              </tr>
                            ) : (
                              gradeEntries.map((entry: any) => (
                                <tr 
                                  key={entry.id} 
                                  className={`transition ${
                                    entry.isNoAbsenceDummy 
                                      ? "bg-emerald-50/60 hover:bg-emerald-100/80 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30" 
                                      : "hover:bg-slate-50/50"
                                  }`}
                                >
                                  <td className="py-0.5 px-2 font-semibold text-slate-500 text-[11px]">{entry.time}</td>
                                  <td className="py-0.5 px-2">
                                    <div className="flex flex-col justify-center">
                                      {entry.isNoAbsenceDummy ? (
                                        <span 
                                          className="bg-emerald-600 text-white font-black text-[9.5px] px-1.5 py-0.5 rounded-md inline-block text-center shadow-3xs whitespace-nowrap"
                                          title={entry.studentName}
                                        >
                                          {entry.studentName}
                                        </span>
                                      ) : (
                                        <span className="font-extrabold text-slate-800 text-[9.5px] whitespace-nowrap block" title={entry.studentName}>
                                          {entry.studentName}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-0.5 px-2 text-center">
                                    <div className="flex items-center gap-1.5 justify-center" dir="rtl">
                                      {/* Right in RTL (first in JSX): Period Badge 'ح' */}
                                      <span className={`font-extrabold text-[10px] w-5 h-5 rounded-md flex items-center justify-center border shadow-3xs ${getPeriodBadgeStyles(getPeriodNum(entry.periodCode))}`} title="الحصة">
                                        {getPeriodNum(entry.periodCode)}
                                      </span>
                                      {/* Left in RTL (second in JSX): Class/Section Badge 'ص' */}
                                      <span className={`font-extrabold text-[10px] w-5 h-5 rounded-md flex items-center justify-center border shadow-3xs ${getClassBadgeStyles(getClassNum(entry.classCode))}`} title="الصف">
                                        {getClassNum(entry.classCode)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-0.5 px-2 text-slate-600 font-semibold text-[9.5px] whitespace-nowrap" title={entry.teacherName}>{entry.teacherName}</td>
                                  {!isReadOnly && (
                                    <td className="py-0.5 px-1.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAbsence(entry.recordId, entry.studentId, entry.isAbsent)}
                                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                        title="حذف هذا تسجيل الغياب"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB CONTENT: SPECIFIC SEARCH (غياب محدد) */}
          {activeStatsTab === "selected_attendance" && (
            <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-5 animate-fadeIn">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span>🔍</span>
                  <span>الاستعلام عن غياب فصل معين</span>
                </h3>
                <p className="text-2xs text-slate-400 font-bold mt-0.5">اختر الصف والفصل والتاريخ المحددين لعرض سجل الغياب والتأخر المفصل.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">الصف الدراسي</label>
                  <select
                    value={searchGradeId}
                    onChange={(e) => setSearchGradeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {grades.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">الفصل الدراسي</label>
                  <select
                    value={searchClassId}
                    onChange={(e) => setSearchClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {classes.filter(c => c.gradeId === searchGradeId).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {classes.filter(c => c.gradeId === searchGradeId).length === 0 && (
                      <option value="">لا يوجد فصول</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">تاريخ الاستعلام</label>
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                  />
                </div>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden mt-4">
                <table className="w-full text-right text-xs" dir="rtl">
                  <thead className="bg-slate-50 text-slate-500 font-extrabold text-[11px] border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-4 text-right">رقم</th>
                      <th className="py-2.5 px-4 text-right">اسم الطالب</th>
                      <th className="py-2.5 px-4 text-right">الحالة</th>
                      <th className="py-2.5 px-4 text-right">الحصة</th>
                      <th className="py-2.5 px-4 text-right">المعلم المعتمد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchAttendanceResult.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 font-extrabold">
                          لا توجد غيابات مسجلة لهذا الفصل في هذا التاريخ 👍
                        </td>
                      </tr>
                    ) : (
                      searchAttendanceResult.map((entry, index) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-4 font-bold text-slate-400">{index + 1}</td>
                          <td className="py-3 px-4 font-extrabold text-slate-800">{entry.studentName}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-3xs font-black ${
                              entry.status === "غائب" ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                            }`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-black text-slate-700">{entry.period}</td>
                          <td className="py-3 px-4 text-slate-500 font-bold">{entry.teacherName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: TODAY BEHAVIORS (السلوك) */}
          {activeStatsTab === "behavior" && (
            <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-5 animate-fadeIn">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span>📝</span>
                    <span>الرصد السلوكي لليوم</span>
                  </h3>
                  <p className="text-2xs text-slate-400 font-bold mt-0.5">استعراض كافة الملاحظات والمخالفات السلوكية التي تم رصدها اليوم من قبل المعلمين.</p>
                </div>
                <span className="bg-amber-50 text-amber-700 text-3xs font-extrabold px-3 py-1 rounded-xl border border-amber-150">
                  {getTodayFormattedArabic()}
                </span>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs" dir="rtl">
                  <thead className="bg-slate-50 text-slate-500 font-extrabold text-[11px] border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-4 text-right">رقم</th>
                      <th className="py-2.5 px-4 text-right">اسم الطالب</th>
                      <th className="py-2.5 px-4 text-right">الصف / الفصل</th>
                      <th className="py-2.5 px-4 text-right">المخالفة / الملاحظة</th>
                      <th className="py-2.5 px-4 text-right">المعلم المعتمد</th>
                      {!isReadOnly && <th className="py-2.5 px-2 text-center">⚙️</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recentLogs.filter(l => l.type === "سلوك" && l.date === getTodayDateString()).length === 0 ? (
                      <tr>
                        <td colSpan={isReadOnly ? 5 : 6} className="py-12 text-center text-slate-400 font-extrabold">
                          لا توجد مخالفات سلوكية مرصودة اليوم 👍
                        </td>
                      </tr>
                    ) : (
                      stats.recentLogs
                        .filter(l => l.type === "سلوك" && l.date === getTodayDateString())
                        .map((log, index) => {
                          // Find student and class
                          const studentName = log.title.replace("سلوك سلبي: ", "");
                          const studentObj = students.find(s => s.name === studentName);
                          const gradeName = studentObj ? (grades.find(g => g.id === studentObj.gradeId)?.name || "") : "";
                          const className = studentObj ? (classes.find(c => c.id === studentObj.classId)?.name || "") : "";

                          return (
                            <tr key={index} className="hover:bg-slate-50/50 transition">
                              <td className="py-3 px-4 font-bold text-slate-400">{index + 1}</td>
                              <td className="py-3 px-4 font-extrabold text-slate-800">{studentName}</td>
                              <td className="py-3 px-4 font-bold text-slate-600">{gradeName} - {className}</td>
                              <td className="py-3 px-4">
                                <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 font-extrabold text-3xs">
                                  {log.subtitle.replace("المخالفة: ", "")}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-500 font-medium">معلم الحصة</td>
                              {!isReadOnly && (
                                <td className="py-3 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      confirmAction(
                                        "حذف المخالفة السلوكية",
                                        "هل أنت متأكد من حذف هذه الملاحظة السلوكية؟ لا يمكن التراجع عن هذا الإجراء.",
                                        async () => {
                                          try {
                                            setStatsLoading(true);
                                            // Find and delete behavior record matching details
                                            const bRecords = await getAllBehaviorRecords();
                                            const matched = bRecords.find(b => {
                                              const s = students.find(st => st.id === b.studentId);
                                              return s?.name === studentName && b.violation === log.subtitle.replace("المخالفة: ", "") && b.date === getTodayDateString();
                                            });
                                            
                                            if (matched) {
                                              const { deleteBehaviorRecord } = await import("../dbService");
                                              await deleteBehaviorRecord(matched.id);
                                              showMessage("تم حذف السلوك السلبي بنجاح!");
                                              await loadStatistics();
                                            }
                                          } catch (e) {
                                            console.error("Error deleting behavior record:", e);
                                          } finally {
                                            setStatsLoading(false);
                                          }
                                        }
                                      );
                                    }}
                                    className="text-rose-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="حذف هذا السلوك"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: STUDENT DETAILED REPORT (تقرير الطالب) */}
          {activeStatsTab === "student_report" && (
            <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-5 animate-fadeIn">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span>📋</span>
                  <span>تقرير الطالب التفصيلي والطباعة</span>
                </h3>
                <p className="text-2xs text-slate-400 font-bold mt-0.5">اختر الطالب لاستخراج السيرة السلوكية ونسب الغياب والتأخر في كافة الحصص بنظام بنتو وبطريقة قابلة للطباعة.</p>
              </div>

              {/* Selection Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">الصف الدراسي</label>
                  <select
                    value={reportGradeId}
                    onChange={(e) => setReportGradeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {grades.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">الفصل الدراسي</label>
                  <select
                    value={reportClassId}
                    onChange={(e) => setReportClassId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {classes.filter(c => c.gradeId === reportGradeId).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {classes.filter(c => c.gradeId === reportGradeId).length === 0 && (
                      <option value="">لا يوجد فصول</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">الطالب</label>
                  <select
                    value={reportStudentId}
                    onChange={(e) => setReportStudentId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {students.filter(s => s.classId === reportClassId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {students.filter(s => s.classId === reportClassId).length === 0 && (
                      <option value="">لا يوجد طلاب</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Bento Student Report card */}
              {studentReportData ? (
                <div className="space-y-6 animate-scaleUp pt-2">
                  
                  {/* Student Header */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="bg-blue-600 text-white w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shadow-sm">
                        👨‍🎓
                      </div>
                      <div className="text-right">
                        <h4 className="text-sm font-black text-slate-800">{students.find(s => s.id === reportStudentId)?.name}</h4>
                        <p className="text-2xs text-slate-400 font-extrabold mt-0.5">
                          {grades.find(g => g.id === reportGradeId)?.name} • {classes.find(c => c.id === reportClassId)?.name}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition print:hidden cursor-pointer"
                    >
                      <span>🖨️</span>
                      <span>طباعة بطاقة الطالب</span>
                    </button>
                  </div>

                  {/* Bento Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Attendance rate card */}
                    <div className="bg-gradient-to-tr from-blue-50/50 to-indigo-50/50 border border-blue-100 rounded-2xl p-4 text-center flex flex-col justify-between">
                      <span className="text-3xs text-blue-600 font-extrabold mb-2 block">نسبة الانضباط والحضور</span>
                      <div className="relative w-18 h-18 mx-auto flex items-center justify-center mb-1">
                        <span className={`text-xl font-black ${
                          studentReportData.attendanceRate >= 90 ? "text-emerald-600" : studentReportData.attendanceRate >= 75 ? "text-amber-500" : "text-rose-600"
                        }`}>{studentReportData.attendanceRate}%</span>
                      </div>
                      <span className="text-3xs text-slate-400 font-semibold block mt-1">من إجمالي الحصص المسجلة</span>
                    </div>

                    {/* Absents Count Card */}
                    <div className="bg-white border border-slate-150 rounded-2xl p-4 text-center flex flex-col justify-between shadow-3xs">
                      <span className="text-3xs text-slate-400 font-extrabold mb-2 block">إجمالي مرات الغياب</span>
                      <span className="text-3xl font-black text-rose-600 my-auto">{studentReportData.absentCount}</span>
                      <span className="text-3xs text-rose-400 font-bold block mt-2 bg-rose-50/50 py-1 rounded-lg">حالة غياب مرصودة</span>
                    </div>

                    {/* Lates Count Card */}
                    <div className="bg-white border border-slate-150 rounded-2xl p-4 text-center flex flex-col justify-between shadow-3xs">
                      <span className="text-3xs text-slate-400 font-extrabold mb-2 block">إجمالي مرات التأخر</span>
                      <span className="text-3xl font-black text-amber-500 my-auto">{studentReportData.lateCount}</span>
                      <span className="text-3xs text-amber-600 font-bold block mt-2 bg-amber-50/50 py-1 rounded-lg">حالة تأخر مرصودة</span>
                    </div>

                    {/* Behaviors Count Card */}
                    <div className="bg-white border border-slate-150 rounded-2xl p-4 text-center flex flex-col justify-between shadow-3xs">
                      <span className="text-3xs text-slate-400 font-extrabold mb-2 block">المخالفات السلوكية</span>
                      <span className="text-3xl font-black text-violet-600 my-auto">{studentReportData.behaviors.length}</span>
                      <span className="text-3xs text-violet-600 font-bold block mt-2 bg-violet-50/50 py-1 rounded-lg">ملاحظة مسجلة</span>
                    </div>
                  </div>

                  {/* Two columns: History Logs vs Behaviors list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    
                    {/* Column A: Attendance logs */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                        <span>📕</span>
                        <span>سجل الانضباط والحصص التفصيلي</span>
                      </h4>
                      
                      <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                        {studentReportData.history.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-10 font-bold">السجل نظيف! الطالب حاضر دائماً 👍</p>
                        ) : (
                          studentReportData.history.map((log, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                              <div className="text-right">
                                <p className="text-[11px] font-extrabold text-slate-800">حصة {log.period}</p>
                                <p className="text-[9px] text-slate-400 font-semibold">بواسطة: {log.teacher}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-3xs text-slate-400 font-bold">{log.date}</span>
                                <span className={`px-2 py-0.5 rounded-lg text-3xs font-black ${
                                  log.status === "غائب" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                                }`}>{log.status}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Column B: Behaviors list */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                        <span>📝</span>
                        <span>سجل الملاحظات السلوكية المرصودة</span>
                      </h4>

                      <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                        {studentReportData.behaviors.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-10 font-bold">السجل نظيف! سلوك الطالب مثالي وجميل 🌟</p>
                        ) : (
                          studentReportData.behaviors.map((b, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-violet-50/50 border border-violet-100 space-y-1.5">
                              <p className="text-[11px] font-black text-violet-800 leading-relaxed">{b.violation}</p>
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold pt-1 border-t border-violet-100/40">
                                <span>بتاريخ: {b.date}</span>
                                <span>المعلم: معتمد</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <p className="text-center py-10 text-xs text-slate-400 font-black">يرجى تسجيل أو اختيار طالب لعرض تقريره الأكاديمي المفصل.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: GRADES & CLASSES (SCREENSHOT COMPLIANT CUSTOMIZER) */}
      {activeSubTab === "grades" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Tab Selection Header */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-md font-extrabold text-slate-800">تخصيص وإدارة الخيارات الأكاديمية 🏫</h2>
              <p className="text-2xs text-slate-400 font-bold mt-0.5">أضف، احذف، وعدّل الصفوف والفصول الدراسية لتتناسب مع خطتك الأكاديمية المحددة.</p>
            </div>
            
            {/* Mode Switcher */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setGradesAddMode("individual")}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                  gradesAddMode === "individual" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>التهيئة اليدوية</span>
              </button>
              <button
                type="button"
                onClick={() => setGradesAddMode("excel")}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                  gradesAddMode === "excel" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>استيراد الهيكل المرفق 📁</span>
              </button>
            </div>
          </div>

          {/* School Name Customization Card */}
          <div className="bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border border-blue-100 rounded-2xl p-5 text-right space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">🏫</span>
              <div>
                <h3 className="text-sm font-black text-slate-800">تخصيص هوية واسم المدرسة الحالي</h3>
                <p className="text-3xs text-slate-500 font-bold mt-1">
                  يمكنك تعديل اسم مدرستك الحالي في أي وقت لتحديث الهوية بالكامل في كافة التقارير واللوحات الجانبية والواجهات المطبوعة.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 max-w-md">
              <input
                type="text"
                defaultValue={schoolName || ""}
                placeholder="أدخل اسم المدرسة الجديد"
                id="school-settings-input"
                className="flex-1 text-xs font-bold px-3.5 py-2.5 bg-white border border-slate-200/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition text-right"
              />
              <button
                type="button"
                disabled={isSavingSchoolName}
                onClick={async () => {
                  const inputEl = document.getElementById("school-settings-input") as HTMLInputElement;
                  if (inputEl) {
                    const trimmed = inputEl.value.trim();
                    if (!trimmed) {
                      alert("يرجى إدخال اسم مدرسة صالح.");
                      return;
                    }
                    if (onSchoolNameChange) {
                      onSchoolNameChange(trimmed);
                    }
                  }
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-55 flex items-center justify-center gap-1.5"
              >
                {isSavingSchoolName ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <span>تحديث الاسم ✨</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {gradesAddMode === "excel" ? (
            /* excel upload card for grades */
            <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 p-6 space-y-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-600" />
                <span>إرفاق ملف الهيكل الأكاديمي (الصفوف والفصول)</span>
              </h3>

              {attachedGradesFile ? (
                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">{attachedGradesFile.name}</p>
                        <p className="text-2xs text-slate-500">{(attachedGradesFile.size / 1024).toFixed(1)} KB • تم التحقق والإرفاق بنجاح</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachedGradesFile(null);
                        setParsedGradesStructure([]);
                      }}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {parsedGradesStructure.length > 0 && (
                    <div className="bg-white border border-slate-100 rounded-lg p-3 space-y-2">
                      <p className="text-2xs font-extrabold text-slate-500">معاينة الهيكل المستورد ({parsedGradesStructure.length} عنصر):</p>
                      <div className="max-h-24 overflow-y-auto divide-y divide-slate-100 text-2xs text-slate-700 font-semibold pr-1">
                        {parsedGradesStructure.slice(0, 10).map((item, i) => (
                          <p key={i} className="py-1">🏫 {item.gradeName} {item.className ? ` ➔ ${item.className}` : ""}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleGradesImportSubmit}
                    disabled={statsLoading || submitting.importGrades}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs"
                  >
                    {submitting.importGrades ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>تأكيد اعتماد وبناء الهيكل المرفق ({parsedGradesStructure.length})</span>
                  </button>
                </div>
              ) : (
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                    isGradesDragging ? "border-blue-500 bg-blue-50/20" : "border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-white"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsGradesDragging(true); }}
                  onDragLeave={() => setIsGradesDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsGradesDragging(false); const file = e.dataTransfer.files?.[0]; if (file) processGradesFile(file); }}
                >
                  <label htmlFor="grades-file-input" className="cursor-pointer block w-full space-y-2">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-full w-fit mx-auto">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">اسحب وأفلت مستند هيكل المدرسة (.csv أو .txt) هنا</p>
                      <p className="text-2xs text-slate-400 mt-1">أو انقر لتصفح الملفات من جهازك</p>
                    </div>
                    <div className="text-2xs text-blue-500 font-bold bg-blue-50/50 py-1.5 px-3 rounded-md w-fit mx-auto mt-2 border border-blue-100/50 space-y-1">
                      <p>صيغة المستند المقبولة:</p>
                      <p className="text-slate-600">الصف الدراسي,اسم الفصل</p>
                      <p className="text-slate-400">مثال: الصف الأول,الفصل 1</p>
                    </div>
                    <input
                      id="grades-file-input"
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleGradesFileChange}
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            /* Screenshot-perfect Two Column Layout for Desktop */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Right Column: Grades List (takes 5 cols on lg) */}
              <div className="lg:col-span-5 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-extrabold text-slate-800 flex items-center justify-between">
                    <span>الصفوف الدراسية المتاحة ({grades.length})</span>
                  </h3>
                </div>

                {/* Add Grade Subform */}
                <form onSubmit={handleAddGradeSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="مثال: الصف الأول..."
                    value={newGradeName}
                    onChange={(e) => setNewGradeName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting.addGrade}
                    className={`relative overflow-hidden bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap transition-all duration-300 ${
                      submitting.addGrade 
                        ? "ring-4 ring-blue-200/80 scale-95 shadow-md" 
                        : "hover:scale-101"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صف</span>

                    {submitting.addGrade && (
                      <div className="absolute inset-0 bg-blue-600 rounded-xl flex items-center justify-center gap-2 text-white">
                        <div className="relative flex items-center justify-center">
                          {/* Beautiful concentric spinning rings */}
                          <div className="absolute w-6.5 h-6.5 border-2 border-dashed border-white/30 rounded-full animate-spin [animation-duration:3s]"></div>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <span className="text-3xs font-extrabold animate-pulse">جاري الإضافة...</span>
                      </div>
                    )}
                  </button>
                </form>

                {/* Grades list matching visual style */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {grades.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">لا توجد صفوف دراسية مسجلة.</p>
                  ) : (
                    grades.map(grade => {
                      const gradeClassCount = classes.filter(c => c.gradeId === grade.id).length;
                      const gradeStudentCount = students.filter(s => s.gradeId === grade.id).length;
                      const isSelected = selectedGradeIdForClasses === grade.id;

                      return (
                        <div 
                          key={grade.id} 
                          onClick={() => setSelectedGradeIdForClasses(grade.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                            isSelected 
                              ? "bg-blue-50/50 border-blue-300 shadow-3xs" 
                              : "bg-slate-50/40 border-slate-100 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🏫</span>
                            <div>
                              <p className="text-xs font-black text-slate-800">{grade.name}</p>
                              <p className="text-3xs text-slate-400 font-bold">{gradeClassCount} فصول • {gradeStudentCount} طالب</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleDeleteGrade(grade.id, grade.name)}
                              disabled={submitting['deleteGrade_' + grade.id]}
                              className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 transition"
                              title="حذف الصف بكامل فصوله"
                            >
                              {submitting['deleteGrade_' + grade.id] ? (
                                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Left Column: Selected Grade classes customizer (takes 7 cols on lg) */}
              <div className="lg:col-span-7 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-5">
                {selectedGradeIdForClasses ? (
                  <>
                    {/* Selected Grade Headline */}
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-extrabold text-slate-800">
                        الفصول الدراسية لـ : <span className="text-blue-600 font-black">"{grades.find(g => g.id === selectedGradeIdForClasses)?.name}"</span>
                      </h3>
                      <p className="text-3xs text-slate-400 font-bold mt-0.5">اختر رقم ترتيب الفصل لتثبيته تلقائياً على هذا الصف</p>
                    </div>

                    {/* Sequence Sequence selection buttons (1 to 10 as in screenshot) */}
                    <div className="space-y-3">
                      <label className="block text-2xs font-extrabold text-slate-500">رقم ترتيب/تسلسل الفصل (تصاعدي):</label>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setSelectedClassNumber(num)}
                            className={`py-2 rounded-xl text-xs font-black border transition-all ${
                              selectedClassNumber === num
                                ? "bg-blue-600 text-white border-blue-600 shadow-3xs"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Automated adding button */}
                    <button
                      type="button"
                      onClick={handleAddClassSequence}
                      disabled={submitting.addClass}
                      className={`relative overflow-hidden w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all duration-300 ${
                        submitting.addClass
                          ? "ring-4 ring-blue-200/80 scale-95 shadow-md"
                          : "hover:scale-101"
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة "الفصل {selectedClassNumber}" للصف الدراسي</span>

                      {submitting.addClass && (
                        <div className="absolute inset-0 bg-blue-600 rounded-xl flex items-center justify-center gap-2 text-white">
                          <div className="relative flex items-center justify-center">
                            {/* Beautiful concentric spinning rings */}
                            <div className="absolute w-7 h-7 border-2 border-dashed border-white/30 rounded-full animate-spin [animation-duration:3s]"></div>
                            <div className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                          <span className="text-xs font-bold animate-pulse">جاري إضافة الفصل...</span>
                        </div>
                      )}
                    </button>

                    {/* Classes list of current selected grade */}
                    <div className="space-y-2">
                      <h4 className="text-2xs font-extrabold text-slate-500">الفصول المسجلة حالياً:</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {classes.filter(c => c.gradeId === selectedGradeIdForClasses).map(cls => {
                          const clsStudentsCount = students.filter(s => s.classId === cls.id).length;
                          return (
                            <div 
                              key={cls.id} 
                              className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 flex items-center justify-between text-xs transition hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <Layers className="w-4 h-4 text-blue-500" />
                                <span>{cls.name}</span>
                                <span className="text-3xs text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">({clsStudentsCount} طالب)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteClass(cls.id, cls.name)}
                                disabled={submitting['deleteClass_' + cls.id]}
                                className="text-rose-400 hover:text-rose-600 p-1"
                              >
                                {submitting['deleteClass_' + cls.id] ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                        {classes.filter(c => c.gradeId === selectedGradeIdForClasses).length === 0 && (
                          <p className="col-span-2 text-center py-6 text-2xs text-slate-400 font-bold">لا يوجد فصول تابعة لهذا الصف حالياً. ابدأ بإضافة فصل.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-xs text-slate-400 py-12 font-bold">يرجى تسجيل صف دراسي أو اختياره من القائمة الجانبية لعرض فصوله.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: TEACHERS MANAGEMENT */}
      {activeSubTab === "teachers" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header & Mode Switcher */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-md font-extrabold text-slate-800">إضافة المعلمين والمعلمات 💼</h2>
              <p className="text-2xs text-slate-400 font-bold mt-0.5">تسجيل المعلمين المعتمدين لتخويلهم صلاحيات رصد الحضور والغياب والسلوك للطلاب.</p>
            </div>
            
            {/* Mode Switcher */}
            <div className="flex items-center gap-2">
              {currentStep === 7.5 && !hasClickedTeacherSwitcher && (
                <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg animate-pulse">
                  اختر أحد الخيارين 👈
                </span>
              )}
              <div className={`flex bg-slate-100 p-0.5 rounded-lg border transition-all ${
                currentStep === 7.5 && !hasClickedTeacherSwitcher
                  ? "ring-4 ring-amber-400 border-white scale-102 animate-pulse"
                  : "border-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    setTeacherAddMode("individual");
                    setHasClickedTeacherSwitcher(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                    teacherAddMode === "individual" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>معلم فردي ✍️</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTeacherAddMode("excel");
                    setHasClickedTeacherSwitcher(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                    teacherAddMode === "excel" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>نسخ ولصق الأسماء 📋</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Add Teacher Card (left / top) - 5 columns */}
            <div className="lg:col-span-5 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                <UserPlus className="w-4 h-4 text-blue-500" />
                <span>إضافة كادر تعليمي جديد</span>
              </h3>

              {teacherAddMode === "individual" ? (
                <form onSubmit={handleAddTeacherSubmit} className="space-y-3">
                  <div>
                    <label className="block text-2xs font-extrabold text-slate-500 mb-1">اسم المعلم كاملاً</label>
                    <input
                      type="text"
                      placeholder="مثال: أ/ ماجد عبد الله الناصر"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none transition-all ${
                        currentStep === 7.5 && hasClickedTeacherSwitcher && newTeacherName.trim().length === 0
                          ? "border-amber-400 focus:border-amber-500 ring-4 ring-amber-100 scale-101"
                          : "border-slate-200"
                      }`}
                    />
                    {currentStep === 7.5 && hasClickedTeacherSwitcher && newTeacherName.trim().length === 0 && (
                      <p className="text-[10px] text-amber-700 font-black mt-1 animate-pulse">👈 يرجى كتابة اسم المعلم هنا لتسجيله في المدرسة</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submitting.addTeacher}
                    className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all ${
                      currentStep === 7.5 && hasClickedTeacherSwitcher && newTeacherName.trim().length > 0 ? "ring-4 ring-amber-400 border-2 border-white animate-pulse scale-102" : ""
                    }`}
                  >
                    {submitting.addTeacher ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>تسجيل المعلم في المدرسة</span>
                    {currentStep === 7.5 && hasClickedTeacherSwitcher && newTeacherName.trim().length > 0 && (
                      <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                        اضغط هنا 👈
                      </span>
                    )}
                  </button>
                </form>
              ) : (
                /* copy and paste card for teachers */
                <form onSubmit={handleTeacherImportSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-2xs font-extrabold text-slate-500 mb-1.5">انسخ قائمة المعلمين من إكسل أو وورد وألصقها هنا:</label>
                    <textarea
                      rows={6}
                      placeholder="ألصق الأسماء هنا...
أ/ أحمد المحمد
أ/ خالد الحربي
أ/ علي الغامدي"
                      value={pastedTeachersText}
                      onChange={(e) => setPastedTeachersText(e.target.value)}
                      className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none resize-none font-mono transition-all ${
                        currentStep === 7.5 && hasClickedTeacherSwitcher && pastedTeachersText.trim().length === 0
                          ? "border-amber-400 focus:border-amber-500 ring-4 ring-amber-100 scale-101"
                          : "border-slate-200 focus:border-blue-500"
                      }`}
                    />
                    {currentStep === 7.5 && hasClickedTeacherSwitcher && pastedTeachersText.trim().length === 0 && (
                      <p className="text-[10px] text-amber-700 font-black mt-1 animate-pulse">👈 يرجى لصق قائمة الأسماء هنا في المربع لبدء الاستيراد دفعة واحدة</p>
                    )}
                  </div>

                  {parsedTeacherNames.length > 0 && (
                    <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 space-y-2">
                      <p className="text-2xs font-extrabold text-blue-800 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>تم اكتشاف {parsedTeacherNames.length} معلم جاهز للاستيراد:</span>
                      </p>
                      <div className="max-h-24 overflow-y-auto divide-y divide-blue-100/50 text-2xs text-slate-700 font-semibold pr-1">
                        {parsedTeacherNames.slice(0, 5).map((name, i) => (
                          <p key={i} className="py-1">👤 {name}</p>
                        ))}
                        {parsedTeacherNames.length > 5 && (
                          <p className="py-1 text-slate-400 text-center text-3xs">...و {parsedTeacherNames.length - 5} معلمين آخرين</p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={parsedTeacherNames.length === 0 || statsLoading || submitting.importTeachers}
                    className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all ${
                      currentStep === 7.5 && hasClickedTeacherSwitcher && parsedTeacherNames.length > 0 ? "ring-4 ring-amber-400 border-2 border-white animate-pulse scale-102" : ""
                    }`}
                  >
                    {submitting.importTeachers ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>اعتماد واستيراد {parsedTeacherNames.length} معلم دفعة واحدة 📋</span>
                    {currentStep === 7.5 && hasClickedTeacherSwitcher && parsedTeacherNames.length > 0 && (
                      <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                        اضغط هنا 👈
                      </span>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Registered Teachers List - 7 columns */}
            <div className="lg:col-span-7 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-50 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">
                    المعلمون المسجلون في المدرسة ({teachers.length})
                  </h3>
                  <p className="text-3xs text-slate-400 font-bold mt-0.5">تصفح قائمة الكادر التعليمي والتحكم في حذفهم الفردي أو الجماعي.</p>
                </div>
                <div className="relative w-full sm:w-48">
                  <input
                    type="text"
                    placeholder="ابحث باسم المعلم..."
                    value={teacherSearchQuery}
                    onChange={(e) => setTeacherSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl pr-8 pl-3 py-1.5 text-3xs font-semibold text-slate-800 focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                {/* Stats header inside the table */}
                <div className="p-3 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-extrabold text-slate-600">
                      إجمالي عدد المعلمين: <span className="text-blue-600 font-black">{teachers.length} معلم</span>
                    </span>
                    {selectedTeacherIds.length > 0 && (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-3xs font-black border border-blue-100 flex items-center gap-1 animate-pulse">
                        <span>تم تحديد {selectedTeacherIds.length} معلم</span>
                      </span>
                    )}
                  </div>

                  {selectedTeacherIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedTeachers}
                      disabled={submitting.deleteSelectedTeachers}
                      className="bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white px-3 py-1 rounded-xl text-3xs font-black flex items-center gap-1 transition-all shadow-xs"
                    >
                      {submitting.deleteSelectedTeachers ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      <span>حذف المعلمين المحددين ({selectedTeacherIds.length})</span>
                    </button>
                  )}
                </div>

                {/* Table implementation */}
                {(() => {
                  const filteredTeachers = teachers
                    .filter(t => {
                      const term = teacherSearchQuery.trim().toLowerCase();
                      if (!term) return true;
                      return t.name.toLowerCase().includes(term);
                    })
                    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

                  if (teachers.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 py-12 text-center font-bold">لا يوجد معلمون مسجلون حالياً.</p>
                    );
                  }

                  if (filteredTeachers.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 py-12 text-center font-bold">لا يوجد معلمون يطابقون كلمة البحث.</p>
                    );
                  }

                  const allFilteredSelected = filteredTeachers.length > 0 && filteredTeachers.every(t => selectedTeacherIds.includes(t.id));

                  return (
                    <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 text-slate-500 font-extrabold border-b border-slate-100">
                            <th className="py-2.5 px-3 w-12 text-center">#</th>
                            <th className="py-2.5 px-3">اسم المعلم</th>
                            <th className="py-2.5 px-3 w-24 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                  checked={allFilteredSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTeacherIds(filteredTeachers.map(t => t.id));
                                    } else {
                                      setSelectedTeacherIds([]);
                                    }
                                  }}
                                  title="تحديد الكل للحذف"
                                />
                                <span>التحكم</span>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {filteredTeachers.map((t, idx) => {
                            const isSelected = selectedTeacherIds.includes(t.id);

                            return (
                              <tr key={t.id} className={`transition ${isSelected ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-slate-50/40'}`}>
                                <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-extrabold text-slate-900 text-xs">{t.name}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-3">
                                    <input 
                                      type="checkbox" 
                                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedTeacherIds(prev => [...prev, t.id]);
                                        } else {
                                          setSelectedTeacherIds(prev => prev.filter(id => id !== t.id));
                                        }
                                      }}
                                      title="تحديد المعلم للحذف"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTeacher(t.id, t.name)}
                                      disabled={submitting['deleteTeacher_' + t.id]}
                                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition"
                                      title="حذف المعلم"
                                    >
                                      {submitting['deleteTeacher_' + t.id] ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: STUDENTS UNIFIED MANAGEMENT */}
      {activeSubTab === "students" && (
        <div className="space-y-6 animate-fadeIn">
          {/* 1. HORIZONTAL GRADE TABS & STRUCTURE CONTROLLER BAR */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-md font-extrabold text-slate-800">إضافة الطلاب والفصول 👥</h2>
                <p className="text-2xs text-slate-400 font-bold">تصفح وتعديل الطلاب والهيكل الأكاديمي، وتوليد كلمات المرور في شاشة واحدة متكاملة.</p>
              </div>
              
              {/* Orange Button to open School Structure Modal (Grades & Classes management) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedGradeIdForClasses(selectedGradeId);
                  setShowStructureManager(true);
                }}
                className={`bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all ${
                  currentStep === 2 ? "ring-4 ring-amber-400 border-2 border-white animate-pulse scale-105" : ""
                }`}
              >
                <Settings className="w-4 h-4 text-white" />
                <span>إضافة / تعديل الفصول ⚙️</span>
                {currentStep === 2 && (
                  <span className="text-[9px] bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                    اضغط هنا 👈
                  </span>
                )}
              </button>
            </div>

            {/* Grades Selection Horizontal Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-200">
              {grades.map((grade) => {
                const isSelected = selectedGradeId === grade.id;
                const studentCount = students.filter(s => s.gradeId === grade.id).length;
                return (
                  <button
                    key={grade.id}
                    type="button"
                    onClick={() => setSelectedGradeId(grade.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                        : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100/80"
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>{grade.name}</span>
                    <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200/80 shadow-xs">
                      {studentCount}
                    </span>
                    {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full"></span>}
                  </button>
                );
              })}
              {grades.length === 0 && (
                <p className="text-2xs text-slate-400 font-extrabold py-1">لا توجد صفوف دراسية مسجلة حالياً. اضغط على زر "إضافة / تعديل الفصول" لإضافة صف.</p>
              )}
            </div>
          </div>

          {/* 2. CLASS BUTTONS FOR SELECTED GRADE (LIST STYLE) */}
          {selectedGradeId && (
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-3">
              <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-500" />
                <span>الفصول المتاحة في هذا الصف الدراسي:</span>
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200 flex-wrap">
                {classes.filter(c => c.gradeId === selectedGradeId).map((cls) => {
                  const isSelected = selectedClassId === cls.id;
                  const studentCount = students.filter(s => s.classId === cls.id).length;

                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-black transition-all border ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/10"
                          : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100/80"
                      }`}
                    >
                      <span>{cls.name}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200/80 shadow-xs">
                        {studentCount}
                      </span>
                    </button>
                  );
                })}
                {classes.filter(c => c.gradeId === selectedGradeId).length === 0 && (
                  <p className="text-2xs text-slate-400 font-extrabold py-1">لا توجد فصول تابعة لهذا الصف حالياً. أضف فصلاً عبر "إضافة / تعديل الفصول" الهيكل.</p>
                )}
              </div>
            </div>
          )}

          {/* 3. ACTIVE CLASS DETAILS PANEL & STUDENT ACTION PANEL */}
          {selectedGradeId && selectedClassId ? (
            <div className="space-y-6">
              {/* Class Header with Search and Student Add Toggler */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-md font-extrabold text-slate-800">
                      كشف طلاب: <span className="text-blue-600 font-black">{grades.find(g => g.id === selectedGradeId)?.name}</span> - <span className="text-blue-600 font-black">{classes.find(c => c.id === selectedClassId)?.name}</span>
                    </h3>
                    <p className="text-2xs text-slate-400 font-bold mt-0.5">تصفح كشف الطلاب، تفاصيل التحصيل، والتحكم في إضافة الطلاب أو السجلات.</p>
                  </div>
                </div>

                {/* Right/Left actions: Search & Toggler */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="ابحث باسم الطالب..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full sm:w-60 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl pr-8 pl-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddStudentSection(!showAddStudentSection)}
                    className={`font-extrabold px-4.5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                      showAddStudentSection
                        ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    } ${
                      currentStep === 6 && !showAddStudentSection ? "ring-4 ring-blue-500/50 border-2 border-white animate-pulse scale-105" : ""
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{showAddStudentSection ? "إخفاء نافذة الإضافة" : "إضافة طالب / طلاب للفصل"}</span>
                    {currentStep === 6 && !showAddStudentSection && (
                      <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                        اضغط هنا 👈
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Student Insertion Forms */}
              {showAddStudentSection && (
                <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-blue-500" />
                      <span>تسجيل طالب جديد في {classes.find(c => c.id === selectedClassId)?.name}</span>
                    </h3>
                    
                    {/* Add Mode switcher */}
                    <div className="flex items-center gap-2">
                      {currentStep === 6 && !hasClickedStudentSwitcher && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg animate-pulse">
                          اختر أحد الخيارين 👈
                        </span>
                      )}
                      <div className={`flex bg-slate-100 p-0.5 rounded-lg border transition-all ${
                        currentStep === 6 && !hasClickedStudentSwitcher
                          ? "ring-4 ring-amber-400 border-white scale-102 animate-pulse"
                          : "border-slate-200"
                      }`}>
                        <button
                          type="button"
                          onClick={() => {
                            setStudentAddMode("individual");
                            setHasClickedStudentSwitcher(true);
                          }}
                          className={`px-3 py-1 rounded-md text-3xs font-extrabold transition ${
                            studentAddMode === "individual" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          طالب فردي ✍️
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStudentAddMode("excel");
                            setHasClickedStudentSwitcher(true);
                          }}
                          className={`px-3 py-1 rounded-md text-3xs font-extrabold transition ${
                            studentAddMode === "excel" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          نسخ ولصق الأسماء 📋
                        </button>
                      </div>
                    </div>
                  </div>

                  {studentAddMode === "individual" ? (
                    <form onSubmit={handleAddStudentSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-9">
                        <label className="block text-3xs font-extrabold text-slate-500 mb-1">اسم الطالب ثلاثي أو رباعي</label>
                        <input
                          type="text"
                          placeholder="مثال: خالد عبد العزيز اليوسف..."
                          value={newStudentName}
                          onChange={(e) => setNewStudentName(e.target.value)}
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none transition-all ${
                            currentStep === 6 && hasClickedStudentSwitcher && newStudentName.trim().length === 0
                              ? "border-amber-400 focus:border-amber-500 ring-4 ring-amber-100 scale-101"
                              : "border-slate-200"
                          }`}
                        />
                        {currentStep === 6 && hasClickedStudentSwitcher && newStudentName.trim().length === 0 && (
                          <p className="text-[10px] text-amber-700 font-black mt-1 animate-pulse">👈 يرجى كتابة اسم الطالب هنا لإضافته للفصل</p>
                        )}
                      </div>
                      <div className="sm:col-span-3">
                        <button
                          type="submit"
                          disabled={submitting.addStudent}
                          className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all ${
                            currentStep === 6 && hasClickedStudentSwitcher && newStudentName.trim().length > 0
                              ? "ring-4 ring-amber-400 border-2 border-white animate-pulse scale-102"
                              : ""
                          }`}
                        >
                          {submitting.addStudent ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          <span>إضافة الطالب</span>
                          {currentStep === 6 && hasClickedStudentSwitcher && newStudentName.trim().length > 0 && (
                            <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                              اضغط هنا 👈
                            </span>
                          )}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleStudentImportSubmit} className="space-y-4">
                      <div>
                        <label className="block text-3xs font-extrabold text-slate-500 mb-1">انسخ قائمة الطلاب من إكسل أو وورد وألصقها هنا (اسم في كل سطر):</label>
                        <textarea
                          rows={4}
                          placeholder="خالد عبد العزيز اليوسف&#10;محمد أحمد السديري&#10;فهد سليمان الدوسري"
                          value={pastedStudentsText}
                          onChange={(e) => setPastedStudentsText(e.target.value)}
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none resize-none font-mono transition-all ${
                            currentStep === 6 && hasClickedStudentSwitcher && pastedStudentsText.trim().length === 0
                              ? "border-amber-400 focus:border-amber-500 ring-4 ring-amber-100 scale-101"
                              : "border-slate-200 focus:border-blue-500"
                          }`}
                        />
                        {currentStep === 6 && hasClickedStudentSwitcher && pastedStudentsText.trim().length === 0 && (
                          <p className="text-[10px] text-amber-700 font-black mt-1 animate-pulse">👈 يرجى لصق قائمة الأسماء هنا في المربع لبدء الاستيراد دفعة واحدة</p>
                        )}
                      </div>

                      {parsedStudentNames.length > 0 && (
                        <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 space-y-1.5">
                          <p className="text-3xs font-extrabold text-blue-800 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>تم اكتشاف {parsedStudentNames.length} طالب جاهز للاستيراد:</span>
                          </p>
                          <div className="max-h-20 overflow-y-auto text-3xs text-slate-600 font-semibold pr-1">
                            {parsedStudentNames.slice(0, 3).map((name, i) => (
                              <p key={i} className="py-0.5">👤 {name}</p>
                            ))}
                            {parsedStudentNames.length > 3 && (
                              <p className="text-slate-400">...و {parsedStudentNames.length - 3} طلاب آخرين</p>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={parsedStudentNames.length === 0 || statsLoading || submitting.importStudents}
                        className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all ${
                          currentStep === 6 && hasClickedStudentSwitcher && parsedStudentNames.length > 0
                            ? "ring-4 ring-amber-400 border-2 border-white animate-pulse scale-102"
                            : ""
                        }`}
                      >
                        {submitting.importStudents ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        <span>اعتماد واستيراد {parsedStudentNames.length} طالب دفعة واحدة</span>
                        {currentStep === 6 && hasClickedStudentSwitcher && parsedStudentNames.length > 0 && (
                          <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                            اضغط هنا للاستيراد 👈
                          </span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* 4. STUDENTS LIST TABLE WITHOUT PASSWORDS */}
              <div className="bg-white rounded-2xl shadow-3xs border border-slate-100 overflow-hidden">
                {/* Stats header inside the table */}
                <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-extrabold text-slate-600">
                      عدد طلاب هذا الفصل: <span className="text-blue-600 font-black">{students.filter(s => s.classId === selectedClassId).length} طالب</span>
                    </span>
                    {selectedStudentIds.length > 0 && (
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-3xs font-black border border-blue-100 flex items-center gap-1 animate-pulse">
                        <span>تم تحديد {selectedStudentIds.length} طالب</span>
                      </span>
                    )}
                  </div>

                  {selectedStudentIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedStudents}
                      disabled={submitting.deleteSelectedStudents}
                      className="bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md transform hover:scale-[1.02] active:scale-95"
                    >
                      {submitting.deleteSelectedStudents ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 animate-bounce" />
                      )}
                      <span>حذف الطلاب المحددين ({selectedStudentIds.length})</span>
                    </button>
                  )}
                </div>

                {/* Table implementation */}
                {(() => {
                  const classStudents = students.filter(s => s.classId === selectedClassId);
                  const filteredClassStudents = classStudents.filter(s => {
                    const term = studentSearchQuery.trim().toLowerCase();
                    if (!term) return true;
                    return s.name.toLowerCase().includes(term);
                  }).sort((a, b) => a.name.localeCompare(b.name, "ar"));

                  if (classStudents.length === 0) {
                    return (
                      <div className="text-center py-16 space-y-3">
                        <p className="text-xs text-slate-400 font-bold">لا يوجد طلاب مسجلين في هذا الفصل حالياً.</p>
                        <button
                          type="button"
                          onClick={() => setShowAddStudentSection(true)}
                          className="text-xs text-blue-600 font-extrabold hover:underline"
                        >
                          ابدأ بإضافة أول طالب للفصل الآن ✍️
                        </button>
                      </div>
                    );
                  }

                  if (filteredClassStudents.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <p className="text-xs text-slate-400 font-bold">لا يوجد طلاب يطابقون كلمة البحث في هذا الفصل.</p>
                      </div>
                    );
                  }

                  const allFilteredSelected = filteredClassStudents.length > 0 && filteredClassStudents.every(st => selectedStudentIds.includes(st.id));

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 text-slate-500 font-extrabold border-b border-slate-100">
                            <th className="py-3 px-4 w-12 text-center">#</th>
                            <th className="py-3 px-4">اسم الطالب</th>
                            <th className="py-3 px-4 w-28 text-center">الصف</th>
                            <th className="py-3 px-4 w-28 text-center">الفصل</th>
                            <th className="py-3 px-4 w-24 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                  checked={allFilteredSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedStudentIds(filteredClassStudents.map(st => st.id));
                                    } else {
                                      setSelectedStudentIds([]);
                                    }
                                  }}
                                  title="تحديد الكل للحذف"
                                />
                                <span>التحكم</span>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {filteredClassStudents.map((st, idx) => {
                            const studentGrade = grades.find(g => g.id === st.gradeId)?.name || "غير محدد";
                            const studentClass = classes.find(c => c.id === st.classId)?.name || "غير محدد";
                            const isSelected = selectedStudentIds.includes(st.id);

                            return (
                              <tr key={st.id} className={`transition ${isSelected ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-slate-50/40'}`}>
                                <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                                <td className="py-3 px-4 font-extrabold text-slate-900 text-sm">{st.name}</td>
                                <td className="py-3 px-4 text-center text-slate-500 font-bold">{studentGrade}</td>
                                <td className="py-3 px-4 text-center text-slate-500 font-bold">{studentClass}</td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-3">
                                    <input 
                                      type="checkbox" 
                                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedStudentIds(prev => [...prev, st.id]);
                                        } else {
                                          setSelectedStudentIds(prev => prev.filter(id => id !== st.id));
                                        }
                                      }}
                                      title="تحديد الطالب للحذف"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStudent(st.id, st.name)}
                                      disabled={submitting['deleteStudent_' + st.id]}
                                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition"
                                      title="حذف الطالب"
                                    >
                                      {submitting['deleteStudent_' + st.id] ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center space-y-4 shadow-3xs">
              <div className="p-4 bg-slate-50 text-slate-400 rounded-full w-fit mx-auto">
                <Users className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h4 className="text-sm font-extrabold text-slate-800">بناء هيكل المدرسة والصفوف الدراسية</h4>
                <p className="text-xs text-slate-400 font-bold leading-relaxed">
                  الرجاء التأكد من تسجيل الصفوف الدراسية والفصول أولاً، ثم اختيار الصف والفصل المطلوب لعرض وإدارة كشوفات الطلاب وتعديل كلمات المرور.
                </p>
                <button
                  type="button"
                  onClick={() => setShowStructureManager(true)}
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 shadow-xs transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>تهيئة وإدارة الصفوف والفصول الآن</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. OVERLAY MODAL: SCHOOL ACADEMIC STRUCTURE MANAGER (Grades & Classes) */}
      {showStructureManager && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-50 rounded-2xl border border-slate-100 shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleUp" dir="rtl">
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">إدارة صفوف وفصول المدرسة</h3>
                  <p className="text-3xs text-slate-400 font-bold">إضافة وتعديل وحذف الفصول الأكاديمية والمستويات الدراسية في المدرسة.</p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => {
                  setShowStructureManager(false);
                  onRefreshData().then(() => {
                    // Update selectors to make sure they point to valid data
                    if (grades.length > 0) {
                      if (!selectedGradeId || !grades.some(g => g.id === selectedGradeId)) {
                        setSelectedGradeId(grades[0].id);
                      }
                    }
                  });
                }}
                className="transition-all duration-300 p-2 rounded-xl flex items-center gap-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Excel Import Block inside Modal */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-3xs p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h4 className="text-xs font-black text-slate-700">الاستيراد الجماعي لهيكل المدرسة من ملف 📁</h4>
                  
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setGradesAddMode("individual")}
                      className={`px-3 py-1 rounded-md text-3xs font-extrabold transition ${
                        gradesAddMode === "individual" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      إعداد فردي يدوي
                    </button>
                    <button
                      type="button"
                      onClick={() => setGradesAddMode("excel")}
                      className={`px-3 py-1 rounded-md text-3xs font-extrabold transition ${
                        gradesAddMode === "excel" ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      استيراد ملف الهيكل
                    </button>
                  </div>
                </div>

                {gradesAddMode === "excel" && (
                  <div className="space-y-3">
                    {attachedGradesFile ? (
                      <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex flex-col space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                            <div>
                              <p className="text-xs font-bold text-slate-800">{attachedGradesFile.name}</p>
                              <p className="text-2xs text-slate-500">{(attachedGradesFile.size / 1024).toFixed(1)} KB • تم الإرفاق بنجاح</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachedGradesFile(null);
                              setParsedGradesStructure([]);
                            }}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        
                        {parsedGradesStructure.length > 0 && (
                          <div className="bg-white border border-slate-100 rounded-lg p-3 space-y-2">
                            <p className="text-2xs font-extrabold text-slate-500">معاينة الهيكل المستورد ({parsedGradesStructure.length} عنصر):</p>
                            <div className="max-h-24 overflow-y-auto divide-y divide-slate-100 text-2xs text-slate-700 font-semibold pr-1">
                              {parsedGradesStructure.slice(0, 4).map((item, i) => (
                                <p key={i} className="py-1">🏫 {item.gradeName} {item.className ? `← ${item.className}` : ""}</p>
                              ))}
                              {parsedGradesStructure.length > 4 && (
                                <p className="py-1 text-slate-400 text-center text-3xs">...و {parsedGradesStructure.length - 4} صفوف/فصول أخرى</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <button
                          type="button"
                          onClick={handleGradesImportSubmit}
                          disabled={statsLoading}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs"
                        >
                          <UploadCloud className="w-4 h-4" />
                          <span>اعتماد الهيكل واستيراد الفصول الدراسية</span>
                        </button>
                      </div>
                    ) : (
                      <div 
                        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${
                          isGradesDragging ? "border-blue-500 bg-blue-50/20" : "border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-white"
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setIsGradesDragging(true); }}
                        onDragLeave={() => setIsGradesDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsGradesDragging(false); const file = e.dataTransfer.files?.[0]; if (file) processGradesFile(file); }}
                      >
                        <label htmlFor="grades-file-input" className="cursor-pointer block w-full space-y-2">
                          <div className="p-3 bg-blue-50 text-blue-600 rounded-full w-fit mx-auto">
                            <UploadCloud className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">اسحب وأفلت مستند هيكل المدرسة (.csv أو .txt) هنا</p>
                            <p className="text-2xs text-slate-400 mt-1">أو انقر لتصفح الملفات من جهازك</p>
                          </div>
                          <div className="text-2xs text-blue-500 font-bold bg-blue-50/50 py-1.5 px-3 rounded-md w-fit mx-auto mt-2 border border-blue-100/50 space-y-1">
                            <p>صيغة المستند المقبولة:</p>
                            <p className="text-slate-600">الصف الدراسي,اسم الفصل</p>
                            <p className="text-slate-400">مثال: الصف الأول,الفصل 1</p>
                          </div>
                          <input
                            id="grades-file-input"
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={handleGradesFileChange}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Two Column Layout for Manual Management */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Right Column: Grades List */}
                <div className="lg:col-span-5 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h5 className="text-xs font-black text-slate-800 flex items-center justify-between">
                      <span>الصفوف الدراسية المتاحة ({grades.length})</span>
                    </h5>
                  </div>

                  {/* Add Grade Subform */}
                  <form 
                    onSubmit={handleAddGradeSubmit} 
                    className={`flex gap-2 p-1.5 rounded-2xl transition-all duration-300 ${
                      currentStep === 3 ? "ring-4 ring-blue-500/50 bg-blue-50/50 border border-blue-400 animate-pulse scale-102" : ""
                    }`}
                  >
                    <input
                      type="text"
                      placeholder="مثال: الصف الأول..."
                      value={newGradeName}
                      onChange={(e) => setNewGradeName(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submitting.addGrade}
                      className={`relative overflow-hidden bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap transition-all duration-300 ${
                        submitting.addGrade 
                          ? "ring-4 ring-blue-200/80 scale-95 shadow-md" 
                          : "hover:scale-101"
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صف</span>
                      {currentStep === 3 && !submitting.addGrade && (
                        <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                          اضغط هنا 👈
                        </span>
                      )}

                      {submitting.addGrade && (
                        <div className="absolute inset-0 bg-blue-600 rounded-xl flex items-center justify-center gap-2 text-white">
                          <div className="relative flex items-center justify-center">
                            {/* Beautiful concentric spinning rings */}
                            <div className="absolute w-6.5 h-6.5 border-2 border-dashed border-white/30 rounded-full animate-spin [animation-duration:3s]"></div>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                          <span className="text-3xs font-extrabold animate-pulse">جاري...</span>
                        </div>
                      )}
                    </button>
                  </form>

                  {/* Grades list */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {grades.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">لا توجد صفوف دراسية مسجلة.</p>
                    ) : (
                      grades.map(grade => {
                        const gradeClassCount = classes.filter(c => c.gradeId === grade.id).length;
                        const gradeStudentCount = students.filter(s => s.gradeId === grade.id).length;
                        const isSelected = selectedGradeIdForClasses === grade.id;

                        return (
                          <div 
                            key={grade.id} 
                            onClick={() => setSelectedGradeIdForClasses(grade.id)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                              isSelected 
                                ? "bg-blue-50/50 border-blue-300 shadow-3xs" 
                                : "bg-slate-50/40 border-slate-100 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🏫</span>
                              <div>
                                <p className="text-xs font-black text-slate-800">{grade.name}</p>
                                <p className="text-3xs text-slate-400 font-bold">{gradeClassCount} فصول • {gradeStudentCount} طالب</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteGrade(grade.id, grade.name); }}
                              className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 transition"
                              title="حذف الصف بكامل فصوله"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Left Column: Selected Grade classes customizer */}
                <div className="lg:col-span-7 bg-white rounded-2xl shadow-3xs border border-slate-100 p-5 space-y-5">
                  {selectedGradeIdForClasses ? (
                    <>
                      {/* Selected Grade Headline */}
                      <div className="border-b border-slate-100 pb-3">
                        <h5 className="text-xs font-black text-slate-800">
                          الفصول الدراسية لـ : <span className="text-blue-600 font-black">"{grades.find(g => g.id === selectedGradeIdForClasses)?.name}"</span>
                        </h5>
                        <p className="text-3xs text-slate-400 font-bold mt-0.5">اختر رقم ترتيب الفصل لتثبيته تلقائياً على هذا الصف</p>
                      </div>

                      {/* Sequence selection buttons */}
                      <div className="space-y-3">
                        <label className="block text-3xs font-extrabold text-slate-500">رقم ترتيب/تسلسل الفصل (تصاعدي):</label>
                        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setSelectedClassNumber(num)}
                              className={`py-2 rounded-xl text-xs font-black border transition-all ${
                                selectedClassNumber === num
                                  ? "bg-blue-600 text-white border-blue-600 shadow-3xs"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Automated adding button */}
                      <button
                        type="button"
                        onClick={handleAddClassSequence}
                        disabled={submitting.addClass}
                        className={`relative overflow-hidden w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all duration-300 ${
                          currentStep === 4 ? "ring-4 ring-blue-500/50 border-2 border-white animate-pulse scale-102" : ""
                        } ${
                          submitting.addClass
                            ? "ring-4 ring-blue-200/80 scale-95 shadow-md"
                            : "hover:scale-101"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة "الفصل {selectedClassNumber}" للصف الدراسي</span>
                        {currentStep === 4 && !submitting.addClass && (
                          <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded font-black animate-bounce mr-1">
                            اضغط هنا 👈
                          </span>
                        )}

                        {submitting.addClass && (
                          <div className="absolute inset-0 bg-blue-600 rounded-xl flex items-center justify-center gap-2 text-white">
                            <div className="relative flex items-center justify-center">
                              {/* Beautiful concentric spinning rings */}
                              <div className="absolute w-7 h-7 border-2 border-dashed border-white/30 rounded-full animate-spin [animation-duration:3s]"></div>
                              <div className="w-4.5 h-4.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </div>
                            <span className="text-xs font-bold animate-pulse">جاري إضافة الفصل...</span>
                          </div>
                        )}
                      </button>

                      {/* Classes list of current selected grade */}
                      <div className="space-y-2">
                        <h6 className="text-3xs font-extrabold text-slate-500">الفصول المسجلة حالياً:</h6>
                        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                          {classes.filter(c => c.gradeId === selectedGradeIdForClasses).map(cls => {
                            const clsStudentsCount = students.filter(s => s.classId === cls.id).length;
                            return (
                              <div 
                                key={cls.id} 
                                className="bg-slate-50/50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-between text-xs transition hover:bg-slate-50"
                              >
                                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                  <Layers className="w-4 h-4 text-blue-500" />
                                  <span>{cls.name}</span>
                                  <span className="text-3xs text-slate-400 bg-white px-1.5 py-0.5 rounded-full border border-slate-100">({clsStudentsCount} ط)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClass(cls.id, cls.name)}
                                  className="text-rose-400 hover:text-rose-600 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                          {classes.filter(c => c.gradeId === selectedGradeIdForClasses).length === 0 && (
                            <p className="text-center py-6 text-2xs text-slate-400 font-bold">لا يوجد فصول تابعة لهذا الصف حالياً. ابدأ بإضافة فصل.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-xs text-slate-400 py-12 font-bold">يرجى تسجيل صف دراسي أو اختياره من القائمة الجانبية لعرض فصوله.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-white border-t border-slate-100 px-6 py-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowStructureManager(false);
                  onRefreshData().then(() => {
                    // Update selectors to make sure they point to valid data
                    if (grades.length > 0) {
                      if (!selectedGradeId || !grades.some(g => g.id === selectedGradeId)) {
                        setSelectedGradeId(grades[0].id);
                      }
                    }
                  });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-xs transition"
              >
                <span>إغلاق وحفظ التغييرات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Custom Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md p-6 space-y-4 text-right animate-scaleUp" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-black">{confirmState.title}</h4>
            </div>
            <p className="text-xs text-slate-500 font-extrabold leading-relaxed">{confirmState.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold px-4.5 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  await action();
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-4.5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Custom Alert Modal (e.g. for Duplicates) */}
      {alertState && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg p-6 space-y-4 text-right animate-scaleUp animate-fadeIn" dir="rtl">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 bg-amber-50 rounded-2xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-800">{alertState.title}</h4>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 max-h-[250px] overflow-y-auto">
              <p className="text-xs text-slate-600 font-extrabold leading-relaxed whitespace-pre-wrap">{alertState.message}</p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAlertState(null)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-xs transition-all cursor-pointer text-center"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
