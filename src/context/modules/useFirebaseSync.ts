import { AppState, useAppStore, setSuppressPersistUntil } from '@/store';
import {
  QuestionHistoryEntry,
  McHistoryEntry,
  SavedQuestionSet,
  Preset,
  StudyGoals,
  StreakData,
} from '@/types';
import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  SyncableData,
  FirebaseUser,
  SyncMetadata,
  onAuthChange,
  saveUserData,
  buildVersionMap,
  signUpWithEmail,
  signInWithEmail,
  loadUserData,
  migrateUserDataForCompaction,
  deleteArchivedItems,
  saveDailyUsage,
} from './useFirebase';
import {
  SyncConflict,
  tombstonesToDeletedIds,
  purgePersistedTombstones,
  detectDualDeletions,
  buildConflictLabel,
  filterDeleted,
  removeTombstone,
} from './deletion-tombstones';

// Helper to normalize remote SyncableData to local SyncableData
function normalizeRemoteSyncableData(
  remote: SyncableData | null
): SyncableData | null {
  if (!remote) return null;
  return {
    settings: {},
    questionHistory: Array.isArray(remote.questionHistory)
      ? (remote.questionHistory as QuestionHistoryEntry[])
      : [],
    mcHistory: Array.isArray(remote.mcHistory)
      ? (remote.mcHistory as McHistoryEntry[])
      : [],
    savedSets: Array.isArray(remote.savedSets)
      ? (remote.savedSets as SavedQuestionSet[])
      : [],
    presets: Array.isArray(remote.presets) ? (remote.presets as Preset[]) : [],
    studyGoals:
      remote.studyGoals && typeof remote.studyGoals === 'object'
        ? remote.studyGoals
        : undefined,
    streakData:
      remote.streakData && typeof remote.streakData === 'object'
        ? remote.streakData
        : undefined,
  };
}

const SYNC_DEBUG = true;

// Debug log / sync event memory limits
const DEBUG_LOG_LIMIT = 50;
const SYNC_EVENT_LIMIT = 30;

// Persist sync-enabled preference so it survives reloads
const SYNC_ENABLED_STORAGE_KEY = 'firebase_sync_enabled';

function readPersistedSyncEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SYNC_ENABLED_STORAGE_KEY);
    if (stored === null) return true; // Default to enabled for new users
    return stored === 'true';
  } catch {
    return true;
  }
}

function writePersistedSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SYNC_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — non-fatal
  }
}

function getUserId(user: FirebaseUser | null): string {
  return user?.uid ?? 'anonymous';
}

function mergeStudyGoals(
  local: StudyGoals | undefined,
  remote: StudyGoals | undefined
): StudyGoals | undefined {
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;
  return {
    dailyQuestionGoal: remote.dailyQuestionGoal ?? local.dailyQuestionGoal,
    dailyWrittenGoal: remote.dailyWrittenGoal ?? local.dailyWrittenGoal,
    dailyMcGoal: remote.dailyMcGoal ?? local.dailyMcGoal,
    weeklyStreakGoal: remote.weeklyStreakGoal ?? local.weeklyStreakGoal,
  };
}

function mergeStreakData(
  local: StreakData | undefined,
  remote: StreakData | undefined
): StreakData | undefined {
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;

  const mergedCompletions: Record<
    string,
    { total: number; written: number; mc: number }
  > = { ...local.dailyCompletions };

  for (const [date, remoteEntry] of Object.entries(remote.dailyCompletions)) {
    const localEntry = mergedCompletions[date];
    if (!localEntry) {
      mergedCompletions[date] = remoteEntry;
    } else {
      mergedCompletions[date] = {
        total: Math.max(localEntry.total, remoteEntry.total),
        written: Math.max(localEntry.written, remoteEntry.written),
        mc: Math.max(localEntry.mc, remoteEntry.mc),
      };
    }
  }

  return {
    currentStreak: Math.max(local.currentStreak, remote.currentStreak),
    longestStreak: Math.max(local.longestStreak, remote.longestStreak),
    lastActiveDate:
      local.lastActiveDate > remote.lastActiveDate
        ? local.lastActiveDate
        : remote.lastActiveDate,
    dailyCompletions: mergedCompletions,
  };
}

function mergeSyncableData(
  local: SyncableData | null,
  remote: import('./useFirebase').SyncableData | null
): SyncableData {
  const defaultData: SyncableData = {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
    presets: [],
  };

  // Helper to cast remote arrays to correct types
  function castArray<T>(arr: unknown[] | undefined): T[] {
    return Array.isArray(arr) ? (arr as T[]) : [];
  }

  if (!local && !remote) {
    return defaultData;
  }
  if (!local) {
    return {
      settings: {},
      questionHistory: castArray<QuestionHistoryEntry>(
        remote?.questionHistory ?? []
      ),
      mcHistory: castArray<McHistoryEntry>(remote?.mcHistory ?? []),
      savedSets: castArray<SavedQuestionSet>(remote?.savedSets ?? []),
      presets: castArray<Preset>(remote?.presets ?? []),
      studyGoals: remote?.studyGoals,
      streakData: remote?.streakData,
    };
  }
  if (!remote) {
    return local;
  }
  return {
    settings: {},
    questionHistory: mergeById(
      local.questionHistory,
      castArray<QuestionHistoryEntry>(remote.questionHistory)
    ),
    mcHistory: mergeById(
      local.mcHistory,
      castArray<McHistoryEntry>(remote.mcHistory)
    ),
    savedSets: mergeById(
      local.savedSets,
      castArray<SavedQuestionSet>(remote.savedSets)
    ),
    presets: mergeById(
      local.presets!,
      castArray<Preset>(remote?.presets ?? [])
    ),
    studyGoals: mergeStudyGoals(
      local.studyGoals as unknown as StudyGoals | undefined,
      remote.studyGoals as unknown as StudyGoals | undefined
    ),
    streakData: mergeStreakData(
      local.streakData as unknown as StreakData | undefined,
      remote.streakData as unknown as StreakData | undefined
    ),
  };
}

function hasRemoteData(data: SyncableData | null): boolean {
  if (!data) {
    return false;
  }
  const hasSettings = Boolean(
    data.settings && Object.keys(data.settings).length > 0
  );
  return (
    hasSettings ||
    (data.questionHistory?.length ?? 0) > 0 ||
    (data.mcHistory?.length ?? 0) > 0 ||
    (data.savedSets?.length ?? 0) > 0 ||
    (data.presets?.length ?? 0) > 0 ||
    Boolean(data.studyGoals && Object.keys(data.studyGoals).length > 0) ||
    Boolean(data.streakData && Object.keys(data.streakData).length > 0)
  );
}

interface HasId {
  id?: string;
  lastModified?: number;
  createdAt?: string;
  updatedAt?: string;
}

function mergeById<T extends HasId>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();

  for (const item of local) {
    if (item.id) {
      byId.set(item.id, item);
    }
  }

  for (const item of remote) {
    if (!item.id) {
      continue;
    }
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    const existingModified = getItemLastModified(existing);
    const remoteModified = getItemLastModified(item);
    if (remoteModified >= existingModified) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

function getItemLastModified(item: HasId): number {
  if (
    typeof item.lastModified === 'number' &&
    Number.isFinite(item.lastModified)
  ) {
    return item.lastModified;
  }

  if (item.updatedAt) {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (item.createdAt) {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function extractSyncableData(state: AppState): SyncableData {
  return {
    settings: {},
    questionHistory: state.questionHistory,
    mcHistory: state.mcHistory,
    savedSets: state.savedSets,
    presets: state.presets ?? [],
    studyGoals: state.studyGoals,
    streakData: state.streakData,
  };
}

function applySyncableDataToStore(data: SyncableData): Partial<AppState> {
  const result: Partial<AppState> = {
    questionHistory: (data.questionHistory as QuestionHistoryEntry[]) ?? [],
    mcHistory: (data.mcHistory as McHistoryEntry[]) ?? [],
    savedSets: (data.savedSets as SavedQuestionSet[]) ?? [],
    presets: (data.presets as Preset[]) ?? [],
  };
  if (data.studyGoals) {
    result.studyGoals = data.studyGoals as unknown as AppState['studyGoals'];
  }
  if (data.streakData) {
    result.streakData = data.streakData as unknown as AppState['streakData'];
  }
  return result;
}

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'syncing'
  | 'error'
  | 'offline';

export interface SyncEvent {
  id: string;
  timestamp: number;
  type: 'upload' | 'download' | 'error' | 'conflict' | 'archive' | 'retry';
  description: string;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  message: string;
  data?: unknown;
}

export interface UseFirebaseSyncReturn {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean;
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  syncError: string | null;
  syncEvents: SyncEvent[];
  debugLogs: DebugLogEntry[];
  pendingChanges: number;
  pendingDeletions: number;
  conflicts: SyncConflict[];
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean
  ) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
  forceSync: () => Promise<void>;
  resolveConflicts: (resolutions: Map<string, 'keep' | 'delete'>) => void;
}

export function useFirebaseSync(): UseFirebaseSyncReturn {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncEnabled, setIsSyncEnabled] = useState(() =>
    readPersistedSyncEnabled()
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingChanges, setPendingChanges] = useState(0);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const getPendingDeletions = useCallback((): number => {
    const tombstones = useAppStore.getState().deletionTombstones;
    return (
      Object.keys(tombstones.questionHistory).length +
      Object.keys(tombstones.mcHistory).length +
      Object.keys(tombstones.savedSets).length +
      Object.keys(tombstones.presets).length
    );
  }, []);

  const debugLog = useCallback((message: string, data?: unknown) => {
    if (SYNC_DEBUG) {
      console.log('[FirebaseSync]', message, data);
      const entry: DebugLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        message: data ? `${message} ${JSON.stringify(data)}` : message,
        data,
      };
      setDebugLogs((prev) => [entry, ...prev].slice(0, DEBUG_LOG_LIMIT));
    }
  }, []);

  const addSyncEvent = useCallback(
    (type: SyncEvent['type'], description: string) => {
      const event: SyncEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        type,
        description,
      };
      debugLog(`Sync event: ${type} - ${description}`);
      setSyncEvents((prev) => [event, ...prev].slice(0, SYNC_EVENT_LIMIT));
    },
    [debugLog]
  );

  const localDataRef = useRef<SyncableData | null>(null);
  const isInitializedRef = useRef(false);
  const suppressAutoSaveRef = useRef(false);
  const suppressAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Track sync metadata for delta sync
  const syncMetadataRef = useRef<SyncMetadata>({
    lastSyncTime: 0,
    questionHistorySyncTime: 0,
    mcHistorySyncTime: 0,
    savedSetsSyncTime: 0,
    lastSyncVersions: {
      questionHistory: {},
      mcHistory: {},
      savedSets: {},
    },
  });

  // Snapshot of last-synced data for detecting pending changes
  const lastSyncedSnapshotRef = useRef<string>('');

  const suppressAutoSaveTemporarily = useCallback((ms = 1200) => {
    suppressAutoSaveRef.current = true;
    if (suppressAutoSaveTimerRef.current) {
      clearTimeout(suppressAutoSaveTimerRef.current);
    }
    suppressAutoSaveTimerRef.current = setTimeout(() => {
      suppressAutoSaveRef.current = false;
      suppressAutoSaveTimerRef.current = null;
    }, ms);
  }, []);

  // Persist isSyncEnabled to localStorage whenever it changes
  useEffect(() => {
    writePersistedSyncEnabled(isSyncEnabled);
  }, [isSyncEnabled]);

  // Track pending changes by comparing current state to last synced snapshot
  useEffect(() => {
    if (!user || !isSyncEnabled || !isInitializedRef.current) return;

    const checkPending = () => {
      const state = useAppStore.getState();
      if (!state.isHydrated) return;
      const syncable = extractSyncableData(state);
      const snapshot = JSON.stringify({
        qh: syncable.questionHistory.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        mch: syncable.mcHistory.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        ss: syncable.savedSets.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        pr:
          syncable.presets?.map((q) => ({
            id: q.id,
            lm: getItemLastModified(q as HasId),
          })) ?? [],
      });

      if (snapshot !== lastSyncedSnapshotRef.current) {
        // Count how many items differ
        let count = 0;
        try {
          const lastParsed = JSON.parse(
            lastSyncedSnapshotRef.current ||
              '{"qh":[],"mch":[],"ss":[],"pr":[]}'
          );
          const lastQhIds = new Set(
            lastParsed.qh.map((i: { id: string }) => i.id)
          );
          const lastMcIds = new Set(
            lastParsed.mch.map((i: { id: string }) => i.id)
          );
          const lastSsIds = new Set(
            lastParsed.ss.map((i: { id: string }) => i.id)
          );
          const lastPrIds = new Set(
            (lastParsed.pr ?? []).map((i: { id: string }) => i.id)
          );

          // Build current ID sets
          const currentQhIds = new Set(
            syncable.questionHistory.map((q) => q.id)
          );
          const currentMcIds = new Set(syncable.mcHistory.map((q) => q.id));
          const currentSsIds = new Set(syncable.savedSets.map((q) => q.id));
          const currentPrIds = new Set(
            (syncable.presets ?? []).map((q) => q.id)
          );

          // Count additions (items in current but not in last synced)
          for (const q of syncable.questionHistory) {
            if (!lastQhIds.has(q.id)) count++;
          }
          for (const q of syncable.mcHistory) {
            if (!lastMcIds.has(q.id)) count++;
          }
          for (const q of syncable.savedSets) {
            if (!lastSsIds.has(q.id)) count++;
          }
          for (const q of syncable.presets ?? []) {
            if (!lastPrIds.has(q.id)) count++;
          }

          // Count deletions (items in last synced but not in current)
          for (const id of lastQhIds) {
            if (!currentQhIds.has(id)) count++;
          }
          for (const id of lastMcIds) {
            if (!currentMcIds.has(id)) count++;
          }
          for (const id of lastSsIds) {
            if (!currentSsIds.has(id)) count++;
          }
          for (const id of lastPrIds) {
            if (!currentPrIds.has(id as string)) count++;
          }
        } catch {
          count = -1; // unknown
        }
        setPendingChanges(count);
      } else {
        setPendingChanges(0);
      }
    };

    const unsubscribe = useAppStore.subscribe(() => {
      if (suppressAutoSaveRef.current) return;
      checkPending();
    });

    // Check immediately
    checkPending();

    return () => {
      unsubscribe();
    };
  }, [user, isSyncEnabled]);

  // Sync daily usage (tokens/day, est. cost) to Firestore when generationHistory changes
  useEffect(() => {
    if (!user || !isSyncEnabled || !isInitializedRef.current) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.generationHistory === prevState.generationHistory) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const current = useAppStore.getState();
          if (!current.isHydrated) return;
          await saveDailyUsage(
            getUserId(user),
            current.generationHistory,
            current.questionHistory,
            current.mcHistory
          );
          debugLog('Daily usage synced after generation');
        } catch (err) {
          console.warn(
            '[Firebase] Daily usage sync after generation failed:',
            err
          );
        }
      }, 2000);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [user, isSyncEnabled, debugLog]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      debugLog('Auth changed:', firebaseUser?.uid ?? 'null');
      setUser(firebaseUser);
      if (!firebaseUser) {
        setIsSyncEnabled(false);
        isInitializedRef.current = false;
        setSyncStatus('idle');
      } else {
        const persisted = readPersistedSyncEnabled();
        debugLog('Persisted sync preference:', persisted);
        if (persisted) {
          setIsSyncEnabled(true);
        }
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, [debugLog]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus((prev) => (prev === 'offline' ? 'idle' : prev));
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enableSync = useCallback(
    async (email: string, password: string, isSignUp = false) => {
      debugLog('enableSync called', { email, isSignUp });
      setSyncError(null);
      setSyncStatus('connecting');

      try {
        let firebaseUser: FirebaseUser | null = null;

        if (isSignUp) {
          debugLog('Signing up...');
          firebaseUser = await signUpWithEmail(email, password);
        } else {
          debugLog('Signing in...');
          firebaseUser = await signInWithEmail(email, password);
        }

        if (!firebaseUser) {
          setSyncError('Failed to sign in');
          return;
        }

        debugLog('User authenticated:', firebaseUser.uid);
        setUser(firebaseUser);

        const userId = getUserId(firebaseUser);
        debugLog('Loading user data for:', userId);
        isInitializedRef.current = false;

        let remoteData = await loadUserData(userId);
        const remoteHasData = hasRemoteData(
          normalizeRemoteSyncableData(remoteData)
        );
        debugLog('Remote data loaded:', {
          hasData: remoteHasData,
          settings: !!remoteData?.settings,
          questionHistory: remoteData?.questionHistory?.length,
          mcHistory: remoteData?.mcHistory?.length,
          savedSets: remoteData?.savedSets?.length,
        });

        if (remoteHasData) {
          const migrationResult = await migrateUserDataForCompaction(
            userId,
            remoteData
          );
          debugLog('Compaction migration result', migrationResult);
          if (migrationResult.migrated) {
            addSyncEvent(
              'upload',
              `Cloud compaction migrated ${migrationResult.questionHistoryCount} written, ${migrationResult.mcHistoryCount} MC, ${migrationResult.savedSetsCount} saved sets`
            );
            remoteData = await loadUserData(userId);
            debugLog('Remote data reloaded after compaction migration:', {
              hasData: hasRemoteData(normalizeRemoteSyncableData(remoteData)),
              questionHistory: remoteData?.questionHistory?.length,
              mcHistory: remoteData?.mcHistory?.length,
              savedSets: remoteData?.savedSets?.length,
            });
          }
        }

        const localState = useAppStore.getState();
        const localData = extractSyncableData(localState);
        const tombstones = localState.deletionTombstones;

        localDataRef.current = localData;

        if (hasRemoteData(normalizeRemoteSyncableData(remoteData))) {
          // Apply tombstone filter before merge
          const filteredLocalData: SyncableData = {
            ...localData,
            questionHistory: filterDeleted(
              localData.questionHistory as Array<
                Record<string, unknown> & { id?: string }
              >,
              tombstones.questionHistory
            ),
            mcHistory: filterDeleted(
              localData.mcHistory as Array<
                Record<string, unknown> & { id?: string }
              >,
              tombstones.mcHistory
            ),
            savedSets: filterDeleted(
              localData.savedSets as Array<
                Record<string, unknown> & { id?: string }
              >,
              tombstones.savedSets
            ),
            presets: filterDeleted(
              (localData.presets ?? []) as Array<
                Record<string, unknown> & { id?: string }
              >,
              tombstones.presets
            ) as typeof localData.presets,
          };

          let merged = mergeSyncableData(filteredLocalData, remoteData ?? null);

          // Remove any preset whose ID is in tombstones (mergeById may re-add from remote)
          if (Object.keys(tombstones.presets).length > 0) {
            merged = {
              ...merged,
              presets: (merged.presets ?? []).filter(
                (p) => !p.id || !(p.id in tombstones.presets)
              ),
            };
          }
          const storeUpdates = applySyncableDataToStore(merged);
          setSuppressPersistUntil(Date.now() + 1500);
          suppressAutoSaveTemporarily();
          useAppStore.setState(storeUpdates);
          localDataRef.current = merged;

          // Initialize sync metadata from merged data
          const now = Date.now();
          syncMetadataRef.current.lastSyncTime = now;
          syncMetadataRef.current.questionHistorySyncTime = now;
          syncMetadataRef.current.mcHistorySyncTime = now;
          syncMetadataRef.current.savedSetsSyncTime = now;
          syncMetadataRef.current.lastSyncVersions.questionHistory =
            buildVersionMap(
              merged.questionHistory as Array<Record<string, unknown>>,
              {}
            );
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            merged.mcHistory as Array<Record<string, unknown>>,
            {}
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            merged.savedSets as Array<Record<string, unknown>>,
            {}
          );

          // Set snapshot so pending changes shows 0 after initial merge
          lastSyncedSnapshotRef.current = JSON.stringify({
            qh: merged.questionHistory.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            mch: merged.mcHistory.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            ss: merged.savedSets.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            pr: (merged.presets ?? []).map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
          });

          debugLog('Sync metadata initialized', {
            questionHistoryVersions: Object.keys(
              syncMetadataRef.current.lastSyncVersions.questionHistory
            ).length,
            mcHistoryVersions: Object.keys(
              syncMetadataRef.current.lastSyncVersions.mcHistory
            ).length,
            savedSetsVersions: Object.keys(
              syncMetadataRef.current.lastSyncVersions.savedSets
            ).length,
          });

          addSyncEvent(
            'download',
            `Synced ${remoteData?.questionHistory?.length || 0} question history items`
          );

          // Sync daily usage (tokens/day, est. cost) to Firestore
          try {
            await saveDailyUsage(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
            debugLog('Daily usage synced on connect');
          } catch (usageError) {
            console.warn(
              '[Firebase] Daily usage sync failed on connect:',
              usageError
            );
          }

          // Archive old items from Firestore after merge
          const qhKeepIds = new Set(
            merged.questionHistory.map((item) => String(item.id ?? ''))
          );
          const mcKeepIds = new Set(
            merged.mcHistory.map((item) => String(item.id ?? ''))
          );
          void deleteArchivedItems(userId, 'questionHistory', qhKeepIds).then(
            (deleted) => {
              if (deleted > 0)
                addSyncEvent(
                  'archive',
                  `Archived ${deleted} old question history items`
                );
            }
          );
          void deleteArchivedItems(userId, 'mcHistory', mcKeepIds).then(
            (deleted) => {
              if (deleted > 0)
                addSyncEvent(
                  'archive',
                  `Archived ${deleted} old MC history items`
                );
            }
          );
        }

        if (!hasRemoteData(normalizeRemoteSyncableData(remoteData))) {
          // Initialize sync metadata for first-time sync
          const now = Date.now();
          syncMetadataRef.current.lastSyncTime = now;
          syncMetadataRef.current.questionHistorySyncTime = now;
          syncMetadataRef.current.mcHistorySyncTime = now;
          syncMetadataRef.current.savedSetsSyncTime = now;
          syncMetadataRef.current.lastSyncVersions.questionHistory =
            buildVersionMap(
              localDataRef.current.questionHistory as Array<
                Record<string, unknown>
              >,
              {}
            );
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            localDataRef.current.mcHistory as Array<Record<string, unknown>>,
            {}
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            localDataRef.current.savedSets as Array<Record<string, unknown>>,
            {}
          );

          // Full sync for first upload, including any pending deletions
          const deletedIds = tombstonesToDeletedIds(tombstones);
          const hasDeletions =
            deletedIds.questionHistory.length > 0 ||
            deletedIds.mcHistory.length > 0 ||
            deletedIds.savedSets.length > 0 ||
            deletedIds.presets.length > 0;
          await saveUserData(userId, localDataRef.current, {
            fullSync: true,
            ...(hasDeletions ? { deletedIds } : {}),
          });

          // Sync daily usage (tokens/day, est. cost) to Firestore
          try {
            await saveDailyUsage(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
            debugLog('Daily usage synced on initial upload');
          } catch (usageError) {
            console.warn(
              '[Firebase] Daily usage sync failed on initial upload:',
              usageError
            );
          }

          addSyncEvent('upload', 'Initial data uploaded to cloud');
          if (hasDeletions) {
            useAppStore.setState({
              deletionTombstones: purgePersistedTombstones(
                tombstones,
                deletedIds
              ),
            });
          }

          lastSyncedSnapshotRef.current = JSON.stringify({
            qh: localDataRef.current.questionHistory.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            mch: localDataRef.current.mcHistory.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            ss: localDataRef.current.savedSets.map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
            pr: (localDataRef.current.presets ?? []).map((q) => ({
              id: q.id,
              lm: getItemLastModified(q as HasId),
            })),
          });
        }
        isInitializedRef.current = true;
        setPendingChanges(0);
        setIsSyncEnabled(true);
        setSyncError(null);
        setSyncStatus('idle');
        setLastSyncTime(Date.now());
        toast.success('Cloud sync connected');
      } catch (error: unknown) {
        console.error('Failed to enable sync:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to enable sync';
        setSyncError(errorMessage);
        addSyncEvent('error', `Connection failed: ${errorMessage}`);
        setIsSyncEnabled(false);
        setSyncStatus('error');
        toast.error(`Sync failed: ${errorMessage}`);
      }
    },
    [debugLog, addSyncEvent, suppressAutoSaveTemporarily]
  );

  const disableSync = useCallback(async () => {
    setIsSyncEnabled(false);
    isInitializedRef.current = false;
    setSyncStatus('idle');
    addSyncEvent('upload', 'Disconnected from cloud sync');
  }, [addSyncEvent]);

  const toggleSync = useCallback(() => {
    if (isSyncEnabled) {
      setIsSyncEnabled(false);
      isInitializedRef.current = false;
      setSyncStatus('idle');
      addSyncEvent('upload', 'Cloud sync paused');
    } else if (user) {
      setIsSyncEnabled(true);
      setSyncStatus('idle');
      addSyncEvent('download', 'Cloud sync resumed');
    }
  }, [isSyncEnabled, user, addSyncEvent]);

  const forceSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }

    debugLog('Manual sync started');
    setIsSyncing(true);
    setSyncStatus('syncing');
    setIsSyncEnabled(true);
    isInitializedRef.current = true;
    toast.message('Syncing data...');

    const userId = getUserId(user);

    try {
      const state = useAppStore.getState();
      const localData = extractSyncableData(state);
      const tombstones = state.deletionTombstones;

      debugLog('Manual sync local snapshot', {
        questionHistory: localData.questionHistory?.length,
        mcHistory: localData.mcHistory?.length,
        savedSets: localData.savedSets?.length,
        pendingDeletions:
          Object.keys(tombstones.questionHistory).length +
          Object.keys(tombstones.mcHistory).length +
          Object.keys(tombstones.savedSets).length,
      });

      // 1. Read remote
      const remoteData = await loadUserData(userId);
      const remoteHasData = hasRemoteData(
        normalizeRemoteSyncableData(remoteData)
      );
      debugLog('Manual sync remote snapshot', {
        hasData: remoteHasData,
        questionHistory: remoteData?.questionHistory?.length ?? 0,
        mcHistory: remoteData?.mcHistory?.length ?? 0,
        savedSets: remoteData?.savedSets?.length ?? 0,
      });

      // 2. Detect dual-deletion conflicts before merging
      const detectedConflicts: SyncConflict[] = [];
      if (remoteHasData) {
        const remoteQhIds = new Set(
          (remoteData?.questionHistory ?? []).map(
            (i: Record<string, unknown>) => String(i.id ?? '')
          )
        );
        const remoteMcIds = new Set(
          (remoteData?.mcHistory ?? []).map((i: Record<string, unknown>) =>
            String(i.id ?? '')
          )
        );
        const remoteSsIds = new Set(
          (remoteData?.savedSets ?? []).map((i: Record<string, unknown>) =>
            String(i.id ?? '')
          )
        );

        // Previously synced IDs — only flag conflicts for items that were synced before
        const prevSyncedQh = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.questionHistory)
        );
        const prevSyncedMc = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.mcHistory)
        );
        const prevSyncedSs = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.savedSets)
        );

        const localQhItems = localData.questionHistory as Record<
          string,
          unknown
        >[];
        const localMcItems = localData.mcHistory as Record<string, unknown>[];
        const localSsItems = localData.savedSets as Record<string, unknown>[];

        // For each tombstone, check if the item is also absent from remote
        // Only flag conflict if the item was previously synced (not a create-then-delete-before-sync)
        const qhConflicts = detectDualDeletions(
          new Set(Object.keys(tombstones.questionHistory)),
          remoteQhIds,
          prevSyncedQh
        );
        for (const id of qhConflicts) {
          detectedConflicts.push({
            id,
            collection: 'questionHistory',
            label: buildConflictLabel('questionHistory', id, localQhItems),
            localDeletedAt: tombstones.questionHistory[id],
          });
        }

        const mcConflicts = detectDualDeletions(
          new Set(Object.keys(tombstones.mcHistory)),
          remoteMcIds,
          prevSyncedMc
        );
        for (const id of mcConflicts) {
          detectedConflicts.push({
            id,
            collection: 'mcHistory',
            label: buildConflictLabel('mcHistory', id, localMcItems),
            localDeletedAt: tombstones.mcHistory[id],
          });
        }

        const ssConflicts = detectDualDeletions(
          new Set(Object.keys(tombstones.savedSets)),
          remoteSsIds,
          prevSyncedSs
        );
        for (const id of ssConflicts) {
          detectedConflicts.push({
            id,
            collection: 'savedSets',
            label: buildConflictLabel('savedSets', id, localSsItems),
            localDeletedAt: tombstones.savedSets[id],
          });
        }

        // Preset conflict detection — presets are stored as a single Firestore document,
        // so individual items don't have per-item sync tracking. Skip dual-deletion detection
        // for presets; deletions are always propagated silently by rewriting the full array.
      }

      // If there are conflicts, pause sync and prompt user
      if (detectedConflicts.length > 0) {
        debugLog('Dual-deletion conflicts detected', {
          count: detectedConflicts.length,
        });
        setConflicts(detectedConflicts);
        setIsSyncing(false);
        setSyncStatus('idle');
        addSyncEvent(
          'conflict',
          `${detectedConflicts.length} deletion conflict${detectedConflicts.length === 1 ? '' : 's'} detected — awaiting resolution`
        );
        toast.warning(
          `${detectedConflicts.length} deletion conflict${detectedConflicts.length === 1 ? '' : 's'} needs resolution`
        );
        return; // Sync paused until resolveConflicts is called
      }

      // 3. Apply tombstone filters: remove locally deleted items from what we merge/upload
      const filteredLocalData: SyncableData = {
        ...localData,
        questionHistory: filterDeleted(
          localData.questionHistory as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(
          localData.mcHistory as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.mcHistory
        ),
        savedSets: filterDeleted(
          localData.savedSets as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.savedSets
        ),
        presets: filterDeleted(
          (localData.presets ?? []) as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.presets
        ) as typeof localData.presets,
      };

      // 4. Merge local + remote (newer wins)
      let merged = remoteHasData
        ? mergeSyncableData(filteredLocalData, remoteData)
        : filteredLocalData;

      // Remove any preset whose ID is in tombstones (mergeById may re-add from remote)
      if (Object.keys(tombstones.presets).length > 0) {
        merged = {
          ...merged,
          presets: (merged.presets ?? []).filter(
            (p) => !p.id || !(p.id in tombstones.presets)
          ),
        };
      }

      if (remoteHasData) {
        const storeUpdates = applySyncableDataToStore(merged);
        setSuppressPersistUntil(Date.now() + 1500);
        suppressAutoSaveTemporarily();
        useAppStore.setState(storeUpdates);
        addSyncEvent('download', 'Merged remote updates');
      }

      // 5. Write with deletedIds to propagate deletions to Firestore
      debugLog('Uploading merged data', {
        questionHistory: merged.questionHistory?.length,
        mcHistory: merged.mcHistory?.length,
        savedSets: merged.savedSets?.length,
      });

      const deletedIds = tombstonesToDeletedIds(tombstones);
      const hasDeletions =
        deletedIds.questionHistory.length > 0 ||
        deletedIds.mcHistory.length > 0 ||
        deletedIds.savedSets.length > 0 ||
        deletedIds.presets.length > 0;

      await saveUserData(userId, merged, {
        deltaSyncVersions: syncMetadataRef.current.lastSyncVersions,
        fullSync: false,
        ...(hasDeletions ? { deletedIds } : {}),
      });

      if (hasDeletions) {
        const totalDeletions =
          deletedIds.questionHistory.length +
          deletedIds.mcHistory.length +
          deletedIds.savedSets.length +
          deletedIds.presets.length;
        addSyncEvent('upload', `Deleted ${totalDeletions} items from cloud`);
        if (deletedIds.presets.length > 0) {
          addSyncEvent(
            'upload',
            `${deletedIds.presets.length} preset${deletedIds.presets.length === 1 ? '' : 's'} deleted from cloud`
          );
        }
      }
      addSyncEvent('upload', 'Data synced to cloud');

      // 6. Clear persisted tombstones after successful sync
      if (hasDeletions) {
        useAppStore.setState({
          deletionTombstones: purgePersistedTombstones(tombstones, deletedIds),
        });
      }

      // 7. Sync daily usage (bundled into manual sync)
      try {
        await saveDailyUsage(
          userId,
          state.generationHistory,
          state.questionHistory,
          state.mcHistory
        );
        debugLog('Daily usage synced');
      } catch (usageError) {
        console.warn('[Firebase] Daily usage sync failed:', usageError);
      }

      localDataRef.current = merged;

      // Update sync metadata
      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.questionHistorySyncTime = now;
      syncMetadataRef.current.mcHistorySyncTime = now;
      syncMetadataRef.current.savedSetsSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(
          merged.questionHistory as Array<Record<string, unknown>>,
          syncMetadataRef.current.lastSyncVersions.questionHistory
        );
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        merged.mcHistory as Array<Record<string, unknown>>,
        syncMetadataRef.current.lastSyncVersions.mcHistory
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        merged.savedSets as Array<Record<string, unknown>>,
        syncMetadataRef.current.lastSyncVersions.savedSets
      );

      // Update snapshot for pending change tracking
      lastSyncedSnapshotRef.current = JSON.stringify({
        qh: merged.questionHistory.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        mch: merged.mcHistory.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        ss: merged.savedSets.map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
        pr: (merged.presets ?? []).map((q) => ({
          id: q.id,
          lm: getItemLastModified(q as HasId),
        })),
      });

      setPendingChanges(0);
      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');
      debugLog('Manual sync completed successfully');
      toast.success('Sync complete');
    } catch (error) {
      console.error('Force sync failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Force sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Manual sync failed: ${errorMessage}`);
      debugLog('Manual sync failed', error);
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user, debugLog, addSyncEvent, suppressAutoSaveTemporarily]);

  const resolveConflicts = useCallback(
    (resolutions: Map<string, 'keep' | 'delete'>) => {
      debugLog('Resolving conflicts', {
        total: resolutions.size,
        kept: Array.from(resolutions.values()).filter((r) => r === 'keep')
          .length,
        deleted: Array.from(resolutions.values()).filter((r) => r === 'delete')
          .length,
      });

      const state = useAppStore.getState();
      let tombstones = state.deletionTombstones;

      for (const [id, resolution] of resolutions) {
        const conflict = conflicts.find((c) => c.id === id);
        if (!conflict) continue;

        if (resolution === 'keep') {
          // Remove tombstone — item will be kept on next sync
          tombstones = removeTombstone(tombstones, conflict.collection, id);
        }
        // If 'delete', tombstone stays — it will be propagated on next sync
      }

      useAppStore.setState({ deletionTombstones: tombstones });
      setConflicts([]);

      const kept = Array.from(resolutions.values()).filter(
        (r) => r === 'keep'
      ).length;
      const deleted = resolutions.size - kept;

      if (kept > 0) {
        addSyncEvent(
          'conflict',
          `Restored ${kept} item${kept === 1 ? '' : 's'} from deletion`
        );
      }
      if (deleted > 0) {
        addSyncEvent(
          'conflict',
          `Confirmed deletion of ${deleted} item${deleted === 1 ? '' : 's'}`
        );
      }

      // Re-trigger sync now that conflicts are resolved
      void forceSync();
    },
    [conflicts, debugLog, addSyncEvent, forceSync]
  );

  // ── Autosync timer ─────────────────────────────────────────────────────────
  const forceSyncRef = useRef(forceSync);
  forceSyncRef.current = forceSync;
  const autoSyncIntervalMinutes = useAppStore((s) => s.autoSyncIntervalMinutes);

  useEffect(() => {
    if (
      !autoSyncIntervalMinutes ||
      autoSyncIntervalMinutes <= 0 ||
      !user ||
      !isSyncEnabled
    ) {
      return;
    }

    const intervalMs = autoSyncIntervalMinutes * 60 * 1000;
    debugLog('Autosync timer started', {
      intervalMinutes: autoSyncIntervalMinutes,
    });

    const timerId = setInterval(() => {
      const online = navigator.onLine;
      if (!online) {
        debugLog('Autosync skipped: offline');
        return;
      }
      if (isSyncing) {
        debugLog('Autosync skipped: sync already in progress');
        return;
      }
      debugLog('Autosync triggered');
      void forceSyncRef.current();
    }, intervalMs);

    return () => {
      clearInterval(timerId);
      debugLog('Autosync timer stopped');
    };
  }, [user, isSyncEnabled, isSyncing, autoSyncIntervalMinutes, debugLog]);

  return {
    user,
    isLoading,
    isSyncing,
    isSyncEnabled,
    isOnline,
    syncStatus,
    lastSyncTime,
    syncError,
    syncEvents,
    debugLogs,
    pendingChanges,
    pendingDeletions: getPendingDeletions(),
    conflicts,
    enableSync,
    disableSync,
    toggleSync,
    forceSync,
    resolveConflicts,
  };
}
