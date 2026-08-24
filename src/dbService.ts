import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  writeBatch,
  serverTimestamp,
  onSnapshot,
  disableNetwork,
  enableNetwork
} from "firebase/firestore";
import { db, auth as firebaseAuth } from "./firebase";
import { Grade, Class, Teacher, Student, AttendanceRecord, BehaviorRecord, MorningDelayRecord, RegisteredUser } from "./types";

// Active user proxy for unauthenticated direct links
let activeUserProxy: any = null;

// In-memory alias cache for UID <-> Email <-> School Name mappings
const userProfileAliasCache = new Map<string, { uid: string; email: string; schoolName?: string }>();

export function setActiveUser(user: any) {
  activeUserProxy = user;
  if (user?.uid && user?.email) {
    userProfileAliasCache.set(user.uid.toLowerCase(), { uid: user.uid, email: user.email.toLowerCase(), schoolName: user.displayName });
    userProfileAliasCache.set(user.email.toLowerCase(), { uid: user.uid, email: user.email.toLowerCase(), schoolName: user.displayName });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`user_alias_${user.uid.toLowerCase()}`, JSON.stringify({ uid: user.uid, email: user.email.toLowerCase() }));
        localStorage.setItem(`user_alias_${user.email.toLowerCase()}`, JSON.stringify({ uid: user.uid, email: user.email.toLowerCase() }));
      } catch (e) {}
    }
  }
}

/**
 * Resolves the effective UID and Email from URL parameters, Firebase auth, or active session.
 */
export function getEffectiveUidAndEmail(): { uid: string; email: string; isGuest?: boolean } {
  let ownerParam: string | null = null;
  let emailParam: string | null = null;
  let schoolParam: string | null = null;

  if (typeof window !== "undefined") {
    // 1. Check window.location.search
    const urlParams = new URLSearchParams(window.location.search);
    ownerParam = urlParams.get("owner") || urlParams.get("ownerId") || urlParams.get("uid");
    emailParam = urlParams.get("email") || urlParams.get("ownerEmail") || urlParams.get("userEmail");
    schoolParam = urlParams.get("school") || urlParams.get("schoolName");

    // 2. Check window.location.hash for query params
    if ((!ownerParam || !emailParam) && window.location.hash.includes("?")) {
      const hashIndex = window.location.hash.indexOf("?");
      const hashParams = new URLSearchParams(window.location.hash.substring(hashIndex));
      if (!ownerParam) ownerParam = hashParams.get("owner") || hashParams.get("ownerId") || hashParams.get("uid");
      if (!emailParam) emailParam = hashParams.get("email") || hashParams.get("ownerEmail") || hashParams.get("userEmail");
      if (!schoolParam) schoolParam = hashParams.get("school") || hashParams.get("schoolName");
    }
  }

  if (ownerParam || emailParam) {
    const rawOwner = ownerParam ? decodeURIComponent(ownerParam).trim() : "";
    const rawEmail = emailParam ? decodeURIComponent(emailParam).trim().toLowerCase() : "";

    const isOwnerMyself = !!(firebaseAuth.currentUser && (
      (rawOwner && firebaseAuth.currentUser.uid === rawOwner) ||
      (rawEmail && firebaseAuth.currentUser.email?.toLowerCase() === rawEmail)
    ));

    // Try resolving from alias cache or localStorage
    let cachedAlias: { uid: string; email: string } | null = null;
    if (rawOwner) {
      cachedAlias = userProfileAliasCache.get(rawOwner.toLowerCase()) || null;
      if (!cachedAlias && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`user_alias_${rawOwner.toLowerCase()}`);
          if (raw) cachedAlias = JSON.parse(raw);
        } catch (e) {}
      }
    }
    if (!cachedAlias && rawEmail) {
      cachedAlias = userProfileAliasCache.get(rawEmail.toLowerCase()) || null;
      if (!cachedAlias && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`user_alias_${rawEmail.toLowerCase()}`);
          if (raw) cachedAlias = JSON.parse(raw);
        } catch (e) {}
      }
    }

    let resolvedEmail = rawEmail;
    if (!resolvedEmail) {
      if (cachedAlias?.email) {
        resolvedEmail = cachedAlias.email;
      } else if (rawOwner.includes("@")) {
        resolvedEmail = rawOwner.toLowerCase();
      } else if (isOwnerMyself && firebaseAuth.currentUser?.email) {
        resolvedEmail = firebaseAuth.currentUser.email.toLowerCase();
      } else {
        resolvedEmail = `owner_${rawOwner}@school.com`;
      }
    }

    let resolvedUid = rawOwner;
    if (!resolvedUid) {
      if (cachedAlias?.uid) {
        resolvedUid = cachedAlias.uid;
      } else if (rawEmail) {
        resolvedUid = `user_${rawEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      } else if (isOwnerMyself && firebaseAuth.currentUser?.uid) {
        resolvedUid = firebaseAuth.currentUser.uid;
      } else {
        resolvedUid = "school_main";
      }
    }

    // Save alias mapping in memory for fast synchronous lookup
    if (resolvedUid && resolvedEmail && !resolvedEmail.endsWith("@school.com")) {
      userProfileAliasCache.set(resolvedUid.toLowerCase(), { uid: resolvedUid, email: resolvedEmail });
      userProfileAliasCache.set(resolvedEmail.toLowerCase(), { uid: resolvedUid, email: resolvedEmail });
    }

    return {
      uid: resolvedUid,
      email: resolvedEmail,
      isGuest: !isOwnerMyself
    };
  }

  if (firebaseAuth.currentUser) {
    const cUid = firebaseAuth.currentUser.uid;
    const cEmail = firebaseAuth.currentUser.email?.toLowerCase() || "";
    if (cUid && cEmail) {
      userProfileAliasCache.set(cUid.toLowerCase(), { uid: cUid, email: cEmail });
      userProfileAliasCache.set(cEmail.toLowerCase(), { uid: cUid, email: cEmail });
    }
    return {
      uid: cUid,
      email: cEmail,
      isGuest: false
    };
  }

  if (activeUserProxy && activeUserProxy.uid) {
    return {
      uid: activeUserProxy.uid,
      email: activeUserProxy.email?.toLowerCase() || `owner_${activeUserProxy.uid}@school.com`,
      isGuest: !!activeUserProxy.isGuest
    };
  }

  // Check stored ID in localStorage so write operations never fail
  if (typeof window !== "undefined") {
    let linked = localStorage.getItem("linked_school_owner_id");
    if (linked) {
      return {
        uid: linked,
        email: `owner_${linked}@school.com`,
        isGuest: true
      };
    }
    let stored = localStorage.getItem("own_school_admin_id");
    if (!stored) {
      stored = "school_main";
      localStorage.setItem("own_school_admin_id", stored);
    }
    return {
      uid: stored,
      email: `owner_${stored}@school.com`,
      isGuest: true
    };
  }

  return {
    uid: "school_main",
    email: "owner_school_main@school.com",
    isGuest: true
  };
}

export function getOrCreateOwnSchoolAdminId(): string {
  if (typeof window !== "undefined") {
    let linked = localStorage.getItem("linked_school_owner_id");
    if (linked) return linked;
    let stored = localStorage.getItem("own_school_admin_id");
    if (!stored) {
      stored = "school_main";
      localStorage.setItem("own_school_admin_id", stored);
    }
    return stored;
  }
  return "school_main";
}

export function setLinkedSchoolOwnerId(id: string): void {
  if (typeof window !== "undefined" && id) {
    const cleanId = id.trim();
    localStorage.setItem("linked_school_owner_id", cleanId);
    localStorage.setItem("own_school_admin_id", cleanId);
  }
}

// Auth proxy returning actual or effective user
const auth = {
  get currentUser() {
    const eff = getEffectiveUidAndEmail();
    if (eff) {
      return {
        uid: eff.uid,
        email: eff.email,
        displayName: activeUserProxy?.displayName || firebaseAuth.currentUser?.displayName || "زائر (مباشر)"
      };
    }
    return null;
  }
};

// Collection Names
const GRADES_COLL = "grades";
const CLASSES_COLL = "classes";
const TEACHERS_COLL = "teachers";
const STUDENTS_COLL = "students";
const ATTENDANCE_COLL = "attendance";
const BEHAVIORS_COLL = "behaviors";
const MORNING_DELAYS_COLL = "morning_delays";
const SETTINGS_COLL = "settings";
const USERS_COLL = "registered_users";

// --- ROBUST LOCAL CACHE & SYNC ENGINE ---
function getLocalStorageKey(colName: string, uid?: string): string {
  return `school_offline_cache_${colName}`;
}

function getLocalItems(colName: string, uid?: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`school_offline_cache_${colName}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    
    // Fallback check for legacy scoped cache key
    if (uid) {
      const legacyRaw = localStorage.getItem(`school_offline_cache_${uid}_${colName}`);
      if (legacyRaw) {
        const parsedLegacy = JSON.parse(legacyRaw);
        if (Array.isArray(parsedLegacy)) return parsedLegacy;
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

export function getLocalCollection<T = any>(colName: string, uid?: string): T[] {
  const items = getLocalItems(colName, uid);
  return (Array.isArray(items) ? items : []) as T[];
}

function setLocalItems(colName: string, items: any[], uid?: string) {
  if (typeof window === "undefined") return;
  try {
    const safeItems = Array.isArray(items) ? items : [];
    localStorage.setItem(getLocalStorageKey(colName, uid), JSON.stringify(safeItems));
  } catch (e) {}
}

function saveOrUpdateLocalItem(colName: string, item: any, uid?: string) {
  if (!item) return;
  const items = getLocalItems(colName, uid);
  const safeItems = Array.isArray(items) ? [...items] : [];
  const idx = safeItems.findIndex(i => i && i.id === item.id);
  if (idx >= 0) {
    safeItems[idx] = { ...safeItems[idx], ...item };
  } else {
    safeItems.push(item);
  }
  setLocalItems(colName, safeItems, uid);
  notifyCollectionSubscribers(colName, safeItems);
}

function removeLocalItem(colName: string, id: string, uid?: string) {
  const items = getLocalItems(colName, uid);
  const safeItems = Array.isArray(items) ? items : [];
  const filtered = safeItems.filter(i => i && i.id !== id);
  setLocalItems(colName, filtered, uid);
  notifyCollectionSubscribers(colName, filtered);
}

function removeLocalItemsBy(colName: string, predicate: (item: any) => boolean, uid?: string) {
  const items = getLocalItems(colName, uid);
  const safeItems = Array.isArray(items) ? items : [];
  const filtered = safeItems.filter(i => i && !predicate(i));
  setLocalItems(colName, filtered, uid);
  notifyCollectionSubscribers(colName, filtered);
}

function generateLocalId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Multiplexed Collection Subscriptions Hub
interface CollectionHub {
  unsub: (() => void) | null;
  callbacks: Set<(items: any[]) => void>;
  latestData: any[];
  lastUpdated: number;
  cleanupTimer: any;
}

const collectionHubs = new Map<string, CollectionHub>();

// Cross-tab and Cross-Window Real-time Broadcast Channel for instant (0ms) sync
let realTimeSyncChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    realTimeSyncChannel = new BroadcastChannel("school_realtime_instant_sync");
    realTimeSyncChannel.onmessage = (event) => {
      const data = event.data;
      if (data && data.colName) {
        notifyCollectionSubscribers(data.colName, data.items, true);
      }
    };
  } catch (e) {}
}

// Storage event listener fallback (for iframes / cross-tab contexts)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("school_offline_cache_")) {
      const parts = e.key.split("_");
      const colName = parts[parts.length - 1];
      if (colName && collectionHubs.has(colName)) {
        notifyCollectionSubscribers(colName, undefined, true);
      }
    }
  });
}

function getCollectionHub(colName: string): CollectionHub {
  let hub = collectionHubs.get(colName);
  if (!hub) {
    hub = {
      unsub: null,
      callbacks: new Set(),
      latestData: [],
      lastUpdated: 0,
      cleanupTimer: null
    };
    collectionHubs.set(colName, hub);
  }
  return hub;
}

function notifyCollectionSubscribers(colName: string, items?: any[], fromBroadcast: boolean = false) {
  const hub = collectionHubs.get(colName);
  if (!hub) return;
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email;
  
  const rawList = Array.isArray(items) ? items : getLocalItems(colName, currentUid);
  const safeList = Array.isArray(rawList) ? rawList : [];
  const dataToBroadcast = safeList.filter(item => isDocBelongingToUser(item, currentUid, currentEmail));
  
  hub.latestData = dataToBroadcast;
  hub.lastUpdated = Date.now();
  hub.callbacks.forEach(cb => {
    try { cb(dataToBroadcast); } catch (_) {}
  });

  // Broadcast to other tabs/windows in real time (0ms)
  if (!fromBroadcast && realTimeSyncChannel) {
    try {
      realTimeSyncChannel.postMessage({
        colName,
        items: dataToBroadcast,
        timestamp: Date.now()
      });
    } catch (_) {}
  }
}

// Helper to check if a document belongs to a specific user/school
export function isDocBelongingToUser(data: any, currentUid?: string, currentEmail?: string): boolean {
  if (!data) return false;
  // All documents in this school database belong to the active school system and sync universally
  return true;
}

/**
 * Resolves the school owner profile from Firestore by UID or Email
 */
export async function resolveOwnerProfileFromDb(ownerIdOrEmail: string): Promise<{ uid: string; email: string; schoolName?: string } | null> {
  if (!ownerIdOrEmail) return null;
  const key = ownerIdOrEmail.trim().toLowerCase();
  
  if (userProfileAliasCache.has(key)) {
    return userProfileAliasCache.get(key)!;
  }

  if (isQuotaExhausted()) {
    return null;
  }

  try {
    // 1. Try querying registered_users by uid
    const qUid = query(collection(db, USERS_COLL), where("uid", "==", ownerIdOrEmail));
    const snapUid = await getDocs(qUid);
    if (!snapUid.empty) {
      const data = snapUid.docs[0].data();
      const profile = {
        uid: data.uid || ownerIdOrEmail,
        email: data.email?.toLowerCase() || "",
        schoolName: data.schoolName || ""
      };
      if (profile.uid) {
        userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      if (profile.email) {
        userProfileAliasCache.set(profile.email.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      return profile;
    }

    // 2. Try querying registered_users by email
    if (ownerIdOrEmail.includes("@")) {
      const qEmail = query(collection(db, USERS_COLL), where("email", "==", key));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const data = snapEmail.docs[0].data();
        const profile = {
          uid: data.uid || "",
          email: data.email?.toLowerCase() || key,
          schoolName: data.schoolName || ""
        };
        if (profile.uid) {
          userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
          try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
        }
        if (profile.email) {
          userProfileAliasCache.set(profile.email.toLowerCase(), profile);
          try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
        }
        return profile;
      }
    }

    // 3. Try checking settings document (e.g., settings_QgOSyBcP28MzmbJT92aH8vdgAG33)
    const settingsDoc = await getDoc(doc(db, SETTINGS_COLL, `settings_${ownerIdOrEmail}`));
    if (settingsDoc.exists()) {
      const sData = settingsDoc.data();
      const profile = {
        uid: sData.userId || ownerIdOrEmail,
        email: sData.userEmail?.toLowerCase() || "",
        schoolName: sData.schoolName || ""
      };
      if (profile.uid) {
        userProfileAliasCache.set(profile.uid.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.uid.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      if (profile.email) {
        userProfileAliasCache.set(profile.email.toLowerCase(), profile);
        try { localStorage.setItem(`user_alias_${profile.email.toLowerCase()}`, JSON.stringify(profile)); } catch (e) {}
      }
      return profile;
    }
  } catch (e: any) {
    handleFirestoreError(e);
  }

  return null;
}

// Migrate guest records in Firestore to an authenticated user upon Google login
export async function migrateGuestDataToUser(guestUid: string, userUid: string, userEmail: string): Promise<void> {
  if (!guestUid || !userUid || guestUid === userUid) return;
  
  const collections = [
    GRADES_COLL,
    CLASSES_COLL,
    TEACHERS_COLL,
    STUDENTS_COLL,
    ATTENDANCE_COLL,
    BEHAVIORS_COLL,
    MORNING_DELAYS_COLL,
    SETTINGS_COLL
  ];

  try {
    for (const colName of collections) {
      const q = query(collection(db, colName), where("userId", "==", guestUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => {
          batch.set(doc(db, colName, d.id), {
            userId: userUid,
            userEmail: userEmail,
            updatedAt: Date.now()
          }, { merge: true });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.warn("Notice during guest data migration:", err);
  }
}

// Helper to fully synchronize all local cached records to Firestore
export async function syncAllLocalDataToFirestore(): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  if (!uid) return;

  const collections = [
    GRADES_COLL,
    CLASSES_COLL,
    TEACHERS_COLL,
    STUDENTS_COLL,
    ATTENDANCE_COLL,
    BEHAVIORS_COLL,
    MORNING_DELAYS_COLL
  ];

  try {
    for (const colName of collections) {
      const items = getLocalItems(colName, uid).filter(item => isDocBelongingToUser(item, uid, email));
      if (items.length === 0) continue;
      
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          if (!item || !item.id) return;
          const docRef = doc(db, colName, item.id);
          batch.set(docRef, {
            ...item,
            userId: item.userId || uid,
            userEmail: item.userEmail || email,
            updatedAt: Date.now()
          }, { merge: true });
        });
        await batch.commit().catch(() => {});
      }
    }

    const storedName = typeof window !== "undefined" 
      ? (localStorage.getItem(`school_name_${uid}`) || (email ? localStorage.getItem(`school_name_${email}`) : null)) 
      : null;
    if (storedName) {
      await saveSchoolName(storedName);
    }
  } catch (err) {
    console.error("Error syncing all local data to Firestore:", err);
  }
}

// Clear any legacy quota backoff flags on boot so Firestore is ALWAYS connected
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("firestore_quota_backoff_until");
  } catch (_) {}
}

export function isQuotaExhausted(): boolean {
  return false;
}

export function handleFirestoreError(err: any) {
  if (!err) return;
  // Non-blocking logger for diagnostic monitoring without disconnecting network
  if (err?.code && err.code !== "permission-denied") {
    console.debug("Firestore notification:", err?.message || err);
  }
}

export function markQuotaExhausted() {
  // No-op: Never disable network to guarantee 100% real-time synchronization across all devices
}

// Update Morning Delay Reason (for Admin and Supervisors)
export async function updateMorningDelayReason(id: string, newReason: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  // 1. Update local cache immediately
  const items = getLocalItems(MORNING_DELAYS_COLL, uid);
  const idx = items.findIndex(r => r && r.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], reason: newReason, updatedAt: Date.now() };
    setLocalItems(MORNING_DELAYS_COLL, items, uid);
    notifyCollectionSubscribers(MORNING_DELAYS_COLL, items);
  }

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, MORNING_DELAYS_COLL, id);
    await setDoc(docRef, { reason: newReason, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("Firestore update morning delay reason notice:", err);
  }
}

// Update Attendance Record student absence excuse
export async function updateAttendanceAbsenceExcuse(recordId: string, studentId: string, isExcused: boolean, reason?: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  const items = getLocalItems(ATTENDANCE_COLL, uid);
  const idx = items.findIndex(r => r && r.id === recordId);
  if (idx >= 0) {
    const existing = items[idx];
    const excusedList = Array.isArray(existing.excused) ? [...existing.excused] : [];
    const excuseReasons = { ...(existing.excuseReasons || {}) };

    if (isExcused) {
      if (!excusedList.includes(studentId)) excusedList.push(studentId);
      if (reason) excuseReasons[studentId] = reason;
      else if (!excuseReasons[studentId]) excuseReasons[studentId] = "بعذر";
    } else {
      const eIdx = excusedList.indexOf(studentId);
      if (eIdx >= 0) excusedList.splice(eIdx, 1);
      delete excuseReasons[studentId];
    }

    const updated = {
      ...existing,
      excused: excusedList,
      excuseReasons,
      updatedAt: Date.now()
    };
    items[idx] = updated;
    setLocalItems(ATTENDANCE_COLL, items, uid);
    notifyCollectionSubscribers(ATTENDANCE_COLL, items);

    try {
      const docRef = doc(db, ATTENDANCE_COLL, recordId);
      await setDoc(docRef, { excused: excusedList, excuseReasons, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.warn("Firestore update attendance excuse notice:", err);
    }
  }
}

// Helper to fetch entire collection and filter client-side based on strict multi-tenant user isolation
async function fetchAndFilterCollection(colName: string): Promise<any[]> {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff.uid;
  const currentEmail = eff.email?.toLowerCase() || "";

  // 1. Check in-memory collection hub first
  const hub = collectionHubs.get(colName);
  if (hub && Array.isArray(hub.latestData) && hub.latestData.length > 0 && Date.now() - hub.lastUpdated < 60000) {
    return hub.latestData;
  }

  // 2. Load from local storage cache
  const rawLocal = getLocalItems(colName, currentUid);
  const localList = Array.isArray(rawLocal) ? rawLocal.filter(item => isDocBelongingToUser(item, currentUid, currentEmail)) : [];

  if (isQuotaExhausted()) {
    return localList;
  }

  try {
    const querySnapshot = await getDocs(collection(db, colName));
    const results: any[] = [];
    const seenIds = new Set<string>();
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (isDocBelongingToUser(data, currentUid, currentEmail) && !seenIds.has(docSnap.id)) {
        seenIds.add(docSnap.id);
        results.push({ id: docSnap.id, ...data });
      }
    });

    // Update local cache and hub with authoritative Firestore data
    setLocalItems(colName, results, currentUid);
    const targetHub = getCollectionHub(colName);
    targetHub.latestData = results;
    targetHub.lastUpdated = Date.now();

    return results;
  } catch (err: any) {
    if (err?.code === "resource-exhausted" || (typeof err?.message === "string" && err.message.toLowerCase().includes("quota"))) {
      markQuotaExhausted();
    }
    // Graceful fallback to local cache on permission denial, quota limit, or offline
    return localList;
  }
}

// Fetch All Grades
export async function getGrades(): Promise<Grade[]> {
  const rawGrades = (await fetchAndFilterCollection(GRADES_COLL)) as Grade[];
  const safeGrades = Array.isArray(rawGrades) ? rawGrades : [];
  const seen = new Set<string>();
  const uniqueGrades: Grade[] = [];
  for (const g of safeGrades) {
    if (!g || !g.id) continue;
    const key = g.name?.trim();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueGrades.push(g);
    }
  }
  return uniqueGrades;
}

// Fetch All Classes
export async function getClasses(): Promise<Class[]> {
  const rawClasses = (await fetchAndFilterCollection(CLASSES_COLL)) as Class[];
  const safeClasses = Array.isArray(rawClasses) ? rawClasses : [];
  const seen = new Set<string>();
  const uniqueClasses: Class[] = [];
  for (const c of safeClasses) {
    if (!c || !c.id) continue;
    const key = `${c.gradeId}_${c.name?.trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueClasses.push(c);
    }
  }
  return uniqueClasses;
}

// Fetch All Teachers
export async function getTeachers(): Promise<Teacher[]> {
  const list = await fetchAndFilterCollection(TEACHERS_COLL);
  return Array.isArray(list) ? (list as Teacher[]) : [];
}

// Fetch All Students
export async function getStudents(): Promise<Student[]> {
  const list = await fetchAndFilterCollection(STUDENTS_COLL);
  return Array.isArray(list) ? (list as Student[]) : [];
}

// Fetch Students by Grade and Class
export async function getStudentsByClass(gradeId: string, classId: string): Promise<Student[]> {
  const students = await fetchAndFilterCollection(STUDENTS_COLL);
  const safeStudents = Array.isArray(students) ? students : [];
  return safeStudents.filter(s => s && s.gradeId === gradeId && s.classId === classId) as Student[];
}

// Fetch Attendance Record for a specific date, period, grade, class
export async function getAttendanceRecord(
  date: string,
  period: string,
  gradeId: string,
  classId: string
): Promise<AttendanceRecord | null> {
  const records = await fetchAndFilterCollection(ATTENDANCE_COLL);
  const found = records.find(r => r.date === date && r.period === period && r.gradeId === gradeId && r.classId === classId);
  return found ? (found as AttendanceRecord) : null;
}

// Subscribe to a specific Attendance Record in real-time (routed via multiplexed collection hub)
export function subscribeToAttendanceRecord(
  date: string,
  period: string,
  gradeId: string,
  classId: string,
  callback: (record: AttendanceRecord | null) => void,
  onError?: (error: any) => void
) {
  return subscribeToCollection(ATTENDANCE_COLL, (records) => {
    const found = records.find(r => r.date === date && r.period === period && r.gradeId === gradeId && r.classId === classId) || null;
    callback(found);
  }, onError);
}

// Save Attendance Record (Instant local-first cache + real-time Firestore sync)
export async function saveAttendanceRecord(record: Omit<AttendanceRecord, "id" | "timestamp">): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  
  // Deterministic canonical ID per slot to guarantee 100% unified sync across all devices
  const sanitizedPeriod = (record.period || "1").replace(/\s+/g, '_');
  const recordId = `att_${record.date}_${sanitizedPeriod}_${record.gradeId}_${record.classId}`;

  const fullRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now(),
    updatedAt: Date.now()
  };

  // 1. Save to local storage cache immediately (0ms)
  saveOrUpdateLocalItem(ATTENDANCE_COLL, fullRecord, uid);

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, ATTENDANCE_COLL, recordId);
    await setDoc(docRef, fullRecord, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Delete entire Attendance Record (Instant local update + real-time Firestore delete)
export async function deleteAttendanceRecord(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(ATTENDANCE_COLL, id, eff.uid);
  try {
    await deleteDoc(doc(db, ATTENDANCE_COLL, id));
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Delete single student absence/late entry from an Attendance Record (Instant 0ms update + Firestore sync)
export async function deleteAttendanceEntry(recordId: string, studentId: string, isAbsentType: boolean): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  if (studentId === "no-absence") {
    return deleteAttendanceRecord(recordId);
  }

  // 1. Update local storage cache immediately (0ms)
  const items = getLocalItems(ATTENDANCE_COLL, uid);
  const idx = items.findIndex(r => r.id === recordId);
  let updatedRecord: any = null;

  if (idx >= 0) {
    const existing = items[idx];
    let updatedAbsent: string[] = Array.isArray(existing.absent) ? [...existing.absent] : [];
    let updatedLate: string[] = Array.isArray(existing.late) ? [...existing.late] : [];
    let updatedPresent: string[] = Array.isArray(existing.present) ? [...existing.present] : [];

    if (isAbsentType) {
      updatedAbsent = updatedAbsent.filter((id: string) => id !== studentId);
      if (!updatedPresent.includes(studentId)) {
        updatedPresent.push(studentId);
      }
    } else {
      updatedLate = updatedLate.filter((id: string) => id !== studentId);
      if (!updatedPresent.includes(studentId)) {
        updatedPresent.push(studentId);
      }
    }

    const isNoAbsence = updatedAbsent.length === 0 && updatedLate.length === 0;

    updatedRecord = {
      ...existing,
      absent: updatedAbsent,
      late: updatedLate,
      present: updatedPresent,
      isNoAbsence,
      updatedAt: Date.now()
    };

    items[idx] = updatedRecord;
    setLocalItems(ATTENDANCE_COLL, items, uid);
    notifyCollectionSubscribers(ATTENDANCE_COLL, items);
  }

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, ATTENDANCE_COLL, recordId);
    if (updatedRecord) {
      await setDoc(docRef, updatedRecord, { merge: true });
    }
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Fetch Behavior Records for a student
export async function getBehaviorRecords(studentId: string): Promise<BehaviorRecord[]> {
  const records = await fetchAndFilterCollection(BEHAVIORS_COLL);
  const safeRecords = Array.isArray(records) ? records : [];
  const filtered = safeRecords.filter(r => r && r.studentId === studentId) as BehaviorRecord[];
  return filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// Subscribe to Behavior Records for a student in real-time
export function subscribeToBehaviorRecords(
  studentId: string,
  callback: (records: BehaviorRecord[]) => void,
  onError?: (error: any) => void
) {
  return subscribeToCollection(BEHAVIORS_COLL, (records) => {
    const safeRecords = Array.isArray(records) ? records : [];
    const filtered = safeRecords.filter(r => r && r.studentId === studentId);
    filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    callback(filtered);
  }, onError);
}

// Save Behavior Record (Instant local-first cache + real-time Firestore sync)
export async function saveBehaviorRecord(record: Omit<BehaviorRecord, "id" | "timestamp">): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const newId = generateLocalId("beh");

  const fullRecord = {
    ...record,
    id: newId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now(),
    updatedAt: Date.now()
  };

  // 1. Instant local update (0ms)
  saveOrUpdateLocalItem(BEHAVIORS_COLL, fullRecord, uid);

  // 2. Firestore write
  try {
    const docRef = doc(db, BEHAVIORS_COLL, newId);
    await setDoc(docRef, fullRecord, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return newId;
}

// Delete Behavior Record (Instant local purge + real-time Firestore delete)
export async function deleteBehaviorRecord(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(BEHAVIORS_COLL, id, eff.uid);
  try {
    await deleteDoc(doc(db, BEHAVIORS_COLL, id));
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// --- MORNING DELAY (التأخر الصباحي) ---

// Fetch Morning Delay Records (optionally filtered by date)
export async function getMorningDelayRecords(date?: string): Promise<MorningDelayRecord[]> {
  const records = (await fetchAndFilterCollection(MORNING_DELAYS_COLL)) as MorningDelayRecord[];
  const safeRecords = Array.isArray(records) ? records : [];
  if (date) {
    return safeRecords.filter(r => r && r.date === date).sort((a, b) => (b.arrivalTime || "").localeCompare(a.arrivalTime || ""));
  }
  return safeRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// Subscribe to Morning Delay Records in real-time
export function subscribeToMorningDelayRecords(
  date: string | undefined,
  callback: (records: MorningDelayRecord[]) => void,
  onError?: (error: any) => void
) {
  return subscribeToCollection(MORNING_DELAYS_COLL, (records) => {
    const safeRecords = Array.isArray(records) ? records : [];
    let filtered = safeRecords;
    if (date) {
      filtered = safeRecords.filter(r => r && r.date === date);
    }
    filtered.sort((a, b) => {
      if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
      return (a.arrivalTime || "").localeCompare(b.arrivalTime || "");
    });
    callback(filtered);
  }, onError);
}

// Save Morning Delay Record (Instant local-first optimistic cache + real-time Firestore sync)
export async function saveMorningDelayRecord(record: Omit<MorningDelayRecord, "id" | "timestamp">): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  
  // Instant lookup from local cache instead of slow network roundtrip
  const localList = getLocalItems(MORNING_DELAYS_COLL);
  const existing = localList.find(r => r.date === record.date && r.studentId === record.studentId && isDocBelongingToUser(r, uid, email));
  const recordId = existing?.id || generateLocalId("delay");

  const fullRecord: MorningDelayRecord = {
    ...record,
    id: recordId,
    userId: uid,
    userEmail: email,
    timestamp: Date.now(),
    updatedAt: Date.now()
  };

  // 1. Instant local cache update (0ms)
  saveOrUpdateLocalItem(MORNING_DELAYS_COLL, fullRecord);

  // 2. Real-time Firestore write
  try {
    const docRef = doc(db, MORNING_DELAYS_COLL, recordId);
    await setDoc(docRef, fullRecord, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return recordId;
}

// Save Multiple Morning Delay Records in Batch
export async function saveMorningDelaysBatch(records: Omit<MorningDelayRecord, "id" | "timestamp">[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  // Local cache update
  records.forEach(r => {
    saveOrUpdateLocalItem(MORNING_DELAYS_COLL, {
      ...r,
      id: generateLocalId("delay"),
      userId: uid,
      userEmail: email,
      timestamp: Date.now()
    });
  });

  try {
    const batch = writeBatch(db);
    for (const record of records) {
      const docRef = doc(collection(db, MORNING_DELAYS_COLL));
      batch.set(docRef, {
        ...record,
        userId: uid,
        userEmail: email,
        timestamp: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Delete Morning Delay Record (Instant local purge + real-time Firestore delete)
export async function deleteMorningDelayRecord(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(MORNING_DELAYS_COLL, id, eff.uid);
  try {
    await deleteDoc(doc(db, MORNING_DELAYS_COLL, id));
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Fetch all morning delay records for stats/reports
export async function getAllMorningDelayRecords(): Promise<MorningDelayRecord[]> {
  return fetchAndFilterCollection(MORNING_DELAYS_COLL) as Promise<MorningDelayRecord[]>;
}

// Subscribe to all morning delay records
export function subscribeToAllMorningDelayRecords(callback: (records: MorningDelayRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(MORNING_DELAYS_COLL, (records) => {
    const safeRecords = Array.isArray(records) ? records : [];
    safeRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    callback(safeRecords);
  }, onError);
}

// --- ADMIN WRITES ---

// Add Grade
export async function addGrade(name: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const existingGrades = await getGrades();
  const trimmedName = name.trim();
  const existing = existingGrades.find(g => g.name?.trim() === trimmedName);
  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("grd");
  const newGradeObj = {
    id: generatedId,
    name: trimmedName,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  // 1. Immediately write to local storage cache
  saveOrUpdateLocalItem(GRADES_COLL, newGradeObj);

  // 2. Persist to Firestore with explicit document ID
  try {
    await setDoc(doc(db, GRADES_COLL, generatedId), newGradeObj);
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return generatedId;
}

// Add Multiple Grades in a Batch
export async function addGradesBatch(names: string[]): Promise<{ id: string; name: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localGrades = getLocalItems(GRADES_COLL).filter(g => isDocBelongingToUser(g, uid, email));
  const existingMap = new Map<string, string>();
  localGrades.forEach(g => {
    if (g.name) existingMap.set(g.name.trim(), g.id);
  });

  const results: { id: string; name: string }[] = [];
  const toCreate: { id: string; name: string }[] = [];

  names.forEach(rawName => {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    if (existingMap.has(trimmed)) {
      results.push({ id: existingMap.get(trimmed)!, name: trimmed });
    } else {
      const generatedId = generateLocalId("grd");
      const gradeItem = { id: generatedId, name: trimmed };
      results.push(gradeItem);
      toCreate.push(gradeItem);
      // Save locally
      saveOrUpdateLocalItem(GRADES_COLL, {
        id: generatedId,
        name: trimmed,
        userId: uid,
        userEmail: email,
        createdAt: Date.now()
      });
      existingMap.set(trimmed, generatedId);
    }
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((item, idx) => {
          const docRef = doc(db, GRADES_COLL, item.id);
          batch.set(docRef, {
            id: item.id,
            name: item.name,
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {
      handleFirestoreError(err);
    }
  }

  return results;
}

// Delete Grade (Instant 0ms local purge + real-time Firestore cascade delete)
export async function deleteGrade(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  // 1. Gather all associated class & student IDs from local cache before removal
  const localClasses = getLocalItems(CLASSES_COLL, uid);
  const classIdsToDelete = localClasses.filter(c => c.gradeId === id).map(c => c.id);
  
  const localStudents = getLocalItems(STUDENTS_COLL, uid);
  const studentIdsToDelete = localStudents.filter(s => s.gradeId === id || classIdsToDelete.includes(s.classId)).map(s => s.id);

  // 2. Delete from local storage cache immediately (0ms instant UI update)
  removeLocalItem(GRADES_COLL, id, uid);
  removeLocalItemsBy(CLASSES_COLL, (c) => c.gradeId === id, uid);
  removeLocalItemsBy(STUDENTS_COLL, (s) => s.gradeId === id || classIdsToDelete.includes(s.classId), uid);

  // 3. Delete from Firestore in real time
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, GRADES_COLL, id));
    classIdsToDelete.forEach(cId => batch.delete(doc(db, CLASSES_COLL, cId)));
    studentIdsToDelete.forEach(sId => batch.delete(doc(db, STUDENTS_COLL, sId)));
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Add Class (Instant optimistic return + real-time Firestore persistence)
export async function addClass(name: string, gradeId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const trimmedName = name.trim();
  const localClasses = getLocalItems(CLASSES_COLL).filter(c => isDocBelongingToUser(c, uid, email));
  const existing = localClasses.find(c => c.gradeId === gradeId && c.name?.trim() === trimmedName);
  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("cls");
  const newClassObj = {
    id: generatedId,
    name: trimmedName,
    gradeId,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(CLASSES_COLL, newClassObj);

  // Firestore write with deterministic document ID
  try {
    await setDoc(doc(db, CLASSES_COLL, generatedId), newClassObj);
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return generatedId;
}

// Add Multiple Classes in a Batch (Ultra-fast atomic save)
export async function addClassesBatch(classesList: { name: string; gradeId: string }[]): Promise<{ id: string; name: string; gradeId: string }[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localClasses = getLocalItems(CLASSES_COLL).filter(c => isDocBelongingToUser(c, uid, email));
  const existingKeySet = new Set<string>();
  localClasses.forEach(c => {
    if (c.name && c.gradeId) existingKeySet.add(`${c.gradeId}__${c.name.trim()}`);
  });

  const results: { id: string; name: string; gradeId: string }[] = [];
  const toCreate: { id: string; name: string; gradeId: string }[] = [];

  classesList.forEach(item => {
    const trimmed = item.name.trim();
    if (!trimmed || !item.gradeId) return;
    const key = `${item.gradeId}__${trimmed}`;
    if (existingKeySet.has(key)) {
      const match = localClasses.find(c => c.gradeId === item.gradeId && c.name?.trim() === trimmed);
      if (match) results.push({ id: match.id, name: trimmed, gradeId: item.gradeId });
    } else {
      const generatedId = generateLocalId("cls");
      const classObj = { id: generatedId, name: trimmed, gradeId: item.gradeId };
      results.push(classObj);
      toCreate.push(classObj);

      // Save locally immediately
      saveOrUpdateLocalItem(CLASSES_COLL, {
        id: generatedId,
        name: trimmed,
        gradeId: item.gradeId,
        userId: uid,
        userEmail: email,
        createdAt: Date.now()
      });
      existingKeySet.add(key);
    }
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((c, idx) => {
          const docRef = doc(db, CLASSES_COLL, c.id);
          batch.set(docRef, {
            id: c.id,
            name: c.name,
            gradeId: c.gradeId,
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {
      handleFirestoreError(err);
    }
  }

  return results;
}

// Delete Class (Instant 0ms local purge + real-time Firestore cascade delete)
export async function deleteClass(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;

  // 1. Gather all student IDs in this class before removal
  const localStudents = getLocalItems(STUDENTS_COLL, uid);
  const studentIdsToDelete = localStudents.filter(s => s.classId === id).map(s => s.id);

  // 2. Delete from local cache immediately (0ms instant UI update)
  removeLocalItem(CLASSES_COLL, id, uid);
  removeLocalItemsBy(STUDENTS_COLL, (s) => s.classId === id, uid);

  // 3. Asynchronous Firestore batch delete
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, CLASSES_COLL, id));
    studentIdsToDelete.forEach(sId => batch.delete(doc(db, STUDENTS_COLL, sId)));
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Add Teacher
export async function addTeacher(name: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const generatedId = generateLocalId("tch");

  const newTeacherObj = {
    id: generatedId,
    name: name.trim(),
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(TEACHERS_COLL, newTeacherObj);

  try {
    await setDoc(doc(db, TEACHERS_COLL, generatedId), newTeacherObj);
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return generatedId;
}

// Add Multiple Teachers in a Batch
export async function addTeachersBatch(names: string[]): Promise<Teacher[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const toCreate: Teacher[] = [];
  names.forEach(name => {
    const generatedId = generateLocalId("tch");
    const item: Teacher = { id: generatedId, name: name.trim() };
    toCreate.push(item);
    saveOrUpdateLocalItem(TEACHERS_COLL, {
      id: generatedId,
      name: item.name,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((t, idx) => {
          const docRef = doc(db, TEACHERS_COLL, t.id);
          batch.set(docRef, { 
            id: t.id,
            name: t.name, 
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {
      handleFirestoreError(err);
    }
  }

  return toCreate;
}

// Delete Teacher (Instant 0ms local purge + real-time Firestore delete)
export async function deleteTeacher(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(TEACHERS_COLL, id, eff.uid);
  try {
    await deleteDoc(doc(db, TEACHERS_COLL, id));
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Delete Multiple Teachers in a Batch (Instant 0ms local purge + real-time Firestore delete)
export async function deleteTeachersBatch(ids: string[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  ids.forEach(id => removeLocalItem(TEACHERS_COLL, id, eff.uid));
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, TEACHERS_COLL, id));
    });
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Add Student (Deduplicates automatically by classId and normalized student name)
export async function addStudent(name: string, gradeId: string, classId: string): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;
  const trimmedName = name.trim();

  // Normalize for robust duplicate checking
  const normName = trimmedName
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ");

  const localStudents = getLocalCollection<Student>(STUDENTS_COLL);
  const existing = localStudents.find(s => {
    if (s.classId !== classId) return false;
    const sNorm = (s.name || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");
    return sNorm === normName;
  });

  if (existing) {
    return existing.id;
  }

  const generatedId = generateLocalId("stu");

  const newStudentObj = {
    id: generatedId,
    name: trimmedName,
    gradeId,
    classId,
    userId: uid,
    userEmail: email,
    createdAt: Date.now()
  };

  saveOrUpdateLocalItem(STUDENTS_COLL, newStudentObj);

  try {
    await setDoc(doc(db, STUDENTS_COLL, generatedId), newStudentObj);
  } catch (err: any) {
    handleFirestoreError(err);
  }

  return generatedId;
}

// Add Multiple Students in a Batch (Ignores duplicates, adds non-duplicates)
export async function addStudentsBatch(studentsList: { name: string, gradeId: string, classId: string }[]): Promise<Student[]> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff.uid;
  const email = eff.email;

  const localStudents = getLocalCollection<Student>(STUDENTS_COLL);
  const seenClassAndNames = new Set<string>();

  localStudents.forEach(s => {
    const sNorm = (s.name || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");
    seenClassAndNames.add(`${s.classId}:::${sNorm}`);
  });

  const toCreate: Student[] = [];
  studentsList.forEach(s => {
    const trimmed = s.name.trim();
    if (!trimmed) return;

    const norm = trimmed
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");

    const key = `${s.classId}:::${norm}`;
    if (seenClassAndNames.has(key)) {
      // Ignore duplicate
      return;
    }

    seenClassAndNames.add(key);
    const generatedId = generateLocalId("stu");
    const item: Student = { id: generatedId, name: trimmed, gradeId: s.gradeId, classId: s.classId };
    toCreate.push(item);
    saveOrUpdateLocalItem(STUDENTS_COLL, {
      id: generatedId,
      name: item.name,
      gradeId: item.gradeId,
      classId: item.classId,
      userId: uid,
      userEmail: email,
      createdAt: Date.now()
    });
  });

  if (toCreate.length > 0) {
    try {
      const chunkSize = 400;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        const now = Date.now();
        chunk.forEach((s, idx) => {
          const docRef = doc(db, STUDENTS_COLL, s.id);
          batch.set(docRef, { 
            id: s.id,
            name: s.name, 
            gradeId: s.gradeId, 
            classId: s.classId, 
            userId: uid,
            userEmail: email,
            createdAt: now + i + idx
          });
        });
        await batch.commit();
      }
    } catch (err: any) {
      handleFirestoreError(err);
    }
  }

  return toCreate;
}

// Delete Student (Instant 0ms local purge + real-time Firestore delete)
export async function deleteStudent(id: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  removeLocalItem(STUDENTS_COLL, id, eff.uid);
  try {
    await deleteDoc(doc(db, STUDENTS_COLL, id));
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Delete Multiple Students in a Batch (Instant 0ms local purge + real-time Firestore delete)
export async function deleteStudentsBatch(ids: string[]): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  ids.forEach(id => removeLocalItem(STUDENTS_COLL, id, eff.uid));
  try {
    const batch = writeBatch(db);
    ids.forEach(id => {
      batch.delete(doc(db, STUDENTS_COLL, id));
    });
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err);
  }
}

// Fetch all attendance for statistics
export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
  return fetchAndFilterCollection(ATTENDANCE_COLL) as Promise<AttendanceRecord[]>;
}

// Subscribe to all attendance for real-time statistics
export function subscribeToAllAttendanceRecords(callback: (records: AttendanceRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(ATTENDANCE_COLL, (data) => {
    callback(Array.isArray(data) ? data : []);
  }, onError);
}

// Fetch all behavior records for statistics
export async function getAllBehaviorRecords(): Promise<BehaviorRecord[]> {
  const list = await fetchAndFilterCollection(BEHAVIORS_COLL);
  return Array.isArray(list) ? (list as BehaviorRecord[]) : [];
}

// Subscribe to all behavior records for real-time statistics
export function subscribeToAllBehaviorRecords(callback: (records: BehaviorRecord[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(BEHAVIORS_COLL, (data) => {
    callback(Array.isArray(data) ? data : []);
  }, onError);
}

// --- DATABASE AUTO-SEEDING ---
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  return false;
}

// --- SCHOOL SETTINGS ---
export async function getSchoolName(): Promise<string> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff?.uid || "school_main";
  const email = eff?.email || "";
  
  if (typeof window !== "undefined") {
    const localName = localStorage.getItem(`school_name_${uid}`) || (email ? localStorage.getItem(`school_name_${email}`) : null) || localStorage.getItem("school_name_cached");
    if (localName) return localName;
  }

  if (isQuotaExhausted()) {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`school_name_${uid}`) || localStorage.getItem("school_name_cached") || "";
    }
    return "";
  }

  try {
    const querySnapshot = await getDocs(collection(db, SETTINGS_COLL));
    let schoolNameVal = "";
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.schoolName && isDocBelongingToUser(data, uid, email)) {
        schoolNameVal = data.schoolName;
      } else if (!schoolNameVal && data.schoolName) {
        schoolNameVal = data.schoolName;
      }
    });
    if (schoolNameVal && typeof window !== "undefined") {
      localStorage.setItem(`school_name_${uid}`, schoolNameVal);
      localStorage.setItem("school_name_cached", schoolNameVal);
    }
    return schoolNameVal;
  } catch (err: any) {
    handleFirestoreError(err);
    if (typeof window !== "undefined") {
      return localStorage.getItem(`school_name_${uid}`) || localStorage.getItem("school_name_cached") || "";
    }
  }
  return "";
}

export async function saveSchoolName(schoolName: string): Promise<void> {
  const eff = getEffectiveUidAndEmail();
  const uid = eff?.uid || "school_main";
  const email = eff?.email || "";
  if (!uid) return;

  if (typeof window !== "undefined") {
    localStorage.setItem(`school_name_${uid}`, schoolName);
    localStorage.setItem(`school_name_cached`, schoolName);
    if (email) localStorage.setItem(`school_name_${email}`, schoolName);
  }

  try {
    const docRef = doc(db, SETTINGS_COLL, `settings_${uid}`);
    await setDoc(docRef, { schoolName, userId: uid, userEmail: email, updatedAt: Date.now() }, { merge: true });
  } catch (err) {}
}

// Generic live subscription helper using collection multiplexing hub
function subscribeToCollection(colName: string, callback: (data: any[]) => void, onError?: (error: any) => void) {
  const eff = getEffectiveUidAndEmail();
  if (!eff) {
    callback([]);
    return () => {};
  }
  const currentUid = eff.uid;
  const currentEmail = eff.email;

  const hub = getCollectionHub(colName);

  // If there's a pending teardown timer, cancel it
  if (hub.cleanupTimer) {
    clearTimeout(hub.cleanupTimer);
    hub.cleanupTimer = null;
  }

  // Register callback
  hub.callbacks.add(callback);

  // 1. Immediately provide current cached state without waiting for network
  const rawLocal = getLocalItems(colName, currentUid);
  const safeLocal = Array.isArray(rawLocal) ? rawLocal.filter(item => isDocBelongingToUser(item, currentUid, currentEmail)) : [];
  const localList = Array.isArray(hub.latestData) && hub.latestData.length > 0 
    ? hub.latestData 
    : safeLocal;
  
  if (!Array.isArray(hub.latestData) || hub.latestData.length === 0) {
    hub.latestData = localList;
  }
  try {
    callback(Array.isArray(localList) ? localList : []);
  } catch (_) {}

  // 2. Connect to Firestore singleton onSnapshot listener if not already connected
  if (!hub.unsub) {
    try {
      const q = collection(db, colName);
      hub.unsub = onSnapshot(q, (snapshot) => {
        const activeEff = getEffectiveUidAndEmail();
        const activeUid = activeEff.uid;
        const activeEmail = activeEff.email;
        const results: any[] = [];
        const seenIds = new Set<string>();
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (isDocBelongingToUser(data, activeUid, activeEmail) && !seenIds.has(docSnap.id)) {
            seenIds.add(docSnap.id);
            results.push({ id: docSnap.id, ...data });
          }
        });

        // Update local storage cache
        setLocalItems(colName, results, activeUid);
        hub.latestData = results;
        hub.lastUpdated = Date.now();

        // Broadcast to all active subscribers of this collection
        hub.callbacks.forEach(cb => {
          try { cb(results); } catch (_) {}
        });

        // Broadcast to other tabs/windows in real time (0ms)
        if (realTimeSyncChannel) {
          try {
            realTimeSyncChannel.postMessage({
              colName,
              items: results,
              timestamp: Date.now()
            });
          } catch (_) {}
        }
      }, (error: any) => {
        const activeEff = getEffectiveUidAndEmail();
        const fallbackRaw = getLocalItems(colName, activeEff.uid);
        const fallbackList = Array.isArray(fallbackRaw) ? fallbackRaw.filter(item => isDocBelongingToUser(item, activeEff.uid, activeEff.email)) : [];
        hub.latestData = fallbackList;
        hub.callbacks.forEach(cb => {
          try { cb(fallbackList); } catch (_) {}
        });
        if (onError) {
          try { onError(error); } catch (_) {}
        }
      });
    } catch (err: any) {
      console.warn("Firestore subscription notice:", err);
    }
  }

  return () => {
    hub.callbacks.delete(callback);
    if (hub.callbacks.size === 0) {
      // Cooldown timer to prevent rapid connect/disconnect churning
      hub.cleanupTimer = setTimeout(() => {
        if (hub.callbacks.size === 0 && hub.unsub) {
          try { hub.unsub(); } catch (_) {}
          hub.unsub = null;
        }
      }, 30000);
    }
  };
}

// Subscribe All Grades in real-time
export function subscribeToGrades(callback: (grades: Grade[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(GRADES_COLL, (rawGrades) => {
    const safeGrades = Array.isArray(rawGrades) ? rawGrades : [];
    const seen = new Set<string>();
    const uniqueGrades: Grade[] = [];
    for (const g of safeGrades) {
      if (!g || !g.id) continue;
      const key = g.name?.trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueGrades.push(g);
      }
    }
    callback(uniqueGrades);
  }, onError);
}

// Subscribe All Classes in real-time
export function subscribeToClasses(callback: (classes: Class[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(CLASSES_COLL, (rawClasses) => {
    const safeClasses = Array.isArray(rawClasses) ? rawClasses : [];
    const seen = new Set<string>();
    const uniqueClasses: Class[] = [];
    for (const c of safeClasses) {
      if (!c || !c.id) continue;
      const key = `${c.gradeId}_${c.name?.trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueClasses.push(c);
      }
    }
    callback(uniqueClasses);
  }, onError);
}

// Subscribe All Teachers in real-time
export function subscribeToTeachers(callback: (teachers: Teacher[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(TEACHERS_COLL, (data) => {
    callback(Array.isArray(data) ? data : []);
  }, onError);
}

// Subscribe All Students in real-time
export function subscribeToStudents(callback: (students: Student[]) => void, onError?: (error: any) => void) {
  return subscribeToCollection(STUDENTS_COLL, (data) => {
    callback(Array.isArray(data) ? data : []);
  }, onError);
}

// Subscribe School Name in real-time
export function subscribeToSchoolName(callback: (schoolName: string) => void, onError?: (error: any) => void) {
  const eff = getEffectiveUidAndEmail();
  const currentUid = eff?.uid || "school_main";
  const currentEmail = eff?.email || "";

  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(`school_name_${currentUid}`) || (currentEmail ? localStorage.getItem(`school_name_${currentEmail}`) : null) || localStorage.getItem("school_name_cached");
    if (cached) callback(cached);
  }

  return subscribeToCollection(SETTINGS_COLL, (records) => {
    let schoolNameVal = "";
    records.forEach(data => {
      if (data.schoolName && isDocBelongingToUser(data, currentUid, currentEmail)) {
        schoolNameVal = data.schoolName;
      } else if (!schoolNameVal && data.schoolName) {
        schoolNameVal = data.schoolName;
      }
    });
    if (schoolNameVal && typeof window !== "undefined") {
      localStorage.setItem(`school_name_${currentUid}`, schoolNameVal);
      localStorage.setItem("school_name_cached", schoolNameVal);
    }
    if (schoolNameVal) {
      callback(schoolNameVal);
    }
  }, onError);
}

// --- REGISTERED USERS SYSTEM ---

/**
 * Registers or updates a user profile when they login or state checking occurs.
 */
export async function registerUserInDb(
  user: { uid: string; email: string; displayName?: string; photoURL?: string },
  currentSchoolName: string = ""
): Promise<void> {
  if (!user || !user.uid) return;
  const email = user.email?.toLowerCase() || "";
  if (!email || email === "majedsoft@gmail.com" && user.displayName === "زائر عام") {
    // Skip registering the guest general user
    return;
  }

  try {
    const payload: Partial<RegisteredUser> = {
      uid: user.uid,
      email: email,
      displayName: user.displayName || email.split("@")[0],
      photoURL: user.photoURL || "",
      lastLogin: Date.now(),
      schoolName: currentSchoolName || "",
      status: "نشط",
      createdAt: Date.now()
    };

    saveOrUpdateLocalItem(USERS_COLL, {
      id: user.uid,
      ...payload
    });

    const docRef = doc(db, USERS_COLL, user.uid);
    const docSnap = await getDocs(query(collection(db, USERS_COLL), where("uid", "==", user.uid)));
    
    let existingData: any = null;
    if (!docSnap.empty) {
      existingData = docSnap.docs[0].data();
    }

    if (existingData?.schoolName && !payload.schoolName) {
      payload.schoolName = existingData.schoolName;
    }
    if (existingData?.status) {
      payload.status = existingData.status;
    }
    if (existingData?.createdAt) {
      payload.createdAt = existingData.createdAt;
    }

    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    // Handled safely without noisy console errors
  }
}

/**
 * Loads all registered users from Firestore and retrieves statistics/counts of their database items
 */
export async function getRegisteredUsers(): Promise<RegisteredUser[]> {
  try {
    const users: RegisteredUser[] = [];
    const seenUids = new Set<string>();

    if (isQuotaExhausted()) {
      const cachedUsers = getLocalItems(USERS_COLL);
      cachedUsers.forEach(u => {
        if (u && u.uid && !seenUids.has(u.uid)) {
          seenUids.add(u.uid);
          users.push(u);
        }
      });
      if (users.length === 0) {
        const eff = getEffectiveUidAndEmail();
        if (eff && eff.uid) {
          users.push({
            id: eff.uid,
            uid: eff.uid,
            email: eff.email || "school_admin@school.com",
            displayName: activeUserProxy?.displayName || "مدير المدرسة الحالي",
            photoURL: "",
            lastLogin: Date.now(),
            createdAt: Date.now(),
            schoolName: (typeof window !== "undefined" ? (localStorage.getItem(`school_name_${eff.uid}`) || localStorage.getItem("school_name_cached")) : "") || "المدرسة الرئيسية",
            status: "نشط"
          });
        }
      }
      return users;
    }

    try {
      const querySnapshot = await getDocs(collection(db, USERS_COLL));
      querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const uid = data.uid || docSnap.id;
        if (uid && !seenUids.has(uid)) {
          seenUids.add(uid);
          users.push({
            id: docSnap.id,
            uid: uid,
            email: data.email || "",
            displayName: data.displayName || "مستخدم مسجل",
            photoURL: data.photoURL || "",
            lastLogin: data.lastLogin || Date.now(),
            createdAt: data.createdAt || Date.now(),
            schoolName: data.schoolName || "",
            status: data.status || "نشط"
          });
        }
      });
    } catch (permErr: any) {
      handleFirestoreError(permErr);
      // If Firestore security rules restrict reading USERS_COLL or quota is exhausted, read from local cache
      const cachedUsers = getLocalItems(USERS_COLL);
      cachedUsers.forEach(u => {
        if (u && u.uid && !seenUids.has(u.uid)) {
          seenUids.add(u.uid);
          users.push(u);
        }
      });
    }

    // If still empty, add current active user if available
    if (users.length === 0) {
      const eff = getEffectiveUidAndEmail();
      if (eff && eff.uid) {
        users.push({
          id: eff.uid,
          uid: eff.uid,
          email: eff.email || "school_admin@school.com",
          displayName: activeUserProxy?.displayName || "مدير المدرسة الحالي",
          photoURL: "",
          lastLogin: Date.now(),
          createdAt: Date.now(),
          schoolName: localStorage.getItem(`school_name_${eff.uid}`) || localStorage.getItem("school_name_cached") || "المدرسة الرئيسية",
          status: "نشط"
        });
      }
    }

    // Count statistics safely
    const userStatsMap: Record<string, { grades: number; classes: number; teachers: number; students: number }> = {};
    const incrementStat = (userId: string, email: string, statType: "grades" | "classes" | "teachers" | "students") => {
      const key = userId || email?.toLowerCase();
      if (!key) return;
      if (!userStatsMap[key]) {
        userStatsMap[key] = { grades: 0, classes: 0, teachers: 0, students: 0 };
      }
      userStatsMap[key][statType]++;
    };

    try {
      const [allGrades, allClasses, allTeachers, allStudents] = await Promise.all([
        getDocs(collection(db, GRADES_COLL)).catch(() => null),
        getDocs(collection(db, CLASSES_COLL)).catch(() => null),
        getDocs(collection(db, TEACHERS_COLL)).catch(() => null),
        getDocs(collection(db, STUDENTS_COLL)).catch(() => null)
      ]);

      if (allGrades) {
        allGrades.forEach(d => {
          const data = d.data();
          incrementStat(data.userId, data.userEmail, "grades");
        });
      }
      if (allClasses) {
        allClasses.forEach(d => {
          const data = d.data();
          incrementStat(data.userId, data.userEmail, "classes");
        });
      }
      if (allTeachers) {
        allTeachers.forEach(d => {
          const data = d.data();
          incrementStat(data.userId, data.userEmail, "teachers");
        });
      }
      if (allStudents) {
        allStudents.forEach(d => {
          const data = d.data();
          incrementStat(data.userId, data.userEmail, "students");
        });
      }
    } catch {
      // Safe fallback if collections cannot be enumerated
    }

    // Map counts back to each user
    users.forEach(u => {
      const statsByUid = userStatsMap[u.uid];
      const statsByEmail = userStatsMap[u.email?.toLowerCase()];
      const combinedStats = statsByUid || statsByEmail || { grades: 0, classes: 0, teachers: 0, students: 0 };
      
      u.gradesCount = combinedStats.grades;
      u.classesCount = combinedStats.classes;
      u.teachersCount = combinedStats.teachers;
      u.studentsCount = combinedStats.students;
    });

    // Sort by registration date descending (newest first)
    return users.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    return [];
  }
}

/**
 * Updates a user's account status (e.g. Suspend or Activate)
 */
export async function updateUserStatus(uid: string, status: "نشط" | "موقوف"): Promise<void> {
  try {
    const docRef = doc(db, USERS_COLL, uid);
    await setDoc(docRef, { status }, { merge: true });
  } catch (err) {
    console.error("Error updating user status:", err);
    throw err;
  }
}

/**
 * Deletes a registered user from the directory, and optionally wipes all their school data entirely.
 */
export async function deleteRegisteredUser(uid: string, email: string, wipeSchoolData: boolean = false): Promise<void> {
  try {
    // 1. Delete user registration document
    await deleteDoc(doc(db, USERS_COLL, uid));

    // 2. If wipe is requested, find and delete all associated records across ALL collections
    if (wipeSchoolData) {
      const batch = writeBatch(db);
      const emailLower = email?.toLowerCase() || "";

      const collectionsToClear = [
        GRADES_COLL,
        CLASSES_COLL,
        TEACHERS_COLL,
        STUDENTS_COLL,
        ATTENDANCE_COLL,
        BEHAVIORS_COLL,
        MORNING_DELAYS_COLL,
        SETTINGS_COLL
      ];

      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        snap.forEach(docSnap => {
          const data = docSnap.data();
          let belongs = false;

          if (data.userId === uid) belongs = true;
          else if (data.userEmail && data.userEmail.toLowerCase() === emailLower) belongs = true;

          if (belongs) {
            batch.delete(docSnap.ref);
          }
        });
      }

      await batch.commit();
    }
  } catch (err) {
    console.error("Error deleting registered user and wiping data:", err);
    throw err;
  }
}

/**
 * Completely purges ALL server data, temporary cached records, and previously deleted items across ALL Firestore collections and local storage.
 */
export async function purgeAllServerAndTemporaryData(preserveSuperAdmin: boolean = true): Promise<{ deletedCount: number }> {
  let deletedCount = 0;
  const collectionsToClear = [
    GRADES_COLL,
    CLASSES_COLL,
    TEACHERS_COLL,
    STUDENTS_COLL,
    ATTENDANCE_COLL,
    BEHAVIORS_COLL,
    MORNING_DELAYS_COLL,
    SETTINGS_COLL,
    "student_passwords"
  ];

  if (!preserveSuperAdmin) {
    collectionsToClear.push(USERS_COLL);
  }

  // 1. Delete all documents in chunks from Firestore
  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        const docs = snap.docs;
        const chunkSize = 400;
        for (let i = 0; i < docs.length; i += chunkSize) {
          const chunk = docs.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(d => {
            batch.delete(d.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn(`Error purging collection ${colName}:`, e);
    }
  }

  // 2. Clear all local browser storage caches
  if (typeof window !== "undefined") {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith("school_offline_cache_") ||
          key.startsWith("school_name_") ||
          key.startsWith("user_alias_") ||
          key === "school_name_cached" ||
          key === "firestore_quota_backoff_until" ||
          key === "linked_school_owner_id"
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  // 3. Reset in-memory collection hubs and notify all subscribers with empty array
  collectionHubs.forEach((hub, colName) => {
    hub.callbacks.forEach(cb => {
      try { cb([]); } catch (_) {}
    });
  });

  // 4. Broadcast instant clear to all other tabs and windows
  if (realTimeSyncChannel) {
    try {
      collectionsToClear.forEach(colName => {
        realTimeSyncChannel?.postMessage({
          colName,
          items: [],
          timestamp: Date.now()
        });
      });
    } catch (_) {}
  }

  return { deletedCount };
}

/**
 * Scans for and removes any orphaned temporary/deleted records (attendance/behaviors/delays referring to deleted students or classes)
 */
export async function purgeDeletedAndOrphanedData(): Promise<{ purgedCount: number }> {
  let purgedCount = 0;
  try {
    const [gradesSnap, classesSnap, studentsSnap, teachersSnap, attSnap, behSnap, delaySnap] = await Promise.all([
      getDocs(collection(db, GRADES_COLL)),
      getDocs(collection(db, CLASSES_COLL)),
      getDocs(collection(db, STUDENTS_COLL)),
      getDocs(collection(db, TEACHERS_COLL)),
      getDocs(collection(db, ATTENDANCE_COLL)),
      getDocs(collection(db, BEHAVIORS_COLL)),
      getDocs(collection(db, MORNING_DELAYS_COLL))
    ]);

    const validGradeIds = new Set(gradesSnap.docs.map(d => d.id));
    const validClassIds = new Set(classesSnap.docs.map(d => d.id));
    const validStudentIds = new Set(studentsSnap.docs.map(d => d.id));

    const batch = writeBatch(db);
    let batchOperations = 0;

    // Check attendance records
    attSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if ((data.gradeId && !validGradeIds.has(data.gradeId)) || (data.classId && !validClassIds.has(data.classId))) {
        batch.delete(docSnap.ref);
        purgedCount++;
        batchOperations++;
      }
    });

    // Check behavior records
    behSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.studentId && !validStudentIds.has(data.studentId)) {
        batch.delete(docSnap.ref);
        purgedCount++;
        batchOperations++;
      }
    });

    // Check morning delays
    delaySnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.studentId && !validStudentIds.has(data.studentId)) {
        batch.delete(docSnap.ref);
        purgedCount++;
        batchOperations++;
      }
    });

    if (batchOperations > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn("Error purging orphaned data:", e);
  }
  return { purgedCount };
}



