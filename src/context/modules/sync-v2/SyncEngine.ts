/**
 * Core sync orchestrator.
 *
 * Orchestrates LocalCache, QueueManager, RemoteRepository, RealtimeListener,
 * and ConflictResolver into a cohesive sync engine.
 */

import { SYNC_METADATA_KEY } from './config';
import { applyResolutions } from './ConflictResolver';
import { buildSnapshot, cacheApplySnapshot } from './LocalCache';
import { QueueManager } from './QueueManager';
import type { ChangeEvent } from './RealtimeListener';
import { RealtimeListener } from './RealtimeListener';
import { RemoteRepository } from './RemoteRepository';
import type {
  CacheSnapshot,
  DeletionTombstones,
  LocalCacheEntry,
  SyncableData,
  SyncConflict,
  SyncEvent,
  SyncMetadata,
  SyncOperation,
  SyncStatus,
  SyncTelemetry,
} from './types';

let eventCounter = 0;
function newEventId(): string {
  return `evt-${Date.now()}-${++eventCounter}`;
}

const EMPTY_METADATA: SyncMetadata = {
  lastSyncTime: 0,
  questionHistorySyncTime: 0,
  mcHistorySyncTime: 0,
  savedSetsSyncTime: 0,
  lastSyncVersions: { questionHistory: {}, mcHistory: {}, savedSets: {} },
  settingsLastModified: { main: 0, goals: 0, presets: 0 },
};

const EMPTY_TOMBSTONES: DeletionTombstones = {
  questionHistory: {},
  mcHistory: {},
  savedSets: {},
  presets: {},
};

function readMetadata(userId: string): SyncMetadata {
  try {
    const raw = localStorage.getItem(`${SYNC_METADATA_KEY}:${userId}`);
    if (!raw) return { ...EMPTY_METADATA };
    return JSON.parse(raw) as SyncMetadata;
  } catch {
    return { ...EMPTY_METADATA };
  }
}

function writeMetadata(userId: string, meta: SyncMetadata): void {
  try {
    localStorage.setItem(
      `${SYNC_METADATA_KEY}:${userId}`,
      JSON.stringify(meta)
    );
  } catch {
    /* non-fatal */
  }
}

// ─── Merge Logic ──────────────────────────────────────────────────────────────

function mergeStudyGoals(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
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

interface DailyCompletion {
  total: number;
  written: number;
  mc: number;
}

function mergeStreakData(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;

  const getDailyCompletions = (
    data: Record<string, unknown>
  ): Record<string, DailyCompletion> => {
    const raw = data.dailyCompletions;
    if (typeof raw !== 'object' || raw === null) return {};
    const result: Record<string, DailyCompletion> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        const v = value as Record<string, unknown>;
        result[key] = {
          total: typeof v.total === 'number' ? v.total : 0,
          written: typeof v.written === 'number' ? v.written : 0,
          mc: typeof v.mc === 'number' ? v.mc : 0,
        };
      }
    }
    return result;
  };

  const localDaily = getDailyCompletions(local);
  const remoteDaily = getDailyCompletions(remote);
  const merged: Record<string, DailyCompletion> = { ...localDaily };

  for (const [date, remoteEntry] of Object.entries(remoteDaily)) {
    const localEntry = merged[date];
    if (!localEntry) {
      merged[date] = remoteEntry;
    } else {
      merged[date] = {
        total: Math.max(localEntry.total, remoteEntry.total),
        written: Math.max(localEntry.written, remoteEntry.written),
        mc: Math.max(localEntry.mc, remoteEntry.mc),
      };
    }
  }

  return {
    currentStreak: Math.max(
      (typeof local.currentStreak === 'number' ? local.currentStreak : 0) || 0,
      (typeof remote.currentStreak === 'number' ? remote.currentStreak : 0) || 0
    ),
    longestStreak: Math.max(
      (typeof local.longestStreak === 'number' ? local.longestStreak : 0) || 0,
      (typeof remote.longestStreak === 'number' ? remote.longestStreak : 0) || 0
    ),
    lastActiveDate:
      (typeof local.lastActiveDate === 'string' ? local.lastActiveDate : '') >
      (typeof remote.lastActiveDate === 'string' ? remote.lastActiveDate : '')
        ? local.lastActiveDate
        : remote.lastActiveDate,
    dailyCompletions: merged,
  };
}

function mergeById<
  T extends {
    id?: string;
    lastModified?: number;
    updatedAt?: string;
    createdAt?: string;
  },
>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of local) {
    if (item.id) byId.set(item.id, item);
  }

  function getModified(item: T): number {
    if (
      typeof item.lastModified === 'number' &&
      Number.isFinite(item.lastModified)
    )
      return item.lastModified;
    if (item.updatedAt) {
      const p = Date.parse(item.updatedAt);
      if (Number.isFinite(p)) return p;
    }
    if (item.createdAt) {
      const p = Date.parse(item.createdAt);
      if (Number.isFinite(p)) return p;
    }
    return 0;
  }

  for (const item of remote) {
    if (!item.id) continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    if (getModified(item) >= getModified(existing)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function mergeSyncableData(
  local: SyncableData | null,
  remote: SyncableData | null,
  tombstones: DeletionTombstones
): SyncableData {
  const defaults: SyncableData = {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  };
  if (!local && !remote) return defaults;
  if (!local) return { ...defaults, ...remote };
  if (!remote) return local;

  const filter = <T extends { id?: string }>(
    items: T[],
    coll: 'questionHistory' | 'mcHistory' | 'savedSets' | 'presets'
  ): T[] => items.filter((i) => (i.id ? !(i.id in tombstones[coll]) : true));

  const merged: SyncableData = {
    settings: {},
    questionHistory: mergeById(
      filter(local.questionHistory, 'questionHistory'),
      filter(remote.questionHistory, 'questionHistory')
    ),
    mcHistory: mergeById(
      filter(local.mcHistory, 'mcHistory'),
      filter(remote.mcHistory, 'mcHistory')
    ),
    savedSets: mergeById(
      filter(local.savedSets, 'savedSets'),
      filter(remote.savedSets, 'savedSets')
    ),
    presets: (() => {
      const remotePresets = (remote.presets ?? []) as Array<
        Record<string, unknown> & { id?: string }
      >;
      const localPresets = (local.presets ?? []) as Array<
        Record<string, unknown> & { id?: string }
      >;
      const remoteById = new Map<string, Record<string, unknown>>();
      for (const preset of remotePresets) {
        if (typeof preset.id === 'string' && preset.id.length > 0) {
          remoteById.set(preset.id, preset);
        }
      }
      const localOnly = localPresets.filter(
        (p) =>
          typeof p.id === 'string' && p.id.length > 0 && !remoteById.has(p.id)
      );
      return [...remotePresets, ...localOnly] as Array<Record<string, unknown>>;
    })(),
    studyGoals: mergeStudyGoals(local.studyGoals, remote.studyGoals),
    streakData: mergeStreakData(local.streakData, remote.streakData),
  };

  // Apply tombstone filtering after merge
  merged.presets = (merged.presets ?? []).filter((p) => {
    const id = (p as { id?: unknown }).id;
    return typeof id === 'string' ? !(id in tombstones.presets) : true;
  });

  return merged;
}

function normalizeSyncValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSyncValue(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      if (key === '_lastModified' || key === 'lastModified') continue;
      normalized[key] = normalizeSyncValue(source[key]);
    }
    return normalized;
  }
  return value;
}

function areEquivalentSyncValue(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeSyncValue(left)) ===
    JSON.stringify(normalizeSyncValue(right))
  );
}

// ─── SyncEngine ───────────────────────────────────────────────────────────────

type DataChangeCallback = (data: SyncableData) => void;
type EventCallback = (event: SyncEvent) => void;
type StatusCallback = (status: SyncStatus) => void;

const FOREGROUND_PULL_COOLDOWN_MS = 300000;
const FOREGROUND_PULL_MIN_BACKGROUND_MS = 120000;

export class SyncEngine {
  private userId: string | null = null;
  private queueManager: QueueManager | null = null;
  private remoteRepo: RemoteRepository | null = null;
  private realtimeListener: RealtimeListener | null = null;
  private metadata: SyncMetadata = { ...EMPTY_METADATA };
  private tombstones: DeletionTombstones = { ...EMPTY_TOMBSTONES };
  private localData: SyncableData | null = null;
  private snapshot: CacheSnapshot | null = null;
  private conflicts: SyncConflict[] = [];
  private isOnline = navigator.onLine;
  private status: SyncStatus = 'idle';
  private lastSyncTime: number | null = null;
  private lastError: string | null = null;
  private telemetry: SyncTelemetry = {
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
  };
  private telemetryCallbacks: Set<(t: SyncTelemetry) => void> = new Set();
  private queueCountCallbacks: Set<(n: number) => void> = new Set();
  private dataCallbacks: Set<DataChangeCallback> = new Set();
  private eventCallbacks: Set<EventCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private initialized = false;
  private started = false;
  private remotePullTimer: ReturnType<typeof setTimeout> | null = null;
  private remotePullInFlight = false;
  private remotePullQueued = false;
  private getState: (() => SyncableData) | null = null;
  private getTombstones: (() => DeletionTombstones) | null = null;
  private setTombstones: ((t: DeletionTombstones) => void) | null = null;
  private readonly onlineHandler: () => void;
  private readonly offlineHandler: () => void;
  private readonly focusHandler: () => void;
  private readonly visibilityHandler: () => void;
  private lastForegroundPullAt = 0;
  private lastBackgroundedAt: number | null = null;
  private shouldPullAfterResume = false;

  constructor(
    getState: () => SyncableData,
    getTombstones: () => DeletionTombstones,
    setTombstones: (t: DeletionTombstones) => void
  ) {
    this.getState = getState;
    this.getTombstones = getTombstones;
    this.setTombstones = setTombstones;
    this.tombstones = getTombstones();

    this.onlineHandler = () => this.handleOnline();
    this.offlineHandler = () => this.handleOffline();
    this.focusHandler = () => this.handleForegroundResume();
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.lastBackgroundedAt = Date.now();
        return;
      }
      this.handleForegroundResume();
    };
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    window.addEventListener('focus', this.focusHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  onTelemetryChange(cb: (t: SyncTelemetry) => void): () => void {
    this.telemetryCallbacks.add(cb);
    // Push current telemetry immediately
    try {
      cb({ ...this.telemetry });
    } catch {
      /* ignore */
    }
    return () => {
      this.telemetryCallbacks.delete(cb);
    };
  }

  onQueueCountChange(cb: (n: number) => void): () => void {
    this.queueCountCallbacks.add(cb);
    try {
      cb(this.queueManager?.pendingCount ?? 0);
    } catch {
      /* ignore */
    }
    return () => {
      this.queueCountCallbacks.delete(cb);
    };
  }

  private notifyTelemetryChange(t: SyncTelemetry): void {
    for (const cb of this.telemetryCallbacks) {
      try {
        cb({ ...t });
      } catch {
        /* ignore callback errors */
      }
    }
  }

  private notifyQueueChange(n: number): void {
    for (const cb of this.queueCountCallbacks) {
      try {
        cb(n);
      } catch {
        /* ignore */
      }
    }
  }

  // ─── Initialization ─────────────────────────────────────────────────────────

  initialize(userId: string): void {
    this.userId = userId;
    this.metadata = readMetadata(userId);
    this.tombstones = this.getTombstones?.() ?? { ...EMPTY_TOMBSTONES };

    this.remoteRepo = new RemoteRepository(userId);
    this.queueManager = new QueueManager(
      userId,
      (ops) => this.handleFlush(ops),
      (t) => {
        this.telemetry = t;
        this.notifyTelemetryChange(t);
      },
      (count) => {
        this.notifyQueueChange(count);
      }
    );
    this.realtimeListener = new RealtimeListener(
      userId,
      (events) => {
        void this.handleRemoteChanges(events);
      },
      undefined,
      () => {
        this.shouldPullAfterResume = true;
      }
    );

    this.initialized = true;
    this.setStatus('idle');
  }

  start(): void {
    if (!this.userId || !this.initialized || this.started) return;
    this.started = true;
    this.performStartupSync();
    this.realtimeListener?.start();
    if (this.isOnline && this.queueManager) {
      void this.queueManager.flush();
      this.scheduleRemotePull();
    }
  }

  stop(): void {
    this.started = false;
    this.realtimeListener?.stop();
    this.queueManager?.destroy();
    if (this.remotePullTimer) {
      clearTimeout(this.remotePullTimer);
      this.remotePullTimer = null;
    }
    this.remotePullInFlight = false;
    this.remotePullQueued = false;
  }

  // ─── Sync Operations ────────────────────────────────────────────────────────

  async push(): Promise<void> {
    if (!this.queueManager) return;
    await this.queueManager.flush();
  }

  async pull(): Promise<void> {
    if (!this.userId || !this.remoteRepo) return;
    await this.performPull();
  }

  retryNow(): void {
    this.queueManager?.retryNow();
  }

  // ─── Conflict Resolution ────────────────────────────────────────────────────

  getConflicts(): SyncConflict[] {
    return this.conflicts.filter((c) => !c.resolved);
  }

  resolveConflicts(
    resolutions: Map<string, 'keep_local' | 'keep_remote' | 'merge' | 'delete'>
  ): void {
    const results = applyResolutions(this.conflicts, resolutions);
    for (const conflict of this.conflicts) {
      if (resolutions.has(conflict.id)) {
        conflict.resolved = true;
        conflict.resolution = resolutions.get(conflict.id);
      }
    }

    // Apply winning data
    for (const [entityId, data] of results.entries()) {
      const collection = this.findCollectionForEntity(entityId);
      if (data) {
        this.queueManager?.enqueue(collection, 'upsert', entityId);
      } else {
        this.queueManager?.enqueue(collection, 'delete', entityId);
      }
    }

    this.conflicts = this.conflicts.filter((c) => !c.resolved);
    this.queueManager?.scheduleFlush();
  }

  // ─── Queue Operations ───────────────────────────────────────────────────────

  enqueue(
    collection: 'questionHistory' | 'mcHistory' | 'savedSets' | 'settings',
    opType: 'upsert' | 'delete',
    entityId?: string
  ): void {
    this.queueManager?.enqueue(collection, opType, entityId);
    this.queueManager?.scheduleFlush();
  }

  getPendingCount(): number {
    return this.queueManager?.pendingCount ?? 0;
  }

  getQueuedOpsCount(): number {
    return this.queueManager?.pendingCount ?? 0;
  }

  // ─── State Accessors ────────────────────────────────────────────────────────

  getStatus(): SyncStatus {
    return this.status;
  }
  getIsOnline(): boolean {
    return this.isOnline;
  }
  getLastSyncTime(): number | null {
    return this.lastSyncTime;
  }
  getLastError(): string | null {
    return this.lastError;
  }
  getTelemetry(): SyncTelemetry {
    return { ...this.telemetry };
  }
  getLocalData(): SyncableData | null {
    return this.localData;
  }
  getSnapshot(): CacheSnapshot | null {
    return this.snapshot;
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  onDataChange(cb: DataChangeCallback): () => void {
    this.dataCallbacks.add(cb);
    return () => {
      this.dataCallbacks.delete(cb);
    };
  }

  onEvent(cb: EventCallback): () => void {
    this.eventCallbacks.add(cb);
    return () => {
      this.eventCallbacks.delete(cb);
    };
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => {
      this.statusCallbacks.delete(cb);
    };
  }

  // ─── Internal Handlers ──────────────────────────────────────────────────────

  // eslint-disable-next-line complexity
  private async handleFlush(ops: SyncOperation[]): Promise<void> {
    if (!this.remoteRepo) return;
    this.setStatus('syncing');

    try {
      const state = this.getState?.() ?? {
        settings: {},
        questionHistory: [],
        mcHistory: [],
        savedSets: [],
      };

      // Filter out noop operations where data hasn't actually changed
      const nonNoopOps = this.filterNoopOperations(ops, state);
      const skipCount = ops.length - nonNoopOps.length;
      if (skipCount > 0) {
        this.telemetry.hashNoopSkips += skipCount;
        this.telemetry.estimatedWritesAvoided += skipCount;
        this.notifyTelemetryChange(this.telemetry);
      }

      if (nonNoopOps.length === 0) {
        return;
      }

      await this.remoteRepo.flushOperations(nonNoopOps, () => {
        // Map ops to actual data from state
        const allItems = [
          ...state.questionHistory,
          ...state.mcHistory,
          ...state.savedSets,
          ...(state.presets ?? []),
        ];
        return allItems;
      });

      this.lastSyncTime = Date.now();
      this.metadata.lastSyncTime = this.lastSyncTime;

      // Record the lastModified of each successfully flushed upsert so that
      // filterNoopOperations can skip them on the next flush if unchanged.
      const allItems: Record<string, unknown>[] = [
        ...state.questionHistory,
        ...state.mcHistory,
        ...state.savedSets,
      ];
      const lmById = new Map<string, number>();
      for (const item of allItems) {
        const id = typeof item.id === 'string' ? item.id : undefined;
        if (!id) continue;
        const lm =
          typeof item.lastModified === 'number' &&
          Number.isFinite(item.lastModified)
            ? item.lastModified
            : 0;
        lmById.set(id, lm);
      }
      for (const op of nonNoopOps) {
        if (
          op.opType === 'upsert' &&
          op.entityId &&
          op.collection !== 'settings'
        ) {
          const coll = op.collection;
          if (!this.metadata.lastSyncVersions[coll]) {
            this.metadata.lastSyncVersions[coll] = {};
          }
          const lm = lmById.get(op.entityId) ?? 0;
          if (lm > 0) {
            this.metadata.lastSyncVersions[coll][op.entityId] = lm;
          }
        }
      }

      if (this.userId) writeMetadata(this.userId, this.metadata);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.addEvent('error', `Flush failed: ${this.lastError}`);
      throw error;
    } finally {
      this.setStatus('idle');
    }
  }

  private filterNoopOperations(
    ops: SyncOperation[],
    state: SyncableData
  ): SyncOperation[] {
    // Skip upsert ops where the entity's lastModified timestamp hasn't changed
    // since we last synced it. This prevents re-writing every document to
    // Firestore on every flush when nothing actually changed.
    const allItems: Record<string, unknown>[] = [
      ...state.questionHistory,
      ...state.mcHistory,
      ...state.savedSets,
      ...(state.presets ?? []),
    ];
    const lmById = new Map<string, number>();
    for (const item of allItems) {
      const id = typeof item.id === 'string' ? item.id : undefined;
      if (!id) continue;
      const lm =
        typeof item.lastModified === 'number' &&
        Number.isFinite(item.lastModified)
          ? item.lastModified
          : 0;
      lmById.set(id, lm);
    }

    return ops.filter((op) => {
      // Always keep deletes — they must be sent regardless.
      if (op.opType === 'delete') return true;
      // Always keep ops without an entityId (collection-level ops).
      if (!op.entityId) return true;
      // Always keep settings ops — they don't participate in version tracking.
      if (op.collection === 'settings') return true;

      const versions = this.metadata.lastSyncVersions[op.collection];
      if (!versions) return true;

      const lastSynced = versions[op.entityId] ?? 0;
      const currentLm = lmById.get(op.entityId) ?? 0;

      // If the local lastModified hasn't advanced beyond what we last pushed,
      // there's nothing new to write.
      return currentLm > lastSynced;
    });
  }

  private handleRemoteChanges(events: ChangeEvent[]): void {
    if (!this.userId) return;
    this.tombstones = this.getTombstones?.() ?? this.tombstones;

    // Skip if empty events batch
    if (events.length === 0) return;

    const added = events.filter((e) => e.type === 'added').length;
    const modified = events.filter((e) => e.type === 'modified').length;
    const removed = events.filter((e) => e.type === 'removed').length;
    this.addEvent(
      'download',
      `Realtime update: ${added} added, ${modified} updated, ${removed} removed`
    );

    // Ensure we have a local data object to mutate
    if (!this.localData) {
      this.localData = this.getLocalState();
    }

    let mutated = false;

    for (const ev of events) {
      if (this.applyRemoteChangeEvent(ev)) mutated = true;
    }

    if (mutated && this.localData) {
      // Refresh snapshot/cache and notify listeners
      this.snapshot = buildSnapshot(this.buildSnapshotEntries(this.localData));
      this.notifyDataChange(this.localData);
    }

    // For true realtime sync, trust the listener data and don't schedule pulls
    // Pulls create unnecessary Firestore reads and can conflicting data
    // Only pull on startup or explicit user request
    // Note: scheduleRemotePull removed to improve realtime sync latency
  }

  private applyRemoteChangeEvent(ev: ChangeEvent): boolean {
    const coll = ev.collection;
    const id = ev.docId;
    const lm = ev.lastModified ?? Date.now();

    if (coll === 'settings') {
      // settings docs are: main (settings), goals, presets
      if (!this.localData)
        this.localData = {
          settings: {} as Record<string, unknown>,
          questionHistory: [],
          mcHistory: [],
          savedSets: [],
          presets: [],
        };

      if (this.isNoopSettingsEvent(id, ev.data)) {
        return false;
      }

      return this.applySettingsEvent(ev, id);
    }

    // For collections (questionHistory, mcHistory, savedSets)
    if (!this.localData) return false;
    const arr: Array<Record<string, unknown>> =
      coll === 'questionHistory'
        ? this.localData.questionHistory
        : coll === 'mcHistory'
          ? this.localData.mcHistory
          : this.localData.savedSets;

    if (
      ev.type !== 'removed' &&
      this.isNoopCollectionEvent(coll, id, ev.data)
    ) {
      this.updateCollectionVersion(coll, id, lm);
      return false;
    }

    return this.applyCollectionEvent(ev, coll, arr, id, lm);
  }

  private isNoopSettingsEvent(
    id: string,
    data: Record<string, unknown> | null
  ): boolean {
    if (!this.localData || !data) return false;

    const currentSettingsDoc =
      id === 'main'
        ? { settings: this.localData.settings ?? {} }
        : id === 'goals'
          ? {
              studyGoals: this.localData.studyGoals,
              streakData: this.localData.streakData,
            }
          : id === 'presets'
            ? { presets: this.localData.presets ?? [] }
            : null;

    return (
      currentSettingsDoc !== null &&
      areEquivalentSyncValue(currentSettingsDoc, data)
    );
  }

  private isNoopCollectionEvent(
    coll: 'questionHistory' | 'mcHistory' | 'savedSets',
    id: string,
    data: Record<string, unknown> | null
  ): boolean {
    if (!this.localData || !data) return false;

    const arr: Array<Record<string, unknown>> =
      coll === 'questionHistory'
        ? this.localData.questionHistory
        : coll === 'mcHistory'
          ? this.localData.mcHistory
          : this.localData.savedSets;

    const existing = arr.find((x) => ((x as { id?: string }).id ?? '') === id);
    return existing ? areEquivalentSyncValue(existing, data) : false;
  }

  private updateCollectionVersion(
    coll: 'questionHistory' | 'mcHistory' | 'savedSets',
    id: string,
    lm: number
  ): void {
    if (!this.metadata.lastSyncVersions) {
      this.metadata.lastSyncVersions = {
        questionHistory: {},
        mcHistory: {},
        savedSets: {},
      };
    }
    this.metadata.lastSyncVersions[coll][id] = lm;
  }

  private scheduleRemotePull(): void {
    if (!this.isOnline || !this.userId) return;
    if (this.remotePullTimer) {
      clearTimeout(this.remotePullTimer);
    }
    this.remotePullTimer = setTimeout(() => {
      this.remotePullTimer = null;
      void this.runRemotePull();
    }, 200);
  }

  private async runRemotePull(): Promise<void> {
    if (this.remotePullInFlight) {
      this.remotePullQueued = true;
      return;
    }

    this.remotePullInFlight = true;
    try {
      await this.performPull();
    } finally {
      this.remotePullInFlight = false;
      if (this.remotePullQueued) {
        this.remotePullQueued = false;
        this.scheduleRemotePull();
      }
    }
  }

  private performStartupSync(): void {
    if (!this.userId || !this.remoteRepo) return;
    this.setStatus('connecting');

    try {
      // On startup, just use local state. Realtime listeners will sync any
      // remote changes immediately after they're subscribed.
      // We skip the expensive full remote load and merge operation.
      const localState = this.getLocalState();
      this.localData = localState;
      this.lastSyncTime = Date.now();
      this.metadata.lastSyncTime = this.lastSyncTime;

      // Update snapshot
      this.snapshot = buildSnapshot(this.buildSnapshotEntries(localState));

      // Write metadata
      if (this.userId) writeMetadata(this.userId, this.metadata);

      // Notify with local state
      this.notifyDataChange(localState);
      this.addEvent(
        'download',
        `Startup sync skipped (using realtime listeners): ${localState.questionHistory.length} QH, ${localState.mcHistory.length} MC, ${localState.savedSets.length} SS`
      );
      this.setStatus('idle');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.addEvent('error', `Startup sync failed: ${this.lastError}`);
      this.setStatus('error');
    }
  }

  private getLocalState(): SyncableData {
    return (
      this.getState?.() ?? {
        settings: {},
        questionHistory: [],
        mcHistory: [],
        savedSets: [],
      }
    );
  }

  private buildSnapshotEntries(merged: SyncableData): LocalCacheEntry[] {
    const now = Date.now();
    const getItemId = (item: Record<string, unknown>): string => {
      const id = item.id;
      return typeof id === 'string' ? id : '';
    };
    return [
      ...merged.questionHistory.map((i) => ({
        id: getItemId(i),
        collection: 'questionHistory' as const,
        data: i,
        lastModified: (i.lastModified as number) || 0,
        syncedAt: now,
        isDeleted: false,
      })),
      ...merged.mcHistory.map((i) => ({
        id: getItemId(i),
        collection: 'mcHistory' as const,
        data: i,
        lastModified: (i.lastModified as number) || 0,
        syncedAt: now,
        isDeleted: false,
      })),
      ...merged.savedSets.map((i) => ({
        id: getItemId(i),
        collection: 'savedSets' as const,
        data: i,
        lastModified: (i.lastModified as number) || 0,
        syncedAt: now,
        isDeleted: false,
      })),
    ];
  }

  private applySettingsEvent(ev: ChangeEvent, id: string): boolean {
    // Ensure localData exists for mutation
    if (!this.localData) return false;

    if (ev.type === 'removed' || ev.data === null) {
      this.clearSettingsDoc(id);
      return true;
    }

    const data = ev.data as Record<string, unknown> | null;
    this.mergeSettingsDoc(id, data);

    return true;
  }

  private clearSettingsDoc(id: string): void {
    if (!this.localData) return;

    if (id === 'main') {
      this.localData.settings = {} as Record<string, unknown>;
      return;
    }
    if (id === 'goals') {
      this.localData.studyGoals = undefined;
      this.localData.streakData = undefined;
      return;
    }
    if (id === 'presets') {
      this.localData.presets = [];
    }
  }

  private mergeSettingsDoc(
    id: string,
    data: Record<string, unknown> | null
  ): void {
    if (!this.localData) return;

    if (id === 'main') {
      const incoming = (data?.settings as Record<string, unknown>) ?? {};
      this.localData.settings = {
        ...(this.localData.settings ?? {}),
        ...incoming,
      };
      return;
    }

    if (id === 'goals') {
      const incomingGoals = data?.studyGoals as
        | Record<string, unknown>
        | undefined;
      const incomingStreak = data?.streakData as
        | Record<string, unknown>
        | undefined;
      this.localData.studyGoals = incomingGoals ?? this.localData.studyGoals;
      this.localData.streakData = incomingStreak ?? this.localData.streakData;
      return;
    }

    if (id === 'presets') {
      this.localData.presets =
        (data?.presets as Record<string, unknown>[]) ??
        this.localData.presets ??
        [];
    }
  }

  private applyCollectionEvent(
    ev: ChangeEvent,
    coll: 'questionHistory' | 'mcHistory' | 'savedSets',
    arr: Array<Record<string, unknown>>,
    id: string,
    lm: number
  ): boolean {
    if (ev.type === 'removed') {
      const confirmedDelete = this.confirmRemoteDelete(coll, id);
      const idx = arr.findIndex(
        (x) => ((x as { id?: string }).id ?? '') === id
      );
      if (idx >= 0) {
        arr.splice(idx, 1);
        if (
          this.metadata.lastSyncVersions &&
          this.metadata.lastSyncVersions[coll]
        ) {
          delete this.metadata.lastSyncVersions[coll][id];
        }
        return true;
      }
      return confirmedDelete;
    }

    const tomb = this.tombstones[coll];
    if (id in tomb) return false;
    const existingIdx = arr.findIndex(
      (x) => ((x as { id?: string }).id ?? '') === id
    );
    if (existingIdx >= 0) {
      arr[existingIdx] = ev.data as Record<string, unknown>;
    } else {
      arr.push(ev.data as Record<string, unknown>);
    }
    if (!this.metadata.lastSyncVersions)
      this.metadata.lastSyncVersions = {
        questionHistory: {},
        mcHistory: {},
        savedSets: {},
      };
    this.metadata.lastSyncVersions[coll][id] = lm;
    return true;
  }

  private confirmRemoteDelete(
    coll: 'questionHistory' | 'mcHistory' | 'savedSets',
    id: string
  ): boolean {
    if (!(id in this.tombstones[coll])) return false;

    const nextCollection = { ...this.tombstones[coll] };
    delete nextCollection[id];
    const nextTombstones: DeletionTombstones = {
      ...this.tombstones,
      [coll]: nextCollection,
    };

    this.tombstones = nextTombstones;
    this.setTombstones?.(nextTombstones);
    return true;
  }

  private async performPull(): Promise<void> {
    if (!this.userId || !this.remoteRepo) return;
    this.setStatus('syncing');

    try {
      // Fetch delta changes only for collections
      // Settings are handled by realtime listeners, don't fetch them here
      const [qh, mc, ss] = await Promise.all([
        this.remoteRepo.getDeltaChanges(
          'questionHistory',
          this.metadata.lastSyncVersions.questionHistory
        ),
        this.remoteRepo.getDeltaChanges(
          'mcHistory',
          this.metadata.lastSyncVersions.mcHistory
        ),
        this.remoteRepo.getDeltaChanges(
          'savedSets',
          this.metadata.lastSyncVersions.savedSets
        ),
      ]);

      this.telemetry.fullSyncReads += 1;
      this.notifyTelemetryChange(this.telemetry);

      // If no changes, we're done
      if (qh.length === 0 && mc.length === 0 && ss.length === 0) {
        this.telemetry.deltaNoChangePasses += 1;
        this.addEvent('download', 'No changes from server');
        this.shouldPullAfterResume = false;
        this.setStatus('idle');
        return;
      }

      // Apply to cache
      const entries: LocalCacheEntry[] = [
        ...qh.map((d) => ({
          id: d.id,
          collection: 'questionHistory' as const,
          data: d.data,
          lastModified: d.lastModified,
          syncedAt: Date.now(),
          isDeleted: false,
        })),
        ...mc.map((d) => ({
          id: d.id,
          collection: 'mcHistory' as const,
          data: d.data,
          lastModified: d.lastModified,
          syncedAt: Date.now(),
          isDeleted: false,
        })),
        ...ss.map((d) => ({
          id: d.id,
          collection: 'savedSets' as const,
          data: d.data,
          lastModified: d.lastModified,
          syncedAt: Date.now(),
          isDeleted: false,
        })),
      ];
      await cacheApplySnapshot(entries);

      // Update metadata version tracking
      for (const d of qh)
        this.metadata.lastSyncVersions.questionHistory[d.id] = d.lastModified;
      for (const d of mc)
        this.metadata.lastSyncVersions.mcHistory[d.id] = d.lastModified;
      for (const d of ss)
        this.metadata.lastSyncVersions.savedSets[d.id] = d.lastModified;

      this.lastSyncTime = Date.now();
      this.metadata.lastSyncTime = this.lastSyncTime;
      if (this.userId) writeMetadata(this.userId, this.metadata);

      // Apply changes to local data
      if (!this.localData) {
        this.localData = this.getLocalState();
      }

      // Merge pulled data with current state
      const localState = this.getState?.() ?? {
        settings: {},
        questionHistory: [],
        mcHistory: [],
        savedSets: [],
      };

      this.localData = mergeSyncableData(
        localState,
        {
          settings: this.localData.settings,
          questionHistory: qh.map((d) => d.data),
          mcHistory: mc.map((d) => d.data),
          savedSets: ss.map((d) => d.data),
          presets: this.localData.presets,
          studyGoals: this.localData.studyGoals,
          streakData: this.localData.streakData,
        },
        this.tombstones
      );

      this.notifyDataChange(this.localData);
      this.addEvent(
        'download',
        `Pulled ${qh.length + mc.length + ss.length} changes`
      );
      this.shouldPullAfterResume = false;
      this.setStatus('idle');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.addEvent('error', `Pull failed: ${this.lastError}`);
      this.setStatus('error');
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.shouldPullAfterResume = true;
    this.setStatus(this.status === 'offline' ? 'idle' : this.status);
    if (this.queueManager && this.queueManager.pendingCount > 0) {
      this.queueManager.scheduleFlush();
    }
    this.handleForegroundResume();
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.setStatus('offline');
  }

  private handleForegroundResume(): void {
    if (!this.started || !this.isOnline || !this.userId || !this.remoteRepo) {
      return;
    }

    const now = Date.now();
    const backgroundMs =
      this.lastBackgroundedAt !== null ? now - this.lastBackgroundedAt : 0;
    const wasBackgroundedLongEnough =
      backgroundMs >= FOREGROUND_PULL_MIN_BACKGROUND_MS;

    // Normal focus toggles should stay listener-only. Pull only if we've been
    // offline, the app was backgrounded for a while, or a listener error was seen.
    if (!this.shouldPullAfterResume && !wasBackgroundedLongEnough) {
      return;
    }

    if (now - this.lastForegroundPullAt < FOREGROUND_PULL_COOLDOWN_MS) {
      return;
    }
    this.lastForegroundPullAt = now;
    this.scheduleRemotePull();
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    for (const cb of this.statusCallbacks) cb(status);
  }

  private addEvent(type: SyncEvent['type'], description: string): void {
    const event: SyncEvent = {
      id: newEventId(),
      timestamp: Date.now(),
      type,
      description,
    };
    for (const cb of this.eventCallbacks) cb(event);
  }

  private notifyDataChange(data: SyncableData): void {
    for (const cb of this.dataCallbacks) cb(data);
  }

  private findCollectionForEntity(
    entityId: string
  ): 'questionHistory' | 'mcHistory' | 'savedSets' | 'settings' {
    // Heuristic: check metadata versions
    if (this.metadata.lastSyncVersions.questionHistory[entityId])
      return 'questionHistory';
    if (this.metadata.lastSyncVersions.mcHistory[entityId]) return 'mcHistory';
    if (this.metadata.lastSyncVersions.savedSets[entityId]) return 'savedSets';
    return 'settings';
  }

  destroy(): void {
    this.stop();
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    window.removeEventListener('focus', this.focusHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.dataCallbacks.clear();
    this.eventCallbacks.clear();
    this.statusCallbacks.clear();
  }
}
