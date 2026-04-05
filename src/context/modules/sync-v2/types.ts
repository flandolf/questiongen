/**
 * Type definitions for the next-generation sync layer.
 */

// ─── Collections ──────────────────────────────────────────────────────────────

export type SyncCollection =
  | 'questionHistory'
  | 'mcHistory'
  | 'savedSets'
  | 'settings';

export const SYNC_COLLECTIONS: SyncCollection[] = [
  'questionHistory',
  'mcHistory',
  'savedSets',
  'settings',
];

// ─── Sync Operations ──────────────────────────────────────────────────────────

export type SyncOpType = 'upsert' | 'delete';

export interface SyncOperation {
  id: string;
  collection: SyncCollection;
  opType: SyncOpType;
  entityId?: string;
  createdAt: number;
}

export interface SyncQueueState {
  operations: SyncOperation[];
  updatedAt: number;
}

// ─── Sync State & Status ──────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'syncing'
  | 'error'
  | 'offline';

export interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  lastError: string | null;
  pendingChanges: number;
  queuedOpsCount: number;
  lastFlushTime: number | null;
}

// ─── Sync Events ──────────────────────────────────────────────────────────────

export type SyncEventType =
  | 'upload'
  | 'download'
  | 'error'
  | 'conflict'
  | 'archive'
  | 'retry';

export interface SyncEvent {
  id: string;
  timestamp: number;
  type: SyncEventType;
  description: string;
}

// ─── Debug Logs ───────────────────────────────────────────────────────────────

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  message: string;
  data?: unknown;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface SyncTelemetry {
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
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

export type CollectionType = SyncCollection;

export interface SyncConflict {
  id: string;
  collection: CollectionType;
  entityId: string;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
  localModified: number;
  remoteModified: number;
  detectedAt: number;
  resolved: boolean;
  resolution?: 'keep_local' | 'keep_remote' | 'merge' | 'delete';
}

// ─── Local Cache ──────────────────────────────────────────────────────────────

export interface LocalCacheEntry {
  id: string;
  collection: SyncCollection;
  data: Record<string, unknown>;
  lastModified: number;
  syncedAt: number | null;
  isDeleted: boolean;
}

export interface CacheSnapshot {
  version: number;
  timestamp: number;
  entries: Map<string, Map<string, number>>; // collection -> (entityId -> lastModified)
}

// ─── Remote Document ──────────────────────────────────────────────────────────

export interface RemoteDocument {
  id: string;
  data: Record<string, unknown>;
  lastModified: number;
  shardKey?: string;
}

// ─── Sync Config ──────────────────────────────────────────────────────────────

export interface SyncConfig {
  flushDebounceMs: number;
  queueSizeThreshold: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  conflictWindowMs: number;
  maxDocsPerLoad: number;
  batchSize: number;
  shardFormat: string;
  enableRealtime: boolean;
  enableOfflinePersistence: boolean;
}

// ─── Syncable Data (matches existing app types) ───────────────────────────────

export interface SyncableData {
  settings: Record<string, unknown>;
  questionHistory: Record<string, unknown>[];
  mcHistory: Record<string, unknown>[];
  savedSets: Record<string, unknown>[];
  presets?: Array<Record<string, unknown>>;
  studyGoals?: Record<string, unknown>;
  streakData?: Record<string, unknown>;
}

// ─── Sync Metadata ────────────────────────────────────────────────────────────

export interface SyncMetadata {
  lastSyncTime: number;
  questionHistorySyncTime: number;
  mcHistorySyncTime: number;
  savedSetsSyncTime: number;
  lastSyncVersions: {
    questionHistory: Record<string, number>;
    mcHistory: Record<string, number>;
    savedSets: Record<string, number>;
  };
}

// ─── Deletion Tombstones ──────────────────────────────────────────────────────

export interface DeletionTombstones {
  questionHistory: Record<string, number>;
  mcHistory: Record<string, number>;
  savedSets: Record<string, number>;
  presets: Record<string, number>;
}

// ─── Shard ────────────────────────────────────────────────────────────────────

export type ShardKey = string; // Format: YYYY-MM

export interface ShardPath {
  collection: SyncCollection;
  shardKey: ShardKey;
  docId: string;
}
