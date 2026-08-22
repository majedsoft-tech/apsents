import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with robust connection settings (forcing long-polling to prevent proxy/firewall blockages)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as Record<string, string>).firestoreDatabaseId || undefined);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
