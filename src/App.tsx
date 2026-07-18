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
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
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
  ChevronLeft,
  Copy,
  Check,
  ExternalLink,
  LogOut
} from "lucide-react";

function getInitialMode(): "teacher" | "admin" | "stats-only" {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  
  if (path.includes("stats-only") || hash.includes("stats-only") || search.includes("stats-only") || search.includes("page=stats-only")) {
    return "stats-only";
  }
  if (path.includes("/teacher") || hash.includes("teacher") || search.includes("page=teacher") || search.includes("teacher")) {
    return "teacher";
  }
  return "admin"; // Default homepage is now the Admin Dashboard (لوحة التحكم)
}

export default function App() {
  // Authentication States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Database States
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Responsive Navigation States
  const [appMode, setAppMode] = useState<"teacher" | "admin" | "stats-only">(getInitialMode());
  const [isDirectTeacherLink, setIsDirectTeacherLink] = useState<boolean>(() => {
    return getInitialMode() === "teacher";
  });

  // If the user navigates to admin or other sections, reset direct link status
  useEffect(() => {
    if (appMode !== "teacher") {
      setIsDirectTeacherLink(false);
    }
  }, [appMode]);

  const [copied, setCopied] = useState<boolean>(false);
  const [teacherCopied, setTeacherCopied] = useState<boolean>(false);
  const [teacherTab, setTeacherTab] = useState<"attendance" | "behavior">("attendance");
  const [adminTab, setAdminTab] = useState<"stats" | "grades" | "teachers" | "students">("stats");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [todayCounts, setTodayCounts] = useState<{ absentCount: number; behaviorCount: number }>({ absentCount: 0, behaviorCount: 0 });

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

  // Listen to Firebase Auth state change and load user-specific data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthChecking(false);
      if (user) {
        setLoading(true);
        try {
          // Direct dynamic load of user-specific data with no default/fallback automatic seeding
          await loadDatabaseData();
        } catch (error) {
          console.error("Initialization error:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setGrades([]);
        setClasses([]);
        setTeachers([]);
        setStudents([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRefreshData = async () => {
    await loadDatabaseData();
  };

  const handleCopyStatsLink = () => {
    const statsLink = `${window.location.origin}${window.location.pathname}?page=stats-only`;
    navigator.clipboard.writeText(statsLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy link: ", err);
    });
  };

  const handleCopyTeacherLink = () => {
    const teacherLink = `${window.location.origin}${window.location.pathname}?page=teacher`;
    navigator.clipboard.writeText(teacherLink).then(() => {
      setTeacherCopied(true);
      setTimeout(() => setTeacherCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy link: ", err);
    });
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

  // Update browser tab title and dynamic favicon icon based on active mode/tab
  useEffect(() => {
    let title = "بوابة أم الحمام الثانوية الرقمية";
    let emoji = "🏫";
    
    if (appMode === "stats-only") {
      title = "الإحصائيات العامة | بوابة أم الحمام";
      emoji = "📊";
    } else if (appMode === "teacher") {
      if (teacherTab === "attendance") {
        title = "رصد الحضور والغياب | بوابة تسجيل الغياب";
        emoji = "📋";
      } else if (teacherTab === "behavior") {
        title = "الرصد السلوكي للطلاب | بوابة تسجيل الغياب";
        emoji = "⚠️";
      }
    } else if (appMode === "admin") {
      if (adminTab === "stats") {
        title = "الإحصائيات والتقارير | لوحة التحكم";
        emoji = "📊";
      } else if (adminTab === "students") {
        title = "إدارة الطلاب والفصول | لوحة التحكم";
        emoji = "👥";
      } else if (adminTab === "teachers") {
        title = "إدارة المعلمين | لوحة التحكم";
        emoji = "💼";
      }
    }
    document.title = title;

    // Dynamically update browser tab icon using SVG text with matching emoji
    try {
      // Remove any existing favicon links to prevent duplicate favicon tags
      const existingLinks = document.querySelectorAll("link[rel*='icon']");
      existingLinks.forEach(el => el.parentNode?.removeChild(el));

      const link = document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>${emoji}</text></svg>`;
      document.getElementsByTagName('head')[0].appendChild(link);
    } catch (e) {
      console.error("Error setting favicon:", e);
    }
  }, [appMode, teacherTab, adminTab]);

  const navigateTo = (mode: "teacher" | "admin" | "stats-only") => {
    const newPath = mode === "admin" ? "/admin" : mode === "stats-only" ? "/" : "/";
    const newSearch = mode === "admin" ? "?page=admin" : mode === "stats-only" ? "?page=stats-only" : "?page=teacher";
    const newHash = mode === "admin" ? "#/admin" : mode === "stats-only" ? "#/stats-only" : "#/";
    
    // Push state to browser history
    window.history.pushState({ mode }, "", `${newPath}${newSearch}${newHash}`);
    setAppMode(mode);

    // Keep right sidebar open and pinned when opening/switching links inside the control panel
    if (mode === "admin" || mode === "teacher") {
      setIsSidebarOpen(true);
      setIsSidebarPinned(true);
    }
  };

  if (authChecking || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100" dir="rtl">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <h3 className="text-lg font-bold">بوابة أم الحمام الثانوية الرقمية</h3>
        <p className="text-xs text-slate-400 mt-2">
          {authChecking ? "جاري التحقق من حالة تسجيل الدخول..." : "جاري تحميل سجلات المدرسة والبيانات الحية..."}
        </p>
      </div>
    );
  }

  // Google Authentication Gate
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100 animate-fadeIn" dir="rtl">
        <div id="login-container" className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="mx-auto bg-gradient-to-tr from-blue-600 to-indigo-700 p-4 rounded-2xl text-white font-extrabold text-3xl shadow-lg shadow-blue-950/50 w-fit">
            🏫
          </div>
          <div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">SmartTeacher</h1>
            <p className="text-xs text-slate-400 mt-2 font-bold">المنصة الموحدة لإدارة ورصد غياب الطلاب وسلوكهم</p>
          </div>

          {/* 3-point description of the application */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 text-right space-y-3">
            <h4 className="text-2xs font-extrabold text-blue-400 uppercase tracking-wide mb-1">🔍 كيف يعمل النظام؟</h4>
            <ul className="text-3xs text-slate-300 space-y-2 font-bold">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong className="text-slate-200">رصد غياب وسلوك الطلاب:</strong> تسجيل الحضور والغياب اليومي ورصد السلوكيات والمخالفات للفصول بضغطة زر.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong className="text-slate-200">إحصائيات وتقارير ذكية:</strong> لوحة تحكم تفاعلية توضح نسب الغياب ومستوى الانضباط العام والمؤشرات البيانية.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong className="text-slate-200">مزامنة سحابية فورية:</strong> حفظ البيانات بشكل مباشر وتلقائي في قاعدة البيانات للرجوع إليها بأمان في أي وقت.</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                await signInWithPopup(auth, googleProvider);
              } catch (err) {
                console.error("Google Sign-In Error:", err);
              }
            }}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 text-xs shadow-md transition-all duration-200 hover:scale-[1.01] active:scale-99 cursor-pointer"
          >
            {/* Google Vector Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.258-3.133C18.29 1.41 15.538 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.93 0 11.52-4.875 11.52-11.72 0-.788-.08-1.39-.18-1.995H12.24z"
              />
            </svg>
            <span>تسجيل الدخول باستخدام حساب Google</span>
          </button>

          <p className="text-[10px] text-slate-500 font-medium">سيتم ربط بياناتك وهيكلك المدرسي تلقائياً بحسابك الموثق</p>
        </div>
      </div>
    );
  }

  // Sidebar Menu Items Definition
  const menuGroups = [
    {
      title: "بوابة تسجيل الغياب ورصد الحصص",
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
              <h1 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 tracking-wide">SmartTeacher</h1>
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
              if (isDirectTeacherLink) {
                return group.items.some(item => item.mode === "teacher");
              } else {
                return group.items.some(item => item.mode === "admin");
              }
            })
            .map((group, gIdx) => (
              <div key={gIdx} className="space-y-2">
                <div className="flex items-center gap-1.5 text-3xs font-extrabold text-slate-400 uppercase tracking-widest px-2.5">
                  {group.icon}
                  <span>{group.title}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isItemActive(item.mode, item.tab);
                    const isStats = item.id === "stats";
                    return (
                      <React.Fragment key={item.id}>
                        <div 
                          className={isStats ? "bg-slate-950/50 rounded-xl p-2 border-2 border-blue-500/65 shadow-lg shadow-blue-500/5 space-y-2 relative overflow-hidden" : "space-y-1"}
                        >
                          {isStats && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-blue-500/60"></div>
                          )}
                          <button
                            onClick={() => handleMenuItemClick(item.mode, item.tab)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] ${
                              active
                                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                                : "text-slate-200 hover:bg-slate-800 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={active ? "text-white" : "text-slate-300"}>{item.icon}</span>
                              <span>{item.label}</span>
                            </div>
                            
                            {active && (
                              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                            )}
                          </button>
                          
                          {isStats && (
                            <div className="px-1">
                              <button
                                type="button"
                                onClick={handleCopyStatsLink}
                                className="w-full flex items-center justify-between gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-extrabold bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer"
                                title="نسخ رابط صفحة الإحصائيات لمشاركتها مباشرة"
                              >
                                <div className="flex items-center gap-1.5">
                                  <Copy className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                  <span>نسخ رابط الإحصائيات</span>
                                </div>
                                {copied ? (
                                  <span className="text-emerald-400 flex items-center gap-0.5 text-[9px] font-black">
                                    <Check className="w-3 h-3 animate-bounce" /> تم النسخ
                                  </span>
                                ) : (
                                  <ExternalLink className="w-3 h-3 text-slate-500" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {isStats && (
                          <>
                            <div 
                              className="bg-slate-950/50 rounded-xl p-2 border-2 border-purple-500/65 shadow-lg shadow-purple-500/5 space-y-2 relative overflow-hidden mt-2"
                            >
                              <div className="absolute top-0 right-0 h-full w-1 bg-purple-500/60"></div>
                              <button
                                onClick={() => navigateTo("teacher")}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer ${
                                  appMode === "teacher"
                                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/10"
                                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={appMode === "teacher" ? "text-white" : "text-purple-400"}><ClipboardCheck className="w-4 h-4" /></span>
                                  <span>بوابة تسجيل الغياب</span>
                                </div>
                                {appMode === "teacher" && (
                                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                )}
                              </button>
                              
                              <div className="px-1">
                                <button
                                  type="button"
                                  onClick={handleCopyTeacherLink}
                                  className="w-full flex items-center justify-between gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-extrabold bg-purple-500/10 hover:bg-purple-500/15 border border-purple-500/20 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer"
                                  title="نسخ رابط بوابة تسجيل الغياب لمشاركته مباشرة"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                                    <span>نسخ رابط بوابة تسجيل الغياب</span>
                                  </div>
                                  {teacherCopied ? (
                                    <span className="text-emerald-400 flex items-center gap-0.5 text-[9px] font-black">
                                      <Check className="w-3 h-3 animate-bounce" /> تم النسخ
                                    </span>
                                  ) : (
                                    <ExternalLink className="w-3 h-3 text-slate-500" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Line divider with vertical margin to separate Student/Class/Teacher admin from Stats/Registration */}
                            <div className="my-5 border-t border-slate-800/80"></div>
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Sidebar Footer Info */}
      <div className="border-t border-slate-800/80 pt-4 mt-auto space-y-3 px-1">
        {/* User Profile Card like the attached image */}
        <div className="bg-slate-950/45 border border-slate-800/60 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-inner">
          {/* Right side: Avatar (first element in RTL) */}
          <div className="w-10 h-10 rounded-full border border-blue-500 bg-white flex items-center justify-center text-blue-600 font-extrabold text-sm flex-shrink-0 shadow-3xs">
            {(currentUser?.displayName || currentUser?.email || "M").charAt(0).toUpperCase()}
          </div>

          {/* Left side: Text details (second element in RTL) */}
          <div className="flex-1 min-w-0 text-right pr-0.5">
            <p className="text-xs font-black text-slate-100 tracking-tight truncate">
              {currentUser?.displayName || "Majed Alnaser"}
            </p>
            <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5" dir="ltr">
              {currentUser?.email || "majedsoft@gmail.com"}
            </p>
          </div>
        </div>

        {/* Logout Button placed nicely at the bottom of the right sidebar, matching the image */}
        <button
          type="button"
          onClick={async () => {
            try {
              await signOut(auth);
            } catch (err) {
              console.error("Logout Error:", err);
            }
          }}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/40 shadow-xs hover:shadow text-rose-600 hover:text-rose-700 rounded-2xl transition-all duration-200 cursor-pointer mt-1"
        >
          {/* Right side: Red sign-out icon in RTL (first child) */}
          <span className="text-red-500 flex-shrink-0"><LogOut className="w-4 h-4" /></span>

          {/* Left side: Red label (second child) */}
          <span className="font-extrabold text-[11px] text-red-600">تسجيل الخروج</span>
        </button>

        {appMode === "teacher" && (
          <button
            onClick={() => navigateTo("admin")}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 text-slate-200 hover:text-white rounded-xl text-3xs font-black transition-all transform hover:translate-y-[-1px] cursor-pointer"
          >
            <span>🛡️ الانتقال للوحة التحكم (Admin)</span>
          </button>
        )}
        
        {/* Footer info: Make design smaller and copyright more clear */}
        <div className="text-center space-y-0.5 pt-1">
          <p className="text-[10px] text-slate-300 font-extrabold tracking-wide">بوابة أم الحمام الرقمية © {new Date().getFullYear()}</p>
          <p className="text-[8px] text-slate-500 font-bold">البرمجة والتصميم: أ/ ماجد الناصر</p>
        </div>
      </div>
    </div>
  );

  const showSidebar = appMode === "admin" || (appMode === "teacher" && !isDirectTeacherLink);
  const showHeader = appMode !== "teacher" || !isDirectTeacherLink;

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans text-slate-800" dir="rtl">
      
      {/* 1. PERSISTENT / FLOATING RIGHT SIDEBAR FOR DESKTOP */}
      {showSidebar && (
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
      {showSidebar && isSidebarOpen && !isSidebarPinned && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="hidden lg:block fixed inset-0 bg-black/40 backdrop-blur-3xs z-35 transition-opacity duration-300 cursor-pointer"
        />
      )}

      {/* Floating Tab on the right edge when desktop sidebar is closed */}
      {showSidebar && !isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          title="إظهار القائمة الجانبية"
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 bg-slate-900 hover:bg-slate-800 text-white p-2.5 rounded-l-xl border-y border-l border-slate-800 shadow-2xl z-35 items-center justify-center cursor-pointer transition-all hover:pl-3.5 group"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-blue-400 group-hover:text-white transition-transform duration-200" />
        </button>
      )}

      {/* 2. RESPONSIVE SLIDING MOBILE DRAWER */}
      {showSidebar && isMobileMenuOpen && (
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
        {showHeader && (
          <header className="bg-white border-b border-slate-200/80 shadow-3xs sticky top-0 z-20 px-4 py-3 md:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              {/* Hamburger (Mobile Only) & Portal Info */}
              <div className="flex items-center gap-3">
                {appMode !== "stats-only" && (
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="lg:hidden p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}

                {/* Desktop Toggle Sidebar Button (shown only when sidebar is closed) */}
                {appMode !== "stats-only" && !isSidebarOpen && (
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
                    {appMode === "stats-only" 
                      ? "إحصائيات وتقارير تفصيلية حية 📊" 
                      : appMode === "admin" 
                        ? "لوحة الإدارة والتحكم 🛡️" 
                        : "بوابة الكادر التعليمي والتحضير 👤"
                    }
                  </h2>
                  <h1 className="text-sm md:text-base font-black text-slate-800 flex items-center gap-1.5">
                    <span>بوابة أم الحمام الرقمية</span>
                    <span className={`hidden sm:inline px-2.5 py-0.5 rounded-full text-3xs font-extrabold border ${
                      appMode === "stats-only"
                        ? "bg-blue-50 text-blue-600 border-blue-100"
                        : appMode === "admin" 
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                          : "bg-blue-50 text-blue-600 border-blue-100"
                    }`}>
                      {appMode === "stats-only" 
                        ? "صفحة الإحصائيات العامة" 
                        : appMode === "admin" 
                          ? "قسم الإشراف العام" 
                          : "قسم المعلمين والمعلمات"
                      }
                    </span>
                  </h1>
                </div>
              </div>

              {/* Live indicators / Date info */}
              <div className="flex items-center gap-2 md:gap-4 text-slate-500 text-2xs font-extrabold">
                {/* Integrated Statistics Pills to free up screen space below */}
                <div className="flex items-center gap-1.5">
                  <div className="bg-rose-50 border border-rose-100 px-2.5 py-1.5 rounded-xl text-rose-700 flex items-center gap-1 shadow-3xs transition hover:bg-rose-100/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    <span className="text-[10px] font-extrabold hidden md:inline">غياب اليوم:</span>
                    <span className="text-[11px] font-black">{todayCounts.absentCount}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 px-2.5 py-1.5 rounded-xl text-amber-700 flex items-center gap-1 shadow-3xs transition hover:bg-amber-100/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span className="text-[10px] font-extrabold hidden md:inline">سلوك اليوم:</span>
                    <span className="text-[11px] font-black">{todayCounts.behaviorCount}</span>
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-slate-600">
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
              activeSubTab={appMode === "stats-only" ? "stats" : adminTab}
              setActiveSubTab={setAdminTab}
              isReadOnly={appMode === "stats-only"}
              onTodayStatsChange={setTodayCounts}
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
