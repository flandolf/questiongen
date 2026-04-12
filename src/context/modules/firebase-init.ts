import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

let app = getApps()[0];
if (!app) {
  app = initializeApp(firebaseConfig);
  console.log('Firebase app initialized');
}

const auth = getAuth(app);
const storage = getStorage(app);

const isTauriRuntime =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

if (isTauriRuntime) {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith('firestore_')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn(
      '[Firebase] Failed to clear Firestore localStorage keys',
      error,
    );
  }
}

const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: isTauriRuntime
        ? memoryLocalCache()
        : persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
    });
  } catch (error) {
    console.warn(
      '[Firebase] Firestore init fallback to default transport',
      error,
    );
    return getFirestore(app);
  }
})();

console.log(
  'Firebase initialized, auth:',
  !!auth,
  'db:',
  !!db,
  'storage:',
  !!storage,
);

export { app, auth, db, storage };
export type { User as FirebaseUser } from 'firebase/auth';
