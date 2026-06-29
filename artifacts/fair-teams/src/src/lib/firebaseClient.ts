import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDGWZI6T-RQAch8YMon-kcFV36T-XksEbw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "fair-teams-dev.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "fair-teams-dev",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "fair-teams-dev.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "690217542710",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:690217542710:web:d6cd620a6ea4ad1e8ba497",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

export function getFairTeamsFirebaseApp() {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFairTeamsAuth() {
  if (!auth) {
    auth = getAuth(getFairTeamsFirebaseApp());
  }
  return auth;
}

export function getFairTeamsFirestore() {
  if (!firestore) {
    firestore = getFirestore(getFairTeamsFirebaseApp());
  }
  return firestore;
}

export function getFirebaseProjectId() {
  return firebaseConfig.projectId;
}
