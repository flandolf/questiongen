/**
 * Sync queue with batching, coalescing, and exponential backoff retries.
 */

import { DEFAULT_CONFIG, SYNC_QUEUE_STORAGE_KEY } from './config';
import type {
  SyncCollection,
  SyncOperation,
  SyncQueueState,
  SyncTelemetry,
} from './types';

const EMPTY_QUEUE: SyncQueueState = { operations: [], updatedAt: 0 };

function getStorageKey(userId: string): string {
  return `${SYNC_QUEUE_STORAGE_KEY}:${userId}`;
}

function readPersistedQueue(userId: string): SyncQueueState {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return EMPTY_QUEUE;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('operations' in parsed) ||
      !Array.isArray(parsed.operations)
    ) {
      return EMPTY_QUEUE;
    }
    const operations = parsed.operations as unknown[];
    const valid = operations.filter(
      (op): op is SyncOperation =>
        op !== null &&
        typeof op === 'object' &&
        'id' in op &&
        typeof (op as Record<string, unknown>).id === 'string' &&
        'collection' in op &&
        typeof (op as Record<string, unknown>).collection === 'string' &&
        'opType' in op &&
        ((op as Record<string, unknown>).opType === 'upsert' ||
          (op as Record<string, unknown>).opType === 'delete') &&
        'createdAt' in op &&
        typeof (op as Record<string, unknown>).createdAt === 'number'
    );
    const updatedAt =
      'updatedAt' in parsed && typeof parsed.updatedAt === 'number'
        ? parsed.updatedAt
        : 0;
    return { operations: valid, updatedAt };
  } catch {
    return EMPTY_QUEUE;
  }
}

function writePersistedQueue(userId: string, queue: SyncQueueState): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(queue));
  } catch {
    // localStorage unavailable — non-fatal
  }
}

function newOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function coalesceKey(op: SyncOperation): string {
  return `${op.collection}:${op.entityId ?? '__all__'}`;
}

/**
 * Coalesce operations with smart noop detection.
 * Rules:
 * - Keep only the latest operation per entity
 * - Delete after upsert = just delete (but entity was newly created, so skip entirely)
 * - Upsert after delete = upsert (entity was recreated)
 * - Multiple upserts = keep last one
 * - Multiple deletes = keep one delete
 */
function coalesceOperations(operations: SyncOperation[]): SyncOperation[] {
  const latestByKey = new Map<string, SyncOperation>();
  let noopsDetected = 0;

  for (const op of operations) {
    const key = coalesceKey(op);
    const existing = latestByKey.get(key);

    if (!existing) {
      latestByKey.set(key, op);
      continue;
    }

    // If timestamps are same, keep existing (shouldn't happen but be safe)
    if (op.createdAt < existing.createdAt) {
      continue;
    }

    // Detect noop patterns
    if (existing.opType === 'upsert' && op.opType === 'delete') {
      // Upsert then delete = just delete, but since item is new, this is noop
      if (op.entityId) latestByKey.delete(key);
      noopsDetected += 1;
    } else if (existing.opType === 'delete' && op.opType === 'upsert') {
      // Delete then upsert = recreate, so upsert is the final state
      latestByKey.set(key, op);
    } else if (op.opType === existing.opType) {
      // Same type, keep latest
      latestByKey.set(key, op);
    } else {
      // Difference type transition, keep new
      latestByKey.set(key, op);
    }
  }

  // Note: noopsDetected is tracked but not currently exposed
  // could add to telemetry if needed
  return Array.from(latestByKey.values());
}

export class QueueManager {
  private queue: SyncQueueState;
  private userId: string;
  private flushing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private config = DEFAULT_CONFIG;
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
    retryMaxAttempts: this.config.retryMaxAttempts,
    retryBlocked: false,
    nextRetryAt: null,
    estimatedWritesAvoided: 0,
    estimatedReadsAvoided: 0,
  };

  private onFlush: (ops: SyncOperation[]) => Promise<void>;
  private onTelemetryChange: (t: SyncTelemetry) => void;
  private onQueueChange: (count: number) => void;

  constructor(
    userId: string,
    onFlush: (ops: SyncOperation[]) => Promise<void>,
    onTelemetryChange: (t: SyncTelemetry) => void,
    onQueueChange: (count: number) => void
  ) {
    this.userId = userId;
    this.queue = readPersistedQueue(userId);
    this.onFlush = onFlush;
    this.onTelemetryChange = onTelemetryChange;
    this.onQueueChange = onQueueChange;
    this.onQueueChange(this.queue.operations.length);
    this.emitTelemetry();
  }

  get pendingCount(): number {
    return this.queue.operations.length;
  }

  get operations(): SyncOperation[] {
    return this.queue.operations;
  }

  getTelemetry(): SyncTelemetry {
    return { ...this.telemetry };
  }

  get canRetry(): boolean {
    return !this.telemetry.retryBlocked;
  }

  enqueue(
    collection: SyncCollection,
    opType: 'upsert' | 'delete',
    entityId?: string
  ): void {
    const op: SyncOperation = {
      id: newOpId(),
      collection,
      opType,
      entityId,
      createdAt: Date.now(),
    };
    const next: SyncQueueState = {
      operations: [...this.queue.operations, op],
      updatedAt: Date.now(),
    };
    this.queue = next;
    this.persist();
    this.telemetry.queuedOpsTotal += 1;
    this.emitTelemetry();
    this.onQueueChange(this.queue.operations.length);
  }

  enqueueBatch(ops: SyncOperation[]): void {
    if (ops.length === 0) return;
    const next: SyncQueueState = {
      operations: [...this.queue.operations, ...ops],
      updatedAt: Date.now(),
    };
    this.queue = next;
    this.persist();
    this.telemetry.queuedOpsTotal += ops.length;
    this.emitTelemetry();
    this.onQueueChange(this.queue.operations.length);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.queue.operations.length === 0) return;

    this.flushing = true;
    const ops = coalesceOperations(this.queue.operations);
    const coalesced = this.queue.operations.length - ops.length;
    if (coalesced > 0) {
      this.telemetry.coalescedOpsSaved += coalesced;
      this.telemetry.estimatedWritesAvoided += coalesced;
      this.onTelemetryChange({ ...this.telemetry });
    }

    try {
      await this.onFlush(ops);
      this.queue = { operations: [], updatedAt: Date.now() };
      this.persist();
      this.telemetry.flushCount += 1;
      this.telemetry.retryAttemptsCurrent = 0;
      this.telemetry.retryBlocked = false;
      this.telemetry.nextRetryAt = null;
      this.emitTelemetry();
      this.onQueueChange(0);
    } catch {
      this.telemetry.retryCount += 1;
      this.telemetry.retryAttemptsCurrent += 1;
      if (this.telemetry.retryAttemptsCurrent >= this.config.retryMaxAttempts) {
        this.telemetry.retryBlocked = true;
        this.telemetry.nextRetryAt = null;
        this.emitTelemetry();
      } else {
        this.scheduleRetry();
      }
    } finally {
      this.flushing = false;
    }
  }

  scheduleFlush(): void {
    // For realtime sync: if no timer is active, flush immediately
    // This makes the first operation in a batch go out near-instantly
    const shouldFlushImmediately = !this.debounceTimer;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Immediate flush for first operation, debounce for subsequent ones
    if (shouldFlushImmediately) {
      void this.flush();
      return;
    }

    // Setup debounce for subsequent operations in quick succession
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.config.flushDebounceMs);

    // Also flush immediately if queue exceeds threshold
    if (this.queue.operations.length >= this.config.queueSizeThreshold) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      void this.flush();
    }
  }

  clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.queue = EMPTY_QUEUE;
    this.telemetry.retryAttemptsCurrent = 0;
    this.telemetry.retryBlocked = false;
    this.telemetry.nextRetryAt = null;
    this.persist();
    this.emitTelemetry();
    this.onQueueChange(0);
  }

  updateUserId(newUserId: string): void {
    this.userId = newUserId;
    this.queue = readPersistedQueue(newUserId);
    this.telemetry.retryAttemptsCurrent = 0;
    this.telemetry.retryBlocked = false;
    this.telemetry.nextRetryAt = null;
    this.emitTelemetry();
    this.onQueueChange(this.queue.operations.length);
  }

  retryNow(): void {
    if (this.queue.operations.length === 0) return;
    this.telemetry.retryAttemptsCurrent = 0;
    this.telemetry.retryBlocked = false;
    this.telemetry.nextRetryAt = null;
    this.emitTelemetry();
    void this.flush();
  }

  private persist(): void {
    writePersistedQueue(this.userId, this.queue);
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const attempt = this.telemetry.retryCount;
    const jitter = Math.random() * 500;
    const delay = Math.min(
      this.config.retryBaseDelayMs * Math.pow(2, Math.min(attempt - 1, 4)) +
        jitter,
      this.config.retryMaxDelayMs
    );
    this.telemetry.nextRetryAt = Date.now() + delay;
    this.emitTelemetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.telemetry.nextRetryAt = null;
      this.emitTelemetry();
      void this.flush();
    }, delay);
  }

  private emitTelemetry(): void {
    this.telemetry.retryMaxAttempts = this.config.retryMaxAttempts;
    this.onTelemetryChange({ ...this.telemetry });
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }
}
