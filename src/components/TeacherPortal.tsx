import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord } from "../types";
import { 
  getStudentsByClass, 
  getAttendanceRecord, 
  saveAttendanceRecord, 
  getBehaviorRecords, 
  saveBehaviorRecord,
  getAllBehaviorRecords
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

export default function TeacherPortal({ grades, classes, teachers, onRefreshStats, activeTab: propActiveTab, setActiveTab: propSetActiveTab, navigateTo }: TeacherPortalProps) {
  // Filter Selection States
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("حصة 1");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Filtered lists
  const [filteredClasses, setFilteredClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Tab State
  const [localActiveTab, setLocalActiveTab] = useState<"attendance" | "behavior">("attendance");
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setLocalActiveTab;

  // Attendance states
  const [absentStudentIds, setAbsentStudentIds] = useState<string[]>([]);
  const [lateStudentIds, setLateStudentIds] = useState<string[]>([]);
  const [savedAbsentIds, setSavedAbsentIds] = useState<string[]>([]);
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

  // Fetch Students and existing Attendance record when Class/Period/Date changes
  useEffect(() => {
    async function loadClassData() {
      if (!selectedGradeId || !selectedClassId) {
        setStudents([]);
        return;
      }

      setAttendanceLoading(true);
      try {
        const studentList = await getStudentsByClass(selectedGradeId, selectedClassId);
        setStudents(studentList);

        if (studentList.length > 0 && !selectedStudentId) {
          setSelectedStudentId(studentList[0].id);
        }

        // Fetch existing attendance
        const record = await getAttendanceRecord(getTodayDateString(), selectedPeriod, selectedGradeId, selectedClassId);
        if (record) {
          const absent = record.absent || [];
          const late = record.late || [];
          setAbsentStudentIds(absent);
          setLateStudentIds(late);
          setSavedAbsentIds(absent);
          setHasRecord(true);
          setIsDirty(false);
        } else {
          // Default: all present
          setAbsentStudentIds([]);
          setLateStudentIds([]);
          setSavedAbsentIds([]);
          setHasRecord(false);
          setIsDirty(false); // No changes made yet, do not trigger unsaved effects initially
        }
      } catch (error) {
        console.error("Error loading class data:", error);
      } finally {
        setAttendanceLoading(false);
      }
    }

    loadClassData();
  }, [selectedGradeId, selectedClassId, selectedPeriod]);

  // Fetch behavior records when selected student changes
  useEffect(() => {
    async function loadBehaviors() {
      if (!selectedStudentId) {
        setStudentBehaviors([]);
        return;
      }
      setBehaviorLoading(true);
      try {
        const records = await getBehaviorRecords(selectedStudentId);
        setStudentBehaviors(records);
      } catch (error) {
        console.error("Error loading behaviors:", error);
      } finally {
        setBehaviorLoading(false);
      }
    }
    loadBehaviors();
  }, [selectedStudentId]);

  // Handle student attendance toggle
  const toggleAttendance = (studentId: string) => {
    setIsDirty(true);
    const wasSavedAbsent = savedAbsentIds.includes(studentId);

    if (wasSavedAbsent) {
      // Toggle between Absent and Late only! Never Present.
      if (absentStudentIds.includes(studentId)) {
        // If currently absent, change to late
        setAbsentStudentIds(prev => prev.filter(id => id !== studentId));
        setLateStudentIds(prev => {
          if (!prev.includes(studentId)) return [...prev, studentId];
          return prev;
        });
      } else {
        // If currently late, change back to absent
        setLateStudentIds(prev => prev.filter(id => id !== studentId));
        setAbsentStudentIds(prev => {
          if (!prev.includes(studentId)) return [...prev, studentId];
          return prev;
        });
      }
    } else {
      // Normal toggle between Present and Absent
      setAbsentStudentIds(prev => {
        if (prev.includes(studentId)) {
          return prev.filter(id => id !== studentId);
        } else {
          return [...prev, studentId];
        }
      });
      // Ensure they are not in late list
      setLateStudentIds(prev => prev.filter(id => id !== studentId));
    }
  };

  // Helper selectors
  const handleSelectAllPresent = () => {
    setIsDirty(true);
    // Students who were saved as absent must NOT be marked present, they must remain as they are (absent or late)
    setAbsentStudentIds(prev => prev.filter(id => savedAbsentIds.includes(id)));
    setLateStudentIds(prev => prev.filter(id => savedAbsentIds.includes(id)));
  };

  const handleSelectAllAbsent = () => {
    setIsDirty(true);
    setAbsentStudentIds(students.map(s => s.id));
    setLateStudentIds([]);
  };

  // Save attendance
  const handleSaveAttendance = async () => {
    if (!selectedTeacherId || !selectedGradeId || !selectedClassId) {
      setSaveStatus({ type: "error", message: "الرجاء اختيار المعلم والصف والفصل أولاً" });
      return;
    }

    setAttendanceLoading(true);
    setSaveStatus(null);
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
      {/* Title & App Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-8 -mt-8 opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-50 rounded-full -ml-8 -mb-8 opacity-50"></div>
        
        {navigateTo && (
          <button
            type="button"
            onClick={() => navigateTo("admin")}
            className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl text-2xs font-extrabold transition border border-slate-200/60 shadow-3xs cursor-pointer"
          >
            <span>🛡️ لوحة الإدارة</span>
          </button>
        )}

        <h1 className="text-2xl font-bold text-blue-900 mb-1">مدرسة أم الحمام الثانوية</h1>
        <div className="flex items-center justify-center gap-1.5 text-slate-600 font-medium text-sm mb-2">
          <span>نظام تسجيل الغياب والسلوك</span>
          <span>📋</span>
        </div>
        <div className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 font-semibold px-3.5 py-1 rounded-full text-xs border border-rose-100 shadow-sm">
          <span>📅</span>
          <span>{formattedDate || "الثلاثاء، ١٤ يوليو"}</span>
        </div>
      </div>

      {/* Summary Counters */}
      <div className="sticky top-4 z-30 bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-slate-200/80 p-3 flex flex-col gap-2">
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

      {/* Filter Options Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Teacher Select */}
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">المعلم</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Select */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الصف</label>
            <select
              value={selectedGradeId}
              onChange={(e) => setSelectedGradeId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {grades.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Class Select */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الفصل</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الحصة</label>
            <div className="grid grid-cols-4 gap-1.5">
              {PERIODS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPeriod(p)}
                  className={`text-xs py-2 px-1 rounded-lg font-bold border transition ${
                    selectedPeriod === p
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Feature Tabs */}
      <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-lg text-sm font-extrabold transition-all duration-300 ${
            activeTab === "attendance"
              ? "bg-blue-600 text-white shadow-md scale-102"
              : "text-slate-600 hover:bg-slate-200"
          }`}
        >
          <span>الغياب 🔴</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("behavior")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-lg text-sm font-extrabold transition-all duration-300 ${
            activeTab === "behavior"
              ? "bg-amber-600 text-white shadow-md scale-102"
              : "text-slate-600 hover:bg-slate-200"
          }`}
        >
          <span>السلوك 📝</span>
        </button>
      </div>

      {/* TAB CONTENT: ATTENDANCE */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          {/* Quick Actions Panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
            {/* Attendance quick toggle helpers */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSelectAllPresent}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-2.5 px-3 rounded-lg text-xs border border-emerald-200 transition"
              >
                🟢 تحديد الجميع حضور
              </button>
              <button
                type="button"
                onClick={handleSelectAllAbsent}
                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold py-2.5 px-3 rounded-lg text-xs border border-rose-200 transition"
              >
                🔴 تحديد الجميع غائبين
              </button>
            </div>
          </div>

          {/* Students Attendance List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">قائمة الطلاب ({students.length})</span>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">اضغط على اسم الطالب لتغيير حالته</span>
            </div>

            {attendanceLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">جاري تحميل قائمة الطلاب...</div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">لا يوجد طلاب مسجلين في هذا الفصل.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student, idx) => {
                  const isAbsent = absentStudentIds.includes(student.id);
                  const isLate = lateStudentIds.includes(student.id);

                  let rowBg = "hover:bg-slate-50";
                  if (isAbsent) {
                    rowBg = "bg-rose-50/70 hover:bg-rose-100/70";
                  } else if (isLate) {
                    rowBg = "bg-amber-50/70 hover:bg-amber-100/70";
                  }

                  return (
                    <div
                      key={student.id}
                      onClick={() => toggleAttendance(student.id)}
                      className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition select-none ${rowBg}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                          isAbsent 
                            ? "bg-rose-100 text-rose-700" 
                            : isLate
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`text-sm font-semibold ${
                          isAbsent 
                            ? "text-rose-700 font-bold" 
                            : isLate
                            ? "text-amber-700 font-bold"
                            : "text-slate-800"
                        }`}>
                          {student.name}
                        </span>
                      </div>

                      <div>
                        {isAbsent ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-rose-600 bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg shadow-2xs">
                            <span>غائب</span>
                            <span>📕</span>
                          </span>
                        ) : isLate ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-600 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg shadow-2xs">
                            <span>متأخر</span>
                            <span>⏳</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                            <span>حاضر</span>
                            <span>📗</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fixed Bottom Save Bar Container */}
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
              disabled={attendanceLoading || students.length === 0 || (hasRecord && !isDirty)}
              className={`w-full font-extrabold text-white py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all ${
                (hasRecord && !isDirty) || students.length === 0
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                  : absentStudentIds.length === 0
                  ? "bg-emerald-600 hover:bg-emerald-700 active:scale-98 cursor-pointer" 
                  : "bg-blue-600 hover:bg-blue-700 active:scale-98 cursor-pointer"
              }`}
              animate={isDirty && students.length > 0 ? {
                scale: [1, 1.02, 1],
                y: [0, -2, 0],
                boxShadow: absentStudentIds.length === 0 
                  ? [
                      "0 4px 6px -1px rgba(16, 185, 129, 0.1), 0 2px 4px -2px rgba(16, 185, 129, 0.1)",
                      "0 10px 15px -3px rgba(16, 185, 129, 0.35), 0 4px 6px -4px rgba(16, 185, 129, 0.35)",
                      "0 4px 6px -1px rgba(16, 185, 129, 0.1), 0 2px 4px -2px rgba(16, 185, 129, 0.1)"
                    ]
                  : [
                      "0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)",
                      "0 10px 15px -3px rgba(37, 99, 235, 0.35), 0 4px 6px -4px rgba(37, 99, 235, 0.35)",
                      "0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)"
                    ]
              } : {}}
              transition={{
                repeat: Infinity,
                duration: 1.8,
                ease: "easeInOut"
              }}
            >
              {attendanceLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className={`w-5 h-5 ${isDirty && students.length > 0 ? "animate-bounce" : ""}`} />
              )}
              <span>
                {attendanceLoading 
                  ? "جاري حفظ الغياب..." 
                  : absentStudentIds.length === 0 
                  ? "حفظ (الجميع حضور) 💾" 
                  : `حفظ الغياب (${absentStudentIds.length} غائب) 💾`}
              </span>
            </motion.button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BEHAVIOR */}
      {activeTab === "behavior" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">سجل سلوكيات الطلاب ({students.length})</span>
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">اضغط على الطالب لإضافة أو عرض السلوك</span>
            </div>

            {attendanceLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">جاري تحميل قائمة الطلاب...</div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">لا يوجد طلاب مسجلين في هذا الفصل.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student, idx) => {
                  const isExpanded = expandedStudentId === student.id;
                  const currentStudentBehaviors = allBehaviors.filter(b => b.studentId === student.id);
                  const behaviorCount = currentStudentBehaviors.length;

                  return (
                    <div
                      key={student.id}
                      className={`flex flex-col transition-all ${
                        isExpanded ? "bg-amber-50/20" : "hover:bg-slate-50/50"
                      }`}
                    >
                      {/* Student Header Row */}
                      <div
                        onClick={() => {
                          const newExpandedId = isExpanded ? "" : student.id;
                          setExpandedStudentId(newExpandedId);
                          setSelectedStudentId(newExpandedId);
                          setSelectedViolation("");
                          setCustomViolationText("");
                          setIsAddFormOpen(true);
                        }}
                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            {idx + 1}
                          </span>
                          <span className={`text-sm font-semibold text-slate-800`}>
                            {student.name}
                          </span>
                          
                          {/* Behavior Count Badge */}
                          {behaviorCount > 0 && (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                              <span>📝 {behaviorCount} سلوكيات</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newExpandedId = isExpanded ? "" : student.id;
                              setExpandedStudentId(newExpandedId);
                              setSelectedStudentId(newExpandedId);
                              setSelectedViolation("");
                              setCustomViolationText("");
                              setIsAddFormOpen(true);
                            }}
                            className={`p-1.5 rounded-lg border transition ${
                              isExpanded 
                                ? "bg-amber-600 border-amber-600 text-white animate-pulse" 
                                : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Section */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-amber-100/50 space-y-4 bg-amber-50/10">
                          {/* Behavior Save Status Message */}
                          {behaviorSaveStatus && selectedStudentId === student.id && (
                            <div className={`p-2 rounded-lg text-center text-xs font-bold border transition ${
                              behaviorSaveStatus.type === "success" 
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                                : "bg-rose-50 text-rose-800 border-rose-200"
                            }`}>
                              {behaviorSaveStatus.message}
                            </div>
                          )}

                          {/* Behavior Add Violation Field */}
                          {isAddFormOpen ? (
                            <div className="bg-white rounded-xl border border-amber-200 p-3.5 space-y-3 shadow-2xs">
                              <label className="block text-xs font-black text-amber-800">إضافة ملاحظة سلوكية جديدة</label>
                              
                              <div className="space-y-3">
                                <div>
                                  <span className="block text-[10px] font-bold text-slate-500 mb-1">حدد السلوك:</span>
                                  <select
                                    value={selectedViolation}
                                    onChange={(e) => {
                                      setSelectedViolation(e.target.value);
                                      if (e.target.value !== "other") {
                                        setCustomViolationText(""); // clear custom text if predefined chosen
                                      }
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  >
                                    <option value="">-- اختر السلوك --</option>
                                    {VIOLATIONS.map(v => (
                                      <option key={v} value={v}>{v}</option>
                                    ))}
                                    <option value="other">أخرى (كتابة نص مخصص)...</option>
                                  </select>
                                </div>

                                {selectedViolation === "other" && (
                                  <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                    <span className="block text-[10px] font-bold text-slate-500 mb-1">اكتب سلوكاً مخصصاً:</span>
                                    <input
                                      type="text"
                                      value={customViolationText}
                                      onChange={(e) => setCustomViolationText(e.target.value)}
                                      placeholder="اكتب تفاصيل السلوك هنا (مثال: تأخر في تسليم المشروع)..."
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={handleSaveBehavior}
                                  disabled={behaviorLoading || !selectedViolation || (selectedViolation === "other" && !customViolationText.trim())}
                                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition active:scale-98"
                                >
                                  {behaviorLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5" />
                                  )}
                                  <span>{behaviorLoading ? "جاري الحفظ..." : "تسجيل السلوك"}</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-start">
                              <button
                                type="button"
                                onClick={() => setIsAddFormOpen(true)}
                                className="text-xs font-bold text-amber-700 bg-amber-100/60 hover:bg-amber-100 border border-amber-200/50 px-3 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-98"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>إضافة ملاحظة سلوكية جديدة</span>
                              </button>
                            </div>
                          )}

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
        </div>
      )}
    </div>
  );
}
