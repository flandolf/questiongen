import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  normalizeMcHistory,
  normalizeQuestionHistory,
  normalizeSavedSets,
} from '@/lib/persistence';
import { useAppStore } from '@/store';
import type { Preset, StreakData, StudyGoals } from '@/types';

import { auth, db } from '../firebase-init';

export interface UseSyncV3Return {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean; // Managed by Firestore internally, but we can show "active" status
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline' | 'connecting';
  lastSyncTime: number | null;
  syncError: string | null;
  pendingChanges: number; // Always 0 in V3 as writes are immediate
  pendingDeletions: number; // Always 0
  queuedOpsCount: number; // Always 0
  lastFlushTime: number | null;
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean
  ) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
}

export function useSyncV3(): UseSyncV3Return {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true); // Default to true if user is logged in
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'error' | 'offline' | 'connecting'
  >('idle');

  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  // Define callback functions first before using them in useEffect
  const cleanupListeners = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const manualRefreshData = useCallback(async (uid: string) => {
    try {
      // Fetch saved sets
      const savedSetsSnapshot = await getDocs(
        collection(db, `users/${uid}/savedSets`)
      );
      const sets = normalizeSavedSets(
        savedSetsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      useAppStore.setState({ savedSets: sets });

      // Fetch question history
      const qhSnapshot = await getDocs(
        collection(db, `users/${uid}/questionHistory`)
      );
      const qh = normalizeQuestionHistory(
        qhSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      useAppStore.setState({ questionHistory: qh });

      // Fetch MC history
      const mchSnapshot = await getDocs(
        collection(db, `users/${uid}/mcHistory`)
      );
      const mch = normalizeMcHistory(
        mchSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      useAppStore.setState({ mcHistory: mch });

      console.log('[FirebaseSync] Manual data refresh completed');
    } catch (error) {
      console.error('[FirebaseSync] Manual refresh error:', error);
    }
  }, []);

  const setupListeners = useCallback(
    (uid: string) => {
      cleanupListeners();
      setSyncStatus('syncing');

      try {
        // 1. Question History
        const qhUnsub = onSnapshot(
          collection(db, `users/${uid}/questionHistory`),
          (snapshot) => {
            try {
              const history = normalizeQuestionHistory(
                snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
              );
              useAppStore.setState({ questionHistory: history });
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing question history snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to question history:',
              error
            );
            setSyncStatus('error');
          }
        );

        // 2. MC History
        const mchUnsub = onSnapshot(
          collection(db, `users/${uid}/mcHistory`),
          (snapshot) => {
            try {
              const history = normalizeMcHistory(
                snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
              );
              useAppStore.setState({ mcHistory: history });
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing MC history snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to MC history:',
              error
            );
            setSyncStatus('error');
          }
        );

        // 3. Saved Sets
        const ssUnsub = onSnapshot(
          collection(db, `users/${uid}/savedSets`),
          (snapshot) => {
            try {
              const sets = normalizeSavedSets(
                snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
              );
              useAppStore.setState({ savedSets: sets });
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing saved sets snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to saved sets:',
              error
            );
            setSyncStatus('error');
          }
        );

        // 4. Settings - Main
        const settingsMainUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'main'),
          (snapshot) => {
            try {
              if (snapshot.exists()) {
                const data = snapshot.data() as { apiKey?: string };
                if (data?.apiKey) useAppStore.setState({ apiKey: data.apiKey });
              }
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing main settings snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to main settings:',
              error
            );
            setSyncStatus('error');
          }
        );

        // 5. Settings - Goals
        const settingsGoalsUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'goals'),
          (snapshot) => {
            try {
              if (snapshot.exists()) {
                const data = snapshot.data() as {
                  studyGoals?: StudyGoals;
                  streakData?: StreakData;
                };
                if (data?.studyGoals)
                  useAppStore.setState({
                    studyGoals: data.studyGoals,
                  });
                if (data?.streakData)
                  useAppStore.setState({
                    streakData: data.streakData,
                  });
              }
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing goals settings snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to goals settings:',
              error
            );
            setSyncStatus('error');
          }
        );

        // 6. Settings - Presets
        const settingsPresetsUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'presets'),
          (snapshot) => {
            try {
              if (snapshot.exists()) {
                const data = snapshot.data() as { presets?: Preset[] };
                if (data?.presets)
                  useAppStore.setState({ presets: data.presets });
              }
            } catch (error) {
              console.error(
                '[FirebaseSync] Error processing presets settings snapshot:',
                error
              );
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Error listening to presets settings:',
              error
            );
            setSyncStatus('error');
          }
        );

        unsubscribesRef.current = [
          qhUnsub,
          mchUnsub,
          ssUnsub,
          settingsMainUnsub,
          settingsGoalsUnsub,
          settingsPresetsUnsub,
        ];

        // Manually fetch data as a fallback to ensure we have the latest
        // This handles cases where listeners might not fire immediately
        manualRefreshData(uid).catch((err) => {
          console.error('[FirebaseSync] Manual refresh failed:', err);
        });

        setSyncStatus('idle');
        console.log(
          '[FirebaseSync] Listeners set up successfully for user:',
          uid
        );
      } catch (error) {
        console.error('[FirebaseSync] Error setting up listeners:', error);
        setSyncStatus('error');
      }
    },
    [cleanupListeners, manualRefreshData]
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);

      if (firebaseUser) {
        setupListeners(firebaseUser.uid);
      } else {
        cleanupListeners();
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupListeners();
    };
  }, [setupListeners, cleanupListeners]);

  // No periodic refresh needed as listeners handle real-time updates.
  // The initial manual refresh in setupListeners ensures we have data if listeners are slow to start.

  const enableSync = async (
    email: string,
    password: string,
    isSignUp = false
  ) => {
    setSyncStatus('connecting');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Note: onAuthStateChanged will trigger and setup listeners
    } catch (error) {
      setSyncStatus('error');
      throw error;
    }
  };

  const disableSync = async () => {
    await auth.signOut();
  };

  const toggleSync = () => {
    setIsSyncEnabled(!isSyncEnabled);
  };

  return {
    user,
    isLoading,
    isSyncing: syncStatus === 'syncing',
    isSyncEnabled,
    isOnline,
    syncStatus,
    lastSyncTime: Date.now(),
    syncError: null,
    pendingChanges: 0,
    pendingDeletions: 0,
    queuedOpsCount: 0,
    lastFlushTime: null,
    enableSync,
    disableSync,
    toggleSync,
  };
}
