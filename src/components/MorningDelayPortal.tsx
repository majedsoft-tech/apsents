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
  FileSpreadsheet
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
  setGlobalProgress
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

  // Mode Selection: "search" (Instant Student Lookup) vs "class" (Grid by Class)
  const [entryMode, setEntryMode] = useState<"search" | "class">("search");

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

  // Set default grade and class when grades load
  useEffect(() => {
    if (grades.length > 0 && !selectedGradeId) {
      setSelectedGradeId(grades[0].id);
    }
  }, [grades, selectedGradeId]);

  // Filtered classes based on selected grade
  const filteredClasses = useMemo(() => {
    if (!selectedGradeId) return [];
    return classes.filter(c => c.gradeId === selectedGradeId);
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
    return students.filter(s => s.gradeId === selectedGradeId && s.classId === selectedClassId);
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

  // Quick record handler for a student
  const handleRecordStudent = async (student: Student, overrideReason?: string) => {
    setSavingStudentId(student.id);
    const gr = grades.find(g => g.id === student.gradeId);
    const cl = classes.find(c => c.id === student.classId);
    const finalReason = overrideReason || (selectedReason === "أخرى" ? (customReason || "أخرى") : selectedReason);

    try {
      const recordPayload = {
        studentId: student.id,
        studentName: student.name,
        gradeId: student.gradeId,
        gradeName: gr?.name || "",
        classId: student.classId,
        className: cl?.name || "",
        date: selectedDate,
        arrivalTime: arrivalTime || getCurrentTimeString(),
        delayMinutes: Number(delayMinutes) || 15,
        reason: finalReason,
        recordedBy: recorderName.trim() || "مشرف التأخر الصباحي",
        notes: notes.trim()
      };

      await saveMorningDelayRecord(recordPayload);
      
      setSaveToast(`تم تسجيل تأخر الطالب (${student.name}) بنجاح`);
      setTimeout(() => setSaveToast(null), 3000);
      
      // Clear quick notes if any
      setNotes("");
    } catch (err) {
      console.error("Error saving morning delay:", err);
      alert("حدث خطأ أثناء حفظ سجل التأخر الصباحي");
    } finally {
      setSavingStudentId(null);
    }
  };

  // Delete Record Handler
  const handleDeleteRecord = async (recordId: string, studentName?: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف تسجيل تأخر الطالب ${studentName ? `"${studentName}"` : ""}؟`)) {
      return;
    }
    try {
      if (setGlobalProgress) {
        setGlobalProgress({ active: true, type: "delete", label: "جاري حذف السجل..." });
      }
      await deleteMorningDelayRecord(recordId);
      setSaveToast("تم حذف السجل بنجاح");
      setTimeout(() => setSaveToast(null), 2500);
    } catch (err) {
      console.error("Error deleting morning delay:", err);
      alert("حدث خطأ أثناء حذف السجل");
    } finally {
      if (setGlobalProgress) {
        setGlobalProgress({ active: false, type: null, label: "" });
      }
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

      {/* 1. PORTAL HERO HEADER */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-3xl p-5 md:p-7 text-white shadow-xl shadow-amber-950/15 relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-2xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-400/20 rounded-full -ml-16 -mb-16 blur-xl pointer-events-none"></div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-100 text-xs font-extrabold border border-white/20">
              <SunMedium className="w-3.5 h-3.5 text-amber-200 animate-spin" />
              <span>{schoolName ? `بوابة ${schoolName}` : "بوابة الرصد الميداني"}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <Clock className="w-7 h-7 text-amber-200" />
              <span>بوابة تسجيل التأخر الصباحي</span>
            </h1>
            <p className="text-xs text-amber-100/90 font-medium">
              توثيق حضور الطلاب المتأخرين عن الطابور الصباحي والحصة الأولى في ثوانٍ معدودة
            </p>
          </div>

          {/* Quick Date Control & Nav Button */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {navigateTo && !isDirectLink && (
              <button
                type="button"
                onClick={() => navigateTo("admin")}
                className="px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs rounded-xl border border-white/25 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <ArrowRight className="w-4 h-4" />
                <span>لوحة التحكم</span>
              </button>
            )}

            {/* Date Picker Bar */}
            <div className="flex items-center bg-white/20 backdrop-blur-md border border-white/25 rounded-2xl p-1 text-white shadow-inner">
              <button
                type="button"
                onClick={() => handleDateShift(1)}
                className="p-1.5 hover:bg-white/20 rounded-xl transition cursor-pointer"
                title="اليوم التالي"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="px-2.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-200" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer text-center"
                />
              </div>

              <button
                type="button"
                onClick={() => handleDateShift(-1)}
                className="p-1.5 hover:bg-white/20 rounded-xl transition cursor-pointer"
                title="اليوم السابق"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {!isToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(getTodayDateString())}
                  className="mr-1 px-2 py-1 bg-amber-400 text-amber-950 text-[10px] font-black rounded-lg hover:bg-amber-300 transition cursor-pointer"
                >
                  اليوم
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Real-time counters summary row */}
        <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-3 gap-2.5 max-w-xl">
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-2.5 text-center border border-white/10">
            <span className="text-[10px] font-bold text-amber-100 block">إجمالي المتأخرين اليوم</span>
            <span className="text-xl font-black text-white">{stats.total}</span>
          </div>
          <div className="bg-emerald-500/25 backdrop-blur-md rounded-2xl p-2.5 text-center border border-emerald-400/20">
            <span className="text-[10px] font-bold text-emerald-100 block">تأخر بعذر</span>
            <span className="text-xl font-black text-emerald-200">{stats.excused}</span>
          </div>
          <div className="bg-rose-500/25 backdrop-blur-md rounded-2xl p-2.5 text-center border border-rose-400/20">
            <span className="text-[10px] font-bold text-rose-100 block">بدون عذر</span>
            <span className="text-xl font-black text-rose-200">{stats.unexcused}</span>
          </div>
        </div>
      </div>

      {/* 2. REGISTRATION CONTROLS & SETTINGS CARD */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-4 md:p-6 space-y-5">
        
        {/* Section title & Entry Mode Toggles */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600 border border-amber-200">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">إعدادات التسجيل والرصد الميداني</h2>
              <p className="text-[11px] text-slate-400 font-semibold">اضبط وقت الحضور والسبب والمشرف ثم اختر الطالب للرصد الفوري</p>
            </div>
          </div>

          {/* Mode Switcher Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setEntryMode("search")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                entryMode === "search"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>البحث السريع الشامل</span>
            </button>

            <button
              type="button"
              onClick={() => setEntryMode("class")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                entryMode === "class"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>الرصد حسب الفصل</span>
            </button>
          </div>
        </div>

        {/* Configuration Row: Supervisor Name + Arrival Time + Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          
          {/* 1. Recorder Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-700 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-amber-600" />
              <span>اسم المشرف / المناوب الصباحي:</span>
            </label>
            <input
              type="text"
              value={recorderName}
              onChange={(e) => setRecorderName(e.target.value)}
              placeholder="مثال: أ. محمد العتيبي"
              className="w-full text-xs font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
            />
          </div>

          {/* 2. Arrival Time & Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>وقت الحضور:</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-28 text-xs font-black px-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none text-center"
              />
              {/* Quick Preset buttons */}
              <div className="flex items-center gap-1 flex-1 overflow-x-auto pb-0.5 scrollbar-none">
                {TIME_PRESETS.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setArrivalTime(t)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer shrink-0 ${
                      arrivalTime === t
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Reason for Tardiness */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-700 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>سبب التأخر:</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition cursor-pointer"
            >
              {COMMON_REASONS.map(r => (
                <option key={r.id} value={r.label}>{r.label}</option>
              ))}
              <option value="أخرى">سبب مخصص آخر...</option>
            </select>
          </div>
        </div>

        {/* If Custom reason selected */}
        {selectedReason === "أخرى" && (
          <div className="pt-1">
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="اكتب سبب التأخر المخصص هنا..."
              className="w-full text-xs font-bold px-3.5 py-2 bg-amber-50/50 border border-amber-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none"
            />
          </div>
        )}

        {/* 3. INTERACTIVE REGISTRATION AREA */}
        
        {/* MODE A: INSTANT STUDENT LOOKUP / SEARCH */}
        {entryMode === "search" && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3" />
              <input
                type="text"
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                placeholder="🔍 ابحث عن اسم الطالب للرصد المباشر (مثال: عبدالله، خالد، فهد)..."
                className="w-full text-sm font-black pr-11 pl-4 py-3 bg-slate-50 border-2 border-amber-200 focus:border-amber-500 focus:bg-white rounded-2xl outline-none shadow-inner transition placeholder:text-slate-400"
                autoFocus
              />
              {studentSearchQuery && (
                <button
                  type="button"
                  onClick={() => setStudentSearchQuery("")}
                  className="absolute left-3 top-3 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-0.5 rounded-lg font-bold cursor-pointer"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Results Dropdown / Grid */}
            {studentSearchQuery.trim() && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold">
                    لم يتم العثور على طالب مطابق للاسم &quot;{studentSearchQuery}&quot;
                  </div>
                ) : (
                  searchResults.map((s) => {
                    const isSaving = savingStudentId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                          s.isRecorded
                            ? "bg-amber-50/70 border-amber-300 shadow-3xs"
                            : "bg-white border-slate-200 hover:border-amber-400 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${
                            s.isRecorded ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"
                          }`}>
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800">{s.name}</h4>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-0.5">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-700 border border-slate-200">{s.gradeName}</span>
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-700 border border-slate-200">{s.className}</span>
                              {s.isRecorded && (
                                <span className="bg-amber-500 text-white px-2 py-0.5 rounded-md font-black">
                                  مسجل متأخراً اليوم ⏰
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRecordStudent(s)}
                          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                            s.isRecorded
                              ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                              : "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          <span>{s.isRecorded ? "تحديث التأخر" : "تسجيل تأخر الطالب"}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* MODE B: CLASS-BASED QUICK GRID */}
        {entryMode === "class" && (
          <div className="pt-3 border-t border-slate-100 space-y-4">
            {/* Grade & Class selectors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-600">الصف:</span>
                <select
                  value={selectedGradeId}
                  onChange={(e) => setSelectedGradeId(e.target.value)}
                  className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none cursor-pointer"
                >
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-600">الفصل:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none cursor-pointer"
                >
                  {filteredClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500 font-bold mr-auto">
                عدد طلاب الفصل: <strong className="text-slate-800">{classStudents.length}</strong>
              </div>
            </div>

            {/* Students Grid */}
            {classStudents.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold">
                لا يوجد طلاب مسجلين في هذا الفصل حالياً
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {classStudents.map((st) => {
                  const isRecorded = records.some(r => r.studentId === st.id);
                  const isSaving = savingStudentId === st.id;
                  const rec = records.find(r => r.studentId === st.id);

                  return (
                    <div
                      key={st.id}
                      onClick={() => !isSaving && handleRecordStudent(st)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 select-none ${
                        isRecorded
                          ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/30 shadow-3xs"
                          : "bg-slate-50/70 border-slate-200/90 hover:bg-white hover:border-amber-400 hover:shadow-xs"
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
                          <span className="bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {rec?.arrivalTime || "متأخر"}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-200/60">
                        <span>{isRecorded ? `السبب: ${rec?.reason || "تأخر"}` : "اضغط للرصد 👈"}</span>
                        <span className={`font-black ${isRecorded ? "text-amber-700" : "text-slate-500"}`}>
                          {isRecorded ? "تم الرصد" : "+ رصد"}
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
                          onClick={() => handleDeleteRecord(rec.id, rec.studentName)}
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

    </div>
  );
}
