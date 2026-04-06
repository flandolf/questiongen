/**
 * Configuration constants for the sync-v2 layer.
 */

import type { SyncConfig } from './types';

export const DEFAULT_CONFIG: SyncConfig = {
  flushDebounceMs: 100,
  queueSizeThreshold: 50,
  retryMaxAttempts: 5,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30000,
  conflictWindowMs: 300000, // 5 minutes
  maxDocsPerLoad: 1000,
  batchSize: 500,
  shardFormat: 'YYYY-MM',
  enableRealtime: true,
  enableOfflinePersistence: true,
};

// Storage key prefixes
export const SYNC_QUEUE_STORAGE_KEY = 'firebase_sync_queue_v3';
export const SYNC_CACHE_DB_NAME = 'firebase_sync_cache_v1';
export const SYNC_CACHE_STORE_NAME = 'entries';
export const SYNC_METADATA_KEY = 'firebase_sync_metadata_v3';

// Debug
export const SYNC_DEBUG = true;
export const DEBUG_LOG_LIMIT = 50;
export const SYNC_EVENT_LIMIT = 30;

// Firestore
export const FIRESTORE_OP_TIMEOUT_MS = 60000;
export const FIRESTORE_DOC_SAFE_BYTES = 950_000;
export const FIRESTORE_BATCH_MAX_OPS = 500;
export const FIRESTORE_RETRY_MAX_ATTEMPTS = 5;
export const FIRESTORE_RETRY_BASE_DELAY_MS = 1000;
export const FIRESTORE_RETRY_MAX_DELAY_MS = 30000;

// Listeners
export const LISTENER_THROTTLE_MS = 30;
