import React, { useState, useEffect } from "react";
import { 
  getGrades, 
  getClasses, 
  getTeachers, 
  getStudents, 
  seedDatabaseIfEmpty 
} from "./dbService";
import { Grade, Class, Teacher, Student } from "./types";
import TeacherPortal from "./components/TeacherPortal";
import AdminPanel from "./components/AdminPanel";
import { 
  ClipboardCheck, 
  AlertTriangle, 
  BarChart3, 
  GraduationCap, 
  Briefcase, 
  Users, 
  Menu, 
  X, 
  Loader2, 
  Calendar, 
  Clock, 
  ShieldCheck,
  Pin,
  PinOff,
  ChevronRight,
  ChevronLeft
} from "lucide-react";

function getInitialMode(): "teacher" | "admin" {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  
  if (path.includes("/admin") || hash.includes("admin") || search.includes("page=admin") || search.includes("admin")) {
    return "admin";
  }
  return "teacher";
}

export default function App() {
  // Database States
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);

  // Responsive Navigation States
  const [appMode, setAppMode] = useState<"teacher" | "admin">(getInitialMode());
  const [teacherTab, setTeacherTab] = useState<"attendance" | "behavior">("attendance");
  const [adminTab, setAdminTab] = useState<"stats" | "grades" | "teachers" | "students">("stats");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Desktop sidebar control states (hide/show & pin/unpin)
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_pinned");
    return saved !== "false";
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_open");
    return saved !== "false";
  });

  // Persist sidebar preferences to local storage
  useEffect(() => {
    localStorage.setItem("sidebar_pinned", String(isSidebarPinned));
  }, [isSidebarPinned]);

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(isSidebarOpen));
  }, [isSidebarOpen]);

  // Time formatting for header
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load all database entities in parallel to optimize speed and responsiveness
  const loadDatabaseData = async () => {
    try {
      const [g, c, t, s] = await Promise.all([
        getGrades(),
        getClasses(),
        getTeachers(),
        getStudents()
      ]);

      // Sort grades: oldest first (ascending by createdAt) so newly added grades appear after existing ones
      const sortedGrades = [...g].sort((a, b) => {
        const timeA = (a as any).createdAt || 0;
        const timeB = (b as any).createdAt || 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, "ar");
      });

      // Sort classes: ascending by the number attached to the class name
      const getNumberFromName = (name: string): number => {
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 999999;
      };

      const sortedClasses = [...c].sort((a, b) => {
        const numA = getNumberFromName(a.name);
        const numB = getNumberFromName(b.name);
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, "ar");
      });

      const sortedTeachers = [...t].sort((a, b) => a.name.localeCompare(b.name, "ar"));

      setGrades(sortedGrades);
      setClasses(sortedClasses);
      setTeachers(sortedTeachers);
      setStudents(s);
    } catch (error) {
      console.error("Error loading data from Firestore:", error);
    }
  };

  // On App Mount
  useEffect(() => {
    async function initializeApp() {
      setLoading(true);
      try {
        setSeeding(true);
        const seeded = await seedDatabaseIfEmpty();
        setSeeding(false);
        await loadDatabaseData();
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setLoading(false);
      }
    }
    initializeApp();
  }, []);

  const handleRefreshData = async () => {
    await loadDatabaseData();
  };

  // Synchronize app mode with URL routing
  useEffect(() => {
    const handleUrlChange = () => {
      setAppMode(getInitialMode());
    };
    
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const navigateTo = (mode: "teacher" | "admin") => {
    const newPath = mode === "admin" ? "/admin" : "/";
    const newSearch = mode === "admin" ? "?page=admin" : "?page=teacher";
    const newHash = mode === "admin" ? "#/admin" : "#/";
    
    // Push state to browser history
    window.history.pushState({ mode }, "", `${newPath}${newSearch}${newHash}`);
    setAppMode(mode);
  };

  if (loading || seeding) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100" dir="rtl">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <h3 className="text-lg font-bold">بوابة أم الحمام الثانوية الرقمية</h3>
        <p className="text-xs text-slate-400 mt-2">
          {seeding ? "جاري تهيئة قاعدة البيانات وبناء هيكل الفصول الافتراضية والطلاب للتشغيل الأول..." : "جاري تحميل سجلات المدرسة والبيانات الحية..."}
        </p>
      </div>
    );
  }

  // Sidebar Menu Items Definition
  const menuGroups = [
    {
      title: "بوابة المعلم ورصد الحصص",
      icon: <ClipboardCheck className="w-4 h-4 text-blue-400" />,
      items: [
        {
          id: "attendance",
          label: "رصد الحضور والغياب",
          icon: <Calendar className="w-4 h-4" />,
          mode: "teacher" as const,
          tab: "attendance" as const
        },
        {
          id: "behavior",
          label: "الرصد السلوكي للطلاب",
          icon: <AlertTriangle className="w-4 h-4" />,
          mode: "teacher" as const,
          tab: "behavior" as const
        }
      ]
    },
    {
      title: "لوحة التحكم والإشراف",
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      items: [
        {
          id: "stats",
          label: "الإحصائيات والتقارير",
          icon: <BarChart3 className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "stats" as const
        },
        {
          id: "students",
          label: "إدارة الطلاب والفصول",
          icon: <Users className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "students" as const
        },
        {
          id: "teachers",
          label: "إدارة المعلمين",
          icon: <Briefcase className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "teachers" as const
        }
      ]
    }
  ];

  const handleMenuItemClick = (mode: "teacher" | "admin", tab: any) => {
    setAppMode(mode);
    if (mode === "teacher") {
      setTeacherTab(tab);
    } else {
      setAdminTab(tab);
    }
    setIsMobileMenuOpen(false); // Close mobile drawer if open
  };

  // Helper to check if a menu item is currently active
  const isItemActive = (mode: "teacher" | "admin", tab: any) => {
    if (appMode !== mode) return false;
    return mode === "teacher" ? teacherTab === tab : adminTab === tab;
  };

  // Reusable Sidebar Content JSX
  const renderSidebarContent = () => (
    <div className="flex flex-col h-full justify-between p-5">
      <div className="space-y-6">
        {/* School Logo Shield */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-700 p-2.5 rounded-xl text-white font-extrabold text-lg shadow-md shadow-blue-900/30">
              🏫
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-wide">بوابة أم الحمام الرقمية</h1>
              <p className="text-3xs text-slate-400 font-bold mt-0.5">مدرسة أم الحمام الثانوية</p>
            </div>
          </div>

          {/* Controls for Desktop pinning/hiding */}
          <div className="hidden lg:flex items-center gap-1.5">
            {/* Pin Toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarPinned(!isSidebarPinned)}
              title={isSidebarPinned ? "إلغاء التثبيت (جعل القائمة عائمة)" : "تثبيت القائمة جانباً"}
              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                isSidebarPinned 
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"
              }`}
            >
              {isSidebarPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              title="إخفاء القائمة"
              className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl transition-all border border-transparent cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Groups & Items */}
        <div className="space-y-5">
          {menuGroups
            .filter((group) => {
              if (appMode === "teacher") {
                return group.items.some(item => item.mode === "teacher");
              } else {
                return group.items.some(item => item.mode === "admin");
              }
            })
            .map((group, gIdx) => (
              <div key={gIdx} className="space-y-2">
                <div className="flex items-center gap-1.5 text-3xs font-extrabold text-slate-500 uppercase tracking-widest px-2.5">
                  {group.icon}
                  <span>{group.title}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isItemActive(item.mode, item.tab);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleMenuItemClick(item.mode, item.tab)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition-all duration-200 ${
                          active
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={active ? "text-white" : "text-slate-400"}>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        
                        {active && (
                          <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Sidebar Footer Info */}
      <div className="border-t border-slate-800 pt-4 mt-auto space-y-3">
        {appMode === "teacher" ? (
          <button
            onClick={() => navigateTo("admin")}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-white rounded-xl text-3xs font-black transition-all cursor-pointer"
          >
            <span>🛡️ الانتقال للوحة التحكم (Admin)</span>
          </button>
        ) : (
          <button
            onClick={() => navigateTo("teacher")}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-white rounded-xl text-3xs font-black transition-all cursor-pointer"
          >
            <span>👤 الانتقال لبوابة المعلمين (Teacher)</span>
          </button>
        )}
        <div className="text-center space-y-1">
          <p className="text-3xs text-slate-500 font-extrabold">البرمجة والتصميم: أ/ ماجد الناصر</p>
          <p className="text-3xs text-slate-600 font-bold">بوابة أم الحمام الرقمية © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans text-slate-800" dir="rtl">
      
      {/* 1. PERSISTENT / FLOATING RIGHT SIDEBAR FOR DESKTOP */}
      {appMode !== "teacher" && (
        <aside 
          className={`hidden lg:block bg-slate-900 text-slate-100 h-screen sticky top-0 flex-shrink-0 border-l border-slate-800 z-40 shadow-xl transition-all duration-300 ${
            isSidebarOpen 
              ? isSidebarPinned 
                ? "w-72" 
                : "fixed right-0 top-0 h-screen w-72 shadow-2xl z-45"
              : "w-0 overflow-hidden border-l-0"
          }`}
        >
          {isSidebarOpen && renderSidebarContent()}
        </aside>
      )}

      {/* Backdrop for unpinned desktop sidebar */}
      {appMode !== "teacher" && isSidebarOpen && !isSidebarPinned && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="hidden lg:block fixed inset-0 bg-black/40 backdrop-blur-3xs z-35 transition-opacity duration-300 cursor-pointer"
        />
      )}

      {/* Floating Tab on the right edge when desktop sidebar is closed */}
      {appMode !== "teacher" && !isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          title="إظهار القائمة الجانبية"
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 bg-slate-900 hover:bg-slate-800 text-white p-2.5 rounded-l-xl border-y border-l border-slate-800 shadow-2xl z-35 items-center justify-center cursor-pointer transition-all hover:pl-3.5 group"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-blue-400 group-hover:text-white transition-transform duration-200" />
        </button>
      )}

      {/* 2. RESPONSIVE SLIDING MOBILE DRAWER */}
      {appMode !== "teacher" && isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
          />
          {/* Menu Panel */}
          <div className="lg:hidden fixed right-0 top-0 bottom-0 w-72 bg-slate-900 text-slate-100 z-50 flex flex-col shadow-2xl animate-slideLeft">
            <div className="flex justify-end p-3 border-b border-slate-800">
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderSidebarContent()}
            </div>
          </div>
        </>
      )}

      {/* 3. MAIN APP SECTION */}
      <div className="flex-1 min-h-screen flex flex-col bg-slate-50 overflow-x-hidden">
        
        {/* Unified Portal Header (Desktop & Mobile Responsive) */}
        {appMode !== "teacher" && (
          <header className="bg-white border-b border-slate-200/80 shadow-3xs sticky top-0 z-20 px-4 py-3 md:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              {/* Hamburger (Mobile Only) & Portal Info */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 transition"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {/* Desktop Toggle Sidebar Button (shown only when sidebar is closed) */}
                {!isSidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    title="إظهار القائمة الجانبية"
                    className="hidden lg:flex p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 transition items-center gap-1 text-2xs font-black shadow-3xs cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-blue-600" />
                    <span>إظهار القائمة</span>
                  </button>
                )}
                
                <div>
                  <h2 className="text-xs font-black text-slate-400">
                    {appMode === "admin" ? "لوحة الإدارة والتحكم 🛡️" : "بوابة الكادر التعليمي والتحضير 👤"}
                  </h2>
                  <h1 className="text-sm md:text-base font-black text-slate-800 flex items-center gap-1.5">
                    <span>بوابة أم الحمام الرقمية</span>
                    <span className={`hidden sm:inline px-2.5 py-0.5 rounded-full text-3xs font-extrabold border ${
                      appMode === "admin" 
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                        : "bg-blue-50 text-blue-600 border-blue-100"
                    }`}>
                      {appMode === "admin" ? "قسم الإشراف العام" : "قسم المعلمين والمعلمات"}
                    </span>
                  </h1>
                </div>
              </div>

              {/* Live indicators / Date info */}
              <div className="flex items-center gap-4 text-slate-500 text-2xs font-extrabold">
                <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>{new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}</span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{currentTime || "--:--"}</span>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Dynamic Inner Portal Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6">
          {appMode === "teacher" ? (
            <TeacherPortal 
              grades={grades} 
              classes={classes} 
              teachers={teachers} 
              onRefreshStats={handleRefreshData}
              activeTab={teacherTab}
              setActiveTab={setTeacherTab}
              navigateTo={navigateTo}
            />
          ) : (
            <AdminPanel 
              grades={grades} 
              classes={classes} 
              teachers={teachers} 
              students={students} 
              setGrades={setGrades}
              setClasses={setClasses}
              setTeachers={setTeachers}
              setStudents={setStudents}
              onRefreshData={handleRefreshData}
              activeSubTab={adminTab}
              setActiveSubTab={setAdminTab}
            />
          )}
        </main>

        {/* Styled Footer (Shown only on mobile view since desktop has sidebar credits) */}
        <footer className="lg:hidden bg-white border-t border-slate-100 py-4 text-center text-slate-400 text-3xs space-y-1">
          <p className="font-extrabold text-slate-500">البرمجة والتصميم: أ/ ماجد الناصر</p>
          <p className="font-semibold text-slate-400">مدرسة أم الحمام الثانوية</p>
        </footer>
      </div>
    </div>
  );
}
