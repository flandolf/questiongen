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
import { EMPTY_PERSISTED_APP_STATE } from '@/lib/persistence';
import { useAppStore } from '@/store';
import type { AppState } from '@/store/types';
import type { CustomSubtopic, Preset, StreakData, StudyGoals, Topic } from '@/types';

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

function getCustomSubtopicLatestTimestamp(subtopics: CustomSubtopic[]): number {
  if (subtopics.length === 0) return 0;
  return Math.max(...subtopics.map((subtopic) => subtopic.updatedAt || subtopic.createdAt || 0));
}

function mergeCustomSubtopics(
  local: Record<Topic, CustomSubtopic[]>,
  remote: Record<string, { subtopics: CustomSubtopic[]; updatedAt: number | null }>,
): {
  merged: Record<Topic, CustomSubtopic[]>;
  topicsToPush: Topic[];
} {
  const merged: Record<Topic, CustomSubtopic[]> = { ...local };
  const topicsToPush: Topic[] = [];
  const topics: Topic[] = [
    'Biology',
    'Chemistry',
    'General Mathematics',
    'Mathematical Methods',
    'Physical Education',
    'Specialist Mathematics',
  ];

  for (const topic of topics) {
    const remoteEntry = remote[topic];
    const localList = local[topic] || [];
    const localLatest = getCustomSubtopicLatestTimestamp(localList);

    if (!remoteEntry) {
      if (localList.length > 0) topicsToPush.push(topic);
      continue;
    }

    const remoteUpdatedAt = remoteEntry.updatedAt ?? 0;
    if (remoteUpdatedAt > localLatest) {
      merged[topic] = remoteEntry.subtopics;
    } else if (localList.length > 0) {
      topicsToPush.push(topic);
    }
  }

  return { merged, topicsToPush };
}

type SettingsProfileUpdates = Partial<
  Pick<AppState, 'apiKey' | 'studyGoals' | 'streakData' | 'presets'>
>;

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

const EMPTY_CUSTOM_SUBTOPICS = {
  Biology: [],
  Chemistry: [],
  'General Mathematics': [],
  'Mathematical Methods': [],
  'Physical Education': [],
  'Specialist Mathematics': [],
};

type CustomSubtopicRemoteEntry = {
  subtopics: CustomSubtopic[];
  updatedAt: number | null;
};

function toMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'object') {
    const ts = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof ts.toDate === 'function') {
      try {
        const date = ts.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.getTime();
        }
      } catch {
        // fall through
      }
    }
    if (typeof ts.seconds === 'number' && Number.isFinite(ts.seconds)) {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return null;
}

const EMPTY_SYNCED_SETTINGS = {
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  studyGoals: EMPTY_PERSISTED_APP_STATE.studyGoals,
  streakData: EMPTY_PERSISTED_APP_STATE.streakData,
  presets: EMPTY_PERSISTED_APP_STATE.presets,
};

function resetUserScopedSyncState() {
  useAppStore.setState({
    ...EMPTY_SYNCED_SETTINGS,
    questionHistory: EMPTY_PERSISTED_APP_STATE.questionHistory,
    mcHistory: EMPTY_PERSISTED_APP_STATE.mcHistory,
    savedSets: EMPTY_PERSISTED_APP_STATE.savedSets,
    generationHistory: EMPTY_PERSISTED_APP_STATE.generationHistory,
    customSubtopics: EMPTY_CUSTOM_SUBTOPICS,
    customSubtopicsSynced: false,
    questions: EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
    activeQuestionIndex: EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
    writtenQuestionPresentedAtById:
      EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
    answersByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
    imagesByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId,
    feedbackByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
    writtenRawModelOutput: EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
    writtenGenerationTelemetry:
      EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
    activeWrittenSavedSetId: EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId,
    mcQuestions: EMPTY_PERSISTED_APP_STATE.mcSession.questions,
    activeMcQuestionIndex: EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex,
    mcQuestionPresentedAtById:
      EMPTY_PERSISTED_APP_STATE.mcSession.presentedAtByQuestionId,
    mcAnswersByQuestionId: EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId,
    mcRawModelOutput: EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
    mcGenerationTelemetry:
      EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
    activeMcSavedSetId: EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId,
  });
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
    customSubtopics: -1,
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
        customSubtopics: -1,
      };

      try {
        // 1. Question History - listen to the full collection so devices can
        // converge on the same attempt count instead of only the newest page.
        const qhUnsub = onSnapshot(
          query(collection(db, `users/${uid}/questionHistory`), orderBy('updatedAt', 'desc')),
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

        // 3.5 Custom Subtopics - per-topic docs under a user collection
        const customSubtopicsUnsub = onSnapshot(
          collection(db, `users/${uid}/customSubtopics`),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              lastSnapshotSizesRef.current.customSubtopics !== snapshot.size
            ) {
              console.info(
                `[FirebaseSync] Received snapshot for ${snapshot.size} custom subtopic topics.`,
              );
              lastSnapshotSizesRef.current.customSubtopics = snapshot.size;
            }

            const remote = snapshot.docs.reduce<
              Record<string, CustomSubtopicRemoteEntry>
            >((acc, d) => {
              const data = d.data() as {
                subtopics?: CustomSubtopic[];
                updatedAt?: unknown;
                lastModified?: unknown;
              };
              acc[d.id] = {
                subtopics: Array.isArray(data.subtopics) ? data.subtopics : [],
                updatedAt: toMs(data.lastModified) ?? toMs(data.updatedAt),
              };
              return acc;
            }, {});

            const local = useAppStore.getState().customSubtopics;
            const { merged } = mergeCustomSubtopics(local, remote);

            useAppStore.setState({
              customSubtopics: merged,
              customSubtopicsSynced: true,
            });
          },
          (error) => {
            console.error(
              '[FirebaseSync] Custom subtopics listener error:',
              error,
            );
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
                const updates: SettingsProfileUpdates = {};

                if ('apiKey' in data) updates.apiKey = data.apiKey ?? '';
                if ('studyGoals' in data && data.studyGoals)
                  updates.studyGoals = data.studyGoals;
                if ('streakData' in data && data.streakData)
                  updates.streakData = data.streakData;
                if ('presets' in data && data.presets)
                  updates.presets = data.presets;

                if (Object.keys(updates).length > 0) {
                  useAppStore.setState(updates);
                }
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
          customSubtopicsUnsub,
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
      if (user) {
        syncUpPendingData();
        void useAppStore.getState().syncCustomSubtopics?.();
      }
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
      const previousUid = activeUidRef.current;
      const nextUid = firebaseUser?.uid ?? null;

      if (previousUid && previousUid !== nextUid) {
        // Clear user-scoped state whenever auth identity changes so the next
        // account starts from a clean local view before remote snapshots load.
        resetUserScopedSyncState();
      }

      console.info(
        `[FirebaseSync] Auth state changed: ${
          firebaseUser
            ? 'User logged in (' + firebaseUser.uid + ')'
            : 'User logged out'
        }`,
      );
      setUser(firebaseUser);
      setIsLoading(false);
      activeUidRef.current = nextUid;

      if (firebaseUser) {
        setupListeners(firebaseUser.uid);
        // Kick off a one-time sync for custom subtopics so local state can be
        // reconciled with the server if there are changes. The store will
        // avoid unnecessary overwrites (local wins when newer).
        void useAppStore.getState().syncCustomSubtopics?.();
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
