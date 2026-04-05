/**
 * Conflict detection and resolution for sync-v2.
 */

import { DEFAULT_CONFIG } from './config';
import type { DeletionTombstones, SyncCollection, SyncConflict } from './types';

let conflictCounter = 0;
function newConflictId(): string {
  conflictCounter += 1;
  return `conflict-${Date.now()}-${conflictCounter}`;
}

export interface ConflictDetectionInput {
  collection: SyncCollection;
  entityId: string;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
  localModified: number;
  remoteModified: number;
  tombstones: DeletionTombstones;
}

function getTombstoneMap(
  tombstones: DeletionTombstones,
  collection: SyncCollection
): Record<string, number> {
  if (collection in tombstones) {
    return tombstones[collection as keyof DeletionTombstones];
  }
  return {};
}

export function detectConflicts(
  inputs: ConflictDetectionInput[]
): SyncConflict[] {
  const conflicts: SyncConflict[] = [];
  const config = DEFAULT_CONFIG;

  for (const input of inputs) {
    const {
      collection,
      entityId,
      localData,
      remoteData,
      localModified,
      remoteModified,
      tombstones,
    } = input;

    const tombstoneMap = getTombstoneMap(tombstones, collection);
    const isTombstonedLocally = entityId in tombstoneMap;

    if (isTombstonedLocally && !remoteData) continue;

    if (!remoteData && localData) {
      if (isTombstonedLocally) continue;
      conflicts.push({
        id: newConflictId(),
        collection,
        entityId,
        localData,
        remoteData: null,
        localModified,
        remoteModified: 0,
        detectedAt: Date.now(),
        resolved: false,
      });
      continue;
    }

    if (localData === null && remoteData) {
      conflicts.push({
        id: newConflictId(),
        collection,
        entityId,
        localData: null,
        remoteData,
        localModified: 0,
        remoteModified,
        detectedAt: Date.now(),
        resolved: false,
      });
      continue;
    }

    if (!localData || !remoteData) continue;

    const timeDiff = Math.abs(localModified - remoteModified);
    if (
      timeDiff <= config.conflictWindowMs &&
      localModified !== remoteModified
    ) {
      conflicts.push({
        id: newConflictId(),
        collection,
        entityId,
        localData,
        remoteData,
        localModified,
        remoteModified,
        detectedAt: Date.now(),
        resolved: false,
      });
    }
  }

  return conflicts;
}

export function resolveAuto(
  conflict: SyncConflict
): 'keep_local' | 'keep_remote' {
  if (conflict.localModified >= conflict.remoteModified) {
    return 'keep_local';
  }
  return 'keep_remote';
}

export function applyResolutions(
  conflicts: SyncConflict[],
  resolutions: Map<string, 'keep_local' | 'keep_remote' | 'merge' | 'delete'>
): Map<string, Record<string, unknown> | null> {
  const results = new Map<string, Record<string, unknown> | null>();

  for (const conflict of conflicts) {
    const resolution = resolutions.get(conflict.id);
    if (resolution === 'delete') {
      results.set(conflict.entityId, null);
      continue;
    }

    if (resolution === 'keep_local') {
      results.set(conflict.entityId, conflict.localData);
      continue;
    }

    if (resolution === 'keep_remote') {
      results.set(conflict.entityId, conflict.remoteData);
      continue;
    }

    const winner = resolveAuto(conflict);
    if (winner === 'keep_local') {
      results.set(conflict.entityId, conflict.localData);
    } else {
      results.set(conflict.entityId, conflict.remoteData);
    }
  }

  return results;
}

export function isTombstoned(
  collection: SyncCollection,
  entityId: string,
  tombstones: DeletionTombstones
): boolean {
  const tombstoneMap = getTombstoneMap(tombstones, collection);
  return entityId in tombstoneMap;
}

export function filterByTombstones<T extends { id?: string }>(
  items: T[],
  collection: SyncCollection,
  tombstones: DeletionTombstones
): T[] {
  return items.filter((item) => {
    if (!item.id) return true;
    return !isTombstoned(collection, item.id, tombstones);
  });
}
