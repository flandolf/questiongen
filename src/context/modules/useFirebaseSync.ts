import { AppState, useAppStore, setSuppressPersistUntil } from '@/store';
import {
  QuestionHistoryEntry,
  McHistoryEntry,
  SavedQuestionSet,
  Preset,
  StudyGoals,
  StreakData,
  SyncOperation,
  SyncQueueState,
  SyncCollection,
  SYNC_COLLECTIONS,
} from '@/types';
import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  SyncableData,
  FirebaseUser,
  SyncMetadata,
  onAuthChange,
  saveUserData,
  getDeltaSyncData,
  getRemoteHistoryCounts,
  isRemotePresetsArrayDifferent,
  loadChangedItems,
  buildVersionMap,
  signUpWithEmail,
  signInWithEmail,
  loadUserData,
  migrateUserDataForCompaction,
  deleteArchivedItems,
  saveDailyUsage,
  saveAnalyticsSummary,
  upsertQuestionHistoryItems,
  deleteQuestionHistoryItems,
  upsertMcHistoryItems,
  deleteMcHistoryItems,
  upsertSavedSets,
  deleteSavedSets,
  replacePresets,
  upsertPresets,
  deletePresets,
  upsertGoals,
} from './useFirebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase-init';
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
const LEGACY_SYNC_QUEUE_STORAGE_KEY = 'firebase_sync_queue_v1';
const SYNC_QUEUE_STORAGE_KEY_PREFIX = 'firebase_sync_queue_v2';
const SYNC_FLUSH_DEBOUNCE_MS = 500;
const FOREGROUND_SYNC_COOLDOWN_MS = 60_000;

// Persist sync-enabled preference so it survives reloads
const SYNC_ENABLED_STORAGE_KEY = 'firebase_sync_enabled';
const VALID_SYNC_COLLECTIONS: ReadonlySet<SyncCollection> = new Set(
  SYNC_COLLECTIONS
);

function isSyncCollection(value: unknown): value is SyncCollection {
  return (
    typeof value === 'string' &&
    VALID_SYNC_COLLECTIONS.has(value as SyncCollection)
  );
}

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

function getSyncQueueStorageKey(userId: string): string {
  return `${SYNC_QUEUE_STORAGE_KEY_PREFIX}:${userId}`;
}

function readPersistedSyncQueue(userId: string): SyncQueueState {
  try {
    const nextKey = getSyncQueueStorageKey(userId);
    const raw =
      localStorage.getItem(nextKey) ??
      // One-time compatibility fallback for queues persisted before user scoping.
      localStorage.getItem(LEGACY_SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return { operations: [], updatedAt: 0 };
    const parsed = JSON.parse(raw) as SyncQueueState;
    if (!Array.isArray(parsed.operations)) {
      return { operations: [], updatedAt: 0 };
    }
    const normalizedOps = parsed.operations
      .map((op) => {
        if (!op || typeof op !== 'object') return null;
        const raw = op as Partial<SyncOperation>;
        const legacyCollection =
          typeof (op as { collection?: unknown }).collection === 'string'
            ? ((op as { collection?: string }).collection as string)
            : undefined;
        // Legacy queue compatibility: older builds tracked presets/goals/streakData
        // as pseudo-collections. They now map to `settings` docs.
        if (legacyCollection === 'presets') {
          return {
            ...raw,
            collection: 'settings' as SyncCollection,
            entityId: 'presets',
          };
        }
        if (
          legacyCollection === 'studyGoals' ||
          legacyCollection === 'streakData'
        ) {
          return {
            ...raw,
            collection: 'settings' as SyncCollection,
            entityId: 'goals',
          };
        }
        return raw;
      })
      .filter(
        (op): op is SyncOperation =>
          !!op &&
          typeof op.id === 'string' &&
          isSyncCollection(op.collection) &&
          (op.opType === 'upsert' || op.opType === 'delete')
      );
    return {
      operations: normalizedOps,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    };
  } catch {
    return { operations: [], updatedAt: 0 };
  }
}

function writePersistedSyncQueue(userId: string, queue: SyncQueueState): void {
  try {
    localStorage.setItem(getSyncQueueStorageKey(userId), JSON.stringify(queue));
    // Clear legacy queue key once we successfully persist to the new key.
    localStorage.removeItem(LEGACY_SYNC_QUEUE_STORAGE_KEY);
  } catch {
    // localStorage unavailable — non-fatal
  }
}

function newSyncOp(
  collection: SyncCollection,
  opType: 'upsert' | 'delete',
  entityId?: string
): SyncOperation {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    collection,
    opType,
    entityId,
    createdAt: Date.now(),
  };
}

function stableHash(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
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
    // Presets: remote always wins for existing IDs. Unlike history items, presets
    // are settings documents without reliable lastModified timestamps, so mergeById
    // (newer-wins by timestamp) lets stale local presets overwrite richer remote
    // ones — causing a permanent startup mismatch loop. Local-only presets (not
    // yet on remote) are preserved.
    presets: (() => {
      const remoteArr = castArray<Preset>(remote?.presets ?? []);
      const remoteById = new Map(remoteArr.map((p) => [p.id, p]));
      const localOnly = (local.presets ?? []).filter(
        (p) => p.id && !remoteById.has(p.id)
      );
      return [...remoteArr, ...localOnly];
    })(),
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

type SnapshotItem = { id: string; lm: number };
type SyncSnapshot = {
  qh: SnapshotItem[];
  mch: SnapshotItem[];
  ss: SnapshotItem[];
  pr: SnapshotItem[];
};

function toSortedSnapshotItems<T extends HasId>(items: T[]): SnapshotItem[] {
  return items
    .map((item) => ({ id: item.id ?? '', lm: getItemLastModified(item) }))
    .filter((item) => item.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildSyncSnapshot(data: SyncableData): SyncSnapshot {
  return {
    qh: toSortedSnapshotItems(data.questionHistory),
    mch: toSortedSnapshotItems(data.mcHistory),
    ss: toSortedSnapshotItems(data.savedSets),
    pr: toSortedSnapshotItems(data.presets ?? []),
  };
}

function toSnapshotMap(items: SnapshotItem[]): Map<string, number> {
  return new Map(items.map((item) => [item.id, item.lm]));
}

function countSnapshotDiff(
  current: SyncSnapshot,
  previous: SyncSnapshot
): number {
  let count = 0;
  const compare = (cur: SnapshotItem[], prev: SnapshotItem[]) => {
    const curMap = toSnapshotMap(cur);
    const prevMap = toSnapshotMap(prev);
    for (const [id, lm] of curMap.entries()) {
      if (!prevMap.has(id) || prevMap.get(id) !== lm) {
        count += 1;
      }
    }
    for (const id of prevMap.keys()) {
      if (!curMap.has(id)) {
        count += 1;
      }
    }
  };
  compare(current.qh, previous.qh);
  compare(current.mch, previous.mch);
  compare(current.ss, previous.ss);
  compare(current.pr, previous.pr);
  return count;
}

function parseSnapshot(raw: string): SyncSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSnapshot>;
    const normalize = (items: unknown): SnapshotItem[] => {
      if (!Array.isArray(items)) return [];
      return items
        .filter(
          (item): item is SnapshotItem =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as SnapshotItem).id === 'string' &&
            typeof (item as SnapshotItem).lm === 'number'
        )
        .map((item) => ({ id: item.id, lm: item.lm }));
    };
    return {
      qh: normalize(parsed.qh),
      mch: normalize(parsed.mch),
      ss: normalize(parsed.ss),
      pr: normalize(parsed.pr),
    };
  } catch {
    return null;
  }
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
  queuedOpsCount: number;
  lastFlushTime: number | null;
  syncTelemetry: {
    queuedOpsTotal: number;
    flushCount: number;
    coalescedOpsSaved: number;
    hashNoopSkips: number;
    deltaChecks: number;
    deltaNoChangePasses: number;
    fullSyncReads: number;
    retryCount: number;
    estimatedWritesAvoided: number;
    estimatedReadsAvoided: number;
  };
  conflicts: SyncConflict[];
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean
  ) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
  pullSync: () => Promise<void>;
  pushSync: () => Promise<void>;
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
  const [queuedOpsCount, setQueuedOpsCount] = useState(0);
  const [lastFlushTime, setLastFlushTime] = useState<number | null>(null);
  const [syncTelemetry, setSyncTelemetry] = useState({
    queuedOpsTotal: 0,
    flushCount: 0,
    coalescedOpsSaved: 0,
    hashNoopSkips: 0,
    deltaChecks: 0,
    deltaNoChangePasses: 0,
    fullSyncReads: 0,
    retryCount: 0,
    estimatedWritesAvoided: 0,
    estimatedReadsAvoided: 0,
  });

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
  const startupSyncDoneRef = useRef(false);
  const foregroundSyncAtRef = useRef(0);
  const activeQueueUserIdRef = useRef<string>('anonymous');
  const flushingQueueRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const syncQueueRef = useRef<SyncQueueState>(
    readPersistedSyncQueue(activeQueueUserIdRef.current)
  );
  const hashedEntitiesRef = useRef<{
    questionHistory: Map<string, string>;
    mcHistory: Map<string, string>;
    savedSets: Map<string, string>;
    presets: Map<string, string>;
    studyGoals: string;
    streakData: string;
  }>({
    questionHistory: new Map(),
    mcHistory: new Map(),
    savedSets: new Map(),
    presets: new Map(),
    studyGoals: '',
    streakData: '',
  });
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

  const persistQueue = useCallback((queue: SyncQueueState) => {
    syncQueueRef.current = queue;
    setQueuedOpsCount(queue.operations.length);
    writePersistedSyncQueue(activeQueueUserIdRef.current, queue);
  }, []);

  const patchTelemetry = useCallback(
    (
      updater: (
        prev: UseFirebaseSyncReturn['syncTelemetry']
      ) => UseFirebaseSyncReturn['syncTelemetry']
    ) => {
      setSyncTelemetry((prev) => updater(prev));
    },
    []
  );

  const enqueueSyncOps = useCallback(
    (ops: SyncOperation[]) => {
      if (ops.length === 0) return;
      const next: SyncQueueState = {
        operations: [...syncQueueRef.current.operations, ...ops],
        updatedAt: Date.now(),
      };
      persistQueue(next);
      patchTelemetry((prev) => ({
        ...prev,
        queuedOpsTotal: prev.queuedOpsTotal + ops.length,
      }));
      addSyncEvent(
        'upload',
        `Queued ${ops.length} sync operation${ops.length === 1 ? '' : 's'}`
      );
    },
    [addSyncEvent, persistQueue, patchTelemetry]
  );

  const flushSyncQueue = useCallback(async () => {
    if (flushingQueueRef.current) return;
    if (!user || !isSyncEnabled || !isOnline || !isInitializedRef.current) {
      return;
    }
    const queue = syncQueueRef.current;
    if (queue.operations.length === 0) return;

    flushingQueueRef.current = true;
    const userId = getUserId(user);
    const state = useAppStore.getState();

    try {
      const latestByKey = new Map<string, SyncOperation>();
      for (const op of queue.operations) {
        const key = `${op.collection}:${op.entityId ?? '__all__'}`;
        const existing = latestByKey.get(key);
        if (!existing || op.createdAt >= existing.createdAt) {
          latestByKey.set(key, op);
        }
      }
      const ops = Array.from(latestByKey.values());
      const coalescedSaved = queue.operations.length - ops.length;
      if (coalescedSaved > 0) {
        patchTelemetry((prev) => ({
          ...prev,
          coalescedOpsSaved: prev.coalescedOpsSaved + coalescedSaved,
          estimatedWritesAvoided: prev.estimatedWritesAvoided + coalescedSaved,
        }));
      }

      const upsertQhIds = new Set<string>();
      const deleteQhIds = new Set<string>();
      const upsertMcIds = new Set<string>();
      const deleteMcIds = new Set<string>();
      const upsertSsIds = new Set<string>();
      const deleteSsIds = new Set<string>();
      const upsertPresetIds = new Set<string>();
      const deletePresetIds = new Set<string>();
      let upsertGoalsRequested = false;
      let upsertPresetsRequested = false;

      for (const op of ops) {
        if (op.collection === 'questionHistory' && op.entityId) {
          if (op.opType === 'delete') {
            upsertQhIds.delete(op.entityId);
            deleteQhIds.add(op.entityId);
          } else {
            deleteQhIds.delete(op.entityId);
            upsertQhIds.add(op.entityId);
          }
        }
        if (op.collection === 'mcHistory' && op.entityId) {
          if (op.opType === 'delete') {
            upsertMcIds.delete(op.entityId);
            deleteMcIds.add(op.entityId);
          } else {
            deleteMcIds.delete(op.entityId);
            upsertMcIds.add(op.entityId);
          }
        }
        if (op.collection === 'savedSets' && op.entityId) {
          if (op.opType === 'delete') {
            upsertSsIds.delete(op.entityId);
            deleteSsIds.add(op.entityId);
          } else {
            deleteSsIds.delete(op.entityId);
            upsertSsIds.add(op.entityId);
          }
        }
        if (op.collection === 'settings') {
          if (op.entityId === 'presets') {
            upsertPresetsRequested = true;
            if (op.opType === 'delete') {
              // Deleting presets is represented as replacing settings/presets with local state.
              deletePresetIds.clear();
              upsertPresetIds.clear();
            }
          } else if (op.entityId === 'goals' || !op.entityId) {
            upsertGoalsRequested = true;
          }
        }
      }

      const qhItems = state.questionHistory.filter((item) =>
        upsertQhIds.has(item.id)
      );
      const mcItems = state.mcHistory.filter((item) =>
        upsertMcIds.has(item.id)
      );
      const ssItems = state.savedSets.filter((item) =>
        upsertSsIds.has(item.id)
      );
      const presetItems = (state.presets ?? []).filter((item) =>
        upsertPresetIds.has(item.id)
      );

      const collectionOps: Promise<unknown>[] = [
        upsertQuestionHistoryItems(
          userId,
          qhItems as Record<string, unknown>[]
        ),
        deleteQuestionHistoryItems(userId, Array.from(deleteQhIds)),
        upsertMcHistoryItems(userId, mcItems as Record<string, unknown>[]),
        deleteMcHistoryItems(userId, Array.from(deleteMcIds)),
        upsertSavedSets(userId, ssItems as Record<string, unknown>[]),
        deleteSavedSets(userId, Array.from(deleteSsIds)),
      ];
      if (!upsertPresetsRequested) {
        collectionOps.push(upsertPresets(userId, presetItems));
        collectionOps.push(deletePresets(userId, Array.from(deletePresetIds)));
      } else {
        collectionOps.push(replacePresets(userId, state.presets ?? []));
      }
      await Promise.all(collectionOps);

      if (upsertGoalsRequested) {
        await upsertGoals(
          userId,
          (state.studyGoals ?? {}) as unknown as Record<string, unknown>,
          (state.streakData ?? {}) as unknown as Record<string, unknown>
        );
      }

      const persistedPresetDeletionIds = upsertPresetsRequested
        ? Object.keys(state.deletionTombstones.presets)
        : Array.from(deletePresetIds);

      const deletedIds = {
        questionHistory: Array.from(deleteQhIds),
        mcHistory: Array.from(deleteMcIds),
        savedSets: Array.from(deleteSsIds),
        presets: persistedPresetDeletionIds,
      };
      if (
        deletedIds.questionHistory.length +
          deletedIds.mcHistory.length +
          deletedIds.savedSets.length +
          deletedIds.presets.length >
        0
      ) {
        useAppStore.setState({
          deletionTombstones: purgePersistedTombstones(
            state.deletionTombstones,
            deletedIds
          ),
        });
      }

      persistQueue({ operations: [], updatedAt: Date.now() });
      setLastFlushTime(Date.now());
      patchTelemetry((prev) => ({
        ...prev,
        flushCount: prev.flushCount + 1,
      }));
      addSyncEvent(
        'upload',
        `Flushed ${ops.length} queued sync operation${ops.length === 1 ? '' : 's'}`
      );
    } catch (error) {
      debugLog('Flush sync queue failed', error);
      addSyncEvent('retry', 'Queued sync failed; will retry automatically');
      patchTelemetry((prev) => ({ ...prev, retryCount: prev.retryCount + 1 }));
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void flushSyncQueue();
      }, 3000);
    } finally {
      flushingQueueRef.current = false;
    }
  }, [
    user,
    isSyncEnabled,
    isOnline,
    addSyncEvent,
    debugLog,
    persistQueue,
    patchTelemetry,
  ]);

  const scheduleFlushSyncQueue = useCallback(() => {
    if (flushDebounceTimerRef.current) {
      clearTimeout(flushDebounceTimerRef.current);
    }
    flushDebounceTimerRef.current = setTimeout(() => {
      flushDebounceTimerRef.current = null;
      void flushSyncQueue();
    }, SYNC_FLUSH_DEBOUNCE_MS);
  }, [flushSyncQueue]);

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

  useEffect(() => {
    setQueuedOpsCount(syncQueueRef.current.operations.length);
  }, []);

  useEffect(() => {
    const IMMEDIATE_LOGS_KEY = 'firebase_live_immediate_logs_v1';

    const loadImmediateLogs = () => {
      try {
        const raw = localStorage.getItem(IMMEDIATE_LOGS_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw) as any[];

        const mapped = arr
          .slice()
          .reverse() // newest first
          .map((l, idx) => {
            // Support both legacy immediate log shapes and the new compact shape
            if (l && typeof l === 'object' && 'ts' in l && 'message' in l) {
              const ts = typeof l.ts === 'number' ? l.ts : Date.now();
              return {
                id: `live-${idx}-${ts}`,
                timestamp: ts,
                message: `[LIVE ${String(l.level ?? 'info').toUpperCase()}] ${String(l.message)}`,
                data: l,
              } as DebugLogEntry;
            }
            if (
              l &&
              typeof l === 'object' &&
              typeof l.id === 'string' &&
              typeof l.timestamp === 'number'
            ) {
              return {
                id: `immediate-${l.id}`,
                timestamp: l.timestamp,
                message: `${l.collection ?? ''} ${l.opType ?? ''} ${l.status ?? ''}$
                  ${l.message ? ' - ' + l.message : ''}`,
                data: l,
              } as DebugLogEntry;
            }
            return null;
          })
          .filter(Boolean) as DebugLogEntry[];

        setDebugLogs((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const toAdd = mapped.filter((m) => !existingIds.has(m.id));
          const combined = [...toAdd, ...prev];
          return combined.slice(0, DEBUG_LOG_LIMIT);
        });
      } catch (e) {
        // don't fail the hook if parsing fails
        // eslint-disable-next-line no-console
        console.warn('useFirebaseSync: failed to load immediate logs', e);
      }
    };

    loadImmediateLogs();

    const storageHandler = (ev: StorageEvent) => {
      if (ev.key === IMMEDIATE_LOGS_KEY) {
        loadImmediateLogs();
      }
    };

    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('storage', storageHandler);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (flushDebounceTimerRef.current) {
        clearTimeout(flushDebounceTimerRef.current);
      }
      if (suppressAutoSaveTimerRef.current) {
        clearTimeout(suppressAutoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user || !isSyncEnabled || !isOnline) return;
    if (syncQueueRef.current.operations.length === 0) return;
    scheduleFlushSyncQueue();
  }, [user, isSyncEnabled, isOnline, scheduleFlushSyncQueue]);

  // Track pending changes by comparing current state to last synced snapshot
  useEffect(() => {
    if (!user || !isSyncEnabled || !isInitializedRef.current) return;

    const checkPending = () => {
      const state = useAppStore.getState();
      if (!state.isHydrated) return;
      const syncable = extractSyncableData(state);
      const currentSnapshot = buildSyncSnapshot(syncable);
      const snapshot = JSON.stringify(currentSnapshot);

      if (snapshot !== lastSyncedSnapshotRef.current) {
        const previousSnapshot = parseSnapshot(lastSyncedSnapshotRef.current);
        if (!previousSnapshot) {
          setPendingChanges(-1);
          return;
        }
        setPendingChanges(countSnapshotDiff(currentSnapshot, previousSnapshot));
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

  useEffect(() => {
    if (!user || !isSyncEnabled || !isInitializedRef.current) return;

    const getIds = (items: Array<{ id: string }>) =>
      new Set(items.map((i) => i.id));
    const cache = hashedEntitiesRef.current;
    const current = useAppStore.getState();
    cache.questionHistory = new Map(
      current.questionHistory.map((item) => [item.id, stableHash(item)])
    );
    cache.mcHistory = new Map(
      current.mcHistory.map((item) => [item.id, stableHash(item)])
    );
    cache.savedSets = new Map(
      current.savedSets.map((item) => [item.id, stableHash(item)])
    );
    cache.presets = new Map(
      (current.presets ?? []).map((item) => [item.id, stableHash(item)])
    );
    cache.studyGoals = stableHash(current.studyGoals);
    cache.streakData = stableHash(current.streakData);

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (!state.isHydrated || suppressAutoSaveRef.current) return;

      const ops: SyncOperation[] = [];
      let hashSkips = 0;

      if (state.questionHistory !== prevState.questionHistory) {
        const prevIds = getIds(prevState.questionHistory);
        const currIds = getIds(state.questionHistory);
        for (const item of state.questionHistory) {
          const nextHash = stableHash(item);
          const prevHash = cache.questionHistory.get(item.id);
          if (!prevIds.has(item.id)) {
            ops.push(newSyncOp('questionHistory', 'upsert', item.id));
            cache.questionHistory.set(item.id, nextHash);
          } else if (prevHash !== nextHash) {
            ops.push(newSyncOp('questionHistory', 'upsert', item.id));
            cache.questionHistory.set(item.id, nextHash);
          } else {
            hashSkips++;
          }
        }
        for (const item of prevState.questionHistory) {
          if (!currIds.has(item.id)) {
            ops.push(newSyncOp('questionHistory', 'delete', item.id));
            cache.questionHistory.delete(item.id);
          }
        }
      }

      if (state.mcHistory !== prevState.mcHistory) {
        const prevIds = getIds(prevState.mcHistory);
        const currIds = getIds(state.mcHistory);
        for (const item of state.mcHistory) {
          const nextHash = stableHash(item);
          const prevHash = cache.mcHistory.get(item.id);
          if (!prevIds.has(item.id)) {
            ops.push(newSyncOp('mcHistory', 'upsert', item.id));
            cache.mcHistory.set(item.id, nextHash);
          } else if (prevHash !== nextHash) {
            ops.push(newSyncOp('mcHistory', 'upsert', item.id));
            cache.mcHistory.set(item.id, nextHash);
          } else {
            hashSkips++;
          }
        }
        for (const item of prevState.mcHistory) {
          if (!currIds.has(item.id)) {
            ops.push(newSyncOp('mcHistory', 'delete', item.id));
            cache.mcHistory.delete(item.id);
          }
        }
      }

      if (state.savedSets !== prevState.savedSets) {
        const prevIds = getIds(prevState.savedSets);
        const currIds = getIds(state.savedSets);
        for (const item of state.savedSets) {
          const nextHash = stableHash(item);
          const prevHash = cache.savedSets.get(item.id);
          if (!prevIds.has(item.id)) {
            ops.push(newSyncOp('savedSets', 'upsert', item.id));
            cache.savedSets.set(item.id, nextHash);
          } else if (prevHash !== nextHash) {
            ops.push(newSyncOp('savedSets', 'upsert', item.id));
            cache.savedSets.set(item.id, nextHash);
          } else {
            hashSkips++;
          }
        }
        for (const item of prevState.savedSets) {
          if (!currIds.has(item.id)) {
            ops.push(newSyncOp('savedSets', 'delete', item.id));
            cache.savedSets.delete(item.id);
          }
        }
      }

      if (state.presets !== prevState.presets) {
        const prevIds = getIds(prevState.presets ?? []);
        const currIds = getIds(state.presets ?? []);
        for (const item of state.presets ?? []) {
          const nextHash = stableHash(item);
          const prevHash = cache.presets.get(item.id);
          if (!prevIds.has(item.id)) {
            ops.push(newSyncOp('settings', 'upsert', 'presets'));
            cache.presets.set(item.id, nextHash);
          } else if (prevHash !== nextHash) {
            ops.push(newSyncOp('settings', 'upsert', 'presets'));
            cache.presets.set(item.id, nextHash);
          } else {
            hashSkips++;
          }
        }
        for (const item of prevState.presets ?? []) {
          if (!currIds.has(item.id)) {
            ops.push(newSyncOp('settings', 'upsert', 'presets'));
            cache.presets.delete(item.id);
          }
        }
      }
      if (state.studyGoals !== prevState.studyGoals) {
        const nextHash = stableHash(state.studyGoals);
        if (cache.studyGoals !== nextHash) {
          cache.studyGoals = nextHash;
          ops.push(newSyncOp('settings', 'upsert', 'goals'));
        }
      }
      if (state.streakData !== prevState.streakData) {
        const nextHash = stableHash(state.streakData);
        if (cache.streakData !== nextHash) {
          cache.streakData = nextHash;
          ops.push(newSyncOp('settings', 'upsert', 'goals'));
        }
      }

      if (ops.length > 0) {
        enqueueSyncOps(ops);
        if (navigator.onLine) {
          scheduleFlushSyncQueue();
        }
      }
      if (hashSkips > 0) {
        patchTelemetry((prev) => ({
          ...prev,
          hashNoopSkips: prev.hashNoopSkips + hashSkips,
          estimatedWritesAvoided: prev.estimatedWritesAvoided + hashSkips,
        }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    user,
    isSyncEnabled,
    enqueueSyncOps,
    scheduleFlushSyncQueue,
    patchTelemetry,
  ]);

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
          await saveAnalyticsSummary(
            getUserId(user),
            current.generationHistory,
            current.questionHistory,
            current.mcHistory
          );
          debugLog('Daily usage and analytics summary synced');
        } catch (err) {
          console.warn('[Firebase] Usage and analytics sync failed:', err);
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
      const nextUserId = getUserId(firebaseUser);
      activeQueueUserIdRef.current = nextUserId;
      const queueForUser = readPersistedSyncQueue(nextUserId);
      syncQueueRef.current = queueForUser;
      setQueuedOpsCount(queueForUser.operations.length);

      debugLog('Auth changed:', firebaseUser?.uid ?? 'null');
      setUser(firebaseUser);
      if (!firebaseUser) {
        setIsSyncEnabled(false);
        isInitializedRef.current = false;
        startupSyncDoneRef.current = false;
        setSyncStatus('idle');
      } else {
        const persisted = readPersistedSyncEnabled();
        debugLog('Persisted sync preference:', persisted);
        if (persisted) {
          setIsSyncEnabled(true);
          // Mark initialized so the queue-sync subscriber activates on
          // session-restore reloads (where enableSync is not called).
          isInitializedRef.current = true;
          // Populate the hash cache from the current store state so the
          // subscriber can detect subsequent changes correctly.
          const current = useAppStore.getState();
          if (current.isHydrated) {
            hashedEntitiesRef.current.questionHistory = new Map(
              current.questionHistory.map((item) => [item.id, stableHash(item)])
            );
            hashedEntitiesRef.current.mcHistory = new Map(
              current.mcHistory.map((item) => [item.id, stableHash(item)])
            );
            hashedEntitiesRef.current.savedSets = new Map(
              current.savedSets.map((item) => [item.id, stableHash(item)])
            );
            hashedEntitiesRef.current.presets = new Map(
              (current.presets ?? []).map((item) => [item.id, stableHash(item)])
            );
            hashedEntitiesRef.current.studyGoals = stableHash(
              current.studyGoals
            );
            hashedEntitiesRef.current.streakData = stableHash(
              current.streakData
            );
          }
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
        patchTelemetry((prev) => ({
          ...prev,
          fullSyncReads: prev.fullSyncReads + 1,
        }));
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
            patchTelemetry((prev) => ({
              ...prev,
              fullSyncReads: prev.fullSyncReads + 1,
            }));
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

          // Persist merged result (including deletions) back to cloud on connect.
          // Without this, tombstoned local deletions (like presets) can remain
          // in Firestore and later reappear on subsequent syncs.
          const deletedIds = tombstonesToDeletedIds(tombstones);
          const hasDeletions =
            deletedIds.questionHistory.length > 0 ||
            deletedIds.mcHistory.length > 0 ||
            deletedIds.savedSets.length > 0 ||
            deletedIds.presets.length > 0;
          await saveUserData(userId, merged, {
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

          // Initialize sync metadata from merged data
          const now = Date.now();
          syncMetadataRef.current.lastSyncTime = now;
          syncMetadataRef.current.questionHistorySyncTime = now;
          syncMetadataRef.current.mcHistorySyncTime = now;
          syncMetadataRef.current.savedSetsSyncTime = now;
          syncMetadataRef.current.lastSyncVersions.questionHistory =
            buildVersionMap(
              merged.questionHistory as Array<Record<string, unknown>>
            );
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            merged.mcHistory as Array<Record<string, unknown>>
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            merged.savedSets as Array<Record<string, unknown>>
          );

          // Set snapshot so pending changes shows 0 after initial merge
          lastSyncedSnapshotRef.current = JSON.stringify(
            buildSyncSnapshot(merged)
          );

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

          // Sync daily usage and analytics summary to Firestore
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
            debugLog('Daily usage and analytics summary synced on connect');
          } catch (usageError) {
            console.warn(
              '[Firebase] Usage and analytics sync failed on connect:',
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
              >
            );
          syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
            localDataRef.current.mcHistory as Array<Record<string, unknown>>
          );
          syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
            localDataRef.current.savedSets as Array<Record<string, unknown>>
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

          // Sync daily usage and analytics summary to Firestore
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
            debugLog('Daily usage and analytics summary synced on connect');
          } catch (usageError) {
            console.warn(
              '[Firebase] Usage and analytics sync failed on connect:',
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

          lastSyncedSnapshotRef.current = JSON.stringify(
            buildSyncSnapshot(localDataRef.current)
          );
        }
        isInitializedRef.current = true;
        startupSyncDoneRef.current = true;
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
    [debugLog, addSyncEvent, suppressAutoSaveTemporarily, patchTelemetry]
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

      // 1. Read remote (delta-first).
      // Tombstones are propagated by delete operations during upload, so they
      // do not require a full remote pre-read.
      let remoteData: SyncableData | null = null;
      let remoteHasData = false;
      let usedPartialRemoteSnapshot = false;
      const remoteDeletedIds = {
        questionHistory: new Set<string>(),
        mcHistory: new Set<string>(),
        savedSets: new Set<string>(),
      };

      const delta = await getDeltaSyncData(userId, localData);
      patchTelemetry((prev) => ({
        ...prev,
        deltaChecks: prev.deltaChecks + 1,
      }));
      const hasSettingsChanges = delta.hasSettingsChanges;
      const changedByCollection: {
        questionHistory: string[];
        mcHistory: string[];
        savedSets: string[];
      } = { questionHistory: [], mcHistory: [], savedSets: [] };
      for (const item of delta.changedItems) {
        const [collection, id] = item.split('/');
        if (!id) continue;
        if (collection === 'questionHistory') {
          changedByCollection.questionHistory.push(id);
        } else if (collection === 'mcHistory') {
          changedByCollection.mcHistory.push(id);
        } else if (collection === 'savedSets') {
          changedByCollection.savedSets.push(id);
        }
      }

      if (
        hasSettingsChanges ||
        changedByCollection.questionHistory.length > 0 ||
        changedByCollection.mcHistory.length > 0 ||
        changedByCollection.savedSets.length > 0
      ) {
        if (hasSettingsChanges) {
          remoteData = await loadUserData(userId);
          patchTelemetry((prev) => ({
            ...prev,
            fullSyncReads: prev.fullSyncReads + 1,
          }));
          remoteHasData = hasRemoteData(
            normalizeRemoteSyncableData(remoteData)
          );
        } else {
          usedPartialRemoteSnapshot = true;
          const changed = await loadChangedItems(userId, changedByCollection);
          const changedQhIds = new Set(
            changed.questionHistory.map((i) => String(i.id ?? ''))
          );
          const changedMcIds = new Set(
            changed.mcHistory.map((i) => String(i.id ?? ''))
          );
          const changedSsIds = new Set(
            changed.savedSets.map((i) => String(i.id ?? ''))
          );
          for (const id of changedByCollection.questionHistory) {
            if (!changedQhIds.has(id)) remoteDeletedIds.questionHistory.add(id);
          }
          for (const id of changedByCollection.mcHistory) {
            if (!changedMcIds.has(id)) remoteDeletedIds.mcHistory.add(id);
          }
          for (const id of changedByCollection.savedSets) {
            if (!changedSsIds.has(id)) remoteDeletedIds.savedSets.add(id);
          }
          // For partial remote snapshots, we need to load presets separately
          // to avoid losing remote preset data. Presets are stored in a single
          // document, so they can't be delta-loaded like collection items.
          let remotePresets: Preset[] = [];
          try {
            const presetsRef = doc(db, 'users', userId, 'settings', 'presets');
            const presetsSnap = await getDoc(presetsRef);
            if (presetsSnap.exists()) {
              const data = presetsSnap.data();
              remotePresets = Array.isArray(data.presets) ? data.presets : [];
            }
          } catch (err) {
            console.warn(
              '[Firebase] Failed to load presets during delta sync:',
              err
            );
          }

          remoteData = {
            settings: {},
            questionHistory: changed.questionHistory,
            mcHistory: changed.mcHistory,
            savedSets: changed.savedSets,
            presets: remotePresets,
          };
          remoteHasData = hasRemoteData(
            normalizeRemoteSyncableData(remoteData)
          );
        }
      } else {
        debugLog('Manual sync delta check: no remote changes detected');
        patchTelemetry((prev) => ({
          ...prev,
          deltaNoChangePasses: prev.deltaNoChangePasses + 1,
          estimatedReadsAvoided: prev.estimatedReadsAvoided + 1,
        }));
      }

      debugLog('Manual sync remote snapshot', {
        hasData: remoteHasData,
        questionHistory: remoteData?.questionHistory?.length ?? 0,
        mcHistory: remoteData?.mcHistory?.length ?? 0,
        savedSets: remoteData?.savedSets?.length ?? 0,
      });

      // 2. Detect dual-deletion conflicts before merging
      const detectedConflicts: SyncConflict[] = [];
      if (remoteHasData && !usedPartialRemoteSnapshot) {
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

        // Preset conflict detection — presets are stored as a single Firestore document
        // containing an array. We detect dual-deletions by comparing local tombstones
        // against remote preset IDs. Since presets are rewritten as a full array on each
        // sync, we need to check if any tombstoned preset ID is also absent from remote.
        const remotePresetIds = new Set(
          (remoteData?.presets ?? []).map((p: Preset) => p.id)
        );
        const prevSyncedPresets = new Set(
          (localData.presets ?? []).map((p: Preset) => p.id)
        );
        const presetConflicts = detectDualDeletions(
          new Set(Object.keys(tombstones.presets)),
          remotePresetIds,
          prevSyncedPresets
        );
        for (const id of presetConflicts) {
          detectedConflicts.push({
            id,
            collection: 'presets',
            label: buildConflictLabel(
              'presets',
              id,
              localData.presets as Record<string, unknown>[]
            ),
            localDeletedAt: tombstones.presets[id],
          });
        }
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

      // Apply remote deletions discovered via delta lookup.
      if (
        remoteDeletedIds.questionHistory.size > 0 ||
        remoteDeletedIds.mcHistory.size > 0 ||
        remoteDeletedIds.savedSets.size > 0
      ) {
        const pendingUpserts = {
          questionHistory: new Set<string>(),
          mcHistory: new Set<string>(),
          savedSets: new Set<string>(),
        };
        for (const op of syncQueueRef.current.operations) {
          if (op.opType !== 'upsert' || !op.entityId) continue;
          if (op.collection === 'questionHistory') {
            pendingUpserts.questionHistory.add(op.entityId);
          } else if (op.collection === 'mcHistory') {
            pendingUpserts.mcHistory.add(op.entityId);
          } else if (op.collection === 'savedSets') {
            pendingUpserts.savedSets.add(op.entityId);
          }
        }

        const removeIfUnchanged = <T extends HasId>(
          items: T[],
          idsToDelete: Set<string>,
          lastSyncVersions: Record<string, number>,
          pendingLocalUpserts: Set<string>
        ): T[] => {
          return items.filter((item) => {
            const id = item.id;
            if (!id || !idsToDelete.has(id)) return true;

            // Keep if we already have a pending local upsert for this ID.
            // This protects genuinely new/edited local data from being dropped.
            if (pendingLocalUpserts.has(id)) return true;

            // If we have never synced this ID in this session and there is no
            // queued local upsert, treat remote deletion as authoritative.
            if (!(id in lastSyncVersions)) return false;

            const lastSyncedVersion = lastSyncVersions[id] ?? 0;
            const localVersion = getItemLastModified(item);
            // Keep local copy if it changed since last sync; it will be re-uploaded.
            return localVersion > lastSyncedVersion;
          });
        };

        filteredLocalData.questionHistory = removeIfUnchanged(
          filteredLocalData.questionHistory,
          remoteDeletedIds.questionHistory,
          syncMetadataRef.current.lastSyncVersions.questionHistory,
          pendingUpserts.questionHistory
        );
        filteredLocalData.mcHistory = removeIfUnchanged(
          filteredLocalData.mcHistory,
          remoteDeletedIds.mcHistory,
          syncMetadataRef.current.lastSyncVersions.mcHistory,
          pendingUpserts.mcHistory
        );
        filteredLocalData.savedSets = removeIfUnchanged(
          filteredLocalData.savedSets,
          remoteDeletedIds.savedSets,
          syncMetadataRef.current.lastSyncVersions.savedSets,
          pendingUpserts.savedSets
        );
      }

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

      if (remoteHasData || usedPartialRemoteSnapshot) {
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

      // 7. Sync daily usage and analytics summary (bundled into manual sync)
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
        debugLog('Daily usage and analytics summary synced');
      } catch (usageError) {
        console.warn('[Firebase] Usage and analytics sync failed:', usageError);
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
          merged.questionHistory as Array<Record<string, unknown>>
        );
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        merged.mcHistory as Array<Record<string, unknown>>
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        merged.savedSets as Array<Record<string, unknown>>
      );

      // Update snapshot for pending change tracking
      lastSyncedSnapshotRef.current = JSON.stringify(buildSyncSnapshot(merged));

      persistQueue({ operations: [], updatedAt: Date.now() });
      setLastFlushTime(Date.now());
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
  }, [
    user,
    debugLog,
    addSyncEvent,
    suppressAutoSaveTemporarily,
    persistQueue,
    patchTelemetry,
  ]);

  const pullSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }

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
      patchTelemetry((prev) => ({
        ...prev,
        fullSyncReads: prev.fullSyncReads + 1,
      }));
      const remoteHasData = hasRemoteData(
        normalizeRemoteSyncableData(remoteData)
      );

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

      let merged = remoteHasData
        ? mergeSyncableData(filteredLocalData, remoteData)
        : filteredLocalData;

      // Keep local pending deletions hidden during pull-only sync.
      merged = {
        ...merged,
        questionHistory: filterDeleted(
          merged.questionHistory as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.questionHistory
        ),
        mcHistory: filterDeleted(
          merged.mcHistory as Array<Record<string, unknown> & { id?: string }>,
          tombstones.mcHistory
        ),
        savedSets: filterDeleted(
          merged.savedSets as Array<Record<string, unknown> & { id?: string }>,
          tombstones.savedSets
        ),
        presets: filterDeleted(
          (merged.presets ?? []) as Array<
            Record<string, unknown> & { id?: string }
          >,
          tombstones.presets
        ) as typeof merged.presets,
      };

      const storeUpdates = applySyncableDataToStore(merged);
      setSuppressPersistUntil(Date.now() + 1500);
      suppressAutoSaveTemporarily();
      useAppStore.setState(storeUpdates);

      localDataRef.current = merged;

      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.questionHistorySyncTime = now;
      syncMetadataRef.current.mcHistorySyncTime = now;
      syncMetadataRef.current.savedSetsSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(
          merged.questionHistory as Array<Record<string, unknown>>
        );
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        merged.mcHistory as Array<Record<string, unknown>>
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        merged.savedSets as Array<Record<string, unknown>>
      );

      // Use pulled snapshot as the newest known cloud-aligned baseline.
      lastSyncedSnapshotRef.current = JSON.stringify(buildSyncSnapshot(merged));

      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');
      addSyncEvent('download', 'Pulled latest changes from cloud');
      debugLog('Manual pull completed successfully');
      toast.success('Pull complete');
    } catch (error) {
      console.error('Pull sync failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Pull sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Pull failed: ${errorMessage}`);
      debugLog('Manual pull failed', error);
      toast.error(`Pull failed: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }, [
    user,
    debugLog,
    addSyncEvent,
    suppressAutoSaveTemporarily,
    patchTelemetry,
  ]);

  const pushSync = useCallback(async () => {
    if (!user) {
      setSyncError('Not signed in');
      return;
    }

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

      const deletedIds = tombstonesToDeletedIds(tombstones);
      const hasDeletions =
        deletedIds.questionHistory.length > 0 ||
        deletedIds.mcHistory.length > 0 ||
        deletedIds.savedSets.length > 0 ||
        deletedIds.presets.length > 0;

      await saveUserData(userId, filteredLocalData, {
        deltaSyncVersions: syncMetadataRef.current.lastSyncVersions,
        fullSync: false,
        ...(hasDeletions ? { deletedIds } : {}),
      });

      if (hasDeletions) {
        useAppStore.setState({
          deletionTombstones: purgePersistedTombstones(tombstones, deletedIds),
        });
      }

      localDataRef.current = filteredLocalData;

      const now = Date.now();
      syncMetadataRef.current.lastSyncTime = now;
      syncMetadataRef.current.questionHistorySyncTime = now;
      syncMetadataRef.current.mcHistorySyncTime = now;
      syncMetadataRef.current.savedSetsSyncTime = now;
      syncMetadataRef.current.lastSyncVersions.questionHistory =
        buildVersionMap(
          filteredLocalData.questionHistory as Array<Record<string, unknown>>
        );
      syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
        filteredLocalData.mcHistory as Array<Record<string, unknown>>
      );
      syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
        filteredLocalData.savedSets as Array<Record<string, unknown>>
      );

      lastSyncedSnapshotRef.current = JSON.stringify(
        buildSyncSnapshot(filteredLocalData)
      );

      persistQueue({ operations: [], updatedAt: Date.now() });
      setLastFlushTime(Date.now());
      setPendingChanges(0);
      setLastSyncTime(Date.now());
      setSyncError(null);
      setSyncStatus('idle');

      addSyncEvent('upload', 'Pushed local changes to cloud');
      debugLog('Manual push completed successfully');
      toast.success('Push complete');
    } catch (error) {
      console.error('Push sync failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Push sync failed';
      setSyncError(errorMessage);
      setSyncStatus('error');
      addSyncEvent('error', `Push failed: ${errorMessage}`);
      debugLog('Manual push failed', error);
      toast.error(`Push failed: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user, debugLog, addSyncEvent, persistQueue]);

  useEffect(() => {
    const state = useAppStore.getState();
    if (
      !user ||
      !isSyncEnabled ||
      !isOnline ||
      !state.isHydrated ||
      startupSyncDoneRef.current
    ) {
      return;
    }
    startupSyncDoneRef.current = true;
    const runStartupCheck = async () => {
      try {
        const hasQueuedOps = syncQueueRef.current.operations.length > 0;
        const hasDeletes = hasPendingLocalDeletes();
        if (hasDeletes) {
          debugLog(
            'Startup reconciliation sync triggered: pending local deletes'
          );
          await forceSync();
          return;
        }
        if (hasQueuedOps) {
          debugLog(
            'Startup queued-op flush triggered (no full reconciliation)'
          );
          await flushSyncQueue();
          return;
        }

        const current = useAppStore.getState();
        const localQhCount = current.questionHistory.length;
        const localMcCount = current.mcHistory.length;
        const remoteCounts = await getRemoteHistoryCounts(getUserId(user));
        const hasCountMismatch =
          remoteCounts.questionHistory !== localQhCount ||
          remoteCounts.mcHistory !== localMcCount;
        const hasPresetsMismatch = await isRemotePresetsArrayDifferent(
          getUserId(user),
          current.presets ?? []
        );
        if (hasCountMismatch || hasPresetsMismatch) {
          debugLog(
            'Startup reconciliation sync triggered: startup alignment mismatch',
            {
              local: { questionHistory: localQhCount, mcHistory: localMcCount },
              remote: remoteCounts,
              hasPresetsMismatch,
            }
          );
          await forceSync();
        } else {
          patchTelemetry((prev) => ({
            ...prev,
            deltaNoChangePasses: prev.deltaNoChangePasses + 1,
            estimatedReadsAvoided: prev.estimatedReadsAvoided + 1,
          }));
          debugLog(
            'Startup reconciliation skipped: history counts and presets array aligned'
          );
        }
      } catch (error) {
        startupSyncDoneRef.current = false;
        debugLog('Startup reconciliation failed; will retry automatically', {
          error,
        });
        addSyncEvent('retry', 'Startup reconciliation failed; retrying later');
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
    patchTelemetry,
    flushSyncQueue,
  ]);

  useEffect(() => {
    const maybeCatchUpFromForeground = () => {
      if (document.visibilityState !== 'visible') return;
      if (!user || !isSyncEnabled || !navigator.onLine || isSyncing) return;
      if (conflicts.length > 0) return;

      const now = Date.now();
      if (now - foregroundSyncAtRef.current < FOREGROUND_SYNC_COOLDOWN_MS) {
        return;
      }

      foregroundSyncAtRef.current = now;
      debugLog('Foreground catch-up sync triggered');
      void forceSync();
    };

    window.addEventListener('focus', maybeCatchUpFromForeground);
    document.addEventListener('visibilitychange', maybeCatchUpFromForeground);

    return () => {
      window.removeEventListener('focus', maybeCatchUpFromForeground);
      document.removeEventListener(
        'visibilitychange',
        maybeCatchUpFromForeground
      );
    };
  }, [user, isSyncEnabled, isSyncing, conflicts.length, forceSync, debugLog]);

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
    queuedOpsCount,
    lastFlushTime,
    syncTelemetry,
    conflicts,
    enableSync,
    disableSync,
    toggleSync,
    pullSync,
    pushSync,
    forceSync,
    resolveConflicts,
  };
}
