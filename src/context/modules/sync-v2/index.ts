/**
 * Barrel exports for the sync-v2 module.
 */

export { DEFAULT_CONFIG } from './config';
export {
  applyResolutions,
  detectConflicts,
  filterByTombstones,
  isTombstoned,
  resolveAuto,
} from './ConflictResolver';
export {
  buildSnapshot,
  cacheApplySnapshot,
  cacheClear,
  cacheDelete,
  cacheGet,
  cacheGetAll,
  cacheGetChangedSince,
  cacheSet,
  countSnapshotDiff,
  snapshotToMap,
} from './LocalCache';
export { QueueManager } from './QueueManager';
export type { ChangeEvent } from './RealtimeListener';
export { RealtimeListener } from './RealtimeListener';
export { RemoteExplorer } from './RemoteExplorer';
export { RemoteRepository } from './RemoteRepository';
export { SyncEngine } from './SyncEngine';
export type {
  CacheSnapshot,
  CollectionType,
  DebugLogEntry,
  DeletionTombstones,
  LocalCacheEntry,
  ManualSyncCollection,
  RemoteDocument,
  ShardKey,
  ShardPath,
  SyncableData,
  SyncCollection,
  SyncConfig,
  SyncConflict,
  SyncEvent,
  SyncEventType,
  SyncMetadata,
  SyncOperation,
  SyncOpType,
  SyncQueueState,
  SyncState,
  SyncStatus,
  SyncTelemetry,
} from './types';
export { SYNC_COLLECTIONS } from './types';
export { useSyncV2 } from './useSyncV2';
