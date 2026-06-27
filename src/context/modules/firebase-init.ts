import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

let app = getApps()[0];
if (!app) {
  app = initializeApp(firebaseConfig);
}

const auth = getAuth(app);

/**
 * Firebase initialization helper: configures app, auth and firestore.
 * Uses a persistent Firestore cache.
 */

const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache(),
    });
  } catch (error) {
    console.warn(
      '[Firebase] Firestore init fallback to default transport',
      error,
    );
    return getFirestore(app);
  }
})();

export { app, auth, db };
export type { User as FirebaseUser } from 'firebase/auth';
