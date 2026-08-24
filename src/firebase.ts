import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  setLogLevel
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Suppress internal Firestore network and quota exhaustion backoff logs in console
try {
  setLogLevel("silent");
} catch (_) {}

// Explicit Firebase Project Configuration provided by user
export const firebaseConfig = {
  apiKey: "AIzaSyCWABVdUWYt49PQXT1duAttR0ql8043yNs",
  authDomain: "apsents.firebaseapp.com",
  projectId: "apsents",
  storageBucket: "apsents.firebasestorage.app",
  messagingSenderId: "717724738568",
  appId: "1:717724738568:web:a8f6ca1b77f80c30ed1dbd",
  measurementId: "G-GBSB6SX96T"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with IndexedDB local persistence and multi-tab sync
// This prevents quota exhaustion by serving reads directly from the IndexedDB cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  }),
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
});

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

