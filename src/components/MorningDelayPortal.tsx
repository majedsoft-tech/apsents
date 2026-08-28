import React, { useState, useEffect, useMemo } from "react";
import { Grade, Class, Teacher, Student, MorningDelayRecord } from "../types";
import { 
  getStudentsByClass,
  getMorningDelayRecords,
  saveMorningDelayRecord,
  deleteMorningDelayRecord,
  subscribeToMorningDelayRecords
} from "../dbService";
import { 
  Clock, 
  Calendar, 
  UserCheck, 
  Search, 
  Plus, 
  Trash2, 
  Check, 
  Copy, 
  Printer, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  User, 
  Building2, 
  Layers, 
  Share2, 
  Filter, 
  Loader2, 
  SunMedium, 
  ArrowRight,
  HelpCircle,
  FileSpreadsheet,
  List,
  LayoutGrid
} from "lucide-react";

interface MorningDelayPortalProps {
  grades: Grade[];
  classes: Class[];
  students: Student[];
  teachers?: Teacher[];
  onRefreshData?: () => Promise<void>;
  navigateTo?: (mode: "teacher" | "admin" | "stats-only" | "super-admin" | "morning-delay") => void;
  schoolName?: string;
  isDirectLink?: boolean;
  globalProgress?: { active: boolean; type: "save" | "load" | "delete" | "import" | null; label: string };
  setGlobalProgress?: React.Dispatch<React.SetStateAction<{ active: boolean; type: "save" | "load" | "delete" | "import" | null; label: string }>>;
  isGoogleAuthenticated?: boolean;
  onRequireGoogleLogin?: () => void;
}

const COMMON_REASONS = [
  { id: "excused", label: "عذر مقبول (معتمد)", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { id: "unexcused", label: "بدون عذر", badge: "bg-rose-100 text-rose-800 border-rose-300" },
  { id: "traffic", label: "ازدحام سير ومواصلات", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  { id: "overslept", label: "استيقاظ متأخر / نوم", badge: "bg-orange-100 text-orange-800 border-orange-300" },
  { id: "family", label: "ظروف عائلية", badge: "bg-blue-100 text-blue-800 border-blue-300" },
  { id: "medical", label: "موعد طبي / صحي", badge: "bg-purple-100 text-purple-800 border-purple-300" }
];

const TIME_PRESETS = ["07:05", "07:15", "07:25", "07:30", "07:45", "08:00", "08:15"];

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentTimeString = () => {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export default function MorningDelayPortal({
  grades,
  classes,
  students,
  teachers = [],
  navigateTo,
  schoolName = "",
  isDirectLink = false,
  setGlobalProgress,
  isGoogleAuthenticated,
  onRequireGoogleLogin
}: MorningDelayPortalProps) {
  // Date State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const isToday = selectedDate === getTodayDateString();

  // Supervisor & Input States
  const [recorderName, setRecorderName] = useState<string>(() => {
    return localStorage.getItem("morning_delay_recorder_name") || "";
  });
  const [arrivalTime, setArrivalTime] = useState<string>(getCurrentTimeString());
  const [selectedReason, setSelectedReason] = useState<string>("بدون عذر");
  const [customReason, setCustomReason] = useState<string>("");
  const [delayMinutes, setDelayMinutes] = useState<number>(15);
  const [notes, setNotes] = useState<string>("");

  // Mode Selection: "search" (Instant Student Lookup) vs "class" (List/Grid by Class) - Default to "class"
  const [entryMode, setEntryMode] = useState<"search" | "class">("class");
  const [classViewMode, setClassViewMode] = useState<"list" | "grid">("list");

  // Search Filter State
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>("");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Records state
  const [records, setRecords] = useState<MorningDelayRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Table Filter & Search
  const [tableSearch, setTableSearch] = useState<string>("");
  const [tableFilterGrade, setTableFilterGrade] = useState<string>("all");
  const [tableFilterReason, setTableFilterReason] = useState<string>("all");
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Custom In-App Confirmation Modal for deleting delays (avoiding blocked window.confirm in iframes)
  const [confirmDeleteState, setConfirmDeleteState] = useState<{
    recordId: string;
    studentName: string;
    studentId?: string;
    date?: string;
  } | null>(null);

  // Save recorder name to localStorage
  useEffect(() => {
    if (recorderName) {
      localStorage.setItem("morning_delay_recorder_name", recorderName);
    }
  }, [recorderName]);

  // Real-time Firestore Subscription for Morning Delay Records
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToMorningDelayRecords(selectedDate, (newRecords) => {
      setRecords(newRecords);
      setLoading(false);
    }, (_err) => {
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [selectedDate]);

  // Sorted Grades
  const sortedGrades = useMemo(() => {
    return [...grades].sort((a, b) => {
      const timeA = (a as any).createdAt || 0;
      const timeB = (b as any).createdAt || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [grades]);

  // Set default grade and class when grades load
  useEffect(() => {
    if (sortedGrades.length > 0 && !selectedGradeId) {
      setSelectedGradeId(sortedGrades[0].id);
    }
  }, [sortedGrades, selectedGradeId]);

  // Filtered and sorted classes based on selected grade
  const filteredClasses = useMemo(() => {
    if (!selectedGradeId) return [];
    const list = classes.filter(c => c.gradeId === selectedGradeId);
    return list.sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+/)?.[0] || "999", 10);
      const numB = parseInt(b.name.match(/\d+/)?.[0] || "999", 10);
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [classes, selectedGradeId]);

  // Set default class when grade changes
  useEffect(() => {
    if (filteredClasses.length > 0 && (!selectedClassId || !filteredClasses.some(c => c.id === selectedClassId))) {
      setSelectedClassId(filteredClasses[0].id);
    }
  }, [filteredClasses, selectedClassId]);

  // Filtered students for class view
  const classStudents = useMemo(() => {
    if (!selectedGradeId || !selectedClassId) return [];
    return students
      .filter(s => s.gradeId === selectedGradeId && s.classId === selectedClassId)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [students, selectedGradeId, selectedClassId]);

  // Instant Search Students List
  const searchResults = useMemo(() => {
    const q = studentSearchQuery.trim().toLowerCase();
    if (!q) return [];
    
    return students
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 15)
      .map(s => {
        const gr = grades.find(g => g.id === s.gradeId);
        const cl = classes.find(c => c.id === s.classId);
        const isRecorded = records.some(r => r.studentId === s.id);
        return {
          ...s,
          gradeName: gr?.name || "غير محدد",
          className: cl?.name || "غير محدد",
          isRecorded
        };
      });
  }, [students, studentSearchQuery, grades, classes, records]);

  // Quick record handler for a student - Records exact real-time on click instantly!
  const handleRecordStudent = async (student: Student, overrideReason?: string) => {
    if (!isGoogleAuthenticated && !isDirectLink) {
      onRequireGoogleLogin?.();
      return;
    }
    const gr = grades.find(g => g.id === student.gradeId);
    const cl = classes.find(c => c.id === student.classId);
    const finalReason = overrideReason || (selectedReason === "أخرى" ? (customReason || "أخرى") : selectedReason);
    
    // Always capture exact real-time when clicking on the student!
    const exactRecordTime = getCurrentTimeString();
    setArrivalTime(exactRecordTime);

    const recordPayload = {
      studentId: student.id,
      studentName: student.name,
      gradeId: student.gradeId,
      gradeName: gr?.name || "",
      classId: student.classId,
      className: cl?.name || "",
      date: selectedDate,
      arrivalTime: exactRecordTime,
      delayMinutes: Number(delayMinutes) || 15,
      reason: finalReason,
      recordedBy: recorderName.trim() || "مشرف التأخر الصباحي",
      notes: notes.trim()
    };

    // Optimistic instant UI update (0ms delay)
    const tempId = "delay_" + student.id + "_" + Date.now();
    const optimisticRecord: MorningDelayRecord = {
      ...recordPayload,
      id: tempId,
      timestamp: Date.now()
    };

    setRecords(prev => {
      const filtered = prev.filter(r => r.studentId !== student.id);
      return [optimisticRecord, ...filtered];
    });

    setSaveToast(`تم تسجيل تأخر (${student.name}) - ${exactRecordTime}`);
    setTimeout(() => setSaveToast(null), 2500);
    setNotes("");

    // Background persistent save
    try {
      const realId = await saveMorningDelayRecord(recordPayload);
      if (realId && realId !== tempId) {
        setRecords(prev => prev.map(r => r.id === tempId ? { ...r, id: realId } : r));
      }
    } catch (err) {
      console.error("Error saving morning delay:", err);
    }
  };

  // Delete Record Handler - opens custom in-app confirmation modal
  const handleDeleteRecord = (recordId: string, studentName?: string, studentId?: string, date?: string) => {
    if (!isGoogleAuthenticated && !isDirectLink) {
      onRequireGoogleLogin?.();
      return;
    }
    setConfirmDeleteState({
      recordId,
      studentName: studentName || "الطالب",
      studentId,
      date: date || selectedDate
    });
  };

  // Execution of the confirmed deletion
  const executeConfirmDelete = async () => {
    if (!confirmDeleteState) return;
    const { recordId, studentName, studentId, date } = confirmDeleteState;
    setConfirmDeleteState(null);

    const targetDate = date || selectedDate;

    // Optimistic instant remove from UI (0ms delay)
    setRecords(prev => prev.filter(r => {
      if (r.id === recordId) return false;
      if (studentId && targetDate && r.studentId === studentId && r.date === targetDate) return false;
      return true;
    }));
    setSaveToast(`تم حذف وإلغاء تسجيل تأخر (${studentName}) بنجاح`);
    setTimeout(() => setSaveToast(null), 2500);

    try {
      await deleteMorningDelayRecord(recordId, { studentId, date: targetDate });
    } catch (err) {
      console.error("Error deleting morning delay:", err);
    }
  };

  // Filtered Records for Table
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Search
      if (tableSearch) {
        const q = tableSearch.toLowerCase();
        const nameMatch = (r.studentName || "").toLowerCase().includes(q);
        const gradeMatch = (r.gradeName || "").toLowerCase().includes(q);
        const classMatch = (r.className || "").toLowerCase().includes(q);
        const reasonMatch = (r.reason || "").toLowerCase().includes(q);
        if (!nameMatch && !gradeMatch && !classMatch && !reasonMatch) return false;
      }
      // Grade filter
      if (tableFilterGrade !== "all" && r.gradeId !== tableFilterGrade) return false;
      // Reason filter
      if (tableFilterReason !== "all" && r.reason !== tableFilterReason) return false;

      return true;
    });
  }, [records, tableSearch, tableFilterGrade, tableFilterReason]);

  // Formatted date in Arabic (e.g. الأحد، ٢٣ أغسطس)
  const formattedArabicDate = useMemo(() => {
    try {
      if (!selectedDate) return "";
      const [year, month, day] = selectedDate.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
      return dateObj.toLocaleDateString("ar-SA", options);
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Statistics summary for current day
  const stats = useMemo(() => {
    const total = records.length;
    const excused = records.filter(r => r.reason.includes("عذر مقبول") || r.reason.includes("معتمد") || r.reason.includes("طبي")).length;
    const unexcused = total - excused;
    return { total, excused, unexcused };
  }, [records]);

  // Generate WhatsApp / Clipboard report text
  const handleCopyReport = () => {
    let report = `📋 *تقرير التأخر الصباحي - ${schoolName || "المدرسة"}*\n`;
    report += `📅 *التاريخ:* ${selectedDate}\n`;
    report += `⏰ *إجمالي المتأخرين:* ${records.length} طالب\n`;
    report += `✅ *بعذر:* ${stats.excused} | ❌ *بدون عذر:* ${stats.unexcused}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (records.length === 0) {
      report += `لم يُسجل أي تأخر صباحي لهذا اليوم ✨\n`;
    } else {
      records.forEach((r, idx) => {
        report += `${idx + 1}. *${r.studentName}* (${r.gradeName} - ${r.className})\n`;
        report += `   ⏱️ وقت الوصول: ${r.arrivalTime} | السبب: ${r.reason}\n`;
      });
    }

    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `تم التوثيق بواسطة: ${recorderName || "المشرف الصباحي"}\nمنصة SmartSchool`;

    navigator.clipboard.writeText(report).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    });
  };

  // Change Date helper
  const handleDateShift = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-12" dir="rtl">
      
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-emerald-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-black animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 1. PORTAL HERO HEADER (Matching screenshot layout with morning delay amber/warm palette) */}
      <div className="text-center relative bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-white rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-md overflow-hidden border border-amber-900/60">
        {/* Subtle decorative background circles */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-400/10 rounded-full -ml-10 -mb-10 pointer-events-none"></div>
        
        {/* Main School Name (Bold, Golden/Amber Yellow) */}
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-amber-300 mb-1 tracking-wide">
          {schoolName || "ام الحمام الثانوية"}
        </h1>

        {/* Subtitle with icon */}
        <div className="flex items-center justify-center gap-1.5 text-amber-100 font-bold text-xs md:text-sm mb-3">
          <span>نظام تسجيل التأخر الصباحي</span>
          <span>⏰</span>
        </div>

        {/* Date Pill / Badge (Centered pill matching screenshot) */}
        <div className="inline-flex items-center gap-2 bg-black/25 hover:bg-black/35 backdrop-blur-md text-white font-bold px-3.5 sm:px-4 py-1.5 rounded-full text-xs md:text-sm border border-white/15 shadow-inner transition-all">
          <button
            type="button"
            onClick={() => handleDateShift(1)}
            className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer text-amber-200"
            title="اليوم التالي"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1.5 cursor-pointer relative px-1">
            <span className="text-sm">🗓️</span>
            <span className="font-extrabold text-amber-50">{formattedArabicDate || "اليوم"}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="تغيير التاريخ"
            />
          </div>

          <button
            type="button"
            onClick={() => handleDateShift(-1)}
            className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer text-amber-200"
            title="اليوم السابق"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(getTodayDateString())}
              className="mr-1 px-2 py-0.5 bg-amber-400 text-amber-950 text-[10px] font-black rounded-full hover:bg-amber-300 transition cursor-pointer"
            >
              اليوم
            </button>
          )}
        </div>
      </div>

      {/* 2. REGISTRATION CONTROLS & SETTINGS CARD */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 md:p-6 space-y-4">
        {/* CLASS-BASED REGISTRATION */}
        <div className="space-y-4">
            {/* Grade & Class selectors (Pills Style matching Teacher Portal and Screenshot) */}
            <div className="space-y-3 bg-slate-50/80 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800">الصف والفصل</label>
                <span className="text-[11px] text-slate-500 font-bold">
                  عدد طلاب الفصل: <strong className="text-indigo-700 font-black">{classStudents.length}</strong> طالب
                </span>
              </div>

              {/* Grade Select Row */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap scrollbar-none">
                {sortedGrades.map((g, idx) => {
                  const isSelected = selectedGradeId === g.id;
                  const gradeShortName = g.name.replace(/^الصف\s+/, "").replace(/^صف\s+/, "");
                  return (
                    <button
                      key={`${g.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedGradeId(g.id);
                        const gradeClasses = classes.filter(c => c.gradeId === g.id);
                        if (gradeClasses.length > 0 && !gradeClasses.some(c => c.id === selectedClassId)) {
                          setSelectedClassId(gradeClasses[0].id);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black border transition-all cursor-pointer shadow-3xs hover:shadow-md hover:scale-[1.02] active:scale-95 ${
                        isSelected
                          ? "bg-[#5046e5] text-white border-[#5046e5] shadow-sm shadow-indigo-500/20"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>🏫</span>
                      <span>{gradeShortName}</span>
                    </button>
                  );
                })}
                {grades.length === 0 && (
                  <p className="text-xs text-slate-400 font-bold py-1">لا توجد صفوف دراسية</p>
                )}
              </div>

              {/* Class Select Row (Separate Line, Pills) */}
              {selectedGradeId && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap scrollbar-none pt-1">
                  {filteredClasses.map((c, idx) => {
                    const isSelected = selectedClassId === c.id;
                    const classNum = c.name.replace(/^الفصل\s*/, "").replace(/^فصل\s*/, "").trim();
                    return (
                      <button
                        key={`${c.id}-${idx}`}
                        type="button"
                        onClick={() => setSelectedClassId(c.id)}
                        className={`flex items-center justify-center min-w-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black border transition-all duration-150 cursor-pointer shadow-3xs hover:shadow-md hover:scale-[1.03] active:scale-95 ${
                          isSelected
                            ? "bg-[#5046e5] text-white border-[#5046e5] shadow-sm shadow-indigo-500/20"
                            : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50/70"
                        }`}
                      >
                        <span>{classNum || c.name}</span>
                      </button>
                    );
                  })}
                  {filteredClasses.length === 0 && (
                    <p className="text-xs text-slate-400 font-bold py-1">لا توجد فصول تابعة لهذا الصف</p>
                  )}
                </div>
              )}
            </div>

            {/* Students Display Area */}
            {classStudents.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold">
                لا يوجد طلاب مسجلين في هذا الفصل حالياً
              </div>
            ) : (
              <div className="space-y-0 rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
                {/* List Sub-Header matching Teacher Attendance List */}
                <div className="bg-slate-50/80 border-b border-slate-200/90 px-4 py-3 flex flex-wrap gap-3 justify-between items-center text-right">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800">قائمة طلاب الفصل ({classStudents.length})</span>
                      {classStudents.filter(st => records.some(r => r.studentId === st.id)).length > 0 && (
                        <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-3xs">
                          {classStudents.filter(st => records.some(r => r.studentId === st.id)).length} متأخر اليوم
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">اضغط على اسم الطالب للرصد المباشر للتأخر الصباحي</span>
                  </div>

                  {/* View Mode Switcher (List vs Grid) */}
                  <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200 shadow-3xs">
                    <button
                      type="button"
                      onClick={() => setClassViewMode("list")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                        classViewMode === "list"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="عرض كقائمة (مثل تسجيل الغياب)"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>قائمة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassViewMode("grid")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                        classViewMode === "grid"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                      title="عرض كشبكة"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>شبكة</span>
                    </button>
                  </div>
                </div>

                {/* 1. LIST VIEW (Default - Like Attendance Portal) */}
                {classViewMode === "list" ? (
                  <div className="divide-y divide-slate-100 bg-white">
                    {classStudents.map((st, idx) => {
                      const isRecorded = records.some(r => r.studentId === st.id);
                      const isSaving = savingStudentId === st.id;
                      const rec = records.find(r => r.studentId === st.id);

                      return (
                        <div
                          key={st.id}
                          onClick={() => !isSaving && handleRecordStudent(st)}
                          className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition select-none ${
                            isRecorded
                              ? "bg-amber-50/70 hover:bg-amber-100/70"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-black w-7 h-7 flex items-center justify-center rounded-full transition-all ${
                              isRecorded
                                ? "bg-amber-500 text-white shadow-3xs"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <span className="text-sm font-bold text-slate-800">
                                {st.name}
                              </span>
                              {isRecorded && (
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mt-0.5">
                                  <span>السبب: <strong className="text-amber-800 font-black">{rec?.reason || "تأخر"}</strong></span>
                                  {rec?.recordedBy && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span>المشرف: {rec.recordedBy}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSaving ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-xl animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>جاري الرصد...</span>
                              </span>
                            ) : isRecorded ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1.5 rounded-xl shadow-2xs">
                                  <span>متأخر</span>
                                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-md font-black">
                                    {rec?.arrivalTime || "07:30"}
                                  </span>
                                  <span>⏳</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentRec = rec || records.find(r => r.studentId === st.id);
                                    if (currentRec) {
                                      handleDeleteRecord(currentRec.id, st.name, currentRec.studentId || st.id, currentRec.date || selectedDate);
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-xl transition cursor-pointer"
                                  title="إلغاء تسجيل التأخر"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 px-3 py-1.5 rounded-xl transition">
                                <span>+ تسجيل التأخر</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 2. GRID VIEW */
                  <div className="p-3 bg-white grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {classStudents.map((st) => {
                      const isRecorded = records.some(r => r.studentId === st.id);
                      const isSaving = savingStudentId === st.id;
                      const rec = records.find(r => r.studentId === st.id);

                      return (
                        <div
                          key={st.id}
                          onClick={() => !isSaving && handleRecordStudent(st)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 select-none relative group ${
                            isRecorded
                              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/30 shadow-3xs"
                              : "bg-slate-50/70 border-slate-200/90 hover:bg-white hover:border-amber-400 hover:shadow-xs hover:scale-[1.01]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                isRecorded ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-700"
                              }`}>
                                {st.name.charAt(0)}
                              </div>
                              <p className="text-xs font-black text-slate-800 truncate">{st.name}</p>
                            </div>

                            {isSaving ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                            ) : isRecorded ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-3xs">
                                  <Clock className="w-3 h-3" /> {rec?.arrivalTime || "متأخر"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentRec = rec || records.find(r => r.studentId === st.id);
                                    if (currentRec) {
                                      handleDeleteRecord(currentRec.id, st.name, currentRec.studentId || st.id, currentRec.date || selectedDate);
                                    }
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                  title="حذف تسجيل التأخر"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-200/60">
                            <span className="truncate">{isRecorded ? `السبب: ${rec?.reason || "تأخر"}` : "اضغط للرصد المباشر 👈"}</span>
                            <span className={`font-black shrink-0 ${isRecorded ? "text-amber-700" : "text-amber-600"}`}>
                              {isRecorded ? "مسجل متأخراً" : "+ رصد الآن"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
      </div>

      {/* 4. TODAY'S REGISTERED DELAY LOG (سجل التأخر الصباحي لليوم) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 md:p-6 space-y-4">
        
        {/* Table Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600 border border-blue-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <span>سجل المتأخرين لليوم</span>
                <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-full border border-amber-200">
                  {filteredRecords.length} طالب
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-semibold">قائمة الطلاب الذين تم رصد تأخرهم بتاريخ {selectedDate}</p>
            </div>
          </div>

          {/* Action Buttons: Copy WhatsApp Summary + Print */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 transition cursor-pointer shadow-3xs"
              title="نسخ تقرير جاهز للواتساب لمشاركته مع الإدارة"
            >
              {copiedSummary ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 animate-bounce" />
                  <span>تم نسخ التقرير!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-emerald-600" />
                  <span>مشاركة التقرير (واتساب)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              title="طباعة كشف التأخر الصباحي"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>طباعة</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {/* Search in table */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="تصفية بالاسم أو السبب..."
              className="w-full text-xs font-bold pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none"
            />
          </div>

          {/* Grade filter */}
          <select
            value={tableFilterGrade}
            onChange={(e) => setTableFilterGrade(e.target.value)}
            className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none cursor-pointer"
          >
            <option value="all">كل الصفوف الدراسية</option>
            {grades.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          {/* Reason filter */}
          <select
            value={tableFilterReason}
            onChange={(e) => setTableFilterReason(e.target.value)}
            className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none cursor-pointer"
          >
            <option value="all">كل الأسباب</option>
            {COMMON_REASONS.map(r => (
              <option key={r.id} value={r.label}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Delay Table */}
        {loading ? (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-400">جاري تحميل سجلات التأخر الصباحي...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-12 bg-slate-50/80 border border-dashed border-slate-200 rounded-2xl space-y-2">
            <Clock className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-xs font-black text-slate-600">لا يوجد متأخرين مسجلين في هذا التاريخ حتى الآن</p>
            <p className="text-[11px] font-medium text-slate-400">استخدم نموذج البحث أو اختيار الفصل أعلاه لرصد الطلاب المتأخرين</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/90 shadow-3xs">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">اسم الطالب</th>
                  <th className="p-3">الصف والفصل</th>
                  <th className="p-3">وقت الوصول</th>
                  <th className="p-3">سبب التأخر</th>
                  <th className="p-3">المشرف الراصد</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {filteredRecords.map((rec, index) => {
                  const isExcused = rec.reason.includes("عذر مقبول") || rec.reason.includes("معتمد") || rec.reason.includes("طبي");
                  return (
                    <tr key={rec.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3 font-black text-slate-400">{index + 1}</td>
                      <td className="p-3 font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-black">
                            {(rec.studentName || "ط").charAt(0)}
                          </div>
                          <span>{rec.studentName}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold">{rec.gradeName}</span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold">{rec.className}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 font-black px-2 py-1 rounded-lg text-xs">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>{rec.arrivalTime}</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
                          isExcused
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {isExcused ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span>{rec.reason}</span>
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-500 font-medium">
                        {rec.recordedBy || "مشرف التأخر"}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id, rec.studentName, rec.studentId, rec.date)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="حذف هذا السجل"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal for Deleting Delays */}
      {confirmDeleteState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-in zoom-in-95 duration-150" dir="rtl">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-rose-200">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-black text-slate-800">إلغاء وحذف تسجيل التأخر</h4>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                هل أنت متأكد من رغبتك في حذف تسجيل تأخر الطالب{" "}
                <span className="text-rose-700 font-black">"{confirmDeleteState.studentName}"</span>؟
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={executeConfirmDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer shadow-sm shadow-rose-600/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد الحذف</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteState(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
