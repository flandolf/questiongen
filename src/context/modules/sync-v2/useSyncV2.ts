/**
 * React hook wrapper for the sync-v2 engine.
 *
 * Drop-in replacement for useFirebaseSync — same API surface, same return type.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { SyncConflict as LegacySyncConflict } from '@/context/modules/deletion-tombstones';
import {
  buildConflictLabel,
  detectDualDeletions,
  filterDeleted,
  purgePersistedTombstones,
  removeTombstone,
  tombstonesToDeletedIds,
} from '@/context/modules/deletion-tombstones';
import { SyncEngine } from '@/context/modules/sync-v2/SyncEngine';
import {
  buildVersionMap,
  deleteArchivedItems,
  getRemoteHistoryCounts,
  isRemotePresetsArrayDifferent,
  loadUserData,
  migrateUserDataForCompaction,
  onAuthChange,
  saveAnalyticsSummary,
  saveDailyUsage,
  saveUserData,
  signInWithEmail,
  signUpWithEmail,
} from '@/context/modules/useFirebase';
import type { AppState } from '@/store';
import { setSuppressPersistUntil, useAppStore } from '@/store';

import type {
  FirebaseUser,
  SyncableData as FirebaseSyncableData,
} from '../useFirebase';
import type {
  DebugLogEntry,
  DeletionTombstones,
  ManualSyncCollection,
  SyncableData as SyncableDataV2,
  SyncEvent,
  SyncStatus,
  SyncTelemetry,
} from './types';

const SYNC_DEBUG = true;
const DEBUG_LOG_LIMIT = 50;
const SYNC_EVENT_LIMIT = 30;
const SYNC_ENABLED_STORAGE_KEY = 'firebase_sync_enabled';
const SYNC_ENABLED_USER_STORAGE_KEY_PREFIX = 'firebase_sync_enabled_v2';
const FOREGROUND_SYNC_COOLDOWN_MS = 60_000;
const LEGACY_SYNC_QUEUE_STORAGE_KEY = 'firebase_sync_queue_v1';

/**
 * Clean up legacy v1 sync storage keys.
 * Run once on startup to migrate away from old storage format.
 */
function cleanupLegacyStorage(): void {
  try {
    localStorage.removeItem(LEGACY_SYNC_QUEUE_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

function readPersistedSyncEnabled(userId?: string): boolean {
  try {
    if (userId) {
      const userStored = localStorage.getItem(
        `${SYNC_ENABLED_USER_STORAGE_KEY_PREFIX}:${userId}`
      );
      if (userStored !== null) return userStored === 'true';
    }
    const stored = localStorage.getItem(SYNC_ENABLED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

function writePersistedSyncEnabled(enabled: boolean, userId?: string): void {
  try {
    if (userId) {
      localStorage.setItem(
        `${SYNC_ENABLED_USER_STORAGE_KEY_PREFIX}:${userId}`,
        String(enabled)
      );
      return;
    }
    localStorage.setItem(SYNC_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    /* non-fatal */
  }
}

function getUserId(user: FirebaseUser | null): string {
  return user?.uid ?? 'anonymous';
}

function hasRemoteDataCheck(data: SyncableDataV2 | null): boolean {
  if (!data) return false;

  const listSections = [
    data.questionHistory,
    data.mcHistory,
    data.savedSets,
    data.presets,
  ];

  if (listSections.some((items) => (items?.length ?? 0) > 0)) {
    return true;
  }

  const objectSections = [data.settings, data.studyGoals, data.streakData];
  return objectSections.some((section) =>
    Boolean(section && Object.keys(section).length > 0)
  );
}

function createEmptySyncableData(): SyncableDataV2 {
  return {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
    presets: [],
  };
}

function buildDeletedIdsForCollection(
  tombstones: DeletionTombstones,
  collection: ManualSyncCollection
) {
  return {
    questionHistory:
      collection === 'questionHistory'
        ? Object.keys(tombstones.questionHistory)
        : [],
    mcHistory:
      collection === 'mcHistory' ? Object.keys(tombstones.mcHistory) : [],
    savedSets:
      collection === 'savedSets' ? Object.keys(tombstones.savedSets) : [],
    presets: collection === 'presets' ? Object.keys(tombstones.presets) : [],
  };
}

function collectionLabel(collection: ManualSyncCollection): string {
  if (collection === 'questionHistory') return 'Question History';
  if (collection === 'mcHistory') return 'Multiple Choice History';
  if (collection === 'savedSets') return 'Saved Sets';
  return 'Presets';
}

function normalizeRemoteSyncableData(
  data: FirebaseSyncableData | null | undefined
): SyncableDataV2 | null {
  if (!data) return null;
  return {
    settings: data.settings ?? {},
    questionHistory: data.questionHistory ?? [],
    mcHistory: data.mcHistory ?? [],
    savedSets: data.savedSets ?? [],
    presets: (data.presets ?? []) as Array<Record<string, unknown>>,
    studyGoals: data.studyGoals,
    streakData: data.streakData,
  };
}

function mergeSyncableData(
  local: SyncableDataV2,
  remote: FirebaseSyncableData | SyncableDataV2 | null
): SyncableDataV2 {
  const normalizedRemote = normalizeRemoteSyncableData(
    remote as FirebaseSyncableData | null
  );
  if (!normalizedRemote) return local;

  const byId = (
    localItems: Record<string, unknown>[],
    remoteItems: Record<string, unknown>[]
  ): Record<string, unknown>[] => {
    const map = new Map<string, Record<string, unknown>>();
    for (const item of localItems) {
      const id = item.id;
      if (typeof id === 'string' && id.length > 0) map.set(id, item);
    }
    for (const item of remoteItems) {
      const id = item.id;
      if (typeof id === 'string' && id.length > 0) map.set(id, item);
    }
    return Array.from(map.values());
  };

  return {
    settings: {
      ...(local.settings ?? {}),
      ...(normalizedRemote.settings ?? {}),
    },
    questionHistory: byId(
      local.questionHistory,
      normalizedRemote.questionHistory
    ),
    mcHistory: byId(local.mcHistory, normalizedRemote.mcHistory),
    savedSets: byId(local.savedSets, normalizedRemote.savedSets),
    presets: byId(local.presets ?? [], normalizedRemote.presets ?? []),
    studyGoals: normalizedRemote.studyGoals ?? local.studyGoals,
    streakData: normalizedRemote.streakData ?? local.streakData,
  };
}

function toFirebaseSyncableData(data: SyncableDataV2): FirebaseSyncableData {
  return {
    settings: data.settings,
    questionHistory: data.questionHistory,
    mcHistory: data.mcHistory,
    savedSets: data.savedSets,
    presets: (data.presets ?? []) as FirebaseSyncableData['presets'],
    studyGoals: data.studyGoals,
    streakData: data.streakData,
  };
}

function extractSyncableData(state: AppState): SyncableDataV2 {
  return {
    settings: state.syncApiKey ? { apiKey: state.apiKey } : {},
    questionHistory: state.questionHistory as unknown as Record<
      string,
      unknown
    >[],
    mcHistory: state.mcHistory as unknown as Record<string, unknown>[],
    savedSets: state.savedSets as unknown as Record<string, unknown>[],
    presets: (state.presets ?? []) as unknown as Record<string, unknown>[],
    studyGoals: state.studyGoals as unknown as
      | Record<string, unknown>
      | undefined,
    streakData: state.streakData as unknown as
      | Record<string, unknown>
      | undefined,
  };
}

function applySyncableDataToStore(data: SyncableDataV2): Partial<AppState> {
  const result: Partial<AppState> = {
    questionHistory: data.questionHistory as AppState['questionHistory'],
    mcHistory: data.mcHistory as AppState['mcHistory'],
    savedSets: data.savedSets as AppState['savedSets'],
    presets: data.presets as AppState['presets'],
  };
  if (data.studyGoals) {
    result.studyGoals = data.studyGoals as AppState['studyGoals'];
  }
  if (data.streakData) {
    result.streakData = data.streakData as AppState['streakData'];
  }
  if (data.settings && typeof data.settings.apiKey === 'string') {
    result.apiKey = data.settings.apiKey;
  }
  return result;
}

interface SnapshotItem {
  id: string;
  lm: number;
}
interface SyncSnapshot {
  qh: SnapshotItem[];
  mch: SnapshotItem[];
  ss: SnapshotItem[];
  pr: SnapshotItem[];
}

function getItemLastModified(item: Record<string, unknown>): number {
  if (
    typeof item.lastModified === 'number' &&
    Number.isFinite(item.lastModified)
  )
    return item.lastModified;
  if (typeof item.updatedAt === 'string') {
    const p = Date.parse(item.updatedAt);
    if (Number.isFinite(p)) return p;
  }
  if (typeof item.createdAt === 'string') {
    const p = Date.parse(item.createdAt);
    if (Number.isFinite(p)) return p;
  }
  return 0;
}

function getSnapshotItemId(item: Record<string, unknown>): string {
  const id = item.id;
  return typeof id === 'string' || typeof id === 'number' ? `${id}` : '';
}

function buildSyncSnapshot(data: SyncableDataV2): SyncSnapshot {
  const toItems = (items: Record<string, unknown>[]): SnapshotItem[] =>
    items
      .map((item) => ({
        id: getSnapshotItemId(item),
        lm: getItemLastModified(item),
      }))
      .filter((i) => i.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

  return {
    qh: toItems(data.questionHistory),
    mch: toItems(data.mcHistory),
    ss: toItems(data.savedSets),
    pr: toItems(data.presets ?? []),
  };
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
  queuedOpsCount: number;
  lastFlushTime: number | null;
  syncTelemetry: SyncTelemetry;
  conflicts: LegacySyncConflict[];
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean
  ) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
  pullSync: () => Promise<void>;
  pushSync: () => Promise<void>;
  pullCollectionSync: (collection: ManualSyncCollection) => Promise<void>;
  pushCollectionSync: (collection: ManualSyncCollection) => Promise<void>;
  forceSync: () => Promise<void>;
  retryQueuedOpsNow: () => void;
  resolveConflicts: (resolutions: Map<string, 'keep' | 'delete'>) => void;
}

export function useSyncV2(): UseFirebaseSyncReturn {
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
  const [conflicts, setConflicts] = useState<LegacySyncConflict[]>([]);
  const [lastFlushTime, setLastFlushTime] = useState<number | null>(null);
  const [syncTelemetry, setSyncTelemetry] = useState<SyncTelemetry>({
    queuedOpsTotal: 0,
    flushCount: 0,
    coalescedOpsSaved: 0,
    hashNoopSkips: 0,
    deltaChecks: 0,
    deltaNoChangePasses: 0,
    fullSyncReads: 0,
    retryCount: 0,
    retryAttemptsCurrent: 0,
    retryMaxAttempts: 5,
    retryBlocked: false,
    nextRetryAt: null,
    estimatedWritesAvoided: 0,
    estimatedReadsAvoided: 0,
  });
  const [queuedOpsCount, setQueuedOpsCount] = useState<number>(0);

  const isSyncingRef = useRef(false);
  const isSyncEnabledRef = useRef(false);
  const inForceSyncRef = useRef(false);
  /** Bumped on disable/sign-out so stale manual-sync finallies do not clear a newer op's spinner. */
  const manualSyncTicketRef = useRef(0);
  /** Only re-apply persisted sync flag from storage when the signed-in Firebase uid changes. */
  const lastAuthUidForPersistRef = useRef<string | null>(null);
  isSyncingRef.current = isSyncing;
  isSyncEnabledRef.current = isSyncEnabled;

  const engineRef = useRef<SyncEngine | null>(null);
  const isInitializedRef = useRef(false);
  const telemetryUnsubRef = useRef<(() => void) | null>(null);
  const queueUnsubRef = useRef<(() => void) | null>(null);
  const startupSyncDoneRef = useRef(false);
  const foregroundSyncAtRef = useRef(0);
  const lastSyncedSnapshotRef = useRef<string>('');
  const syncMetadataRef = useRef({
    lastSyncTime: 0,
    questionHistorySyncTime: 0,
    mcHistorySyncTime: 0,
    savedSetsSyncTime: 0,
    lastSyncVersions: { questionHistory: {}, mcHistory: {}, savedSets: {} },
  });

  const debugLog = useCallback((message: string, data?: unknown) => {
    if (SYNC_DEBUG) {
      console.log('[SyncV2]', message, data);
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
      setSyncEvents((prev) => [event, ...prev].slice(0, SYNC_EVENT_LIMIT));
    },
    []
  );

  const getPendingDeletions = useCallback((): number => {
    const tombstones = useAppStore.getState().deletionTombstones;
    return (
      Object.keys(tombstones.questionHistory).length +
      Object.keys(tombstones.mcHistory).length +
      Object.keys(tombstones.savedSets).length +
      Object.keys(tombstones.presets).length
    );
  }, []);

  const hasPendingLocalDeletes = useCallback((): boolean => {
    const tombstones = useAppStore.getState().deletionTombstones;
    return (
      Object.keys(tombstones.questionHistory).length > 0 ||
      Object.keys(tombstones.mcHistory).length > 0 ||
      Object.keys(tombstones.savedSets).length > 0 ||
      Object.keys(tombstones.presets).length > 0
    );
  }, []);

  useEffect(() => {
    writePersistedSyncEnabled(isSyncEnabled, user?.uid);
  }, [isSyncEnabled, user?.uid]);

  // One-time cleanup of legacy v1 storage on mount
  useEffect(() => {
    cleanupLegacyStorage();
  }, []);

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

  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      debugLog('Auth changed:', firebaseUser?.uid ?? 'null');
      setUser(firebaseUser);
      if (!firebaseUser) {
        lastAuthUidForPersistRef.current = null;
        manualSyncTicketRef.current += 1;
        setIsSyncing(false);
        inForceSyncRef.current = false;
        setIsSyncEnabled(false);
        isInitializedRef.current = false;
        startupSyncDoneRef.current = false;
        setSyncStatus('idle');
        engineRef.current?.destroy();
        engineRef.current = null;
      } else {
        const uid = firebaseUser.uid;
        const uidChanged = lastAuthUidForPersistRef.current !== uid;
        if (uidChanged) {
          lastAuthUidForPersistRef.current = uid;
          const persisted = readPersistedSyncEnabled(uid);
          debugLog('Persisted sync preference:', persisted);
          setIsSyncEnabled(persisted);
        }
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, [debugLog]);

  const initEngine = useCallback((userId: string) => {
    if (engineRef.current) engineRef.current.destroy();
    telemetryUnsubRef.current?.();
    queueUnsubRef.current?.();
    const getState = () => extractSyncableData(useAppStore.getState());
    const getTombstones = () => useAppStore.getState().deletionTombstones;
    const setTombstones = (t: DeletionTombstones) => {
      useAppStore.setState({ deletionTombstones: t });
    };
    const engine = new SyncEngine(getState, getTombstones, setTombstones);
    engine.onStatusChange((status) => setSyncStatus(status));
    engine.onEvent((event) => {
      setSyncEvents((prev) => [event, ...prev].slice(0, SYNC_EVENT_LIMIT));
    });
    engine.onDataChange((data) => {
      const storeUpdates = applySyncableDataToStore(data);
      setSuppressPersistUntil(Date.now() + 1500);
      useAppStore.setState(storeUpdates);
      lastSyncedSnapshotRef.current = JSON.stringify(buildSyncSnapshot(data));
      setPendingChanges(0);
    });
    engineRef.current = engine;
    engine.initialize(userId);
    isInitializedRef.current = true;

    // subscribe to engine telemetry and queue count updates
    telemetryUnsubRef.current?.();
    queueUnsubRef.current?.();

    telemetryUnsubRef.current = engine.onTelemetryChange((t: SyncTelemetry) =>
      setSyncTelemetry(t)
    );

    queueUnsubRef.current = engine.onQueueCountChange((n: number) =>
      setQueuedOpsCount(n)
    );
  }, []);

  useEffect(() => {
    if (!user || !isSyncEnabled) return;
    if (!engineRef.current || !isInitializedRef.current) {
      initEngine(getUserId(user));
    }
    void engineRef.current?.start();
  }, [user, isSyncEnabled, initEngine]);

  useEffect(() => {
    if (!user || !isSyncEnabled || !isInitializedRef.current) return;
    const checkPending = () => {
      const state = useAppStore.getState();
      if (!state.isHydrated) return;
      const syncable = extractSyncableData(state);
      const currentSnapshot = buildSyncSnapshot(syncable);
      const snapshot = JSON.stringify(currentSnapshot);
      if (snapshot !== lastSyncedSnapshotRef.current) {
        try {
          const prev = JSON.parse(
            lastSyncedSnapshotRef.current
          ) as SyncSnapshot | null;
          if (!prev) {
            setPendingChanges(-1);
            return;
          }
          let count = 0;
          const compare = (cur: SnapshotItem[], p: SnapshotItem[]) => {
            const curMap = new Map(cur.map((i) => [i.id, i.lm]));
            const prevMap = new Map(p.map((i) => [i.id, i.lm]));
            for (const [id, lm] of curMap) {
              if (!prevMap.has(id) || prevMap.get(id) !== lm) count++;
            }
            for (const id of prevMap.keys()) {
              if (!curMap.has(id)) count++;
            }
          };
          compare(currentSnapshot.qh, prev.qh);
          compare(currentSnapshot.mch, prev.mch);
          compare(currentSnapshot.ss, prev.ss);
          compare(currentSnapshot.pr, prev.pr);
          setPendingChanges(count);
        } catch {
          setPendingChanges(-1);
        }
      } else {
        setPendingChanges(0);
      }
    };
    const unsub = useAppStore.subscribe(() => checkPending());
    checkPending();
    return () => unsub();
  }, [user, isSyncEnabled]);

  // telemetry and queue updates are delivered via engine callbacks (subscribed in initEngine)

  const enableSync = useCallback(
    // eslint-disable-next-line complexity
    async (email: string, password: string, isSignUp = false) => {
      debugLog('enableSync called', { email, isSignUp });
      setSyncError(null);
      setSyncStatus('connecting');
      try {
        let firebaseUser: FirebaseUser | null = null;
        if (isSignUp) firebaseUser = await signUpWithEmail(email, password);
        else firebaseUser = await signInWithEmail(email, password);
        if (!firebaseUser) {
          setSyncError('Failed to sign in');
          return;
        }

        debugLog('User authenticated:', firebaseUser.uid);
        setUser(firebaseUser);
        const userId = getUserId(firebaseUser);
        isInitializedRef.current = false;

        let remoteData = await loadUserData(userId);
        setSyncTelemetry((prev) => ({
          ...prev,
          fullSyncReads: prev.fullSyncReads + 1,
        }));
        const remoteHasData = hasRemoteDataCheck(
          normalizeRemoteSyncableData(remoteData)
        );

        if (remoteHasData) {
          const migrationResult = await migrateUserDataForCompaction(
            userId,
            remoteData
          );
          if (migrationResult.migrated) {
            addSyncEvent(
              'upload',
              `Cloud compaction migrated ${migrationResult.questionHistoryCount} written, ${migrationResult.mcHistoryCount} MC, ${migrationResult.savedSetsCount} saved sets`
            );
            remoteData = await loadUserData(userId);
            setSyncTelemetry((prev) => ({
              ...prev,
              fullSyncReads: prev.fullSyncReads + 1,
            }));
          }
        }

        const localState = useAppStore.getState();
        const localData = extractSyncableData(localState);
        const tombstones = localState.deletionTombstones;

        if (hasRemoteDataCheck(normalizeRemoteSyncableData(remoteData))) {
          const filteredLocalData: SyncableDataV2 = {
            ...localData,
            questionHistory: filterDeleted(
              localData.questionHistory,
              tombstones.questionHistory
            ),
            mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
            savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
            presets: filterDeleted(localData.presets ?? [], tombstones.presets),
          };

          let merged = mergeSyncableData(filteredLocalData, remoteData ?? null);
          if (Object.keys(tombstones.presets).length > 0) {
            merged = {
              ...merged,
              presets: (merged.presets ?? []).filter((p: unknown) => {
                if (typeof p === 'object' && p !== null) {
                  const preset = p as Record<string, unknown>;
                  const id = preset.id;
                  const idStr =
                    typeof id === 'string'
                      ? id
                      : typeof id === 'number'
                        ? String(id)
                        : '';
                  return !idStr || !(idStr in tombstones.presets);
                }
                return true;
              }),
            };
          }

          const storeUpdates = applySyncableDataToStore(merged);
          setSuppressPersistUntil(Date.now() + 1500);
          useAppStore.setState(storeUpdates);

          const deletedIds = tombstonesToDeletedIds(tombstones);
          const hasDeletions =
            deletedIds.questionHistory.length > 0 ||
            deletedIds.mcHistory.length > 0 ||
            deletedIds.savedSets.length > 0 ||
            deletedIds.presets.length > 0;
          await saveUserData(userId, toFirebaseSyncableData(merged), {
            fullSync: false,
            ...(hasDeletions ? { deletedIds } : {}),
          });
          if (hasDeletions) {
            useAppStore.setState({
              deletionTombstones: purgePersistedTombstones(
                tombstones,
                deletedIds
              ),
            });
          }

          const now = Date.now();
          syncMetadataRef.current.lastSyncTime = now;
          syncMetadataRef.current.lastSyncVersions.questionHistory =
            buildVersionMap(merged.questionHistory);
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            merged.mcHistory
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            merged.savedSets
          );
          lastSyncedSnapshotRef.current = JSON.stringify(
            buildSyncSnapshot(merged)
          );

          addSyncEvent(
            'download',
            `Synced ${remoteData?.questionHistory?.length ?? 0} question history items`
          );

          try {
            await saveDailyUsage(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
            await saveAnalyticsSummary(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
          } catch (err) {
            console.warn('[SyncV2] Usage sync failed:', err);
          }

          const qhKeepIds = new Set<string>(
            merged.questionHistory.map((item: unknown) => {
              if (typeof item === 'object' && item !== null) {
                const obj = item as Record<string, unknown>;
                const id = obj.id;
                if (typeof id === 'string') return id;
                if (typeof id === 'number') return String(id);
                return '';
              }
              return '';
            })
          );
          const mcKeepIds = new Set<string>(
            merged.mcHistory.map((item: unknown) => {
              if (typeof item === 'object' && item !== null) {
                const obj = item as Record<string, unknown>;
                const id = obj.id;
                if (typeof id === 'string') return id;
                if (typeof id === 'number') return String(id);
                return '';
              }
              return '';
            })
          );
          void deleteArchivedItems(userId, 'questionHistory', qhKeepIds).then(
            (d) => {
              if (d > 0)
                addSyncEvent(
                  'archive',
                  `Archived ${d} old question history items`
                );
            }
          );
          void deleteArchivedItems(userId, 'mcHistory', mcKeepIds).then((d) => {
            if (d > 0)
              addSyncEvent('archive', `Archived ${d} old MC history items`);
          });
        } else {
          const now = Date.now();
          syncMetadataRef.current.lastSyncTime = now;
          syncMetadataRef.current.lastSyncVersions.questionHistory =
            buildVersionMap(localData.questionHistory);
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            localData.mcHistory
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            localData.savedSets
          );

          const deletedIds = tombstonesToDeletedIds(tombstones);
          const hasDeletions =
            deletedIds.questionHistory.length > 0 ||
            deletedIds.mcHistory.length > 0 ||
            deletedIds.savedSets.length > 0 ||
            deletedIds.presets.length > 0;
          await saveUserData(userId, toFirebaseSyncableData(localData), {
            fullSync: true,
            ...(hasDeletions ? { deletedIds } : {}),
          });
          try {
            await saveDailyUsage(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
            await saveAnalyticsSummary(
              userId,
              localState.generationHistory,
              localState.questionHistory,
              localState.mcHistory
            );
          } catch (err) {
            console.warn('[SyncV2] Usage sync failed:', err);
          }
          addSyncEvent('upload', 'Initial data uploaded to cloud');
          if (hasDeletions)
            useAppStore.setState({
              deletionTombstones: purgePersistedTombstones(
                tombstones,
                deletedIds
              ),
            });
          lastSyncedSnapshotRef.current = JSON.stringify(
            buildSyncSnapshot(localData)
          );
        }

        initEngine(userId);
        await engineRef.current?.start();
        startupSyncDoneRef.current = true;
        setPendingChanges(0);
        setIsSyncEnabled(true);
        setSyncError(null);
        setSyncStatus('idle');
        setLastSyncTime(Date.now());
        toast.success('Cloud sync connected');
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to enable sync';
        setSyncError(errorMessage);
        addSyncEvent('error', `Connection failed: ${errorMessage}`);
        setIsSyncEnabled(false);
        setSyncStatus('error');
        toast.error(`Sync failed: ${errorMessage}`);
      }
    },
    [debugLog, addSyncEvent, initEngine]
  );

  const disableSync = useCallback(() => {
    manualSyncTicketRef.current += 1;
    setIsSyncing(false);
    inForceSyncRef.current = false;
    setIsSyncEnabled(false);
    isInitializedRef.current = false;
    setSyncStatus('idle');
    addSyncEvent('upload', 'Disconnected from cloud sync');
    engineRef.current?.destroy();
    engineRef.current = null;
    telemetryUnsubRef.current?.();
    telemetryUnsubRef.current = null;
    queueUnsubRef.current?.();
    queueUnsubRef.current = null;
    return Promise.resolve();
  }, [addSyncEvent]);

  const toggleSync = useCallback(() => {
    if (isSyncEnabled) {
      setIsSyncEnabled(false);
      isInitializedRef.current = false;
      setSyncStatus('idle');
      addSyncEvent('upload', 'Cloud sync paused');
      engineRef.current?.stop();
    } else if (user) {
      setIsSyncEnabled(true);
      setSyncStatus('idle');
      addSyncEvent('download', 'Cloud sync resumed');
      void engineRef.current?.start();
    }
  }, [isSyncEnabled, user, addSyncEvent]);

  // eslint-disable-next-line complexity
  const forceSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }
    const ticket = ++manualSyncTicketRef.current;
    debugLog('Manual sync started');
    setIsSyncing(true);
    inForceSyncRef.current = true;
    setSyncStatus('syncing');
    setIsSyncEnabled(true);
    isInitializedRef.current = true;
    toast.message('Syncing data...');
    const userId = getUserId(user);

    try {
      const state = useAppStore.getState();
      const localData = extractSyncableData(state);
      const tombstones = state.deletionTombstones;

      debugLog('Local data before sync', {
        questionHistory: localData.questionHistory.length,
        mcHistory: localData.mcHistory.length,
        savedSets: localData.savedSets.length,
      });

      let remoteData: FirebaseSyncableData | null = null;
      let remoteHasData = false;

      // For manual push sync, we perform a full sync rather than delta-based sync
      // This ensures all items are uploaded regardless of modification timestamps
      remoteData = await loadUserData(userId);
      setSyncTelemetry((prev) => ({
        ...prev,
        fullSyncReads: prev.fullSyncReads + 1,
      }));
      remoteHasData = hasRemoteDataCheck(
        normalizeRemoteSyncableData(remoteData)
      );

      const detectedConflicts: LegacySyncConflict[] = [];
      if (remoteHasData && remoteData) {
        const getIdString = (item: unknown): string => {
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            const id = obj.id;
            if (typeof id === 'string') return id;
            if (typeof id === 'number') return String(id);
            return '';
          }
          return '';
        };
        const remoteQhIds = new Set(
          (remoteData.questionHistory ?? []).map(getIdString)
        );
        const remoteMcIds = new Set(
          (remoteData.mcHistory ?? []).map(getIdString)
        );
        const remoteSsIds = new Set(
          (remoteData.savedSets ?? []).map(getIdString)
        );
        const prevSyncedQh = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.questionHistory)
        );
        const prevSyncedMc = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.mcHistory)
        );
        const prevSyncedSs = new Set(
          Object.keys(syncMetadataRef.current.lastSyncVersions.savedSets)
        );

        for (const id of detectDualDeletions(
          new Set(Object.keys(tombstones.questionHistory)),
          remoteQhIds,
          prevSyncedQh
        )) {
          detectedConflicts.push({
            id,
            collection: 'questionHistory',
            label: buildConflictLabel(
              'questionHistory',
              id,
              localData.questionHistory
            ),
            localDeletedAt: tombstones.questionHistory[id],
          });
        }
        for (const id of detectDualDeletions(
          new Set(Object.keys(tombstones.mcHistory)),
          remoteMcIds,
          prevSyncedMc
        )) {
          detectedConflicts.push({
            id,
            collection: 'mcHistory',
            label: buildConflictLabel('mcHistory', id, localData.mcHistory),
            localDeletedAt: tombstones.mcHistory[id],
          });
        }
        for (const id of detectDualDeletions(
          new Set(Object.keys(tombstones.savedSets)),
          remoteSsIds,
          prevSyncedSs
        )) {
          detectedConflicts.push({
            id,
            collection: 'savedSets',
            label: buildConflictLabel('savedSets', id, localData.savedSets),
            localDeletedAt: tombstones.savedSets[id],
          });
        }
        const remotePresetIds = new Set(
          (remoteData.presets ?? []).map((p: unknown): string => {
            if (typeof p === 'object' && p !== null) {
              const preset = p as Record<string, unknown>;
              const id = preset.id;
              if (typeof id === 'string') return id;
              if (typeof id === 'number') return String(id);
              return '';
            }
            return '';
          })
        );
        const prevSyncedPresets = new Set(
          (localData.presets ?? []).map((p: unknown): string => {
            if (typeof p === 'object' && p !== null) {
              const preset = p as Record<string, unknown>;
              const id = preset.id;
              if (typeof id === 'string') return id;
              if (typeof id === 'number') return String(id);
              return '';
            }
            return '';
          })
        );
        for (const id of detectDualDeletions(
          new Set(Object.keys(tombstones.presets)),
          remotePresetIds,
          prevSyncedPresets
        )) {
          detectedConflicts.push({
            id,
            collection: 'presets',
            label: buildConflictLabel('presets', id, localData.presets ?? []),
            localDeletedAt: tombstones.presets[id],
          });
        }
      }

      if (detectedConflicts.length > 0) {
        setConflicts(detectedConflicts);
        setSyncStatus('idle');
        addSyncEvent(
          'conflict',
          `${detectedConflicts.length} deletion conflict${detectedConflicts.length === 1 ? '' : 's'} detected`
        );
        toast.warning(
          `${detectedConflicts.length} deletion conflict${detectedConflicts.length === 1 ? '' : 's'} needs resolution`
        );
        return;
      }

      const filteredLocalData: SyncableDataV2 = {
        ...localData,
        questionHistory: filterDeleted(
          localData.questionHistory,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
        savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
        presets: filterDeleted(localData.presets ?? [], tombstones.presets),
      };

      let merged = remoteHasData
        ? mergeSyncableData(filteredLocalData, remoteData)
        : filteredLocalData;
      if (Object.keys(tombstones.presets).length > 0) {
        merged = {
          ...merged,
          presets: (merged.presets ?? []).filter((p: unknown) => {
            if (typeof p === 'object' && p !== null) {
              const preset = p as Record<string, unknown>;
              const id = preset.id;
              const idStr =
                typeof id === 'string'
                  ? id
                  : typeof id === 'number'
                    ? String(id)
                    : '';
              return !idStr || !(idStr in tombstones.presets);
            }
            return true;
          }),
        };
      }

      if (remoteHasData) {
        const storeUpdates = applySyncableDataToStore(merged);
        setSuppressPersistUntil(Date.now() + 1500);
        useAppStore.setState(storeUpdates);
        addSyncEvent('download', 'Merged remote updates');
      }

      const deletedIds = tombstonesToDeletedIds(tombstones);
      const hasDeletions =
        deletedIds.questionHistory.length > 0 ||
        deletedIds.mcHistory.length > 0 ||
        deletedIds.savedSets.length > 0 ||
        deletedIds.presets.length > 0;

      debugLog('Manual push sync: uploading data', {
        questionHistory: merged.questionHistory.length,
        mcHistory: merged.mcHistory.length,
        savedSets: merged.savedSets.length,
        presets: merged.presets?.length ?? 0,
        goals: merged.studyGoals ? 1 : 0,
        streakData: merged.streakData ? 1 : 0,
        hasDeletions,
      });

      await saveUserData(userId, toFirebaseSyncableData(merged), {
        // For manual push sync, do NOT use deltaSyncVersions filtering
        // This ensures ALL items are uploaded regardless of modification time
        // fullSync: true will upload everything
        fullSync: true,
        ...(hasDeletions ? { deletedIds } : {}),
      });
      if (hasDeletions)
        useAppStore.setState({
          deletionTombstones: purgePersistedTombstones(tombstones, deletedIds),
        });

      try {
        await saveDailyUsage(
          userId,
          state.generationHistory,
          state.questionHistory,
          state.mcHistory
        );
        await saveAnalyticsSummary(
          userId,
          state.generationHistory,
          state.questionHistory,
          state.mcHistory
        );
      } catch (err) {
        console.warn('[SyncV2] Usage sync failed:', err);
      }

      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(merged.questionHistory);
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        merged.mcHistory
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        merged.savedSets
      );
      lastSyncedSnapshotRef.current = JSON.stringify(buildSyncSnapshot(merged));

      setLastFlushTime(Date.now());
      setPendingChanges(0);
      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');
      toast.success('Sync complete');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Force sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Manual sync failed: ${errorMessage}`);
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      inForceSyncRef.current = false;
      if (ticket === manualSyncTicketRef.current) {
        setIsSyncing(false);
      }
    }
  }, [user, debugLog, addSyncEvent]);

  const pullSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }
    const ticket = ++manualSyncTicketRef.current;
    debugLog('Manual pull started');
    setIsSyncing(true);
    setSyncStatus('syncing');
    setIsSyncEnabled(true);
    isInitializedRef.current = true;
    toast.message('Pulling cloud updates...');
    const userId = getUserId(user);

    try {
      const state = useAppStore.getState();
      const localData = extractSyncableData(state);
      const tombstones = state.deletionTombstones;
      const remoteData = await loadUserData(userId);
      setSyncTelemetry((prev) => ({
        ...prev,
        fullSyncReads: prev.fullSyncReads + 1,
      }));
      const remoteHasData = hasRemoteDataCheck(
        normalizeRemoteSyncableData(remoteData)
      );

      const filteredLocalData: SyncableDataV2 = {
        ...localData,
        questionHistory: filterDeleted(
          localData.questionHistory,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
        savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
        presets: filterDeleted(localData.presets ?? [], tombstones.presets),
      };

      let merged = remoteHasData
        ? mergeSyncableData(filteredLocalData, remoteData)
        : filteredLocalData;
      merged = {
        ...merged,
        questionHistory: filterDeleted(
          merged.questionHistory,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(merged.mcHistory, tombstones.mcHistory),
        savedSets: filterDeleted(merged.savedSets, tombstones.savedSets),
        presets: filterDeleted(merged.presets ?? [], tombstones.presets),
      };

      const storeUpdates = applySyncableDataToStore(merged);
      setSuppressPersistUntil(Date.now() + 1500);
      useAppStore.setState(storeUpdates);

      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(merged.questionHistory);
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        merged.mcHistory
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        merged.savedSets
      );
      lastSyncedSnapshotRef.current = JSON.stringify(buildSyncSnapshot(merged));

      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');
      addSyncEvent('download', 'Pulled latest changes from cloud');
      toast.success('Pull complete');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Pull sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Pull failed: ${errorMessage}`);
      toast.error(`Pull failed: ${errorMessage}`);
    } finally {
      if (ticket === manualSyncTicketRef.current) {
        setIsSyncing(false);
      }
    }
  }, [user, debugLog, addSyncEvent]);

  const pushSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }
    const ticket = ++manualSyncTicketRef.current;
    debugLog('Manual push started');
    setIsSyncing(true);
    setSyncStatus('syncing');
    setIsSyncEnabled(true);
    isInitializedRef.current = true;
    toast.message('Pushing local changes...');
    const userId = getUserId(user);

    try {
      const state = useAppStore.getState();
      const localData = extractSyncableData(state);
      const tombstones = state.deletionTombstones;

      const filteredLocalData: SyncableDataV2 = {
        ...localData,
        questionHistory: filterDeleted(
          localData.questionHistory,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
        savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
        presets: filterDeleted(localData.presets ?? [], tombstones.presets),
      };

      const deletedIds = tombstonesToDeletedIds(tombstones);
      const hasDeletions =
        deletedIds.questionHistory.length > 0 ||
        deletedIds.mcHistory.length > 0 ||
        deletedIds.savedSets.length > 0 ||
        deletedIds.presets.length > 0;
      await saveUserData(userId, toFirebaseSyncableData(filteredLocalData), {
        deltaSyncVersions: syncMetadataRef.current.lastSyncVersions,
        fullSync: false,
        ...(hasDeletions ? { deletedIds } : {}),
      });
      if (hasDeletions)
        useAppStore.setState({
          deletionTombstones: purgePersistedTombstones(tombstones, deletedIds),
        });

      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(filteredLocalData.questionHistory);
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        filteredLocalData.mcHistory
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        filteredLocalData.savedSets
      );
      lastSyncedSnapshotRef.current = JSON.stringify(
        buildSyncSnapshot(filteredLocalData)
      );

      setLastFlushTime(Date.now());
      setPendingChanges(0);
      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');
      addSyncEvent('upload', 'Pushed local changes to cloud');
      toast.success('Push complete');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Push sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Push failed: ${errorMessage}`);
      toast.error(`Push failed: ${errorMessage}`);
    } finally {
      if (ticket === manualSyncTicketRef.current) {
        setIsSyncing(false);
      }
    }
  }, [user, debugLog, addSyncEvent]);

  const pullCollectionSync = useCallback(
    async (collection: ManualSyncCollection) => {
      if (!user) {
        setSyncError('Not signed in');
        return;
      }

      const ticket = ++manualSyncTicketRef.current;
      debugLog('Manual collection pull started', { collection });
      setIsSyncing(true);
      setSyncStatus('syncing');
      toast.message(`Pulling ${collectionLabel(collection)}...`);

      try {
        const state = useAppStore.getState();
        const localData = extractSyncableData(state);
        const tombstones = state.deletionTombstones;
        const remoteData = normalizeRemoteSyncableData(
          await loadUserData(getUserId(user))
        );
        setSyncTelemetry((prev) => ({
          ...prev,
          fullSyncReads: prev.fullSyncReads + 1,
        }));

        const base = {
          ...localData,
          questionHistory: filterDeleted(
            localData.questionHistory,
            tombstones.questionHistory
          ),
          mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
          savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
          presets: filterDeleted(localData.presets ?? [], tombstones.presets),
        };

        const source = remoteData ?? createEmptySyncableData();
        let merged: SyncableDataV2 = base;

        if (collection === 'questionHistory') {
          merged = {
            ...base,
            questionHistory: filterDeleted(
              source.questionHistory,
              tombstones.questionHistory
            ),
          };
        } else if (collection === 'mcHistory') {
          merged = {
            ...base,
            mcHistory: filterDeleted(source.mcHistory, tombstones.mcHistory),
          };
        } else if (collection === 'savedSets') {
          merged = {
            ...base,
            savedSets: filterDeleted(source.savedSets, tombstones.savedSets),
          };
        } else {
          merged = {
            ...base,
            presets: filterDeleted(source.presets ?? [], tombstones.presets),
          };
        }

        const storeUpdates = applySyncableDataToStore(merged);
        setSuppressPersistUntil(Date.now() + 1500);
        useAppStore.setState(storeUpdates);

        const now = Date.now();
        syncMetadataRef.current.lastSyncTime = now;
        syncMetadataRef.current.lastSyncVersions.questionHistory =
          buildVersionMap(merged.questionHistory);
        syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
          merged.mcHistory
        );
        syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
          merged.savedSets
        );
        lastSyncedSnapshotRef.current = JSON.stringify(
          buildSyncSnapshot(merged)
        );

        setLastSyncTime(now);
        setSyncStatus('idle');
        setSyncError(null);
        addSyncEvent('download', `Pulled ${collectionLabel(collection)}`);
        toast.success(`${collectionLabel(collection)} pull complete`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Collection pull failed';
        setSyncError(errorMessage);
        setSyncStatus('error');
        addSyncEvent(
          'error',
          `${collectionLabel(collection)} pull failed: ${errorMessage}`
        );
        toast.error(
          `${collectionLabel(collection)} pull failed: ${errorMessage}`
        );
      } finally {
        if (ticket === manualSyncTicketRef.current) {
          setIsSyncing(false);
        }
      }
    },
    [user, debugLog, addSyncEvent]
  );

  const pushCollectionSync = useCallback(
    async (collection: ManualSyncCollection) => {
      if (!user) {
        setSyncError('Not signed in');
        return;
      }

      const ticket = ++manualSyncTicketRef.current;
      debugLog('Manual collection push started', { collection });
      setIsSyncing(true);
      setSyncStatus('syncing');
      toast.message(`Pushing ${collectionLabel(collection)}...`);

      try {
        const state = useAppStore.getState();
        const localData = extractSyncableData(state);
        const tombstones = state.deletionTombstones;
        const remoteData = normalizeRemoteSyncableData(
          await loadUserData(getUserId(user))
        );
        setSyncTelemetry((prev) => ({
          ...prev,
          fullSyncReads: prev.fullSyncReads + 1,
        }));

        const filteredLocalData: SyncableDataV2 = {
          ...localData,
          questionHistory: filterDeleted(
            localData.questionHistory,
            tombstones.questionHistory
          ),
          mcHistory: filterDeleted(localData.mcHistory, tombstones.mcHistory),
          savedSets: filterDeleted(localData.savedSets, tombstones.savedSets),
          presets: filterDeleted(localData.presets ?? [], tombstones.presets),
        };

        const payload = remoteData ?? createEmptySyncableData();

        if (collection === 'questionHistory') {
          payload.questionHistory = filteredLocalData.questionHistory;
        } else if (collection === 'mcHistory') {
          payload.mcHistory = filteredLocalData.mcHistory;
        } else if (collection === 'savedSets') {
          payload.savedSets = filteredLocalData.savedSets;
        } else {
          payload.presets = filteredLocalData.presets;
        }

        const deletedIds = buildDeletedIdsForCollection(tombstones, collection);
        const hasDeletions =
          deletedIds.questionHistory.length > 0 ||
          deletedIds.mcHistory.length > 0 ||
          deletedIds.savedSets.length > 0 ||
          deletedIds.presets.length > 0;

        await saveUserData(getUserId(user), toFirebaseSyncableData(payload), {
          fullSync: true,
          ...(hasDeletions ? { deletedIds } : {}),
        });

        if (hasDeletions) {
          useAppStore.setState({
            deletionTombstones: purgePersistedTombstones(
              tombstones,
              deletedIds
            ),
          });
        }

        setLastFlushTime(Date.now());
        setLastSyncTime(Date.now());
        setSyncStatus('idle');
        setSyncError(null);
        addSyncEvent('upload', `Pushed ${collectionLabel(collection)}`);
        toast.success(`${collectionLabel(collection)} push complete`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Collection push failed';
        setSyncError(errorMessage);
        setSyncStatus('error');
        addSyncEvent(
          'error',
          `${collectionLabel(collection)} push failed: ${errorMessage}`
        );
        toast.error(
          `${collectionLabel(collection)} push failed: ${errorMessage}`
        );
      } finally {
        if (ticket === manualSyncTicketRef.current) {
          setIsSyncing(false);
        }
      }
    },
    [user, debugLog, addSyncEvent]
  );

  const retryQueuedOpsNow = useCallback(() => {
    if (!engineRef.current) {
      toast.info('Sync engine is not initialized yet');
      return;
    }
    engineRef.current.retryNow();
    addSyncEvent('retry', 'Manual retry requested for queued operations');
    toast.message('Retrying queued operations...');
  }, [addSyncEvent]);

  const resolveConflicts = useCallback(
    (resolutions: Map<string, 'keep' | 'delete'>) => {
      debugLog('Resolving conflicts', { total: resolutions.size });
      const state = useAppStore.getState();
      let tombstones = state.deletionTombstones;
      for (const [id, resolution] of resolutions) {
        const conflict = conflicts.find((c) => c.id === id);
        if (!conflict) continue;
        if (resolution === 'keep')
          tombstones = removeTombstone(tombstones, conflict.collection, id);
      }
      useAppStore.setState({ deletionTombstones: tombstones });
      setConflicts([]);
      const kept = Array.from(resolutions.values()).filter(
        (r) => r === 'keep'
      ).length;
      const deleted = resolutions.size - kept;
      if (kept > 0)
        addSyncEvent(
          'conflict',
          `Restored ${kept} item${kept === 1 ? '' : 's'} from deletion`
        );
      if (deleted > 0)
        addSyncEvent(
          'conflict',
          `Confirmed deletion of ${deleted} item${deleted === 1 ? '' : 's'}`
        );
      void forceSync();
    },
    [conflicts, debugLog, addSyncEvent, forceSync]
  );

  useEffect(() => {
    if (
      !user ||
      !isSyncEnabled ||
      !isOnline ||
      !useAppStore.getState().isHydrated ||
      startupSyncDoneRef.current
    )
      return;
    startupSyncDoneRef.current = true;
    const runStartupCheck = async () => {
      try {
        const hasDeletes = hasPendingLocalDeletes();
        if (hasDeletes) {
          debugLog('Startup reconciliation: pending deletes');
          await forceSync();
          return;
        }
        const current = useAppStore.getState();
        const remoteCounts = await getRemoteHistoryCounts(getUserId(user));
        const hasCountMismatch =
          remoteCounts.questionHistory !== current.questionHistory.length ||
          remoteCounts.mcHistory !== current.mcHistory.length;
        const hasPresetsMismatch = await isRemotePresetsArrayDifferent(
          getUserId(user),
          current.presets ?? []
        );
        if (hasCountMismatch || hasPresetsMismatch) {
          debugLog('Startup reconciliation: alignment mismatch');
          await forceSync();
        } else {
          setSyncTelemetry((prev) => ({
            ...prev,
            deltaNoChangePasses: prev.deltaNoChangePasses + 1,
            estimatedReadsAvoided: prev.estimatedReadsAvoided + 1,
          }));
          debugLog('Startup reconciliation skipped');
        }
      } catch {
        startupSyncDoneRef.current = false;
        addSyncEvent(
          'retry',
          'Startup reconciliation failed; will retry on next app focus'
        );
      }
    };
    void runStartupCheck();
  }, [
    user,
    isSyncEnabled,
    isOnline,
    forceSync,
    debugLog,
    addSyncEvent,
    hasPendingLocalDeletes,
  ]);

  useEffect(() => {
    const maybeCatchUp = () => {
      if (document.visibilityState !== 'visible') return;
      if (!user || !isSyncEnabled || !navigator.onLine || isSyncing) return;
      if (conflicts.length > 0) return;
      const now = Date.now();
      if (now - foregroundSyncAtRef.current < FOREGROUND_SYNC_COOLDOWN_MS)
        return;
      foregroundSyncAtRef.current = now;
      debugLog('Foreground catch-up sync triggered');
      void forceSync();
    };
    window.addEventListener('focus', maybeCatchUp);
    document.addEventListener('visibilitychange', maybeCatchUp);
    return () => {
      window.removeEventListener('focus', maybeCatchUp);
      document.removeEventListener('visibilitychange', maybeCatchUp);
    };
  }, [user, isSyncEnabled, isSyncing, conflicts.length, forceSync, debugLog]);

  const forceSyncRef = useRef(forceSync);
  forceSyncRef.current = forceSync;
  const autoSyncIntervalMinutes = useAppStore((s) => s.autoSyncIntervalMinutes);

  useEffect(() => {
    if (
      !autoSyncIntervalMinutes ||
      autoSyncIntervalMinutes <= 0 ||
      !user ||
      !isSyncEnabled
    )
      return;
    const intervalMs = autoSyncIntervalMinutes * 60 * 1000;
    const timerId = setInterval(() => {
      if (!navigator.onLine || isSyncing) return;
      void forceSyncRef.current();
    }, intervalMs);
    return () => clearInterval(timerId);
  }, [user, isSyncEnabled, isSyncing, autoSyncIntervalMinutes]);

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
    queuedOpsCount: queuedOpsCount,
    lastFlushTime,
    syncTelemetry,
    conflicts,
    enableSync,
    disableSync,
    toggleSync,
    pullSync,
    pushSync,
    pullCollectionSync,
    pushCollectionSync,
    forceSync,
    retryQueuedOpsNow,
    resolveConflicts,
  };
}
