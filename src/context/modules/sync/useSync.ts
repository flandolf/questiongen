import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import { auth, db } from '@/context/modules/firebase-init';
import {
  normalizeGenerationHistory,
  normalizeMcHistory,
  normalizeQuestionHistory,
  normalizeSavedSet,
} from '@/lib/persistence';
import { useAppStore } from '@/store';
import type { Preset, StreakData, StudyGoals } from '@/types';

import {
  migrateSettings,
  saveGenerationRecord,
  saveMcHistoryEntry,
  saveQuestionHistoryEntry,
} from './mutations';

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

export interface UseSyncReturn {
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
  markLocalWrite: (key: string) => void;
}

export function useSync(): UseSyncReturn {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'error' | 'offline' | 'connecting'
  >('idle');

  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const activeUidRef = useRef<string | null>(null);
  const localWriteTimestampsRef = useRef<Record<string, number>>({});
  const lastSnapshotSizesRef = useRef({
    questionHistory: -1,
    mcHistory: -1,
    generationHistory: -1,
    savedSets: -1,
  });

  const cleanupListeners = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const markLocalWrite = useCallback((key: string) => {
    localWriteTimestampsRef.current[key] = Date.now();
    if (key === 'settings') {
      localStorage.setItem('sync_settings_lastWrite', Date.now().toString());
    }
  }, []);

  const getLocalWriteTimestamp = useCallback((key: string): number => {
    if (key === 'settings') {
      const stored = localStorage.getItem('sync_settings_lastWrite');
      return stored ? parseInt(stored, 10) : 0;
    }
    return localWriteTimestampsRef.current[key] ?? 0;
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

    state.generationHistory
      .filter((e) => !e.isUploaded)
      .forEach((e) => void saveGenerationRecord(e));
  }, []);

  const setupListeners = useCallback(
    (uid: string) => {
      cleanupListeners();
      setSyncStatus('syncing');
      lastSnapshotSizesRef.current = {
        questionHistory: -1,
        mcHistory: -1,
        generationHistory: -1,
        savedSets: -1,
      };

      try {
        // 1. Question History - Limit to 100 most recent
        const qhUnsub = onSnapshot(
          query(
            collection(db, `users/${uid}/questionHistory`),
            orderBy('updatedAt', 'desc'),
            limit(100),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              lastSnapshotSizesRef.current.questionHistory !== snapshot.size
            ) {
              console.info(
                `[FirebaseSync] Received snapshot for ${snapshot.size} question history entries.`,
              );
              lastSnapshotSizesRef.current.questionHistory = snapshot.size;
            }
            const history = normalizeQuestionHistory(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
            ).map((e, idx) => ({
              ...e,
              isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
            }));

            // Calculate the horizon (oldest updatedAt in this batch) to avoid deleting local items
            // that are simply older than the current sync limit.
            const horizon =
              history.length > 0
                ? Math.min(...history.map((h) => h.lastModified ?? 0))
                : 0;

            const local = useAppStore.getState().questionHistory;
            useAppStore.setState({
              questionHistory: mergeById(local, history, {
                preserveLocalOnly: (entry) =>
                  entry.isUploaded === false ||
                  (entry.lastModified ?? 0) < horizon,
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

        // 2. MC History - Limit to 100 most recent
        const mchUnsub = onSnapshot(
          query(
            collection(db, `users/${uid}/mcHistory`),
            orderBy('updatedAt', 'desc'),
            limit(100),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (lastSnapshotSizesRef.current.mcHistory !== snapshot.size) {
              console.info(
                `[FirebaseSync] Received snapshot for ${snapshot.size} MC history entries.`,
              );
              lastSnapshotSizesRef.current.mcHistory = snapshot.size;
            }
            const history = normalizeMcHistory(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
            ).map((e, idx) => ({
              ...e,
              isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
            }));

            const horizon =
              history.length > 0
                ? Math.min(...history.map((h) => h.lastModified ?? 0))
                : 0;

            const local = useAppStore.getState().mcHistory;
            useAppStore.setState({
              mcHistory: mergeById(local, history, {
                preserveLocalOnly: (entry) =>
                  entry.isUploaded === false ||
                  (entry.lastModified ?? 0) < horizon,
              }),
            });
          },
          (error) => {
            console.error('[FirebaseSync] MC history listener error:', error);
            setSyncStatus('error');
          },
        );

        // 2.5 Generation History - Limit to 100
        const ghUnsub = onSnapshot(
          query(
            collection(db, `users/${uid}/generationHistory`),
            orderBy('updatedAt', 'desc'),
            limit(100),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              lastSnapshotSizesRef.current.generationHistory !== snapshot.size
            ) {
              console.info(
                `[FirebaseSync] Received snapshot for ${snapshot.size} generation history entries.`,
              );
              lastSnapshotSizesRef.current.generationHistory = snapshot.size;
            }
            const history = normalizeGenerationHistory(
              snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
            ).map((e, idx) => ({
              ...e,
              isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
            }));

            const horizon =
              history.length > 0
                ? Math.min(...history.map((h) => h.lastModified ?? 0))
                : 0;

            const local = useAppStore.getState().generationHistory;
            useAppStore.setState({
              generationHistory: mergeById(local, history, {
                preserveLocalOnly: (entry) =>
                  entry.isUploaded === false ||
                  (entry.lastModified ?? 0) < horizon,
              }),
            });
          },
          (error) => {
            console.error(
              '[FirebaseSync] Generation history listener error:',
              error,
            );
            setSyncStatus('error');
          },
        );

        // 3. Saved Sets
        const ssUnsub = onSnapshot(
          collection(db, `users/${uid}/savedSets`),
          (snapshot) => {
            if (lastSnapshotSizesRef.current.savedSets !== snapshot.size) {
              console.info(
                `[FirebaseSync] Received snapshot for ${snapshot.size} saved sets.`,
              );
              lastSnapshotSizesRef.current.savedSets = snapshot.size;
            }
            const sets = snapshot.docs
              .map((d) => normalizeSavedSet({ id: d.id, ...d.data() }))
              .filter((s): s is NonNullable<typeof s> => s !== null)
              .map((s, idx) => ({
                ...s,
                isUploaded: !snapshot.docs[idx].metadata.hasPendingWrites,
              }));

            const horizon =
              sets.length > 0
                ? Math.min(...sets.map((s) => s.lastModified ?? 0))
                : 0;

            const local = useAppStore.getState().savedSets;
            useAppStore.setState({
              savedSets: mergeById(local, sets, {
                preserveLocalOnly: (entry) =>
                  entry.isUploaded === false ||
                  (entry.lastModified ?? 0) < horizon,
              }),
            });
          },
          (error) => {
            console.error('[FirebaseSync] Saved sets listener error:', error);
            setSyncStatus('error');
          },
        );

        // 4. Consolidated Settings (replacing main, goals, presets)
        const settingsUnsub = onSnapshot(
          doc(db, `users/${uid}/settings`, 'profile'),
          (snapshot) => {
            console.info('[FirebaseSync] Received settings profile snapshot.');
            if (snapshot.exists()) {
              const data = snapshot.data() as {
                apiKey?: string;
                studyGoals?: StudyGoals;
                streakData?: StreakData;
                presets?: Preset[];
                lastModified?: number;
              };
              const remoteLastModified = data.lastModified ?? 0;
              const localLastModified = getLocalWriteTimestamp('settings');

              if (remoteLastModified > localLastModified) {
                if (data?.apiKey) useAppStore.setState({ apiKey: data.apiKey });
                if (data?.studyGoals)
                  useAppStore.setState({ studyGoals: data.studyGoals });
                if (data?.streakData)
                  useAppStore.setState({ streakData: data.streakData });
                if (data?.presets)
                  useAppStore.setState({ presets: data.presets });
              }
            }
          },
          (error) => {
            console.error(
              '[FirebaseSync] Settings profile listener error:',
              error,
            );
            setSyncStatus('error');
          },
        );

        unsubscribesRef.current = [
          qhUnsub,
          mchUnsub,
          ghUnsub,
          ssUnsub,
          settingsUnsub,
        ];

        // Trigger migration of old settings if needed
        void migrateSettings();

        // After setting up listeners, trigger a one-time sync up of any pending local data
        syncUpPendingData();

        setSyncStatus('idle');
      } catch (error) {
        console.error('[FirebaseSync] Error setting up listeners:', error);
        setSyncStatus('error');
      }
    },
    [cleanupListeners, syncUpPendingData, getLocalWriteTimestamp],
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
    markLocalWrite,
  };
}
