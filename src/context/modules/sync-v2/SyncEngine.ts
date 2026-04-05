/**
 * Core sync orchestrator.
 *
 * Orchestrates LocalCache, QueueManager, RemoteRepository, RealtimeListener,
 * and ConflictResolver into a cohesive sync engine.
 */

import { SYNC_METADATA_KEY } from './config';
import { applyResolutions, detectConflicts } from './ConflictResolver';
import {
  buildSnapshot,
  cacheApplySnapshot,
  cacheDelete,
  cacheSet,
} from './LocalCache';
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

// ─── SyncEngine ───────────────────────────────────────────────────────────────

type DataChangeCallback = (data: SyncableData) => void;
type EventCallback = (event: SyncEvent) => void;
type StatusCallback = (status: SyncStatus) => void;

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
    estimatedWritesAvoided: 0,
    estimatedReadsAvoided: 0,
  };
  private telemetryCallbacks: Set<(t: SyncTelemetry) => void> = new Set();
  private queueCountCallbacks: Set<(n: number) => void> = new Set();
  private dataCallbacks: Set<DataChangeCallback> = new Set();
  private eventCallbacks: Set<EventCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private initialized = false;
  private getState: (() => SyncableData) | null = null;
  private getTombstones: (() => DeletionTombstones) | null = null;

  constructor(
    getState: () => SyncableData,
    getTombstones: () => DeletionTombstones,
    _setTombstones: (t: DeletionTombstones) => void
  ) {
    this.getState = getState;
    this.getTombstones = getTombstones;
    this.tombstones = getTombstones();

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
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
    this.realtimeListener = new RealtimeListener(userId, (events) => {
      void this.handleRemoteChanges(events);
    });

    this.initialized = true;
    this.setStatus('idle');
  }

  async start(): Promise<void> {
    if (!this.userId || !this.initialized) return;
    await this.performStartupSync();
    this.realtimeListener?.start();
    if (this.isOnline && this.queueManager) {
      void this.queueManager.flush();
    }
  }

  stop(): void {
    this.realtimeListener?.stop();
    this.queueManager?.destroy();
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

  async forceSync(): Promise<void> {
    await this.push();
    await this.pull();
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
      if (data) {
        this.queueManager?.enqueue(
          this.findCollectionForEntity(entityId),
          'upsert',
          entityId
        );
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

  private async handleFlush(ops: SyncOperation[]): Promise<void> {
    if (!this.remoteRepo) return;
    this.setStatus('syncing');
    this.addEvent('upload', `Flushing ${ops.length} operations`);

    try {
      const state = this.getState?.() ?? {
        settings: {},
        questionHistory: [],
        mcHistory: [],
        savedSets: [],
      };
      await this.remoteRepo.flushOperations(ops, () => {
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
      if (this.userId) writeMetadata(this.userId, this.metadata);
      this.addEvent('upload', `Successfully flushed ${ops.length} operations`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.addEvent('error', `Flush failed: ${this.lastError}`);
      throw error;
    } finally {
      this.setStatus('idle');
    }
  }

  private async handleRemoteChanges(events: ChangeEvent[]): Promise<void> {
    if (!this.userId) return;

    // Apply remote changes to local cache
    for (const event of events) {
      if (event.type === 'removed') {
        await cacheDelete(event.collection, event.docId);
      } else if (event.data) {
        await cacheSet({
          id: event.docId,
          collection: event.collection,
          data: event.data,
          lastModified: Date.now(),
          syncedAt: Date.now(),
          isDeleted: false,
        });
      }
    }

    // Trigger data change notification
    const localState = this.getState?.() ?? {
      settings: {},
      questionHistory: [],
      mcHistory: [],
      savedSets: [],
    };
    this.notifyDataChange(localState);
    this.addEvent('download', `Received ${events.length} remote changes`);
  }

  private async performStartupSync(): Promise<void> {
    if (!this.userId || !this.remoteRepo) return;
    this.setStatus('connecting');

    try {
      const remoteData = await this.loadStartupRemoteData();
      const localState = this.getLocalState();
      const merged = mergeSyncableData(localState, remoteData, this.tombstones);
      this.conflicts = detectConflicts(
        this.buildQuestionHistoryConflictInputs(merged, remoteData)
      );

      // Update local data
      this.localData = merged;
      this.lastSyncTime = Date.now();
      this.metadata.lastSyncTime = this.lastSyncTime;

      // Update snapshot
      this.snapshot = buildSnapshot(this.buildSnapshotEntries(merged));

      // Write metadata
      if (this.userId) writeMetadata(this.userId, this.metadata);

      // Notify
      this.notifyDataChange(merged);
      this.addEvent(
        'download',
        `Startup sync complete: ${merged.questionHistory.length} QH, ${merged.mcHistory.length} MC, ${merged.savedSets.length} SS`
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

  private async loadStartupRemoteData(): Promise<SyncableData> {
    if (!this.remoteRepo) {
      return {
        settings: {},
        questionHistory: [],
        mcHistory: [],
        savedSets: [],
      };
    }

    const [qh, mc, ss, settingsMain, settingsGoals, settingsPresets] =
      await Promise.all([
        this.remoteRepo.getCollection('questionHistory'),
        this.remoteRepo.getCollection('mcHistory'),
        this.remoteRepo.getCollection('savedSets'),
        this.remoteRepo.getSettingsDoc('main').catch(() => null),
        this.remoteRepo.getSettingsDoc('goals').catch(() => null),
        this.remoteRepo.getSettingsDoc('presets').catch(() => null),
      ]);

    this.telemetry.fullSyncReads += 1;
    this.notifyTelemetryChange(this.telemetry);

    return {
      settings: (settingsMain?.data?.settings as Record<string, unknown>) ?? {},
      questionHistory: qh.map((d) => d.data),
      mcHistory: mc.map((d) => d.data),
      savedSets: ss.map((d) => d.data),
      presets:
        (settingsPresets?.data?.presets as Array<Record<string, unknown>>) ??
        [],
      studyGoals:
        (settingsGoals?.data?.studyGoals as Record<string, unknown>) ??
        undefined,
      streakData:
        (settingsGoals?.data?.streakData as Record<string, unknown>) ??
        undefined,
    };
  }

  private buildQuestionHistoryConflictInputs(
    merged: SyncableData,
    remoteData: SyncableData
  ): Array<{
    collection: 'questionHistory';
    entityId: string;
    localData: Record<string, unknown>;
    remoteData: Record<string, unknown>;
    localModified: number;
    remoteModified: number;
    tombstones: DeletionTombstones;
  }> {
    const conflictInputs: Array<{
      collection: 'questionHistory';
      entityId: string;
      localData: Record<string, unknown>;
      remoteData: Record<string, unknown>;
      localModified: number;
      remoteModified: number;
      tombstones: DeletionTombstones;
    }> = [];

    for (const item of merged.questionHistory) {
      const itemId = (item as { id?: unknown }).id;
      if (typeof itemId !== 'string' || itemId.length === 0) continue;

      const remoteItem = remoteData.questionHistory.find(
        (r) => (r as { id?: unknown }).id === itemId
      );
      if (!remoteItem) continue;

      conflictInputs.push({
        collection: 'questionHistory',
        entityId: itemId,
        localData: item,
        remoteData: remoteItem,
        localModified: (item.lastModified as number) || 0,
        remoteModified: (remoteItem.lastModified as number) || 0,
        tombstones: this.tombstones,
      });
    }

    return conflictInputs;
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

  private async performPull(): Promise<void> {
    if (!this.userId || !this.remoteRepo) return;
    this.setStatus('syncing');

    try {
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

      if (qh.length === 0 && mc.length === 0 && ss.length === 0) {
        this.telemetry.deltaNoChangePasses += 1;
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

      // Update metadata
      for (const d of qh)
        this.metadata.lastSyncVersions.questionHistory[d.id] = d.lastModified;
      for (const d of mc)
        this.metadata.lastSyncVersions.mcHistory[d.id] = d.lastModified;
      for (const d of ss)
        this.metadata.lastSyncVersions.savedSets[d.id] = d.lastModified;
      this.lastSyncTime = Date.now();
      this.metadata.lastSyncTime = this.lastSyncTime;
      if (this.userId) writeMetadata(this.userId, this.metadata);

      this.addEvent(
        'download',
        `Pulled ${qh.length + mc.length + ss.length} changes`
      );
      this.setStatus('idle');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.addEvent('error', `Pull failed: ${this.lastError}`);
      this.setStatus('error');
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.setStatus(this.status === 'offline' ? 'idle' : this.status);
    if (this.queueManager && this.queueManager.pendingCount > 0) {
      this.queueManager.scheduleFlush();
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.setStatus('offline');
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
    window.removeEventListener('online', () => this.handleOnline());
    window.removeEventListener('offline', () => this.handleOffline());
    this.dataCallbacks.clear();
    this.eventCallbacks.clear();
    this.statusCallbacks.clear();
  }
}
