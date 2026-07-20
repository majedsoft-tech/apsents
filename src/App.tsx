import React, { useState, useEffect } from "react";
import { 
  getGrades, 
  getClasses, 
  getTeachers, 
  getStudents, 
  seedDatabaseIfEmpty,
  getSchoolName,
  saveSchoolName,
  subscribeToGrades,
  subscribeToClasses,
  subscribeToTeachers,
  subscribeToStudents,
  subscribeToSchoolName,
  registerUserInDb
} from "./dbService";
import { Grade, Class, Teacher, Student } from "./types";
import TeacherPortal from "./components/TeacherPortal";
import AdminPanel from "./components/AdminPanel";
import SuperAdminPanel from "./components/SuperAdminPanel";
import TourGuide from "./components/TourGuide";
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
  LogOut,
  Edit2
} from "lucide-react";

function getInitialMode(): "teacher" | "admin" | "stats-only" | "super-admin" {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  
  if (path.includes("super-admin") || hash.includes("super-admin") || search.includes("super-admin") || search.includes("page=super-admin")) {
    return "super-admin";
  }
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

  // School Name States
  const [schoolName, setSchoolName] = useState<string>("");
  const [isSavingSchoolName, setIsSavingSchoolName] = useState<boolean>(false);
  const [showSchoolModal, setShowSchoolModal] = useState<boolean>(false);
  const [schoolInput, setSchoolInput] = useState<string>("");
  const [modalError, setModalError] = useState<string>("");
  const [modalSaving, setModalSaving] = useState<boolean>(false);

  // Global Operation Progress State (Saves/Loads/Deletes across the app)
  const [globalProgress, setGlobalProgress] = useState<{
    active: boolean;
    type: "save" | "load" | "delete" | "import" | null;
    label: string;
  }>({ active: false, type: null, label: "" });

  // Sidebar Inline School Name Edit States
  const [isEditingSidebarSchool, setIsEditingSidebarSchool] = useState<boolean>(false);
  const [sidebarSchoolInput, setSidebarSchoolInput] = useState<string>("");

  // Database States
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Onboarding Interactive Tour State
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);

  // Responsive Navigation States
  const [appMode, setAppMode] = useState<"teacher" | "admin" | "stats-only" | "super-admin">(getInitialMode());
  const [isDirectTeacherLink, setIsDirectTeacherLink] = useState<boolean>(() => {
    return getInitialMode() === "teacher";
  });

  // If the user navigates to admin or other sections, reset direct link status
  useEffect(() => {
    if (appMode !== "teacher") {
      setIsDirectTeacherLink(false);
    }
  }, [appMode]);

  const showSidebar = appMode === "admin" || appMode === "super-admin" || (appMode === "teacher" && !isDirectTeacherLink);
  const showHeader = appMode !== "teacher" || !isDirectTeacherLink;

  // Ref for header height measurement
  const headerRef = React.useRef<HTMLElement>(null);

  // Monitor header height dynamically and set CSS custom property
  useEffect(() => {
    const updateHeaderHeight = () => {
      const height = showHeader && headerRef.current ? headerRef.current.offsetHeight : 0;
      document.documentElement.style.setProperty('--header-height', `${height}px`);
    };

    updateHeaderHeight();

    let observer: ResizeObserver | null = null;
    if (headerRef.current) {
      observer = new ResizeObserver(updateHeaderHeight);
      observer.observe(headerRef.current);
    }

    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, [showHeader, appMode]);

  const [copied, setCopied] = useState<boolean>(false);
  const [teacherCopied, setTeacherCopied] = useState<boolean>(false);
  const [teacherTab, setTeacherTab] = useState<"attendance" | "behavior">("attendance");
  const [adminTab, setAdminTab] = useState<"stats" | "grades" | "teachers" | "students">("stats");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [todayCounts, setTodayCounts] = useState<{ absentCount: number; behaviorCount: number }>({ absentCount: 0, behaviorCount: 0 });

  // Desktop sidebar control states (hide/show & pin/unpin) - Pinning is always enabled
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(true);
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

  // Setup real-time subscribers for grades, classes, teachers, and students to keep data synced instantly
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthChecking(false);
      } else {
        setCurrentUser(null);
        setAuthChecking(false);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Synchronize registered user profile in Firestore
  useEffect(() => {
    if (currentUser && !currentUser.isGuest) {
      registerUserInDb({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL
      }, schoolName).catch((err) => {
        console.error("Error updating registration: ", err);
      });
    }
  }, [currentUser, schoolName]);

  useEffect(() => {
    if (!currentUser) return;

    // Read cached school name from localStorage first to prevent loading screen flicker
    const cached = localStorage.getItem(`school_name_${currentUser.email?.toLowerCase()}`);
    if (cached) {
      setSchoolName(cached);
    }

    setLoading(true);

    let unsubSchool: (() => void) | null = null;
    let unsubGrades: (() => void) | null = null;
    let unsubClasses: (() => void) | null = null;
    let unsubTeachers: (() => void) | null = null;
    let unsubStudents: (() => void) | null = null;
    let active = true;

    const getNumberFromName = (name: string): number => {
      const match = name.match(/\d+/);
      return match ? parseInt(match[0], 10) : 999999;
    };

    const initialize = async () => {
      try {
        const [g, c, t, s, name] = await Promise.all([
          getGrades(),
          getClasses(),
          getTeachers(),
          getStudents(),
          getSchoolName()
        ]);

        if (!active) return;

        // Set initial state from authoritative Firestore load
        if (name) {
          setSchoolName(name);
          if (currentUser.email) {
            localStorage.setItem(`school_name_${currentUser.email.toLowerCase()}`, name);
          }
        } else {
          setSchoolName("");
          setShowSchoolModal(true);
        }

        const sortedGrades = [...g].sort((a, b) => {
          const timeA = (a as any).createdAt || 0;
          const timeB = (b as any).createdAt || 0;
          if (timeA !== timeB) return timeA - timeB;
          return a.name.localeCompare(b.name, "ar");
        });
        setGrades(sortedGrades);

        const sortedClasses = [...c].sort((a, b) => {
          const numA = getNumberFromName(a.name);
          const numB = getNumberFromName(b.name);
          if (numA !== numB) return numA - numB;
          return a.name.localeCompare(b.name, "ar");
        });
        setClasses(sortedClasses);

        const sortedTeachers = [...t].sort((a, b) => a.name.localeCompare(b.name, "ar"));
        setTeachers(sortedTeachers);

        setStudents(s);

        // Turn off loading once initial data is perfectly ready
        setLoading(false);

        // 1. Subscribe to School Name
        unsubSchool = subscribeToSchoolName((newName) => {
          if (newName) {
            setSchoolName(newName);
            if (currentUser.email) {
              localStorage.setItem(`school_name_${currentUser.email.toLowerCase()}`, newName);
            }
          } else {
            setSchoolName("");
            setShowSchoolModal(true);
          }
        });

        // 2. Subscribe to Grades
        unsubGrades = subscribeToGrades((newGrades) => {
          const sorted = [...newGrades].sort((a, b) => {
            const timeA = (a as any).createdAt || 0;
            const timeB = (b as any).createdAt || 0;
            if (timeA !== timeB) return timeA - timeB;
            return a.name.localeCompare(b.name, "ar");
          });
          setGrades(sorted);
        });

        // 3. Subscribe to Classes
        unsubClasses = subscribeToClasses((newClasses) => {
          const sorted = [...newClasses].sort((a, b) => {
            const numA = getNumberFromName(a.name);
            const numB = getNumberFromName(b.name);
            if (numA !== numB) return numA - numB;
            return a.name.localeCompare(b.name, "ar");
          });
          setClasses(sorted);
        });

        // 4. Subscribe to Teachers
        unsubTeachers = subscribeToTeachers((newTeachers) => {
          const sorted = [...newTeachers].sort((a, b) => a.name.localeCompare(b.name, "ar"));
          setTeachers(sorted);
        });

        // 5. Subscribe to Students
        unsubStudents = subscribeToStudents((newStudents) => {
          setStudents(newStudents);
        });

      } catch (err) {
        console.error("Error doing initial database load:", err);
        if (active) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      active = false;
      if (unsubSchool) (unsubSchool as () => void)();
      if (unsubGrades) (unsubGrades as () => void)();
      if (unsubClasses) (unsubClasses as () => void)();
      if (unsubTeachers) (unsubTeachers as () => void)();
      if (unsubStudents) (unsubStudents as () => void)();
    };
  }, [currentUser]);

  const handleRefreshData = async () => {
    // Data is already fully real-time through firestore live-subscriptions!
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

  const handleSchoolNameChange = async (newName: string) => {
    // 1. Optimistic Update (Instant feedback on the UI and cache)
    setSchoolName(newName);
    const user = auth.currentUser;
    if (user && user.email) {
      localStorage.setItem(`school_name_${user.email.toLowerCase()}`, newName);
    }
    
    // 2. Trigger background save state
    setIsSavingSchoolName(true);
    try {
      await saveSchoolName(newName);
    } catch (err) {
      console.error("Error saving school name:", err);
    } finally {
      setIsSavingSchoolName(false);
    }
  };

  // Auto start interactive tour for new users on their first visit
  useEffect(() => {
    if (currentUser && !loading && schoolName && appMode !== "stats-only") {
      const key = `tour_completed_${currentUser.email?.toLowerCase()}`;
      const completed = localStorage.getItem(key);
      if (!completed) {
        setIsTourOpen(true);
        localStorage.setItem(key, "true");
      }
    }
  }, [currentUser, loading, schoolName, appMode]);

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
    let title = schoolName ? `بوابة ${schoolName}` : "البوابة الرقمية للرصد والمتابعة";
    let emoji = "🏫";
    
    if (appMode === "stats-only") {
      title = schoolName ? `متابعة الغياب والسلوك | ${schoolName}` : "متابعة الغياب والسلوك | البوابة الرقمية";
      emoji = "📊";
    } else if (appMode === "teacher") {
      if (teacherTab === "attendance") {
        title = `رصد الحضور والغياب | ${schoolName || "البوابة الرقمية"}`;
        emoji = "📋";
      } else if (teacherTab === "behavior") {
        title = `الرصد السلوكي للطلاب | ${schoolName || "البوابة الرقمية"}`;
        emoji = "⚠️";
      }
    } else if (appMode === "admin") {
      if (adminTab === "stats") {
        title = "متابعة الغياب والسلوك | لوحة التحكم";
        emoji = "📊";
      } else if (adminTab === "students") {
        title = "إضافة الطلاب والفصول | لوحة التحكم";
        emoji = "👥";
      } else if (adminTab === "teachers") {
        title = "إضافة المعلمين | لوحة التحكم";
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
  }, [appMode, teacherTab, adminTab, schoolName]);

  const navigateTo = (mode: "teacher" | "admin" | "stats-only" | "super-admin") => {
    const newPath = mode === "admin" ? "/admin" : mode === "super-admin" ? "/super-admin" : mode === "stats-only" ? "/" : "/";
    const newSearch = mode === "admin" ? "?page=admin" : mode === "super-admin" ? "?page=super-admin" : mode === "stats-only" ? "?page=stats-only" : "?page=teacher";
    const newHash = mode === "admin" ? "#/admin" : mode === "super-admin" ? "#/super-admin" : mode === "stats-only" ? "#/stats-only" : "#/";
    
    // Push state to browser history
    window.history.pushState({ mode }, "", `${newPath}${newSearch}${newHash}`);
    setAppMode(mode);

    // Keep right sidebar open and pinned when opening/switching links inside the control panel
    if (mode === "admin" || mode === "super-admin" || mode === "teacher") {
      setIsSidebarOpen(true);
      setIsSidebarPinned(true);
    }
  };

  if (authChecking || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100" dir="rtl">
        <div className="max-w-md w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden animate-fadeIn">
          {/* Decorative ambient glowing backdrops */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-12 -mt-12 blur-xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full -ml-12 -mb-12 blur-xl"></div>
          
          <div className="relative flex flex-col items-center">
            {schoolName ? (
              <div className="mx-auto bg-gradient-to-tr from-blue-600 to-indigo-700 p-4 rounded-2xl text-white font-extrabold text-3xl shadow-lg shadow-blue-950/50 w-fit mb-5 animate-bounce">
                🏫
              </div>
            ) : (
              <div className="mx-auto bg-gradient-to-tr from-rose-500 to-amber-500 p-4 rounded-2xl text-white font-extrabold text-3xl shadow-lg shadow-amber-950/50 w-fit mb-5 animate-pulse">
                ✨
              </div>
            )}
            
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            
            <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
              {schoolName ? `بوابة ${schoolName}` : "مرحباً بك في نظام رصد ومتابعة الغياب"}
            </h3>
            
            <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">
              {authChecking 
                ? "جاري التحقق من حالة تسجيل الدخول..." 
                : schoolName 
                  ? `أهلاً بك مجدداً! جاري تحميل سجلات ${schoolName} والبيانات الحية...`
                  : "أهلاً بك! جاري تهيئة حسابك الجديد وتحميل النظام في دقائق معدودة..."
              }
            </p>
            
            {!schoolName && !authChecking && (
              <div className="mt-4 p-3 bg-slate-950/50 border border-slate-800/80 rounded-xl max-w-sm">
                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                  أنت على بعد خطوات بسيطة للحصول على نظام متكامل وذكي لمتابعة ورصد الغياب والسلوك الخاص بمدرستك. يرجى الانتظار للحظات...
                </p>
              </div>
            )}
          </div>
        </div>
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
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">SmartSchool</h1>
            <p className="text-xs text-slate-400 mt-2 font-bold">منصة رصد ومتابعة الغياب والسلوك للطلاب بطريقة مبتكرة</p>
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
    ...(currentUser?.email?.toLowerCase() === "majedsoft@gmail.com" ? [
      {
        title: "الإدارة الفائقة للمنصة",
        icon: <ShieldCheck className="w-4 h-4 text-amber-500" />,
        items: [
          {
            id: "super-admin",
            label: "إدارة المشتركين والمسجلين 👑",
            icon: <Users className="w-4 h-4" />,
            mode: "super-admin" as const,
            tab: "users" as const
          }
        ]
      }
    ] : []),
    {
      title: "تسجيل الغياب للمعلمين",
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
          label: "متابعة الغياب والسلوك",
          icon: <BarChart3 className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "stats" as const
        },
        {
          id: "students",
          label: "إضافة الطلاب والفصول",
          icon: <Users className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "students" as const
        },
        {
          id: "teachers",
          label: "إضافة المعلمين",
          icon: <Briefcase className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "teachers" as const
        }
      ]
    }
  ];

  const handleMenuItemClick = (mode: "teacher" | "admin" | "super-admin", tab: any) => {
    setAppMode(mode);
    if (mode === "teacher") {
      setTeacherTab(tab);
    } else if (mode === "admin") {
      setAdminTab(tab);
    }
    setIsMobileMenuOpen(false); // Close mobile drawer if open
  };

  // Helper to check if a menu item is currently active
  const isItemActive = (mode: "teacher" | "admin" | "super-admin", tab: any) => {
    if (appMode !== mode) return false;
    if (mode === "super-admin") return true;
    return mode === "teacher" ? teacherTab === tab : adminTab === tab;
  };

  // Reusable Sidebar Content JSX
  const renderSidebarContent = () => {
    // Dynamic Onboarding Step Calculation for Sidebar Highlighting
    let onboardingStep = 1;
    if (grades.length === 0 || classes.length === 0) {
      if (appMode !== "admin" || adminTab !== "students") {
        onboardingStep = 1;
      } else {
        onboardingStep = 2;
      }
    } else if (students.length === 0) {
      if (appMode !== "admin" || adminTab !== "students") {
        onboardingStep = 1;
      } else {
        onboardingStep = 6;
      }
    } else if (teachers.length === 0) {
      if (appMode !== "admin" || adminTab !== "teachers") {
        onboardingStep = 7;
      } else {
        onboardingStep = 7.5;
      }
    } else {
      onboardingStep = 8;
    }

    return (
      <div className="flex flex-col h-full justify-between p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
      <div className="space-y-6">
        {/* School Logo Shield */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div id="sidebar-school-logo" className="bg-gradient-to-tr from-blue-600 to-indigo-700 p-2.5 rounded-xl text-white font-extrabold text-lg shadow-md shadow-blue-900/30">
              🏫
            </div>
            <div>
              <h1 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 tracking-wide">SmartSchool</h1>
              {isEditingSidebarSchool ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={sidebarSchoolInput}
                    onChange={(e) => setSidebarSchoolInput(e.target.value)}
                    className="text-[10px] font-bold px-2 py-0.5 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded text-right text-slate-100 max-w-[110px] outline-none"
                    placeholder="اسم المدرسة"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const trimmed = sidebarSchoolInput.trim();
                      if (trimmed) {
                        await handleSchoolNameChange(trimmed);
                      }
                      setIsEditingSidebarSchool(false);
                    }}
                    className="p-1 text-emerald-400 hover:text-emerald-300 bg-slate-950 hover:bg-slate-800 rounded border border-slate-850 cursor-pointer"
                    title="حفظ"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingSidebarSchool(false)}
                    className="p-1 text-rose-400 hover:text-rose-300 bg-slate-950 hover:bg-slate-800 rounded border border-slate-850 cursor-pointer"
                    title="إلغاء"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-3xs text-slate-300 font-extrabold max-w-[110px] truncate">{schoolName || "لم يتم تسجيل اسم المدرسة"}</p>
                  {isSavingSchoolName ? (
                    <div className="p-1 bg-slate-900 border border-slate-800 rounded-md flex items-center justify-center shadow-xs" title="جاري الحفظ...">
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      id="btn-edit-school"
                      onClick={() => {
                        setSidebarSchoolInput(schoolName || "");
                        setIsEditingSidebarSchool(true);
                      }}
                      className="text-red-400 hover:text-red-300 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 p-1 rounded-md transition-all duration-150 cursor-pointer flex items-center justify-center shadow-sm"
                      title="تعديل اسم المدرسة"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls for Desktop hiding (Pinning is always on) */}
          <div className="hidden lg:flex items-center gap-1.5">
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

        {/* Site Subtitle / Description */}
        <div id="sidebar-site-subtitle" className="bg-slate-950/40 border border-slate-800/80 rounded-xl py-2.5 px-3.5 text-center -mt-2.5 shadow-3xs">
          <p className="text-2xs font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
            رصد ومتابعة الغياب
          </p>
        </div>

        {/* Dynamic Groups & Items */}
        <div className="space-y-5">
          {menuGroups
            .filter((group) => {
              if (isDirectTeacherLink) {
                return group.items.some(item => item.mode === "teacher");
              } else {
                return group.items.some(item => item.mode === "admin" || item.mode === "super-admin");
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
                            id={`sidebar-${item.id}`}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer ${
                              active
                                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                                : "text-slate-200 hover:bg-slate-800 hover:text-white"
                            } ${
                              (item.id === "students" && onboardingStep === 1) || (item.id === "teachers" && onboardingStep === 7)
                                ? "ring-2 ring-amber-400 bg-slate-800 text-amber-300 animate-pulse font-extrabold"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={active ? "text-white" : "text-slate-300"}>{item.icon}</span>
                              <span>{item.label}</span>
                              {((item.id === "students" && onboardingStep === 1) || (item.id === "teachers" && onboardingStep === 7)) && (
                                <span className="bg-amber-400 text-slate-900 text-[8px] px-1.5 py-0.5 rounded-md font-black animate-bounce">
                                  البدء هنا 👈
                                </span>
                              )}
                            </div>
                            
                            {active && (
                              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                            )}
                          </button>
                          
                          {isStats && (
                            <div className="px-1">
                              <button
                                type="button"
                                id="btn-copy-stats-link"
                                onClick={handleCopyStatsLink}
                                className="w-full flex items-center justify-between gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-extrabold bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer"
                                title="نسخ رابط صفحة متابعة الغياب والسلوك لمشاركتها مباشرة"
                              >
                                <div className="flex items-center gap-1.5">
                                  <Copy className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                  <span>نسخ الرابط للمسؤول</span>
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
                                  <span>بوابة تسجيل الغياب والسلوك</span>
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
                                  title="نسخ رابط تسجيل الغياب للمعلمين لمشاركته مباشرة"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                                    <span>نسخ الرابط للمعلمين</span>
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
        {/* Combined User Profile and Logout Container (Single Group) */}
        <div className="bg-slate-950/45 border border-slate-800/60 rounded-2xl p-3 space-y-3.5 shadow-inner">
          {/* User Profile Info */}
          <div className="flex items-center gap-3">
            {/* Right side: Avatar (first element in RTL) */}
            <div className="w-10 h-10 rounded-full border border-blue-500 bg-white flex items-center justify-center text-blue-600 font-extrabold text-sm flex-shrink-0 shadow-3xs">
              {(currentUser?.displayName || currentUser?.email || "M").charAt(0).toUpperCase()}
            </div>

            {/* Left side: Text details (second element in RTL) */}
            <div className="flex-1 min-w-0 text-right pr-0.5">
              <p className="text-xs font-black text-slate-100 tracking-tight truncate">
                {currentUser?.displayName || "مستخدم مسجل"}
              </p>
              <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5" dir="ltr">
                {currentUser?.email || ""}
              </p>
            </div>
          </div>

          {/* Horizontal separator matching the theme */}
          <div className="border-t border-slate-800/50"></div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut(auth);
              } catch (err) {
                console.error("Logout Error:", err);
              }
            }}
            className="w-full flex items-center justify-start gap-2.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 hover:text-rose-300 rounded-xl transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="font-extrabold text-[11px]">تسجيل الخروج</span>
          </button>
        </div>

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
          <p className="text-[10px] text-slate-300 font-extrabold tracking-wide">{schoolName ? `بوابة ${schoolName} الرقمية` : "البوابة الرقمية للرصد والمتابعة"} © {new Date().getFullYear()}</p>
          <p className="text-[8px] text-slate-500 font-bold">البرمجة والتصميم: أ/ ماجد الناصر</p>
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-100 via-blue-50/10 to-slate-200/40 font-sans text-slate-800" dir="rtl">
      
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
      <div className="flex-1 min-h-screen flex flex-col bg-gradient-to-b from-blue-50/40 via-slate-50 to-slate-100/60">
        
        {/* Unified Portal Header (Desktop & Mobile Responsive) */}
        {showHeader && (
          <header ref={headerRef} className="bg-white border-b border-slate-200/80 shadow-3xs sticky top-0 z-20 px-4 py-3 md:px-6">
            <div className="w-full flex items-center justify-between">
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
                    {appMode === "super-admin"
                      ? "لوحة الإدارة العليا والتحكم بالمنصة 👑"
                      : appMode === "stats-only" 
                        ? "إحصائيات وتقارير تفصيلية حية 📊" 
                        : appMode === "admin" 
                          ? "لوحة الإدارة والتحكم 🛡️" 
                          : "بوابة الكادر التعليمي والتحضير 👤"
                    }
                  </h2>
                  <h1 className="text-sm md:text-base font-black text-slate-800 flex items-center gap-1.5">
                    <span>{schoolName ? `بوابة ${schoolName} الرقمية` : "البوابة الرقمية للرصد والمتابعة"}</span>
                    <span className={`hidden sm:inline px-2.5 py-0.5 rounded-full text-3xs font-extrabold border ${
                      appMode === "super-admin"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : appMode === "stats-only"
                          ? "bg-blue-50 text-blue-600 border-blue-100"
                          : appMode === "admin" 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : "bg-blue-50 text-blue-600 border-blue-100"
                    }`}>
                      {appMode === "super-admin"
                        ? "قسم الإشراف الفائق للموقع"
                        : appMode === "stats-only" 
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
                {currentUser && appMode !== "stats-only" && (
                  <button
                    type="button"
                    onClick={() => setIsTourOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs border border-amber-300 cursor-pointer"
                    title="بدء الجولة الإرشادية للتطبيق"
                  >
                    <span className="animate-pulse">💡</span>
                    <span>جولة إرشادية</span>
                  </button>
                )}

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
        <main className="flex-1 w-full max-w-none px-3 md:px-6 py-4">
          {appMode === "super-admin" ? (
            <SuperAdminPanel
              currentUser={currentUser}
              onRefreshData={handleRefreshData}
              globalProgress={globalProgress}
              setGlobalProgress={setGlobalProgress}
            />
          ) : appMode === "teacher" ? (
            <TeacherPortal 
              grades={grades} 
              classes={classes} 
              teachers={teachers} 
              onRefreshStats={handleRefreshData}
              activeTab={teacherTab}
              setActiveTab={setTeacherTab}
              navigateTo={navigateTo}
              schoolName={schoolName}
              isDirectTeacherLink={isDirectTeacherLink}
              globalProgress={globalProgress}
              setGlobalProgress={setGlobalProgress}
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
              schoolName={schoolName}
              onSchoolNameChange={handleSchoolNameChange}
              isSavingSchoolName={isSavingSchoolName}
              globalProgress={globalProgress}
              setGlobalProgress={setGlobalProgress}
            />
          )}
        </main>

        {/* Styled Footer (Shown only on mobile view since desktop has sidebar credits) */}
        <footer className="lg:hidden bg-white border-t border-slate-100 py-4 text-center text-slate-400 text-3xs space-y-1">
          <p className="font-extrabold text-slate-500">البرمجة والتصميم: أ/ ماجد الناصر</p>
          <p className="font-semibold text-slate-400">{schoolName || "البوابة الرقمية للمدرسة"}</p>
        </footer>
      </div>

      {/* 4. DYNAMIC SCHOOL CUSTOMIZATION MODAL (ASKED ON FIRST EMAIL SIGN-IN) */}
      {showSchoolModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-right shadow-2xl relative overflow-hidden space-y-5">
            {/* Elegant Background Accents */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-12 -mt-12 opacity-60"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-50 rounded-full -ml-12 -mb-12 opacity-60"></div>
            
            <div className="relative space-y-4">
              {/* Header Icon */}
              <div className="mx-auto bg-gradient-to-tr from-blue-600 to-indigo-700 p-4 rounded-2xl text-white font-extrabold text-3xl shadow-lg shadow-blue-500/20 w-fit">
                🏫
              </div>
              
              {/* Text content */}
              <div className="text-center space-y-1.5">
                <h3 className="text-base font-black text-slate-800">تخصيص النسخة لمدرستك ⚙️</h3>
                <p className="text-3xs text-slate-500 font-bold leading-relaxed px-2">
                  مرحباً بك في منصة <strong className="text-blue-600">SmartSchool</strong> الرقمية! يرجى إدخال اسم مدرستك أو المجمع التعليمي الخاص بك لتخصيص كامل واجهات المنصة، تلوين الهوية، وتوليد التقارير والإحصائيات الحية باسم مدرستك فوراً.
                </p>
              </div>

              {/* Form Input */}
              <div className="space-y-1.5 text-right">
                <label className="block text-3xs font-black text-slate-400 uppercase tracking-wide">
                  اسم المدرسة أو المنشأة التعليمية:
                </label>
                <input
                  type="text"
                  value={schoolInput}
                  onChange={(e) => {
                    setSchoolInput(e.target.value);
                    if (modalError) setModalError("");
                  }}
                  placeholder="مثال: مدرسة أم الحمام الثانوية"
                  className="w-full text-xs font-bold px-4 py-3.5 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 rounded-xl outline-none transition text-right bg-slate-50/50 focus:bg-white placeholder:text-slate-300"
                />
                {modalError && (
                  <p className="text-[10px] text-rose-500 font-black flex items-center gap-1 mt-1">
                    <span>⚠️</span>
                    <span>{modalError}</span>
                  </p>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={modalSaving}
                onClick={async () => {
                  const trimmed = schoolInput.trim();
                  if (!trimmed) {
                    setModalError("يرجى كتابة اسم المدرسة للمتابعة وتخصيص نسختك.");
                    return;
                  }
                  if (trimmed.length < 3) {
                    setModalError("اسم المدرسة يجب أن يتكون من ٣ أحرف على الأقل.");
                    return;
                  }
                  setModalSaving(true);
                  try {
                    await saveSchoolName(trimmed);
                    setSchoolName(trimmed);
                    const user = auth.currentUser;
                    if (user && user.email) {
                      localStorage.setItem(`school_name_${user.email.toLowerCase()}`, trimmed);
                    }
                    setShowSchoolModal(false);
                  } catch (err) {
                    console.error("Error saving custom school name:", err);
                    setModalError("حدث خطأ أثناء حفظ الاسم، يرجى المحاولة مرة أخرى.");
                  } finally {
                    setModalSaving(false);
                  }
                }}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 transition-all active:scale-99 hover:scale-[1.01] cursor-pointer disabled:opacity-50"
              >
                {modalSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>جاري تخصيص وحفظ الهوية...</span>
                  </>
                ) : (
                  <>
                    <span>حفظ وتخصيص المنصة بالكامل ✨</span>
                  </>
                )}
              </button>
              
              <p className="text-[9px] text-slate-400 font-medium text-center">
                يمكنك تعديل اسم المدرسة في أي وقت لاحقاً من خلال تهيئة الإعدادات
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Elegant Floating Save Progress Indicator */}
      {isSavingSchoolName && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 border border-slate-800/80 text-slate-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce text-xs font-bold" dir="rtl">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="tracking-wide">جاري مزامنة وحفظ الاسم الجديد سحابياً...</span>
        </div>
      )}

      {/* Global Elegant Circular Progress Overlay */}
      {globalProgress.active && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 max-w-xs w-full text-center space-y-6 shadow-2xl relative overflow-hidden">
            {/* Glowing visual backdrop */}
            <div className={`absolute top-0 right-0 w-32 h-32 ${
              globalProgress.type === 'delete' ? 'bg-rose-500/10' : globalProgress.type === 'save' ? 'bg-amber-500/10' : 'bg-blue-500/10'
            } rounded-full -mr-12 -mt-12 blur-xl opacity-60`}></div>
            
            <div className="flex flex-col items-center space-y-4">
              {/* Circular Progress Design */}
              <div className="relative flex items-center justify-center">
                {/* Pulsing ring */}
                <div className={`absolute inset-0 rounded-full animate-ping opacity-10 filter blur-xs ${
                  globalProgress.type === 'delete' ? 'bg-rose-500' : globalProgress.type === 'save' ? 'bg-amber-500' : 'bg-blue-500'
                }`} style={{ margin: '-4px' }}></div>
                
                <svg className="animate-spin h-14 w-14" viewBox="0 0 48 48">
                  {/* Background Track */}
                  <circle className="opacity-10 stroke-slate-400" cx="24" cy="24" r="20" fill="none" strokeWidth="4" />
                  {/* Spinning colored path */}
                  <path 
                    className={`opacity-95 ${
                      globalProgress.type === 'delete' ? 'text-rose-600' : globalProgress.type === 'save' ? 'text-amber-500' : 'text-blue-600'
                    }`}
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="4" 
                    strokeLinecap="round"
                    d="M 24,4 A 20,20 0 0,1 44,24" 
                  />
                </svg>
                
                <span className="absolute text-sm">
                  {globalProgress.type === 'delete' ? '🗑️' : globalProgress.type === 'save' ? '💾' : '🔄'}
                </span>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-slate-800 leading-relaxed">
                  {globalProgress.label || "جاري معالجة طلبك..."}
                </h4>
                <p className="text-[10px] font-bold text-slate-400">
                  يرجى الانتظار حتى اكتمال العملية بنجاح.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Onboarding Tour */}
      <TourGuide
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        appMode={appMode}
        setAppMode={setAppMode}
        setAdminTab={setAdminTab}
        setTeacherTab={setTeacherTab}
        setIsSidebarOpen={setIsSidebarOpen}
      />
    </div>
  );
}
