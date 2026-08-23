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
  registerUserInDb,
  setActiveUser,
  syncAllLocalDataToFirestore,
  migrateGuestDataToUser,
  resolveOwnerProfileFromDb,
  getOrCreateOwnSchoolAdminId,
  setLinkedSchoolOwnerId
} from "./dbService";
import { Grade, Class, Teacher, Student } from "./types";
import TeacherPortal from "./components/TeacherPortal";
import MorningDelayPortal from "./components/MorningDelayPortal";
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
  Edit2,
  SunMedium,
  Cloud,
  CloudOff,
  RefreshCw,
  Key,
  Link2,
  Share2,
  Sparkles,
  HelpCircle
} from "lucide-react";

function getInitialMode(): "teacher" | "admin" | "stats-only" | "super-admin" | "morning-delay" {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  
  if (path.includes("super-admin") || hash.includes("super-admin") || search.includes("super-admin") || search.includes("page=super-admin")) {
    return "super-admin";
  }
  if (path.includes("morning-delay") || hash.includes("morning-delay") || search.includes("morning-delay") || search.includes("page=morning-delay")) {
    return "morning-delay";
  }
  if (path.includes("stats-only") || hash.includes("stats-only") || search.includes("stats-only") || search.includes("page=stats-only")) {
    return "stats-only";
  }
  if (path.includes("/teacher") || hash.includes("teacher") || search.includes("page=teacher") || search.includes("teacher")) {
    return "teacher";
  }
  if (path.includes("/admin") || hash.includes("admin") || search.includes("page=admin") || search.includes("admin")) {
    return "admin";
  }

  // If no explicit route in URL, default to admin mode
  return "admin";
}

function getInitialTeacherTab(): "attendance" | "behavior" {
  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get("tab");
  if (tab === "attendance" || tab === "behavior") {
    return tab;
  }
  return "attendance";
}

function getInitialAdminTab(): "stats" | "grades" | "teachers" | "students" {
  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get("tab");
  if (tab === "stats" || tab === "grades" || tab === "teachers" || tab === "students") {
    return tab as any;
  }
  return "stats";
}

export default function App() {
  // Authentication States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [domainCopied, setDomainCopied] = useState<boolean>(false);

  // School Name States
  const [schoolName, setSchoolName] = useState<string>("");
  const [isSavingSchoolName, setIsSavingSchoolName] = useState<boolean>(false);

  // Cloud Sync & Cross-Domain Link States
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [syncCodeInput, setSyncCodeInput] = useState<string>("");
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [adminSyncCopied, setAdminSyncCopied] = useState<boolean>(false);
  const [schoolCodeCopied, setSchoolCodeCopied] = useState<boolean>(false);
  const [isLinkingLoading, setIsLinkingLoading] = useState<boolean>(false);

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
  const [appMode, setAppMode] = useState<"teacher" | "admin" | "stats-only" | "super-admin" | "morning-delay">(getInitialMode());
  const [isDirectTeacherLink, setIsDirectTeacherLink] = useState<boolean>(() => {
    return getInitialMode() === "teacher";
  });
  const [isDirectMorningDelayLink, setIsDirectMorningDelayLink] = useState<boolean>(() => {
    return getInitialMode() === "morning-delay";
  });

  // If the user navigates to admin or other sections, reset direct link status
  useEffect(() => {
    if (appMode !== "teacher") {
      setIsDirectTeacherLink(false);
    }
    if (appMode !== "morning-delay") {
      setIsDirectMorningDelayLink(false);
    }
  }, [appMode]);

  const showSidebar = appMode === "admin" || appMode === "super-admin" || (appMode === "teacher" && !isDirectTeacherLink) || (appMode === "morning-delay" && !isDirectMorningDelayLink);
  const showHeader = (appMode !== "teacher" || !isDirectTeacherLink) && (appMode !== "morning-delay" || !isDirectMorningDelayLink);

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
  const [morningDelayCopied, setMorningDelayCopied] = useState<boolean>(false);
  const [teacherTab, setTeacherTab] = useState<"attendance" | "behavior">(getInitialTeacherTab());
  const [adminTab, setAdminTab] = useState<"stats" | "grades" | "teachers" | "students">(getInitialAdminTab());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [todayCounts, setTodayCounts] = useState<{ absentCount: number; behaviorCount: number }>({ absentCount: 0, behaviorCount: 0 });

  // Desktop sidebar control states - Sidebar is permanently pinned and open
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

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
    const searchParams = new URLSearchParams(window.location.search);
    const hashIndex = window.location.hash.indexOf("?");
    const hashParams = hashIndex !== -1 ? new URLSearchParams(window.location.hash.substring(hashIndex)) : null;

    const pageParam = searchParams.get("page") || hashParams?.get("page") || "";
    const ownerParam = searchParams.get("owner") || searchParams.get("ownerId") || searchParams.get("uid") || hashParams?.get("owner") || hashParams?.get("ownerId") || hashParams?.get("uid") || "";
    const emailParam = searchParams.get("email") || searchParams.get("ownerEmail") || searchParams.get("userEmail") || hashParams?.get("email") || hashParams?.get("ownerEmail") || hashParams?.get("userEmail") || "";
    const schoolParam = searchParams.get("school") || searchParams.get("schoolName") || hashParams?.get("school") || hashParams?.get("schoolName") || "";

    if (schoolParam) {
      const decodedSchool = decodeURIComponent(schoolParam);
      setSchoolName(decodedSchool);
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (ownerParam || emailParam) {
        const decodedOwner = ownerParam ? decodeURIComponent(ownerParam) : "";
        const decodedEmail = emailParam ? decodeURIComponent(emailParam).toLowerCase() : "";

        let effEmail = decodedEmail 
          ? decodedEmail 
          : (decodedOwner.includes("@") ? decodedOwner.toLowerCase() : (user?.email?.toLowerCase() || `owner_${decodedOwner}@school.com`));
        let effUid = decodedOwner 
          ? decodedOwner 
          : (decodedEmail ? `user_${decodedEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : (user?.uid || "school_default"));

        const guestUser = {
          uid: effUid,
          email: effEmail,
          displayName: schoolParam ? decodeURIComponent(schoolParam) : (user?.uid === effUid ? (user?.displayName || "مدير المدرسة") : "زائر (مباشر)"),
          isGuest: user?.uid !== effUid
        };
        setCurrentUser(guestUser);
        setActiveUser(guestUser);

        // Asynchronously resolve owner profile from DB to attach real registered email and school name
        if (decodedOwner || decodedEmail) {
          resolveOwnerProfileFromDb(decodedOwner || decodedEmail).then((profile) => {
            if (profile) {
              const updatedGuestUser = {
                uid: profile.uid || effUid,
                email: profile.email || effEmail,
                displayName: profile.schoolName || guestUser.displayName,
                isGuest: user?.uid !== (profile.uid || effUid)
              };
              setCurrentUser(updatedGuestUser);
              setActiveUser(updatedGuestUser);
              if (profile.schoolName) {
                setSchoolName(profile.schoolName);
              }
            }
          }).catch(() => {});
        }
      } else if (user) {
        const prevGuestId = localStorage.getItem("own_school_admin_id");
        if (prevGuestId && prevGuestId !== user.uid) {
          migrateGuestDataToUser(prevGuestId, user.uid, user.email?.toLowerCase() || "").catch(() => {});
        }
        setCurrentUser(user);
        setActiveUser(user);
        // Automatic full background synchronization for the logged-in admin
        syncAllLocalDataToFirestore().catch(() => {});
      } else {
        const ownSchoolId = getOrCreateOwnSchoolAdminId();
        const guestUser = {
          uid: ownSchoolId,
          email: `owner_${ownSchoolId}@school.com`,
          displayName: "مدير المدرسة (غير مسجل)",
          isGuest: true
        };
        setCurrentUser(guestUser);
        setActiveUser(guestUser);
      }
      setAuthChecking(false);
    });
    return () => unsubscribeAuth();
  }, [appMode]);

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

  const getNumberFromName = (name: string): number => {
    const match = name.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999999;
  };

  const deduplicateById = <T extends { id: string }>(arr: T[]): T[] => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    return arr.filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const deduplicateClasses = (arr: Class[]): Class[] => {
    if (!Array.isArray(arr)) return [];
    const seenIds = new Set<string>();
    const seenGradeName = new Set<string>();
    return arr.filter(c => {
      if (!c || !c.id || seenIds.has(c.id)) return false;
      const key = `${c.gradeId}_${c.name?.trim()}`;
      if (seenGradeName.has(key)) return false;
      seenIds.add(c.id);
      seenGradeName.add(key);
      return true;
    });
  };

  useEffect(() => {
    if (!currentUser) {
      setGrades([]);
      setClasses([]);
      setTeachers([]);
      setStudents([]);
      setSchoolName("");
      return;
    }

    // Reset previous account data immediately to guarantee strict isolation
    setGrades([]);
    setClasses([]);
    setTeachers([]);
    setStudents([]);
    // Check cached school name for instantaneous presentation during loading
    const cachedName = localStorage.getItem(`school_name_${currentUser.uid}`) || 
      (currentUser.email ? localStorage.getItem(`school_name_${currentUser.email.toLowerCase()}`) : null);
    if (cachedName) {
      setSchoolName(cachedName);
    } else {
      setSchoolName("");
    }

    setLoading(true);

    let unsubSchool: (() => void) | null = null;
    let unsubGrades: (() => void) | null = null;
    let unsubClasses: (() => void) | null = null;
    let unsubTeachers: (() => void) | null = null;
    let unsubStudents: (() => void) | null = null;

    try {
      // 1. Subscribe to School Name
      unsubSchool = subscribeToSchoolName((newName) => {
        if (newName) {
          setSchoolName(newName);
          if (currentUser.email) {
            localStorage.setItem(`school_name_${currentUser.email.toLowerCase()}`, newName);
          }
        } else {
          setSchoolName("");
        }
      });

      // 2. Subscribe to Grades
      unsubGrades = subscribeToGrades((newGrades) => {
        const safeList = Array.isArray(newGrades) ? newGrades : [];
        const sorted = deduplicateById([...safeList]).sort((a, b) => {
          const timeA = (a as any).createdAt || 0;
          const timeB = (b as any).createdAt || 0;
          if (timeA !== timeB) return timeA - timeB;
          return (a.name || "").localeCompare(b.name || "", "ar");
        });
        setGrades(sorted);
        setLoading(false);
      });

      // 3. Subscribe to Classes
      unsubClasses = subscribeToClasses((newClasses) => {
        const safeList = Array.isArray(newClasses) ? newClasses : [];
        const sorted = deduplicateClasses([...safeList]).sort((a, b) => {
          const numA = getNumberFromName(a.name);
          const numB = getNumberFromName(b.name);
          if (numA !== numB) return numA - numB;
          return (a.name || "").localeCompare(b.name || "", "ar");
        });
        setClasses(sorted);
      });

      // 4. Subscribe to Teachers
      unsubTeachers = subscribeToTeachers((newTeachers) => {
        const safeList = Array.isArray(newTeachers) ? newTeachers : [];
        const sorted = deduplicateById([...safeList]).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setTeachers(sorted);
      });

      // 5. Subscribe to Students
      unsubStudents = subscribeToStudents((newStudents) => {
        const safeList = Array.isArray(newStudents) ? newStudents : [];
        setStudents(deduplicateById(safeList));
      });

      // Turn off loading spinner quickly
      setTimeout(() => setLoading(false), 250);
    } catch (err) {
      console.error("Error doing database subscriptions:", err);
      setLoading(false);
    }

    return () => {
      if (unsubSchool) (unsubSchool as () => void)();
      if (unsubGrades) (unsubGrades as () => void)();
      if (unsubClasses) (unsubClasses as () => void)();
      if (unsubTeachers) (unsubTeachers as () => void)();
      if (unsubStudents) (unsubStudents as () => void)();
    };
  }, [currentUser]);

  const handleRefreshData = async () => {
    try {
      const [g, c, t, s, sn] = await Promise.all([
        getGrades(),
        getClasses(),
        getTeachers(),
        getStudents(),
        getSchoolName()
      ]);
      if (sn) setSchoolName(sn);
      const sortedGrades = deduplicateById([...g]).sort((a, b) => {
        const timeA = (a as any).createdAt || 0;
        const timeB = (b as any).createdAt || 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, "ar");
      });
      setGrades(sortedGrades);

      const sortedClasses = deduplicateClasses([...c]).sort((a, b) => {
        const numA = getNumberFromName(a.name);
        const numB = getNumberFromName(b.name);
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, "ar");
      });
      setClasses(sortedClasses);

      const sortedTeachers = deduplicateById([...t]).sort((a, b) => a.name.localeCompare(b.name, "ar"));
      setTeachers(sortedTeachers);

      setStudents(deduplicateById(s));
    } catch (err) {
      console.error("Error refreshing data:", err);
    }
  };

  const buildSharedUrl = (pageValue: string, extraParams: string = "") => {
    const ownerId = currentUser?.uid || auth.currentUser?.uid || localStorage.getItem("own_school_admin_id") || getOrCreateOwnSchoolAdminId();
    const ownerEmail = currentUser?.email || auth.currentUser?.email || "";
    
    let query = `page=${pageValue}`;
    if (extraParams) query += `&${extraParams}`;
    if (ownerId) query += `&owner=${encodeURIComponent(ownerId)}`;
    if (ownerEmail && !ownerEmail.endsWith("@school.com")) query += `&email=${encodeURIComponent(ownerEmail)}`;
    if (schoolName) query += `&school=${encodeURIComponent(schoolName)}`;

    return `${window.location.origin}${window.location.pathname}?${query}#/${pageValue}`;
  };

  // Robust clipboard copy function with textarea fallback for iframes and permissions
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn("navigator.clipboard failed, attempting fallback:", e);
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.style.opacity = "0";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("Fallback execCommand failed:", err);
      return false;
    }
  };

  const handleCopyStatsLink = () => {
    // 1. Synchronize in background (non-blocking)
    syncAllLocalDataToFirestore().catch(() => {});
    
    // 2. Perform copy immediately in user interaction thread
    const statsLink = buildSharedUrl("stats-only", "tab=stats");
    copyTextToClipboard(statsLink).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  const handleCopyTeacherLink = () => {
    // 1. Synchronize in background (non-blocking)
    syncAllLocalDataToFirestore().catch(() => {});
    
    // 2. Perform copy immediately in user interaction thread
    const teacherLink = buildSharedUrl("teacher", "tab=attendance");
    copyTextToClipboard(teacherLink).then((ok) => {
      if (ok) {
        setTeacherCopied(true);
        setTimeout(() => setTeacherCopied(false), 2000);
      }
    });
  };

  const handleCopyMorningDelayLink = () => {
    // 1. Synchronize in background (non-blocking)
    syncAllLocalDataToFirestore().catch(() => {});
    
    // 2. Perform copy immediately in user interaction thread
    const delayLink = buildSharedUrl("morning-delay");
    copyTextToClipboard(delayLink).then((ok) => {
      if (ok) {
        setMorningDelayCopied(true);
        setTimeout(() => setMorningDelayCopied(false), 2000);
      }
    });
  };

  const handleCopyAdminSyncLink = () => {
    syncAllLocalDataToFirestore().catch(() => {});
    const adminLink = buildSharedUrl("admin", "page=admin&tab=stats");
    copyTextToClipboard(adminLink).then((ok) => {
      if (ok) {
        setAdminSyncCopied(true);
        setTimeout(() => setAdminSyncCopied(false), 2500);
      }
    });
  };

  const handleCopySchoolCode = (code: string) => {
    copyTextToClipboard(code).then((ok) => {
      if (ok) {
        setSchoolCodeCopied(true);
        setTimeout(() => setSchoolCodeCopied(false), 2500);
      }
    });
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    try {
      const prevGuestUid = currentUser?.isGuest ? currentUser.uid : null;
      const res = await signInWithPopup(auth, googleProvider);
      const user = res.user;
      if (user && prevGuestUid && prevGuestUid !== user.uid) {
        await migrateGuestDataToUser(prevGuestUid, user.uid, user.email || "");
      }
      await syncAllLocalDataToFirestore();
      setAppMode("admin");
      setAdminTab("stats");
      localStorage.removeItem("last_admin_tab");
      window.history.replaceState({ mode: "admin" }, "", "/admin?page=admin&tab=stats#/admin");
      setIsSyncModalOpen(false);
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      if (err?.code === "auth/unauthorized-domain" || err?.message?.includes("unauthorized-domain")) {
        setLoginError("auth/unauthorized-domain");
      } else {
        setLoginError(err?.message || "حدث خطأ أثناء تسجيل الدخول");
      }
    }
  };

  const handleLinkSchoolCode = async (rawInput: string) => {
    if (!rawInput || !rawInput.trim()) {
      setSyncErrorMsg("الرجاء إدخال كود المزامنة أو الرابط المباشر");
      return;
    }

    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    setIsLinkingLoading(true);

    try {
      let targetCode = rawInput.trim();
      // If a full URL was pasted, extract owner or email parameter
      if (targetCode.includes("?") || targetCode.includes("#")) {
        try {
          const urlObj = new URL(targetCode.startsWith("http") ? targetCode : `https://${targetCode}`);
          const pOwner = urlObj.searchParams.get("owner") || urlObj.searchParams.get("ownerId") || urlObj.searchParams.get("uid");
          const pEmail = urlObj.searchParams.get("email") || urlObj.searchParams.get("ownerEmail");
          if (pOwner) targetCode = decodeURIComponent(pOwner);
          else if (pEmail) targetCode = decodeURIComponent(pEmail);
          else if (urlObj.hash.includes("?")) {
            const hashIdx = urlObj.hash.indexOf("?");
            const hashParams = new URLSearchParams(urlObj.hash.substring(hashIdx));
            const hOwner = hashParams.get("owner") || hashParams.get("ownerId") || hashParams.get("uid");
            const hEmail = hashParams.get("email") || hashParams.get("ownerEmail");
            if (hOwner) targetCode = decodeURIComponent(hOwner);
            else if (hEmail) targetCode = decodeURIComponent(hEmail);
          }
        } catch (e) {}
      }

      setLinkedSchoolOwnerId(targetCode);

      // Attempt to resolve profile from DB or use clean ID
      const resolved = await resolveOwnerProfileFromDb(targetCode);
      const updatedUser = {
        uid: resolved?.uid || targetCode,
        email: resolved?.email || (targetCode.includes("@") ? targetCode : `owner_${targetCode}@school.com`),
        displayName: resolved?.schoolName || "مدرسة متزامنة سحابياً",
        isGuest: true
      };

      setCurrentUser(updatedUser);
      setActiveUser(updatedUser);

      // Refresh data
      await handleRefreshData();

      setSyncSuccessMsg("تم ربط ومزامنة بيانات المدرسة بنجاح! تم تحميل الهيكل والصفوف وكافة البيانات.");
      setSyncCodeInput("");
    } catch (err: any) {
      console.error("Link error:", err);
      setSyncErrorMsg("حدث خطأ أثناء محاولة الربط: " + (err?.message || ""));
    } finally {
      setIsLinkingLoading(false);
    }
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
    if (currentUser && !loading && schoolName && appMode !== "stats-only" && appMode !== "teacher" && appMode !== "morning-delay") {
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

  // Direct to Admin Stats Dashboard (بوابة متابعة الغياب والسلوك) on initial login if no explicit page param
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (!searchParams.has("page")) {
      setAppMode("admin");
      setAdminTab("stats");
    }
  }, []);

  // Persist current mode and tabs to localStorage & keep URL state in perfect sync
  useEffect(() => {
    if (authChecking || !currentUser) return; // Only sync and persist when successfully logged in!

    if (appMode) {
      localStorage.setItem("last_app_mode", appMode);
    }
    if (teacherTab) {
      localStorage.setItem("last_teacher_tab", teacherTab);
    }
    if (adminTab) {
      localStorage.setItem("last_admin_tab", adminTab);
    }

    const currentSearch = new URLSearchParams(window.location.search);
    const hashIdx = window.location.hash.indexOf("?");
    const hashSearch = hashIdx !== -1 ? new URLSearchParams(window.location.hash.substring(hashIdx)) : null;

    const currentPage = currentSearch.get("page") || hashSearch?.get("page");
    const currentTab = currentSearch.get("tab") || hashSearch?.get("tab");
    const currentOwner = currentSearch.get("owner") || hashSearch?.get("owner");

    let expectedPage = "admin";
    if (appMode === "super-admin") expectedPage = "super-admin";
    else if (appMode === "stats-only") expectedPage = "stats-only";
    else if (appMode === "teacher") expectedPage = "teacher";
    else if (appMode === "morning-delay") expectedPage = "morning-delay";

    const expectedTab = appMode === "teacher" ? teacherTab : adminTab;

    if (currentPage !== expectedPage || (appMode !== "morning-delay" && currentTab !== expectedTab)) {
      const newPath = appMode === "admin" ? "/admin" : appMode === "super-admin" ? "/super-admin" : appMode === "morning-delay" ? "/morning-delay" : appMode === "stats-only" ? "/" : "/";
      const ownerPart = currentOwner ? `&owner=${currentOwner}` : "";
      const tabPart = appMode === "morning-delay" ? "" : `&tab=${expectedTab}`;
      const newSearch = `?page=${expectedPage}${tabPart}${ownerPart}`;
      const newHash = appMode === "admin" ? "#/admin" : appMode === "super-admin" ? "#/super-admin" : appMode === "morning-delay" ? "#/morning-delay" : appMode === "stats-only" ? "#/stats-only" : "#/";
      
      window.history.replaceState({ mode: appMode }, "", `${newPath}${newSearch}${newHash}`);
    }
  }, [appMode, adminTab, teacherTab, authChecking, currentUser]);

  // Update browser tab title and dynamic favicon icon based on active mode/tab
  useEffect(() => {
    let title = schoolName ? `بوابة ${schoolName}` : "البوابة الرقمية للرصد والمتابعة";
    let emoji = "🏫";
    
    if (appMode === "morning-delay") {
      title = schoolName ? `رصد التأخر الصباحي | ${schoolName}` : "رصد التأخر الصباحي | البوابة الرقمية";
      emoji = "⏰";
    } else if (appMode === "stats-only") {
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

  const navigateTo = (mode: "teacher" | "admin" | "stats-only" | "super-admin" | "morning-delay") => {
    const currentSearch = new URLSearchParams(window.location.search);
    const hashIdx = window.location.hash.indexOf("?");
    const hashSearch = hashIdx !== -1 ? new URLSearchParams(window.location.hash.substring(hashIdx)) : null;
    const currentOwner = currentSearch.get("owner") || hashSearch?.get("owner");
    const ownerPart = currentOwner ? `&owner=${currentOwner}` : "";

    const newPath = mode === "admin" ? "/admin" : mode === "super-admin" ? "/super-admin" : mode === "morning-delay" ? "/morning-delay" : mode === "stats-only" ? "/" : "/";
    const newSearch = mode === "admin" ? `?page=admin${ownerPart}` : mode === "super-admin" ? `?page=super-admin${ownerPart}` : mode === "morning-delay" ? `?page=morning-delay${ownerPart}` : mode === "stats-only" ? `?page=stats-only${ownerPart}` : `?page=teacher${ownerPart}`;
    const newHash = mode === "admin" ? "#/admin" : mode === "super-admin" ? "#/super-admin" : mode === "morning-delay" ? "#/morning-delay" : mode === "stats-only" ? "#/stats-only" : "#/";
    
    // Push state to browser history
    window.history.pushState({ mode }, "", `${newPath}${newSearch}${newHash}`);
    setAppMode(mode);

    // Keep right sidebar open when opening/switching links inside the control panel
    if (mode === "admin" || mode === "super-admin" || mode === "teacher" || mode === "morning-delay") {
      setIsSidebarOpen(true);
    }
  };

  if (authChecking || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-100" dir="rtl">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 space-y-5 shadow-2xl relative overflow-hidden animate-fadeIn backdrop-blur-md">
          {/* Decorative ambient glowing backdrops */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-indigo-500/10 rounded-full -ml-12 -mb-12 blur-2xl"></div>
          
          <div className="relative flex flex-col items-center">
            <div className="mx-auto bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 p-4 rounded-2xl text-white font-extrabold text-3xl shadow-lg shadow-indigo-950/50 w-fit mb-3 animate-bounce">
              🏫
            </div>
            
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-4" />
            
            {/* Welcome Badge */}
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold mb-3 shadow-inner">
              <span>✨</span>
              <span>مرحباً وأهلاً وسهلاً بك</span>
            </div>

            {/* School Name Title */}
            <h3 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-200 to-purple-300">
              {schoolName ? `بوابة ${schoolName}` : "البوابة الرقمية للرصد والمتابعة"}
            </h3>

            {/* School Name subtitle highlight if schoolName exists */}
            {schoolName && (
              <p className="text-xs font-bold text-indigo-400 mt-1">
                منصة {schoolName} لرصد ومتابعة الغياب والسلوك
              </p>
            )}
            
            <div className="mt-4 p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-2xl w-full text-slate-300">
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {authChecking 
                  ? "جاري التحقق من حالة تسجيل الدخول..." 
                  : schoolName 
                    ? `أهلاً بك مجدداً! جاري تحميل سجلات ${schoolName} والبيانات الحية...`
                    : "أهلاً بك! جاري تهيئة حسابك وحفظ اسم مدرستك وتحميل البيانات..."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Google Authentication Gate
  if (!currentUser) {
    const currentDomain = window.location.hostname;
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
            <ul className="text-[10px] sm:text-[11px] text-slate-300 space-y-2.5 font-semibold">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5 text-xs">•</span>
                <span className="leading-relaxed">
                  <strong className="text-slate-100 font-bold">رابط خاص للمعلمين:</strong> تسجيل غياب الطلاب عن الحصص ورصد الملاحظات السلوكية والمخالفات بشكل مباشر وسهل.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5 text-xs">•</span>
                <span className="leading-relaxed">
                  <strong className="text-slate-100 font-bold">متابعة الإدارة والمسؤول:</strong> تقوم الإدارة والمسؤول عن الغياب بمتابعة الغياب والملاحظات السلوكية واتخاذ الإجراءات اللازمة.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5 text-xs">•</span>
                <span className="leading-relaxed">
                  <strong className="text-slate-100 font-bold">إحصائيات وتقارير ذكية:</strong> لوحة تحكم تفاعلية توضح نسب الغياب ومستوى الانضباط العام والمؤشرات البيانية (خاصة بالإدارة).
                </span>
              </li>
            </ul>
          </div>

          {loginError && (
            <div className="bg-amber-950/40 border border-amber-600/50 text-amber-200 rounded-xl p-4 text-right text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>تنبيه نطاق غير مصرح به (Unauthorized Domain)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300 font-medium">
                مشروع Firebase الجديد الخاص بك (<code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">apsents</code>) يتطلب إضافة رابط التطبيق الحالي إلى قائمة النطاقات المعتمدة (Authorized Domains) في لوحة Firebase.
              </p>
              
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 font-bold block">رابط النطاق الحالي المطلوب إضافته:</span>
                <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <code className="text-[10px] font-mono text-blue-300 truncate dir-ltr flex-1">{currentDomain}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentDomain);
                      setDomainCopied(true);
                      setTimeout(() => setDomainCopied(false), 2000);
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[10px] flex items-center gap-1 transition cursor-pointer"
                  >
                    {domainCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{domainCopied ? "تم النسخ" : "نسخ"}</span>
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 leading-normal space-y-1 pt-1 border-t border-slate-800">
                <p className="font-bold text-slate-300">خطوات إضافة النطاق:</p>
                <ol className="list-decimal list-inside space-y-0.5 pr-1 text-slate-300">
                  <li>افتح <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-blue-400 underline font-bold">Firebase Console</a> واختر مشروع <code className="text-amber-300">apsents</code></li>
                  <li>انتقل إلى <strong className="text-slate-200">Authentication</strong> ثم علامة تبويب <strong className="text-slate-200">Settings</strong></li>
                  <li>اختر <strong className="text-slate-200">Authorized domains</strong> ثم اضغط <strong className="text-slate-200">Add domain</strong> وألصق النطاق أعلاه</li>
                </ol>
              </div>
            </div>
          )}

          {/* Google Login Button */}
          <button
            type="button"
            onClick={async () => {
              setLoginError(null);
              try {
                await signInWithPopup(auth, googleProvider);
                setAppMode("admin");
                setAdminTab("stats");
                localStorage.removeItem("last_admin_tab");
                window.history.replaceState({ mode: "admin" }, "", "/admin?page=admin&tab=stats#/admin");
              } catch (err: any) {
                console.error("Google Sign-In Error:", err);
                if (err?.code === "auth/unauthorized-domain" || err?.message?.includes("unauthorized-domain")) {
                  setLoginError("auth/unauthorized-domain");
                } else {
                  setLoginError(err?.message || "حدث خطأ أثناء تسجيل الدخول");
                }
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
      title: "",
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      items: [
        {
          id: "stats",
          label: "بوابة متابعة الغياب والسلوك",
          icon: <BarChart3 className="w-4 h-4" />,
          mode: "admin" as const,
          tab: "stats" as const
        }
      ]
    },
    {
      title: "",
      icon: <Users className="w-4 h-4 text-indigo-500" />,
      isGroupFrame: true,
      items: [
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
        },
        ...(currentUser?.email?.toLowerCase() === "majedsoft@gmail.com" ? [
          {
            id: "super-admin",
            label: "إدارة المشتركين والمسجلين 👑",
            icon: <Users className="w-4 h-4" />,
            mode: "super-admin" as const,
            tab: "users" as const
          }
        ] : [])
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
  const renderSidebarContent = (keyPrefix = "desktop") => {
    // Dynamic Onboarding Step Calculation for Sidebar Highlighting
    const hasGradesAndClasses = grades.length > 0 && classes.length > 0;
    const hasTeachers = teachers.length > 0;

    return (
      <div className="flex flex-col h-full justify-between p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <div className="space-y-6">
        {/* School Logo & Dynamic Name Card in Sidebar */}
        <div className="border-b border-slate-200/80 pb-4 space-y-3">
          <div className="flex items-center gap-3">
            <div id="sidebar-school-logo" className="bg-gradient-to-tr from-blue-600 to-indigo-700 p-2.5 rounded-xl text-white font-extrabold text-lg shadow-md shadow-blue-500/20 flex-shrink-0">
              🏫
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-black text-slate-800 tracking-wide">SmartSchool</h1>
              <span className="text-[10px] text-blue-600 font-bold block">بوابة الإدارة الرقمية</span>
            </div>
          </div>

          {/* School Name Badge / Inline Edit Card */}
          <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-2.5 space-y-1.5 shadow-3xs">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <span>🏫</span>
                <span>اسم المدرسة:</span>
              </span>
              {!isEditingSidebarSchool && !isSavingSchoolName && (
                <button
                  type="button"
                  id="btn-edit-school"
                  onClick={() => {
                    setSidebarSchoolInput(schoolName || "");
                    setIsEditingSidebarSchool(true);
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline cursor-pointer bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-3xs"
                  title="تعديل اسم المدرسة"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>تعديل</span>
                </button>
              )}
            </div>

            {isEditingSidebarSchool ? (
              <div className="space-y-2 mt-1">
                <input
                  type="text"
                  value={sidebarSchoolInput}
                  onChange={(e) => setSidebarSchoolInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const trimmed = sidebarSchoolInput.trim();
                      if (trimmed) {
                        await handleSchoolNameChange(trimmed);
                      }
                      setIsEditingSidebarSchool(false);
                    } else if (e.key === "Escape") {
                      setIsEditingSidebarSchool(false);
                    }
                  }}
                  className="w-full text-xs font-bold px-2.5 py-1.5 bg-white border border-blue-400 focus:border-indigo-600 focus:ring-2 focus:ring-blue-100 rounded-lg text-right text-slate-800 outline-none placeholder:text-slate-300"
                  placeholder="أدخل اسم المدرسة..."
                  autoFocus
                />
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      const trimmed = sidebarSchoolInput.trim();
                      if (trimmed) {
                        await handleSchoolNameChange(trimmed);
                      }
                      setIsEditingSidebarSchool(false);
                    }}
                    className="flex-1 py-1 px-2 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-3xs transition cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>حفظ الاسم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingSidebarSchool(false)}
                    className="py-1 px-2 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-md transition cursor-pointer flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>إلغاء</span>
                  </button>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => {
                  setSidebarSchoolInput(schoolName || "");
                  setIsEditingSidebarSchool(true);
                }}
                className="group flex items-center justify-between gap-2 p-1.5 bg-white rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition"
                title="اضغط للتعديل"
              >
                <span className={`text-xs font-extrabold truncate ${schoolName ? "text-slate-800" : "text-slate-400 italic"}`}>
                  {schoolName || "انقر هنا لكتابة اسم مدرستك..."}
                </span>
                {isSavingSchoolName ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
                ) : (
                  <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-blue-600 flex-shrink-0 transition" />
                )}
              </div>
            )}
          </div>
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
              <div 
                key={`${keyPrefix}-g-${gIdx}`} 
                className={group.isGroupFrame ? "bg-slate-50/90 border border-slate-200/90 rounded-xl p-2.5 space-y-2 shadow-3xs" : "space-y-2"}
              >
                {Boolean(group.title) && (
                  <div className="flex items-center gap-1.5 text-3xs font-extrabold text-slate-500 uppercase tracking-widest px-1">
                    {group.icon}
                    <span>{group.title}</span>
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isItemActive(item.mode, item.tab);
                    const isStats = item.id === "stats";
                    return (
                      <React.Fragment key={`${keyPrefix}-i-${item.id}`}>
                        <div 
                          className={isStats ? "bg-blue-50/50 rounded-xl p-2 border-2 border-blue-500/40 shadow-3xs space-y-2 relative overflow-hidden" : "space-y-1"}
                        >
                          {isStats && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-blue-500/80"></div>
                          )}
                          <button
                            onClick={() => handleMenuItemClick(item.mode, item.tab)}
                            id={`sidebar-${item.id}`}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer ${
                              active
                                ? "bg-[#5046e5] text-white shadow-md shadow-indigo-500/20"
                                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={active ? "text-white" : "text-slate-500"}>{item.icon}</span>
                              <span className={isStats ? "text-[11px]" : ""}>{item.label}</span>
                              {item.id === "students" && !hasGradesAndClasses && (
                                <span className="bg-amber-400 text-slate-900 text-[8px] px-1.5 py-0.5 rounded-md font-black animate-bounce">
                                  البدء هنا 👈
                                </span>
                              )}
                              {item.id === "teachers" && hasGradesAndClasses && !hasTeachers && (
                                <span className="bg-amber-400 text-slate-900 text-[8px] px-1.5 py-0.5 rounded-md font-black animate-bounce">
                                  اضغط هنا 👈
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
                                className="w-full flex items-center justify-between gap-1 text-[10px] text-blue-700 hover:text-blue-800 font-extrabold bg-white hover:bg-blue-50 border border-blue-200/80 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer shadow-3xs"
                                title="نسخ رابط صفحة متابعة الغياب والسلوك لمشاركتها مباشرة"
                              >
                                <div className="flex items-center gap-1.5">
                                  <Copy className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                                  <span>نسخ الرابط للمسؤول</span>
                                </div>
                                {copied ? (
                                  <span className="text-emerald-600 flex items-center gap-0.5 text-[9px] font-black">
                                    <Check className="w-3 h-3 animate-bounce" /> تم النسخ
                                  </span>
                                ) : (
                                  <ExternalLink className="w-3 h-3 text-slate-400" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {isStats && (
                          <>
                            <div 
                              id="sidebar-teacher-portal-container"
                              className="bg-purple-50/50 rounded-xl p-2 border-2 border-purple-500/40 shadow-3xs space-y-2 relative overflow-hidden mt-2"
                            >
                              <div className="absolute top-0 right-0 h-full w-1 bg-purple-500/80"></div>
                              <button
                                onClick={() => navigateTo("teacher")}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer ${
                                  appMode === "teacher"
                                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                                    : "text-slate-700 hover:bg-purple-100/60 hover:text-purple-900"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={appMode === "teacher" ? "text-white" : "text-purple-600"}><ClipboardCheck className="w-4 h-4" /></span>
                                  <span>بوابة تسجيل الغياب والسلوك</span>
                                </div>
                                {appMode === "teacher" && (
                                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                )}
                              </button>
                              
                              <div className="px-1">
                                <button
                                  type="button"
                                  id="btn-copy-teacher-link"
                                  onClick={handleCopyTeacherLink}
                                  className="w-full flex items-center justify-between gap-1 text-[10px] text-purple-700 hover:text-purple-800 font-extrabold bg-white hover:bg-purple-50 border border-purple-200/80 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer shadow-3xs"
                                  title="نسخ رابط تسجيل الغياب للمعلمين لمشاركته مباشرة"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                                    <span>نسخ الرابط للمعلمين</span>
                                  </div>
                                  {teacherCopied ? (
                                    <span className="text-emerald-600 flex items-center gap-0.5 text-[9px] font-black">
                                      <Check className="w-3 h-3 animate-bounce" /> تم النسخ
                                    </span>
                                  ) : (
                                    <ExternalLink className="w-3 h-3 text-slate-400" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Morning Delay Registration Portal Card (بوابة تسجيل التأخر الصباحي) */}
                            <div 
                              id="sidebar-morning-delay-portal-container"
                              className="bg-amber-50/60 rounded-xl p-2 border-2 border-amber-500/40 shadow-3xs space-y-2 relative overflow-hidden mt-2"
                            >
                              <div className="absolute top-0 right-0 h-full w-1 bg-amber-500/80"></div>
                              <button
                                onClick={() => navigateTo("morning-delay")}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-black transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer ${
                                  appMode === "morning-delay"
                                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                                    : "text-slate-700 hover:bg-amber-100/60 hover:text-amber-900"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={appMode === "morning-delay" ? "text-white" : "text-amber-600"}><Clock className="w-4 h-4" /></span>
                                  <span>بوابة تسجيل التأخر الصباحي</span>
                                </div>
                                {appMode === "morning-delay" && (
                                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                )}
                              </button>
                              
                              <div className="px-1">
                                <button
                                  type="button"
                                  id="btn-copy-morning-delay-link"
                                  onClick={handleCopyMorningDelayLink}
                                  className="w-full flex items-center justify-between gap-1 text-[10px] text-amber-800 hover:text-amber-900 font-extrabold bg-white hover:bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-1.5 transition-all duration-200 transform hover:translate-x-[-3px] cursor-pointer shadow-3xs"
                                  title="نسخ رابط تسجيل التأخر الصباحي لمشاركته مع المشرفين مباشرة"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Copy className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                                    <span>نسخ الرابط لمشرف التأخر</span>
                                  </div>
                                  {morningDelayCopied ? (
                                    <span className="text-emerald-600 flex items-center gap-0.5 text-[9px] font-black">
                                      <Check className="w-3 h-3 animate-bounce" /> تم النسخ
                                    </span>
                                  ) : (
                                    <ExternalLink className="w-3 h-3 text-slate-400" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Line divider with vertical margin to separate Student/Class/Teacher admin from Stats/Registration */}
                            <div className="my-5 border-t border-slate-200/80"></div>
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
      <div className="border-t border-slate-200/80 pt-4 mt-auto space-y-3 px-1">
        {/* Cloud Sync & Account Status Container */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 space-y-3 shadow-3xs">
          {/* User Profile Info / Status */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-full border ${currentUser?.isGuest ? 'border-amber-500 bg-amber-500 text-amber-950' : 'border-indigo-500 bg-indigo-600 text-white'} flex items-center justify-center font-extrabold text-sm flex-shrink-0 shadow-3xs`}>
              {currentUser?.isGuest ? <CloudOff className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
            </div>

            {/* Text details */}
            <div className="flex-1 min-w-0 text-right pr-0.5">
              <p className="text-xs font-black text-slate-800 tracking-tight truncate">
                {currentUser?.isGuest ? "إدارة المدرسة (مباشر)" : (currentUser?.displayName || "مدير المدرسة")}
              </p>
              <p className="text-[10px] text-slate-500 font-bold truncate mt-0.5" dir="ltr">
                {currentUser?.isGuest ? "غير مرتبط بحساب Google" : (currentUser?.email || "")}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-1">
            {currentUser?.isGuest ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl font-extrabold text-[11px] transition-all duration-200 cursor-pointer shadow-3xs"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.258-3.133C18.29 1.41 15.538 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.93 0 11.52-4.875 11.52-11.72 0-.788-.08-1.39-.18-1.995H12.24z"
                  />
                </svg>
                <span>تسجيل الدخول بـ Google</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  localStorage.removeItem("guest_user_session");
                  localStorage.removeItem("last_admin_tab");
                  try {
                    await signOut(auth);
                  } catch (err) {
                    console.error("Logout Error:", err);
                  }
                  setCurrentUser(null);
                  setAppMode("admin");
                  setAdminTab("stats");
                  window.history.replaceState({ mode: "admin" }, "", "/admin?page=admin&tab=stats#/admin");
                }}
                className="w-full flex items-center justify-start gap-2.5 px-3 py-2 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-600 hover:text-rose-700 rounded-xl transition-all duration-200 cursor-pointer"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <span className="font-extrabold text-[11px]">تسجيل الخروج</span>
              </button>
            )}
          </div>
        </div>


        
        {/* Footer info: SmartSchool & Copyright */}
        <div className="text-center space-y-1 pt-1.5 border-t border-slate-100">
          <p className="text-[11px] font-black text-indigo-900 tracking-wide">
            منصة <span className="font-extrabold text-blue-600">SmartSchool</span>
          </p>
          <p className="text-[9px] text-slate-500 font-bold">
            {schoolName ? `بوابة ${schoolName} الرقمية` : "البوابة الرقمية للرصد والمتابعة"}
          </p>
          <p className="text-[8px] text-slate-400 font-semibold">
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-100 via-blue-50/10 to-slate-200/40 font-sans text-slate-800" dir="rtl">
      
      {/* 1. PERMANENT FIXED RIGHT SIDEBAR FOR DESKTOP & TABLETS (≥768px) */}
      {showSidebar && (
        <aside className="hidden md:block fixed right-0 top-0 bottom-0 w-72 bg-white text-slate-800 border-l border-slate-200/90 z-40 shadow-xl overflow-hidden">
          {renderSidebarContent("desktop")}
        </aside>
      )}

      {/* 2. MAIN APP SECTION */}
      <div className={`flex-1 min-h-screen flex flex-col bg-gradient-to-b from-blue-50/40 via-slate-50 to-slate-100/60 ${showSidebar ? "md:mr-72" : ""}`}>
        


        {/* Dynamic Inner Portal Content */}
        <main className="flex-1 w-full max-w-none px-3 md:px-6 py-4 space-y-4">
          {/* Guest Cloud Sync Notice Banner */}
          {currentUser?.isGuest && appMode === "admin" && (
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-3.5 px-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 border border-indigo-700/50 animate-in fade-in">
              <div className="flex items-center gap-3 text-right w-full sm:w-auto">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 flex-shrink-0">
                  <CloudOff className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black">
                    البيانات الحالية تعمل بوضع محلي (غير مسجل بحساب Google)
                  </p>
                  <p className="text-[11px] text-slate-300 font-medium">
                    لمزامنة وتوحيد البيانات فورياً بين كلاود فلير وقوقل ستوديو والجوال، سجّل الدخول بـ Google أو اربط كود المزامنة.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="flex-1 sm:flex-initial py-2 px-3.5 bg-white hover:bg-slate-100 text-slate-900 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.258-3.133C18.29 1.41 15.538 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.93 0 11.52-4.875 11.52-11.72 0-.788-.08-1.39-.18-1.995H12.24z"
                    />
                  </svg>
                  <span>تسجيل الدخول بـ Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSyncSuccessMsg(null);
                    setSyncErrorMsg(null);
                    setIsSyncModalOpen(true);
                  }}
                  className="flex-1 sm:flex-initial py-2 px-3 bg-indigo-800/80 hover:bg-indigo-700 text-indigo-100 font-bold text-xs rounded-xl border border-indigo-600/60 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>كود المزامنة</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Mobile Permanent Inline Menu Card (Always visible at the top on phones <768px) */}
          {showSidebar && (
            <div className="md:hidden bg-white border border-slate-200/90 rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <span>📱</span>
                  <span>القائمة الرئيسية للنظام</span>
                </span>
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                  اختر من القائمة لعرض القسم بالأسفل 👇
                </span>
              </div>
              {renderSidebarContent("mobile")}
            </div>
          )}

          {/* Active View Container */}
          <div id="active-portal-view">
            {appMode === "super-admin" ? (
              <SuperAdminPanel
                currentUser={currentUser}
                onRefreshData={handleRefreshData}
                globalProgress={globalProgress}
                setGlobalProgress={setGlobalProgress}
              />
            ) : appMode === "morning-delay" ? (
              <MorningDelayPortal
                grades={grades}
                classes={classes}
                students={students}
                teachers={teachers}
                onRefreshData={handleRefreshData}
                navigateTo={navigateTo}
                schoolName={schoolName}
                isDirectLink={isDirectMorningDelayLink}
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
          </div>
        </main>

        {/* Styled Footer */}
        <footer className="bg-white border-t border-slate-200/80 py-4 px-6 text-center text-slate-500 text-xs mt-auto flex flex-col items-center justify-center gap-1">
          <p className="font-black text-slate-800 text-sm flex items-center justify-center gap-1.5">
            <span>🏫</span>
            <span>منصة <strong className="text-blue-600 font-black">SmartSchool</strong> الرقمية</span>
          </p>
          <p className="font-semibold text-slate-500 text-xs">
            {schoolName ? `بوابة ${schoolName}` : "البوابة الرقمية للمدرسة"}
          </p>
          <p className="font-medium text-slate-400 text-[11px] pt-0.5">
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
        </footer>
      </div>

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
      {appMode !== "teacher" && appMode !== "stats-only" && (
        <TourGuide
          isOpen={isTourOpen}
          onClose={() => setIsTourOpen(false)}
          appMode={appMode}
          setAppMode={setAppMode}
          setAdminTab={setAdminTab}
          setTeacherTab={setTeacherTab}
          setIsSidebarOpen={setIsSidebarOpen}
        />
      )}

      {/* Cloud Sync & Cross-Domain Link Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 max-w-lg w-full text-right space-y-6 shadow-2xl relative my-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-3xs flex-shrink-0">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    إعدادات المزامنة السحابية والربط
                  </h3>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    توحيد البيانات بين كلاود فلير وقوقل ستوديو والجوال
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status & Messages */}
            {syncSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
                <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>{syncSuccessMsg}</span>
              </div>
            )}

            {syncErrorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <span>{syncErrorMsg}</span>
              </div>
            )}

            {/* Current School Information Block */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">
                  معلومات المدرسة الحالية:
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  currentUser?.isGuest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {currentUser?.isGuest ? 'وضع محلي غير موثق' : 'حساب موثق ومزامن'}
                </span>
              </div>

              <div className="space-y-2 text-xs font-bold text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">اسم المدرسة:</span>
                  <span className="font-extrabold text-slate-800">{schoolName || "لم يحدد بعد"}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                  <span className="text-slate-400 flex-shrink-0">كود المزامنة (Sync Code):</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] font-mono text-indigo-700 select-all truncate">
                      {currentUser?.uid || "school_default"}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopySchoolCode(currentUser?.uid || "school_default")}
                      className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition flex-shrink-0 shadow-3xs"
                    >
                      {schoolCodeCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{schoolCodeCopied ? "تم" : "نسخ"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct Admin Sync Link Button */}
              <div className="pt-2 border-t border-slate-200/60">
                <button
                  type="button"
                  onClick={handleCopyAdminSyncLink}
                  className="w-full py-2 px-3 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 flex items-center justify-between cursor-pointer transition shadow-3xs"
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-indigo-600" />
                    <span>نسخ رابط لوحة التحكم المباشر مع معرّف المزامنة</span>
                  </div>
                  {adminSyncCopied ? (
                    <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> تم النسخ
                    </span>
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Method 1: Google Login (Fastest & Best) */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>الخيار الأول (الموصى به): تسجيل الدخول بحساب Google</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                سجّل الدخول بنفس حساب Google في كلوفلاير وفي قوقل ستوديو. سيتم ربط كافة البيانات تلقائياً، وتصبح متطابقة في كل مكان.
              </p>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-3 px-4 rounded-2xl flex items-center justify-center gap-3 text-xs shadow-md transition cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.258-3.133C18.29 1.41 15.538 0 12.24 0c-6.63 0-12 5.37-12 12s5.37 12 12 12c6.93 0 11.52-4.875 11.52-11.72 0-.788-.08-1.39-.18-1.995H12.24z"
                  />
                </svg>
                <span>{currentUser?.isGuest ? "تسجيل الدخول وربط البيانات السحابية" : "إعادة المزامنة بحساب Google"}</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full"></div>
              <span className="bg-white px-3 text-[11px] font-black text-slate-400 absolute">أو</span>
            </div>

            {/* Method 2: Link by Code / URL */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                <Key className="w-4 h-4 text-indigo-600" />
                <span>الخيار الثاني: ربط برمز مدرسة / كود المزامنة من متصفح آخر</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                إذا قمت بإنشاء الفصول على كلاود فلير (أو جهاز آخر)، انسخ كود المزامنة أو الرابط وألصقه هنا لتحميل الفصول فورياً:
              </p>
              
              <div className="space-y-2">
                <input
                  type="text"
                  value={syncCodeInput}
                  onChange={(e) => setSyncCodeInput(e.target.value)}
                  placeholder="ألصق كود المزامنة (مثل: school_xxxx أو الرابط)..."
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-xl text-right text-slate-800 outline-none transition"
                />
                
                <button
                  type="button"
                  disabled={isLinkingLoading || !syncCodeInput.trim()}
                  onClick={() => handleLinkSchoolCode(syncCodeInput)}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  {isLinkingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري المزامنة وتحميل البيانات...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>مزامنة وتحميل بيانات المدرسة فورياً</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authorized Domain Help Modal */}
      {loginError === "auth/unauthorized-domain" && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 max-w-md w-full text-right space-y-5 shadow-2xl relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-3xs flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">تفعيل النطاق في Firebase</h3>
                <p className="text-[11px] text-slate-500 font-bold">مطلوب خطوة واحدة فقط في لوحة تحكم Firebase</p>
              </div>
            </div>

            <div className="text-xs text-slate-700 font-medium space-y-3 leading-relaxed">
              <p>
                لتسجيل الدخول بـ Google على نطاق كلاود فلير الخاص بك، يرجى إضافة هذا النطاق إلى النطاقات المصرح بها في Firebase:
              </p>

              <div className="bg-slate-100 border border-slate-300 rounded-xl p-2.5 flex items-center justify-between">
                <code className="text-indigo-700 font-mono font-bold text-xs" dir="ltr">
                  {typeof window !== "undefined" ? window.location.hostname : "apsents.majedsoft.workers.dev"}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    const host = typeof window !== "undefined" ? window.location.hostname : "";
                    copyTextToClipboard(host);
                    setDomainCopied(true);
                    setTimeout(() => setDomainCopied(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-3xs flex items-center gap-1 cursor-pointer"
                >
                  {domainCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{domainCopied ? "تم النسخ" : "نسخ النطاق"}</span>
                </button>
              </div>

              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pr-1">
                <li>افتح <strong>Firebase Console</strong> ثم اختر مشروعك.</li>
                <li>انتقل إلى <strong>Authentication</strong> ثم تبويب <strong>Settings</strong>.</li>
                <li>انزل إلى <strong>Authorized domains</strong> واضغط <strong>Add domain</strong> وألصق النطاق.</li>
              </ol>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLoginError(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer"
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
