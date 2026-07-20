import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord } from "../types";
import { 
  getStudentsByClass, 
  getAttendanceRecord, 
  saveAttendanceRecord, 
  getBehaviorRecords, 
  saveBehaviorRecord,
  getAllBehaviorRecords,
  subscribeToAttendanceRecord,
  subscribeToBehaviorRecords
} from "../dbService";
import { 
  Users, 
  UserX, 
  CheckCircle, 
  XCircle, 
  ClipboardCheck, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  User, 
  Plus, 
  Save, 
  ChevronRight, 
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";

interface TeacherPortalProps {
  grades: Grade[];
  classes: Class[];
  teachers: Teacher[];
  onRefreshStats?: () => void;
  activeTab?: "attendance" | "behavior";
  setActiveTab?: (tab: "attendance" | "behavior") => void;
  navigateTo?: (mode: "teacher" | "admin") => void;
  schoolName?: string;
  isDirectTeacherLink?: boolean;
  globalProgress?: { active: boolean; type: "save" | "load" | "delete" | "import" | null; label: string };
  setGlobalProgress?: React.Dispatch<React.SetStateAction<{ active: boolean; type: "save" | "load" | "delete" | "import" | null; label: string }>>;
}

const PERIODS = [
  "حصة 1",
  "حصة 2",
  "حصة 3",
  "حصة 4",
  "حصة 5",
  "حصة 6",
  "حصة 7"
];

const VIOLATIONS = [
  "النوم أثناء الحصة",
  "التأخر عن الحصة",
  "عدم إحضار الكتاب",
  "عدم حل الواجب الدراسي",
  "استخدام الهاتف الجوال",
  "الكلام والتشويش أثناء الشرح",
  "عدم الانتباه والتركيز مع المعلم"
];

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TeacherPortal({ grades, classes, teachers, onRefreshStats, activeTab: propActiveTab, setActiveTab: propSetActiveTab, navigateTo, schoolName, isDirectTeacherLink, globalProgress, setGlobalProgress }: TeacherPortalProps) {
  // Filter Selection States
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("حصة 1");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Refs and dynamic offsets for sticky elements to ensure precise and solid pinning
  const firstStickyRef = React.useRef<HTMLDivElement>(null);

  // Filtered lists
  const [filteredClasses, setFilteredClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Tab State
  const [localActiveTab, setLocalActiveTab] = useState<"attendance" | "behavior">("attendance");
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setLocalActiveTab;

  // Attendance states
  const [presentStudentIds, setPresentStudentIds] = useState<string[]>([]);
  const [absentStudentIds, setAbsentStudentIds] = useState<string[]>([]);
  const [lateStudentIds, setLateStudentIds] = useState<string[]>([]);
  const [savedAbsentIds, setSavedAbsentIds] = useState<string[]>([]);
  const [isAllPresentChecked, setIsAllPresentChecked] = useState<boolean>(false);
  const [isAllAbsentChecked, setIsAllAbsentChecked] = useState<boolean>(false);
  const isNoAbsence = absentStudentIds.length === 0 && lateStudentIds.length === 0;
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [hasRecord, setHasRecord] = useState<boolean>(false);

  // Behavior states
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedViolation, setSelectedViolation] = useState<string>("");
  const [customViolationText, setCustomViolationText] = useState<string>("");
  const [studentBehaviors, setStudentBehaviors] = useState<BehaviorRecord[]>([]);
  const [behaviorLoading, setBehaviorLoading] = useState<boolean>(false);
  const [behaviorSaveStatus, setBehaviorSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [allBehaviors, setAllBehaviors] = useState<BehaviorRecord[]>([]);
  const [expandedStudentId, setExpandedStudentId] = useState<string>("");
  const [isAddFormOpen, setIsAddFormOpen] = useState<boolean>(true);
  const [pendingBehaviors, setPendingBehaviors] = useState<{ [studentId: string]: string[] }>({});
  const [activeDropdownStudentId, setActiveDropdownStudentId] = useState<string>("");

  useEffect(() => {
    setPendingBehaviors({});
    setActiveDropdownStudentId("");
  }, [selectedGradeId, selectedClassId, selectedPeriod]);

  const loadAllBehaviorsData = async () => {
    try {
      const records = await getAllBehaviorRecords();
      setAllBehaviors(records);
    } catch (error) {
      console.error("Error loading behaviors:", error);
    }
  };

  useEffect(() => {
    loadAllBehaviorsData();
  }, [selectedGradeId, selectedClassId]);

  // Day Formatting in Arabic
  const [formattedDate, setFormattedDate] = useState<string>("");

  useEffect(() => {
    // Current date formatted nicely in Arabic
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateStr = new Date().toLocaleDateString('ar-SA', options);
    setFormattedDate(dateStr);
  }, []);

  // Monitor the first sticky element's height and compute the top offset for the second sticky element dynamically
  useEffect(() => {
    if (!firstStickyRef.current) return;

    const updateTopOffset = () => {
      if (firstStickyRef.current) {
        const height = firstStickyRef.current.offsetHeight;
        document.documentElement.style.setProperty('--first-sticky-height', `${height}px`);
      }
    };

    updateTopOffset();

    // ResizeObserver ensures it triggers even if content sizes changes without window resize
    const observer = new ResizeObserver(updateTopOffset);
    observer.observe(firstStickyRef.current);
    window.addEventListener("resize", updateTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
    };
  }, []);

  // Initialize dropdowns with first elements when data loaded
  useEffect(() => {
    if (teachers.length > 0 && !selectedTeacherId) {
      setSelectedTeacherId(teachers[0].id);
    }
    if (grades.length > 0 && !selectedGradeId) {
      setSelectedGradeId(grades[0].id);
    }
  }, [teachers, grades]);

  // Update classes list when grade changes
  useEffect(() => {
    if (selectedGradeId) {
      const filtered = classes.filter(c => c.gradeId === selectedGradeId);
      setFilteredClasses(filtered);
      if (filtered.length > 0) {
        // Keep current selected class if it's still valid under the selected grade
        const isCurrentClassValid = filtered.some(c => c.id === selectedClassId);
        if (!isCurrentClassValid) {
          setSelectedClassId(filtered[0].id);
        }
      } else {
        setSelectedClassId("");
      }
    }
  }, [selectedGradeId, classes]);

  // Fetch Students and existing Attendance record when Class/Period/Date changes (Real-time live-sync!)
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    async function loadStudents() {
      if (!selectedGradeId || !selectedClassId) {
        setStudents([]);
        return;
      }

      setAttendanceLoading(true);
      try {
        const studentList = await getStudentsByClass(selectedGradeId, selectedClassId);
        if (!active) return;
        setStudents(studentList);

        if (studentList.length > 0 && !selectedStudentId) {
          setSelectedStudentId(studentList[0].id);
        }

        // Setup real-time listener for attendance record
        unsubscribe = subscribeToAttendanceRecord(
          getTodayDateString(),
          selectedPeriod,
          selectedGradeId,
          selectedClassId,
          (record) => {
            if (!active) return;
            if (record) {
              const absent = record.absent || [];
              const late = record.late || [];
              const present = record.present && record.present.length > 0
                ? record.present
                : studentList.map(s => s.id).filter(id => !absent.includes(id) && !late.includes(id));
              
              setPresentStudentIds(present);
              setAbsentStudentIds(absent);
              setLateStudentIds(late);
              setSavedAbsentIds(absent);
              setHasRecord(true);
              setIsDirty(false);
              setIsAllPresentChecked(false);
              setIsAllAbsentChecked(false);
            } else {
              setPresentStudentIds([]);
              setAbsentStudentIds([]);
              setLateStudentIds([]);
              setSavedAbsentIds([]);
              setHasRecord(false);
              setIsDirty(false);
              setIsAllPresentChecked(false);
              setIsAllAbsentChecked(false);
            }
            setAttendanceLoading(false);
          },
          (err) => {
            console.error("Error subscribing to attendance record:", err);
            setAttendanceLoading(false);
          }
        );
      } catch (error) {
        console.error("Error loading students:", error);
        setAttendanceLoading(false);
      }
    }

    loadStudents();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [selectedGradeId, selectedClassId, selectedPeriod]);

  // Fetch behavior records when selected student changes (Real-time live-sync!)
  useEffect(() => {
    if (!selectedStudentId) {
      setStudentBehaviors([]);
      return;
    }
    setBehaviorLoading(true);
    const unsubscribe = subscribeToBehaviorRecords(
      selectedStudentId,
      (records) => {
        setStudentBehaviors(records);
        setBehaviorLoading(false);
      },
      (error) => {
        console.error("Error subscribing to behaviors:", error);
        setBehaviorLoading(false);
      }
    );
    return () => unsubscribe();
  }, [selectedStudentId]);

  // Handle student attendance toggle
  const toggleAttendance = (studentId: string) => {
    setIsDirty(true);
    setIsAllPresentChecked(false);
    setIsAllAbsentChecked(false);

    const isAbsent = absentStudentIds.includes(studentId);

    if (isAbsent) {
      // Absent -> Present (Remove from absent/late, add to present)
      setAbsentStudentIds(prev => prev.filter(id => id !== studentId));
      setLateStudentIds(prev => prev.filter(id => id !== studentId));
      setPresentStudentIds(prev => {
        if (!prev.includes(studentId)) return [...prev, studentId];
        return prev;
      });
    } else {
      // Present/Late/Unspecified -> Absent (Remove from present/late, add to absent)
      setPresentStudentIds(prev => prev.filter(id => id !== studentId));
      setLateStudentIds(prev => prev.filter(id => id !== studentId));
      setAbsentStudentIds(prev => {
        if (!prev.includes(studentId)) return [...prev, studentId];
        return prev;
      });
    }
  };

  // Helper selectors
  const handleSelectAllPresent = () => {
    setIsDirty(true);
    setAbsentStudentIds([]);
    setLateStudentIds([]);
    setPresentStudentIds(students.map(s => s.id));
    setIsAllPresentChecked(true);
    setIsAllAbsentChecked(false);
  };

  const handleSelectAllAbsent = () => {
    setIsDirty(true);
    setAbsentStudentIds(students.map(s => s.id));
    setLateStudentIds([]);
    setPresentStudentIds([]);
    setIsAllPresentChecked(false);
    setIsAllAbsentChecked(true);
  };

  // Save attendance
  const handleSaveAttendance = async () => {
    if (!selectedTeacherId || !selectedGradeId || !selectedClassId) {
      setSaveStatus({ type: "error", message: "الرجاء اختيار المعلم والصف والفصل أولاً" });
      return;
    }

    setAttendanceLoading(true);
    setSaveStatus(null);
    if (setGlobalProgress) {
      setGlobalProgress({ active: true, type: "save", label: "جاري حفظ وتوثيق سجل الغياب سحابياً..." });
    }
    try {
      const presentIds = students
          .map(s => s.id)
          .filter(id => !absentStudentIds.includes(id) && !lateStudentIds.includes(id));

      await saveAttendanceRecord({
        date: getTodayDateString(),
        period: selectedPeriod,
        gradeId: selectedGradeId,
        classId: selectedClassId,
        teacherId: selectedTeacherId,
        present: presentIds,
        absent: absentStudentIds,
        late: lateStudentIds,
        isNoAbsence: absentStudentIds.length === 0 && lateStudentIds.length === 0
      });

      setSaveStatus({ type: "success", message: "تم حفظ الغياب بنجاح! 💾" });
      setSavedAbsentIds(absentStudentIds);
      setHasRecord(true);
      setIsDirty(false);
      if (onRefreshStats) onRefreshStats();
      
      // Auto clear message after 3s
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error("Error saving attendance:", error);
      setSaveStatus({ type: "error", message: "حدث خطأ أثناء الحفظ، يرجى المحاولة لاحقاً" });
    } finally {
      setAttendanceLoading(false);
      if (setGlobalProgress) {
        setGlobalProgress({ active: false, type: null, label: "" });
      }
    }
  };

  // Save behavior observation
  const handleSaveBehavior = async () => {
    if (!selectedStudentId) {
      setBehaviorSaveStatus({ type: "error", message: "الرجاء تحديد طالب أولاً" });
      return;
    }
    
    const finalViolation = selectedViolation === "other" ? customViolationText.trim() : selectedViolation;
    
    if (!finalViolation) {
      setBehaviorSaveStatus({ 
        type: "error", 
        message: selectedViolation === "other" ? "الرجاء كتابة السلوك المخصص" : "الرجاء اختيار المخالفة من القائمة" 
      });
      return;
    }

    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher) {
      setBehaviorSaveStatus({ type: "error", message: "لم يتم العثور على المعلم المحدد" });
      return;
    }

    setBehaviorLoading(true);
    setBehaviorSaveStatus(null);
    if (setGlobalProgress) {
      setGlobalProgress({ active: true, type: "save", label: "جاري حفظ وتوثيق مخالفة السلوك للطالب..." });
    }
    try {
      await saveBehaviorRecord({
        studentId: selectedStudentId,
        date: getTodayDateString(),
        period: selectedPeriod,
        teacherId: selectedTeacherId,
        teacherName: teacher.name,
        violation: finalViolation
      });

      // Reload behaviors
      const records = await getBehaviorRecords(selectedStudentId);
      setStudentBehaviors(records);
      setSelectedViolation("");
      setCustomViolationText("");

      setBehaviorSaveStatus({ type: "success", message: "تم تسجيل مخالفة السلوك بنجاح! 💾" });
      setIsAddFormOpen(false);
      
      // Reload all behaviors to update list counts
      await loadAllBehaviorsData();
      
      if (onRefreshStats) onRefreshStats();

      setTimeout(() => setBehaviorSaveStatus(null), 3000);
    } catch (error) {
      console.error("Error saving behavior:", error);
      setBehaviorSaveStatus({ type: "error", message: "حدث خطأ أثناء الحفظ" });
    } finally {
      setBehaviorLoading(false);
      if (setGlobalProgress) {
        setGlobalProgress({ active: false, type: null, label: "" });
      }
    }
  };

  const totalPendingBehaviorsCount = Object.keys(pendingBehaviors).reduce((sum, studentId) => {
    const list = pendingBehaviors[studentId] || [];
    return sum + list.length;
  }, 0);
  const isBehaviorDirty = totalPendingBehaviorsCount > 0;

  // Save all pending behaviors at once
  const handleSaveAllBehaviors = async () => {
    if (totalPendingBehaviorsCount === 0) return;

    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher) {
      setBehaviorSaveStatus({ type: "error", message: "لم يتم العثور على المعلم المحدد" });
      return;
    }

    setBehaviorLoading(true);
    setBehaviorSaveStatus(null);
    if (setGlobalProgress) {
      setGlobalProgress({ active: true, type: "save", label: `جاري حفظ عدد ${totalPendingBehaviorsCount} سلوك معلق لجميع الطلاب...` });
    }

    try {
      const todayStr = getTodayDateString();
      const savePromises: Promise<any>[] = [];

      Object.keys(pendingBehaviors).forEach(studentId => {
        const violations = pendingBehaviors[studentId] || [];
        violations.forEach(violation => {
          savePromises.push(
            saveBehaviorRecord({
              studentId,
              date: todayStr,
              period: selectedPeriod,
              teacherId: selectedTeacherId,
              teacherName: teacher.name,
              violation
            })
          );
        });
      });

      await Promise.all(savePromises);

      // Clear pending drafts
      setPendingBehaviors({});

      // Show success message
      setBehaviorSaveStatus({ type: "success", message: "تم حفظ جميع السلوكيات بنجاح! 💾" });

      // Reload all behaviors
      await loadAllBehaviorsData();

      if (onRefreshStats) onRefreshStats();

      setTimeout(() => setBehaviorSaveStatus(null), 3000);
    } catch (error) {
      console.error("Error saving all behaviors:", error);
      setBehaviorSaveStatus({ type: "error", message: "حدث خطأ أثناء حفظ السلوكيات، يرجى المحاولة لاحقاً" });
    } finally {
      setBehaviorLoading(false);
      if (setGlobalProgress) {
        setGlobalProgress({ active: false, type: null, label: "" });
      }
    }
  };

  const currentGrade = grades.find(g => g.id === selectedGradeId)?.name || "";
  const currentClass = classes.find(c => c.id === selectedClassId)?.name || "";

  // Dynamic calculations
  const totalStudents = students.length;
  const absentCount = isNoAbsence ? 0 : absentStudentIds.length;
  const lateCount = isNoAbsence ? 0 : lateStudentIds.length;
  const presentCount = totalStudents - absentCount - lateCount;

  return (
    <div className="flex flex-col space-y-4 pb-36">
      {/* Title, App Header & Filter Options Panel (Unified) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-0 relative overflow-hidden flex flex-col">
        {/* Title Header Part with elegant background color */}
        <div className="text-center relative bg-gradient-to-r from-blue-900 via-indigo-950 to-blue-950 text-white rounded-t-2xl rounded-b-none p-5 shadow-sm overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8"></div>
          
          {/* Admin Panel button was removed per user request */}

          <h1 className="text-xl md:text-2xl font-black text-amber-300 mb-1">{schoolName || "البوابة الرقمية للمدرسة"}</h1>
          <div className="flex items-center justify-center gap-1.5 text-blue-100 font-bold text-xs md:text-sm mb-2.5">
            <span>نظام تسجيل الغياب والسلوك</span>
            <span>📋</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/10 text-white font-bold px-3.5 py-1.5 rounded-full text-xs border border-white/10 shadow-inner">
            <span>📅</span>
            <span>{formattedDate || "الثلاثاء، ١٤ يوليو"}</span>
          </div>
        </div>

        {/* Dropdowns / Filter Options Selection Part with premium custom background color */}
        <div className="bg-slate-50/80 p-5 rounded-b-2xl rounded-t-none grid grid-cols-2 gap-3.5 text-right">
          {/* Teacher Select */}
          <div className="col-span-2">
            <label className="block text-xs font-black text-slate-700 mb-1.5">المعلم</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-3xs"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Select */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">الصف</label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-3xs"
            >
              {grades.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Class Select */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">الفصل</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-3xs"
              disabled={filteredClasses.length === 0}
            >
              {filteredClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              {filteredClasses.length === 0 && <option value="">لا يوجد فصول</option>}
            </select>
          </div>

          {/* Period Select */}
          <div className="col-span-2">
            <label className="block text-xs font-black text-slate-700 mb-1.5">الحصة</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPeriod(p)}
                  className={`text-xs py-2 px-1 rounded-lg font-black border transition ${
                    selectedPeriod === p
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* UNIFIED STICKY CONTROL & STATS HUB (دمج الإحصائيات وأزرار التحكم السريع في عنصر واحد) */}
      <div 
        ref={firstStickyRef}
        style={{ top: "var(--header-height, 0px)" }}
        className="sticky z-30 flex flex-col mb-4"
      >
        {/* Unified Card Container */}
        <div className={`bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-slate-200 p-4 flex flex-col gap-3.5 transition-all duration-300 ${
          activeTab === "attendance" ? "border-t-4 border-t-blue-600" : "border-t-4 border-t-amber-500"
        }`}>
          {/* Quick stats (Attendance & Absence side by side) */}
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-800 py-2 px-2.5 rounded-xl border border-emerald-100">
              <span className="text-[11px] font-black text-emerald-600">الحضور:</span>
              <span className="text-sm font-black text-emerald-700">{totalStudents > 0 ? presentCount : 0}</span>
            </div>
            <div className="flex-1 flex items-center justify-center gap-1.5 bg-rose-50 text-rose-800 py-2 px-2.5 rounded-xl border border-rose-100">
              <span className="text-[11px] font-black text-rose-600">الغياب:</span>
              <span className="text-sm font-black text-rose-700">{totalStudents > 0 ? absentCount : 0}</span>
            </div>
          </div>

          {/* Selected Criteria Info Badge */}
          <div className="bg-slate-50 text-slate-600 border border-slate-150 py-1.5 px-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 w-full">
            <div>
              <span>صف: </span>
              <span className="text-slate-900 font-black">{currentGrade || "---"}</span>
            </div>
            <span className="text-slate-300">|</span>
            <div>
              <span>فصل: </span>
              <span className="text-slate-900 font-black">{currentClass || "---"}</span>
            </div>
            <span className="text-slate-300">|</span>
            <div>
              <span>حصة: </span>
              <span className="text-slate-900 font-black">{selectedPeriod}</span>
            </div>
          </div>
        </div>
      </div>

      {/* UNIFIED STUDENT LIST CARD WITH INTEGRATED TABS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col mb-24">
        {/* Integrated Tabs Selector */}
        <div 
          style={{ top: "calc(var(--header-height, 0px) + var(--first-sticky-height, 168px))" }}
          className="sticky z-20 bg-slate-50/90 backdrop-blur-md pt-4 px-4 rounded-t-2xl border-b border-slate-200 transition-all duration-150"
        >
          <div className="flex items-end w-full relative z-10 -mb-[1px]">
            <button
              type="button"
              onClick={() => setActiveTab("attendance")}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-tr-[28px] rounded-tl-lg rounded-b-none text-xs md:text-sm font-black transition-all duration-300 cursor-pointer border border-b-0 ${
                activeTab === "attendance"
                  ? "bg-blue-50 text-blue-800 border-blue-200 border-t-3 border-t-blue-600 shadow-[0_-4px_12px_rgba(59,130,246,0.08)] z-20 scale-[1.02]"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 border-slate-200/70 z-10"
              }`}
            >
              <span>🔴</span>
              <span>الغياب اليومي</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("behavior")}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-tl-[28px] rounded-tr-lg rounded-b-none text-xs md:text-sm font-black transition-all duration-300 cursor-pointer border border-b-0 -mr-4 ${
                activeTab === "behavior"
                  ? "bg-amber-50 text-amber-800 border-amber-200 border-t-3 border-t-amber-600 shadow-[0_-4px_12px_rgba(245,158,11,0.08)] z-20 scale-[1.02]"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 border-slate-200/70 z-10"
              }`}
            >
              <span>📝</span>
              <span>رصد السلوك</span>
            </button>
          </div>
        </div>

        {/* TAB CONTENT: ATTENDANCE */}
        {activeTab === "attendance" && (
          <div className="flex flex-col">
            {/* Students Attendance List Sub-Header */}
            <div className="bg-slate-50/50 border-b border-slate-100 px-4 py-3 flex flex-wrap gap-3 justify-between items-center text-right">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-slate-700">قائمة الطلاب ({students.length})</span>
                <span className="text-[10px] font-bold text-slate-400">اضغط على اسم الطالب لتغيير حالته</span>
              </div>
              
              <div className="flex items-center gap-2 flex-1 min-w-[220px] sm:flex-initial w-full">
                <button
                  type="button"
                  onClick={handleSelectAllPresent}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg text-xs md:text-sm font-bold border transition-all duration-200 cursor-pointer shadow-3xs ${
                    isAllPresentChecked
                      ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 font-extrabold"
                      : "bg-emerald-50 hover:bg-emerald-100/90 text-emerald-800 border-emerald-200"
                  }`}
                >
                  <div className={`w-4 h-4 border rounded flex items-center justify-center text-[10px] font-black transition-all ${
                    isAllPresentChecked
                      ? "bg-white border-white text-emerald-600"
                      : "bg-white border-emerald-400 text-transparent"
                  }`}>
                    ✓
                  </div>
                  <span>حضور الجميع</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllAbsent}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg text-xs md:text-sm font-bold border transition-all duration-200 cursor-pointer shadow-3xs ${
                    isAllAbsentChecked
                      ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700 font-extrabold"
                      : "bg-rose-50 hover:bg-rose-100/90 text-rose-800 border-rose-200"
                  }`}
                >
                  <div className={`w-4 h-4 border rounded flex items-center justify-center text-[10px] font-black transition-all ${
                    isAllAbsentChecked
                      ? "bg-white border-white text-rose-600"
                      : "bg-white border-rose-400 text-transparent"
                  }`}>
                    ✓
                  </div>
                  <span>غياب الجميع</span>
                </button>
              </div>
            </div>

            {attendanceLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">جاري تحميل قائمة الطلاب...</div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">لا يوجد طلاب مسجلين في هذا الفصل.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student, idx) => {
                  const isPresent = presentStudentIds.includes(student.id);
                  const isAbsent = absentStudentIds.includes(student.id);
                  const isLate = lateStudentIds.includes(student.id);

                  let rowBg = "hover:bg-slate-50/80 bg-white";
                  if (isAbsent) {
                    rowBg = "bg-rose-50/70 hover:bg-rose-100/70";
                  } else if (isLate) {
                    rowBg = "bg-amber-50/70 hover:bg-amber-100/70";
                  } else if (isPresent) {
                    rowBg = "bg-emerald-50/40 hover:bg-emerald-50/70";
                  }

                  return (
                    <div
                      key={student.id}
                      onClick={() => toggleAttendance(student.id)}
                      className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition select-none ${rowBg}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                          isAbsent 
                            ? "bg-rose-100 text-rose-700" 
                            : isLate
                            ? "bg-amber-100 text-amber-700"
                            : isPresent
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-sm font-semibold transition-colors ${
                          isAbsent 
                            ? "text-rose-700 font-bold" 
                            : isLate
                            ? "text-amber-700 font-bold"
                            : isPresent
                            ? "text-emerald-700 font-bold"
                            : "text-slate-500 font-medium"
                        }`}>
                          {student.name}
                        </span>
                      </div>

                      <div className="transition-all duration-200">
                        {isAbsent ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-rose-600 bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg shadow-2xs animate-in fade-in zoom-in duration-150">
                            <span>غائب</span>
                            <span>📕</span>
                          </span>
                        ) : isLate ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-600 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg shadow-2xs animate-in fade-in zoom-in duration-150">
                            <span>متأخر</span>
                            <span>⏳</span>
                          </span>
                        ) : isPresent ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg shadow-2xs animate-in fade-in zoom-in duration-150">
                            <span>حاضر</span>
                            <span>📗</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: BEHAVIOR */}
        {activeTab === "behavior" && (
          <div className="flex flex-col">
            {/* Behavior List Sub-Header */}
            <div className="bg-slate-50/50 border-b border-slate-100 px-4 py-3 flex justify-between items-center text-right">
              <span className="text-xs font-bold text-slate-500">سجل سلوكيات الطلاب ({students.length})</span>
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">اضغط على الطالب لعرض السلوكيات السابقة، وعلامة + لإضافة سلوك جديد</span>
            </div>

            {attendanceLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">جاري تحميل قائمة الطلاب...</div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">لا يوجد طلاب مسجلين في هذا الفصل.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student, idx) => {
                  const isExpanded = expandedStudentId === student.id;
                  const isDropdownOpen = activeDropdownStudentId === student.id;
                  const currentStudentBehaviors = allBehaviors.filter(b => b.studentId === student.id);
                  const behaviorCount = currentStudentBehaviors.length;
                  const studentDrafts = pendingBehaviors[student.id] || [];

                  return (
                    <div
                      key={student.id}
                      className={`relative flex flex-col transition-all border-b border-slate-100 last:border-b-0 ${
                        isExpanded ? "bg-amber-50/10" : "hover:bg-slate-50/50 bg-white"
                      }`}
                    >
                      {/* Independent Dropdown Backplate (Click Outside Listener) */}
                      {isDropdownOpen && (
                        <div 
                          className="fixed inset-0 z-40 cursor-default bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownStudentId("");
                          }}
                        />
                      )}

                      {/* Student Header Row */}
                      <div
                        onClick={() => {
                          const newExpandedId = isExpanded ? "" : student.id;
                          setExpandedStudentId(newExpandedId);
                          setSelectedStudentId(newExpandedId);
                        }}
                        className="flex flex-col px-4 py-3.5 cursor-pointer select-none"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-semibold text-slate-800">
                              {student.name}
                            </span>
                            
                            {/* Behavior Count Badge */}
                            {behaviorCount > 0 && (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                                <span>📝 {behaviorCount} سلوكيات سابقة</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newDropdownId = isDropdownOpen ? "" : student.id;
                                setActiveDropdownStudentId(newDropdownId);
                              }}
                              className={`p-1.5 rounded-lg border transition-all duration-200 flex items-center justify-center cursor-pointer ${
                                isDropdownOpen 
                                  ? "bg-amber-600 border-amber-600 text-white shadow-sm" 
                                  : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                              }`}
                              title="إضافة سلوك"
                            >
                              <Plus className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-45" : ""}`} />
                            </button>
                          </div>
                        </div>

                        {/* Student Drafts / Pending Behaviors list */}
                        {studentDrafts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2.5" onClick={(e) => e.stopPropagation()}>
                            {studentDrafts.map((beh, bIdx) => (
                              <span
                                key={bIdx}
                                className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-800 border border-amber-500/20 text-[11px] font-bold px-2 py-1 rounded-lg shadow-3xs animate-in zoom-in duration-150"
                              >
                                <span>{beh}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingBehaviors(prev => {
                                      const updated = { ...prev };
                                      updated[student.id] = updated[student.id].filter((_, i) => i !== bIdx);
                                      if (updated[student.id].length === 0) {
                                        delete updated[student.id];
                                      }
                                      return updated;
                                    });
                                  }}
                                  className="text-rose-600 hover:text-rose-800 font-extrabold cursor-pointer text-xs w-4 h-4 flex items-center justify-center rounded-full hover:bg-rose-50"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Floating Quick Behavior Selection Dropdown Menu (Opens Externally / z-50) */}
                      {isDropdownOpen && (
                        <div 
                          className="absolute left-4 top-13 z-50 w-[calc(100%-2rem)] max-w-[340px] bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.15)] space-y-3.5 animate-in fade-in slide-in-from-top-3 duration-200 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <span className="text-xs font-black text-slate-800">اختر سلوكاً للإضافة مباشرة:</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownStudentId("");
                              }}
                              className="text-xs font-bold text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                            >
                              إغلاق ×
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                            {VIOLATIONS.map((violation) => {
                              const isAlreadyPending = studentDrafts.includes(violation);
                              return (
                                <button
                                  key={violation}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingBehaviors(prev => {
                                      const current = prev[student.id] || [];
                                      let updatedList;
                                      if (current.includes(violation)) {
                                        updatedList = current.filter(v => v !== violation);
                                      } else {
                                        updatedList = [...current, violation];
                                      }
                                      
                                      const updated = { ...prev };
                                      if (updatedList.length === 0) {
                                        delete updated[student.id];
                                      } else {
                                        updated[student.id] = updatedList;
                                      }
                                      return updated;
                                    });
                                    // CLOSE dropdown immediately after selection
                                    setActiveDropdownStudentId("");
                                  }}
                                  className={`text-right text-xs font-bold px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                                    isAlreadyPending
                                      ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                      : "bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200/80 hover:border-amber-200"
                                  }`}
                                >
                                  <span>{violation}</span>
                                  {isAlreadyPending && <span className="text-white text-[10px] font-black">✓ نشط</span>}
                                </button>
                              );
                            })}
                          </div>

                          {/* Custom Behavior Input */}
                          <div className="border-t border-slate-150 pt-3 mt-1 space-y-1.5">
                            <span className="block text-[11px] font-black text-slate-500">سلوك مخصص آخر غير مدرج:</span>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="مثال: التأخر في تسليم الواجب..."
                                id={`custom-violation-${student.id}`}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const text = e.currentTarget.value.trim();
                                    if (text) {
                                      setPendingBehaviors(prev => {
                                        const current = prev[student.id] || [];
                                        if (current.includes(text)) return prev;
                                        return { ...prev, [student.id]: [...current, text] };
                                      });
                                      e.currentTarget.value = "";
                                      // CLOSE dropdown immediately after selection
                                      setActiveDropdownStudentId("");
                                    }
                                  }
                                }}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const inputEl = document.getElementById(`custom-violation-${student.id}`) as HTMLInputElement;
                                  const text = inputEl?.value.trim();
                                  if (text) {
                                    setPendingBehaviors(prev => {
                                      const current = prev[student.id] || [];
                                      if (current.includes(text)) return prev;
                                      return { ...prev, [student.id]: [...current, text] };
                                    });
                                    inputEl.value = "";
                                    // CLOSE dropdown immediately after selection
                                    setActiveDropdownStudentId("");
                                  }
                                }}
                                className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                              >
                                إضافة
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Expanded Section (Previous History) */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2.5 border-t border-amber-100/30 space-y-3 bg-amber-50/5">
                          {/* Previous Violations Log */}
                          <div className="space-y-2">
                            <span className="block text-xs font-bold text-slate-600">سجل المخالفات المسجلة للطالب:</span>
                            
                            {currentStudentBehaviors.length === 0 ? (
                              <div className="bg-white/80 rounded-xl p-4 text-center text-slate-400 text-xs border border-dashed border-slate-200">
                                لا يوجد ملاحظات مسجلة على هذا الطالب سابقاً 👍
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                                {currentStudentBehaviors.map(record => (
                                  <div 
                                    key={record.id} 
                                    className="bg-white border border-slate-100 rounded-xl p-3 text-[11px] space-y-1.5 relative shadow-3xs"
                                  >
                                    <div className="flex items-center justify-between border-b border-slate-50 pb-1">
                                      <div className="flex items-center gap-1.5 font-bold text-slate-400">
                                        <Calendar className="w-3 h-3 text-amber-500" />
                                        <span>{record.date}</span>
                                        <span className="text-slate-200">|</span>
                                        <Clock className="w-3 h-3 text-amber-500" />
                                        <span>{record.period}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 font-bold text-slate-500">
                                      <User className="w-3 h-3 text-amber-500" />
                                      <span>المعلم: </span>
                                      <span className="text-slate-700">{record.teacherName}</span>
                                    </div>

                                    <div className="flex items-start gap-1 font-bold text-amber-900 bg-amber-50/50 p-1.5 rounded-lg border border-amber-100/50">
                                      <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                      <div>
                                        <span className="text-amber-950 font-black">{record.violation}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FLOATING SAVE BAR CONTAINER (Only when on Attendance tab) */}
      {activeTab === "attendance" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3.5 max-w-md mx-auto shadow-[0_-8px_24px_rgba(15,23,42,0.08)] flex flex-col gap-2 rounded-t-2xl">
          {/* Unsaved changes alert */}
          {isDirty && students.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 py-1.5 px-3.5 rounded-full animate-pulse mx-auto">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              <span>⚠️ الرجاء حفظ التغييرات الحالية للغياب</span>
            </div>
          )}

          {/* Save Status Notification */}
          {saveStatus && (
            <div className={`p-2 rounded-xl text-center text-xs font-bold border transition ${
              saveStatus.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}>
              {saveStatus.message}
            </div>
          )}

          <motion.button
            type="button"
            onClick={handleSaveAttendance}
            disabled={attendanceLoading || students.length === 0 || !isDirty}
            className={`w-full font-extrabold text-white py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all ${
              !isDirty || students.length === 0
                ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                : absentStudentIds.length === 0
                ? "bg-emerald-600 hover:bg-emerald-700 active:scale-98 cursor-pointer ring-4 ring-emerald-500/20" 
                : "bg-blue-600 hover:bg-blue-700 active:scale-98 cursor-pointer ring-4 ring-blue-500/20"
            }`}
            animate={isDirty && students.length > 0 ? {
              scale: [1, 1.03, 0.98, 1.03, 1],
              y: [0, -3, 0],
              boxShadow: absentStudentIds.length === 0 
                ? [
                    "0 4px 6px -1px rgba(16, 185, 129, 0.1), 0 2px 4px -2px rgba(16, 185, 129, 0.1)",
                    "0 12px 20px -3px rgba(16, 185, 129, 0.45), 0 6px 8px -4px rgba(16, 185, 129, 0.45)",
                    "0 4px 6px -1px rgba(16, 185, 129, 0.1), 0 2px 4px -2px rgba(16, 185, 129, 0.1)"
                  ]
                : [
                    "0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)",
                    "0 12px 20px -3px rgba(37, 99, 235, 0.45), 0 6px 8px -4px rgba(37, 99, 235, 0.45)",
                    "0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)"
                  ]
            } : {}}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut"
            }}
          >
            {attendanceLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" id="save-progress-circle">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Save className={`w-5 h-5 ${isDirty && students.length > 0 ? "animate-bounce" : ""}`} />
            )}
            <span>
              {attendanceLoading 
                ? "جاري حفظ الغياب..." 
                : !isDirty
                ? (hasRecord ? "تم حفظ التغييرات بنجاح ✓" : "بانتظار رصد الحضور والغياب... 📝")
                : absentStudentIds.length === 0 
                ? "حفظ (الجميع حضور) 💾" 
                : `حفظ الغياب (${absentStudentIds.length} غائب) 💾`}
            </span>
          </motion.button>
        </div>
      )}

      {/* FLOATING SAVE BAR CONTAINER (Only when on Behavior tab) */}
      {activeTab === "behavior" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3.5 max-w-md mx-auto shadow-[0_-8px_24px_rgba(15,23,42,0.08)] flex flex-col gap-2 rounded-t-2xl">
          {/* Unsaved changes alert */}
          {isBehaviorDirty && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 py-1.5 px-3.5 rounded-full animate-pulse mx-auto">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              <span>⚠️ لديك {totalPendingBehaviorsCount} سلوكيات معلقة لم يتم حفظها بعد</span>
            </div>
          )}

          {/* Behavior Save Status Message */}
          {behaviorSaveStatus && (
            <div className={`p-2 rounded-xl text-center text-xs font-bold border transition ${
              behaviorSaveStatus.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}>
              {behaviorSaveStatus.message}
            </div>
          )}

          <motion.button
            type="button"
            onClick={handleSaveAllBehaviors}
            disabled={behaviorLoading || !isBehaviorDirty}
            className={`w-full font-extrabold text-white py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all ${
              !isBehaviorDirty
                ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                : "bg-amber-600 hover:bg-amber-700 active:scale-98 cursor-pointer ring-4 ring-amber-500/20"
            }`}
            animate={isBehaviorDirty ? {
              scale: [1, 1.03, 0.98, 1.03, 1],
              y: [0, -3, 0],
              boxShadow: [
                "0 4px 6px -1px rgba(217, 119, 6, 0.1), 0 2px 4px -2px rgba(217, 119, 6, 0.1)",
                "0 12px 20px -3px rgba(217, 119, 6, 0.45), 0 6px 8px -4px rgba(217, 119, 6, 0.45)",
                "0 4px 6px -1px rgba(217, 119, 6, 0.1), 0 2px 4px -2px rgba(217, 119, 6, 0.1)"
              ]
            } : {}}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut"
            }}
          >
            {behaviorLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Save className={`w-5 h-5 ${isBehaviorDirty ? "animate-bounce" : ""}`} />
            )}
            <span>
              {behaviorLoading 
                ? "جاري حفظ السلوكيات..." 
                : !isBehaviorDirty
                ? "بانتظار رصد السلوكيات... 📝"
                : `حفظ السلوكيات لـ (${Object.keys(pendingBehaviors).length} طلاب) 💾`}
            </span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
