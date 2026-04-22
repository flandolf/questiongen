import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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

/**
 * Firebase initialization helper: configures app, auth, firestore and
 * storage. Uses a persistent Firestore cache.
 */

const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(),
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
