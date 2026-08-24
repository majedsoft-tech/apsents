import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with standard real-time WebSocket connection
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

