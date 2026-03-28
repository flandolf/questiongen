import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = getApps()[0];
if (!app) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase app initialized");
}

const auth = getAuth(app);
const isTauriRuntime =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const shouldForceLongPolling =
  isTauriRuntime
  || (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));

const db = (() => {
  try {
    if (shouldForceLongPolling) {
      console.log("[Firebase] Android detected; enabling Firestore long-polling transport");
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    }
    return getFirestore(app);
  } catch (error) {
    console.warn("[Firebase] Firestore init fallback to default transport", error);
    return getFirestore(app);
  }
})();

console.log("Firebase initialized, auth:", !!auth, "db:", !!db);

export { app, auth, db };
export type { User as FirebaseUser } from "firebase/auth";
