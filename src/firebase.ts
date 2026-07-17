import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAE53PHUU04iPCpiGQxcm9qDRTAzH57d8s",
  authDomain: "spheric-reporter-w07pf.firebaseapp.com",
  projectId: "spheric-reporter-w07pf",
  storageBucket: "spheric-reporter-w07pf.firebasestorage.app",
  messagingSenderId: "265490755228",
  appId: "1:265490755228:web:30a2daac6eeb1298dfc759"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom databaseId using getFirestore
export const db = getFirestore(app, "ai-studio-38440e4c-1e71-42b1-af20-9c43adb2b969");
