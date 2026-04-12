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
  isSavedSetComplete,
  normalizeMcHistory,
  normalizeQuestionHistory,
  normalizeSavedSet,
} from '@/lib/persistence';
import { useAppStore } from '@/store';
import type { Preset, StreakData, StudyGoals } from '@/types';

import { auth, db } from '../firebase-init';
import { deleteSavedSet as v3DeleteSavedSet } from './mutations';

export interface UseSyncV3Return {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean; // Managed by Firestore internally, but we can show "active" status
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline' | 'connecting';
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean
  ) => Promise<void>;
  disableSync: () => Promise<void>;
}

export function useSyncV3(): UseSyncV3Return {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'error' | 'offline' | 'connecting'
  >('idle');

  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const activeUidRef = useRef<string | null>(null);
  const recoveryInFlightRef = useRef(false);
  const lastRecoveryAttemptAtRef = useRef(0);
  const RECOVERY_COOLDOWN_MS = 10_000;

  // Define callback functions first before using them in useEffect
  const cleanupListeners = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const syncSavedSetsFromRaw = useCallback((rawSavedSets: unknown[]) => {
    const parsedSavedSets = rawSavedSets
      .map((entry) => normalizeSavedSet(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const completedSavedSetIds = parsedSavedSets
      .filter((entry) => isSavedSetComplete(entry))
      .map((entry) => entry.id);

    useAppStore.setState({
      savedSets: parsedSavedSets.filter((entry) => !isSavedSetComplete(entry)),
    });

    completedSavedSetIds.forEach((id) => {
      void v3DeleteSavedSet(id);
    });
  }, []);

  const manualRefreshData = useCallback(
    async (uid: string) => {
      try {
        // Fetch saved sets
        const savedSetsSnapshot = await getDocs(
          collection(db, `users/${uid}/savedSets`)
        );
        syncSavedSetsFromRaw(
          savedSetsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        );

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
    },
    [syncSavedSetsFromRaw]
  );

  const recoverSyncState = useCallback(
    async (reason: 'online' | 'focus' | 'visibility') => {
      const uid = activeUidRef.current;
      if (!uid || !navigator.onLine) return;

      const now = Date.now();
      if (
        recoveryInFlightRef.current ||
        now - lastRecoveryAttemptAtRef.current < RECOVERY_COOLDOWN_MS
      ) {
        return;
      }

      recoveryInFlightRef.current = true;
      lastRecoveryAttemptAtRef.current = now;

      try {
        const shouldRebindListeners =
          syncStatus === 'error' || unsubscribesRef.current.length === 0;

        console.log(
          '[FirebaseSync] Recovery triggered after',
          reason,
          'uid=',
          uid,
          'rebind=',
          shouldRebindListeners
        );

        if (shouldRebindListeners) {
          setupListeners(uid);
          return;
        }

        setSyncStatus('syncing');
        await manualRefreshData(uid);
        setSyncStatus('idle');
      } catch (error) {
        console.error('[FirebaseSync] Recovery failed:', error);
        setSyncStatus('error');
      } finally {
        recoveryInFlightRef.current = false;
      }
    },
    [manualRefreshData, setupListeners, syncStatus]
  );

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
              syncSavedSetsFromRaw(
                snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
              );
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
    [cleanupListeners, manualRefreshData, syncSavedSetsFromRaw]
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (activeUidRef.current) {
        void recoverSyncState('online');
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (user) {
        setSyncStatus('offline');
      }
    };
    const handleFocus = () => {
      if (document.visibilityState === 'visible' && activeUidRef.current) {
        void recoverSyncState('focus');
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [recoverSyncState, user]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
      activeUidRef.current = firebaseUser?.uid ?? null;

      if (firebaseUser) {
        setupListeners(firebaseUser.uid);
      } else {
        cleanupListeners();
        setSyncStatus('idle');
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupListeners();
    };
  }, [setupListeners, cleanupListeners]);

  // Realtime listeners are the primary sync path; connectivity/focus recovery
  // replays a catch-up refresh or listener rebind if the connection dropped.

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

  return {
    user,
    isLoading,
    isSyncing: syncStatus === 'syncing',
    isSyncEnabled: user !== null,
    isOnline,
    syncStatus,
    enableSync,
    disableSync,
  };
}
