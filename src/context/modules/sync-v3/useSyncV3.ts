import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  normalizeMcHistory,
  normalizeQuestionHistory,
  normalizeSavedSet,
} from '@/lib/persistence';
import { useAppStore } from '@/store';
import type { Preset, StreakData, StudyGoals } from '@/types';

import { auth, db } from '../firebase-init';
import { saveMcHistoryEntry, saveQuestionHistoryEntry } from './mutations';

function mergeById<T extends { id: string; lastModified?: number }>(
  local: T[],
  remote: T[],
  options?: {
    preserveLocalOnly?: (entry: T) => boolean;
  },
): T[] {
  /**
   * Merge remote and local arrays by `id`. Optionally preserve local-only
   * entries based on a predicate.
   */
  const result = [...remote];
  const remoteMap = new Map(remote.map((e) => [e.id, e]));

  for (const l of local) {
    const r = remoteMap.get(l.id);
    if (!r) {
      if (options?.preserveLocalOnly?.(l)) {
        result.push(l);
      }
    } else if (
      l.lastModified &&
      r.lastModified &&
      l.lastModified > r.lastModified
    ) {
      const idx = result.findIndex((i) => i.id === l.id);
      if (idx !== -1) result[idx] = l;
    }
  }
  return result;
}

export interface UseSyncV3Return {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean;
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline' | 'connecting';
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean,
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

  const cleanupListeners = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const syncUpPendingData = useCallback(() => {
    const state = useAppStore.getState();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    console.debug(
      '[FirebaseSync] Checking for pending local data to sync up...',
    );

    // Push local-only or pending history
    state.questionHistory
      .filter((e) => !e.isUploaded)
      .forEach((e) => void saveQuestionHistoryEntry(e));

    state.mcHistory
      .filter((e) => !e.isUploaded)
      .forEach((e) => void saveMcHistoryEntry(e));
  }, []);

  const setupListeners = useCallback(
    (uid: string) => {
      cleanupListeners();
      setSyncStatus('syncing');

      try {
        // 1. Question History
        const qhUnsub = onSnapshot(
          collection(db, `users/${uid}/questionHistory`),
          { includeMetadataChanges: true },
          (snapshot) => {
            console.info(
              `[FirebaseSync] Received snapshot for ${snapshot.size} question history entries.`,
            );
            const history = normalizeQuestionHistory(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
            ).map((e, idx) => ({
              ...e,
              isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
            }));
            const local = useAppStore.getState().questionHistory;
            /**
             * Custom hook that manages Firebase-based sync for app state.
             *
             * Responsibilities:
             * - Observe Firebase auth state and set up Firestore listeners for the
             *   current user (question history, MC history, saved sets, settings).
             * - Merge remote and local data using `mergeById` and the app store.
             * - Provide helpers to enable/disable sync (sign-in / sign-up and sign-out).
             *
             * The hook returns the current Firebase user, connection/sync status flags,
             * and `enableSync`/`disableSync` functions for UI-driven authentication.
             *
             * @returns {UseSyncV3Return} sync state and control functions.
             */
            useAppStore.setState({
              questionHistory: mergeById(local, history, {
                preserveLocalOnly: (entry) => entry.isUploaded === false,
              }),
            });
          },
          (error) => {
            console.error(
              '[FirebaseSync] Question history listener error:',
              error,
            );
            setSyncStatus('error');
          },
        );

        // 2. MC History
        const mchUnsub = onSnapshot(
          /**
           * Push local, not-yet-uploaded history entries to Firestore.
           * Relies on `saveQuestionHistoryEntry` and `saveMcHistoryEntry` which
           * themselves handle network/offline behavior via Firestore SDK.
           */
          collection(db, `users/${uid}/mcHistory`),
          { includeMetadataChanges: true },
          (snapshot) => {
            console.info(
              `[FirebaseSync] Received snapshot for ${snapshot.size} MC history entries.`,
            );
            const history = normalizeMcHistory(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
            ).map((e, idx) => ({
              ...e,
              isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
            }));
            const local = useAppStore.getState().mcHistory;
            useAppStore.setState({
              mcHistory: mergeById(local, history, {
                preserveLocalOnly: (entry) => entry.isUploaded === false,
              }),
            });
            /**
             * Attach Firestore snapshot listeners for the given user id.
             * Incoming snapshots are normalized and merged with local app state.
             */
          },
          (error) => {
            console.error('[FirebaseSync] MC history listener error:', error);
            setSyncStatus('error');
          },
        );

        // 3. Saved Sets
        const ssUnsub = onSnapshot(
          collection(db, `users/${uid}/savedSets`),
          { includeMetadataChanges: true },
          (snapshot) => {
            console.info(
              `[FirebaseSync] Received snapshot for ${snapshot.size} saved sets.`,
            );
            const sets = snapshot.docs
              .map((d) => normalizeSavedSet({ id: d.id, ...d.data() }))
              .filter((s): s is NonNullable<typeof s> => s !== null);
            const local = useAppStore.getState().savedSets;
            useAppStore.setState({ savedSets: mergeById(local, sets) });
          },
          (error) => {
            console.error('[FirebaseSync] Saved sets listener error:', error);
            setSyncStatus('error');
          },
        );

        // 4. Settings - Main
        const settingsMainUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'main'),
          (snapshot) => {
            console.info('[FirebaseSync] Received main settings snapshot.');
            if (snapshot.exists()) {
              const data = snapshot.data() as { apiKey?: string };
              if (data?.apiKey) useAppStore.setState({ apiKey: data.apiKey });
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Main settings listener error:',
              error,
            );
            setSyncStatus('error');
          },
        );

        // 5. Settings - Goals
        const settingsGoalsUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'goals'),
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as {
                studyGoals?: StudyGoals;
                streakData?: StreakData;
              };
              if (data?.studyGoals)
                useAppStore.setState({ studyGoals: data.studyGoals });
              if (data?.streakData)
                useAppStore.setState({ streakData: data.streakData });
            }
          },
          (error) => {
            console.error('[FirebaseSync] Goals listener error:', error);
            setSyncStatus('error');
          },
        );

        // 6. Settings - Presets
        const settingsPresetsUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'presets'),
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as { presets?: Preset[] };
              if (data?.presets)
                useAppStore.setState({ presets: data.presets });
            }
          },
          (error) => {
            console.error('[FirebaseSync] Presets listener error:', error);
            setSyncStatus('error');
          },
        );

        unsubscribesRef.current = [
          qhUnsub,
          mchUnsub,
          ssUnsub,
          settingsMainUnsub,
          settingsGoalsUnsub,
          settingsPresetsUnsub,
        ];

        // After setting up listeners, trigger a one-time sync up of any pending local data
        syncUpPendingData();

        setSyncStatus('idle');
      } catch (error) {
        console.error('[FirebaseSync] Error setting up listeners:', error);
        setSyncStatus('error');
      }
    },
    [cleanupListeners, syncUpPendingData],
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Re-trigger sync up when coming back online
      if (user) syncUpPendingData();
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (user) setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, syncUpPendingData]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.info(
        `[FirebaseSync] Auth state changed: ${
          firebaseUser
            ? 'User logged in (' + firebaseUser.uid + ')'
            : 'User logged out'
        }`,
      );
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

  const enableSync = async (
    email: string,
    password: string,
    isSignUp = false,
  ) => {
    setSyncStatus('connecting');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
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
