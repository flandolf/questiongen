export type CollectionType =
  | 'questionHistory'
  | 'mcHistory'
  | 'savedSets'
  | 'presets';

export interface DeletionTombstones {
  questionHistory: Record<string, number>; // id → deletedAt (epoch ms)
  mcHistory: Record<string, number>;
  savedSets: Record<string, number>;
  presets: Record<string, number>;
}

export interface SyncConflict {
  id: string;
  collection: CollectionType;
  /** Human-readable label for the item (title, topic, etc.) */
  label: string;
  /** When the local side deleted it */
  localDeletedAt: number;
}

export const EMPTY_TOMBSTONES: DeletionTombstones = {
  questionHistory: {},
  mcHistory: {},
  savedSets: {},
  presets: {},
};

export function addTombstone(
  tombstones: DeletionTombstones,
  collection: CollectionType,
  id: string
): DeletionTombstones {
  const now = Date.now();
  return {
    ...tombstones,
    [collection]: {
      ...tombstones[collection],
      [id]: now,
    },
  };
}

export function removeTombstone(
  tombstones: DeletionTombstones,
  collection: CollectionType,
  id: string
): DeletionTombstones {
  const next = { ...tombstones[collection] };
  delete next[id];
  return { ...tombstones, [collection]: next };
}

/** Build a deletedIds object for saveUserData from tombstones. */
export function tombstonesToDeletedIds(tombstones: DeletionTombstones): {
  questionHistory: string[];
  mcHistory: string[];
  savedSets: string[];
  presets: string[];
} {
  return {
    questionHistory: Object.keys(tombstones.questionHistory),
    mcHistory: Object.keys(tombstones.mcHistory),
    savedSets: Object.keys(tombstones.savedSets),
    presets: Object.keys(tombstones.presets),
  };
}

/** Clear tombstones whose IDs have been successfully persisted to Firestore. */
export function purgePersistedTombstones(
  tombstones: DeletionTombstones,
  deletedIds: {
    questionHistory: string[];
    mcHistory: string[];
    savedSets: string[];
    presets?: string[];
  }
): DeletionTombstones {
  return {
    questionHistory: Object.fromEntries(
      Object.entries(tombstones.questionHistory).filter(
        ([id]) => !deletedIds.questionHistory.includes(id)
      )
    ),
    mcHistory: Object.fromEntries(
      Object.entries(tombstones.mcHistory).filter(
        ([id]) => !deletedIds.mcHistory.includes(id)
      )
    ),
    savedSets: Object.fromEntries(
      Object.entries(tombstones.savedSets).filter(
        ([id]) => !deletedIds.savedSets.includes(id)
      )
    ),
    presets: Object.fromEntries(
      Object.entries(tombstones.presets).filter(
        ([id]) => !(deletedIds.presets ?? []).includes(id)
      )
    ),
  };
}

/**
 * Given a local item array and tombstones, return only items not deleted.
 */
export function filterDeleted<T extends { id?: string }>(
  items: T[],
  tombstones: Record<string, number>
): T[] {
  if (Object.keys(tombstones).length === 0) return items;
  return items.filter((item) => !item.id || !(item.id in tombstones));
}

/**
 * Detect conflicts: items that are in both local tombstones AND missing from remote.
 * This means the user deleted locally, and the remote also doesn't have the item
 * (either it was never there, or it was deleted remotely too).
 *
 * If previouslySyncedIds is provided, only flag a conflict if the tombstoned ID
 * was previously synced. Items created and deleted locally before ever syncing
 * should not trigger conflict dialogs.
 *
 * Returns the subset of tombstone IDs that are NOT present in remote data.
 */
export function detectDualDeletions(
  tombstoneIds: Set<string>,
  remoteItemIds: Set<string>,
  previouslySyncedIds?: Set<string>
): Set<string> {
  const conflicts = new Set<string>();
  for (const id of tombstoneIds) {
    if (!remoteItemIds.has(id)) {
      // Only flag as conflict if the item was previously synced (or no filter provided)
      if (!previouslySyncedIds || previouslySyncedIds.has(id)) {
        conflicts.add(id);
      }
    }
  }
  return conflicts;
}

/**
 * Build human-readable labels for conflict items from local state.
 */
export function buildConflictLabel(
  collection: CollectionType,
  itemId: string,
  localItems: Record<string, unknown>[]
): string {
  const item = localItems.find((i) => i.id === itemId);
  if (!item) return `${collection}/${itemId.slice(0, 8)}`;

  if (collection === 'savedSets') {
    return (item.title as string) || `Saved set ${itemId.slice(0, 8)}`;
  }
  if (collection === 'questionHistory') {
    const question = item.question as Record<string, unknown> | undefined;
    return (question?.topic as string) || `Question ${itemId.slice(0, 8)}`;
  }
  if (collection === 'mcHistory') {
    const question = item.question as Record<string, unknown> | undefined;
    return (question?.topic as string) || `MC Question ${itemId.slice(0, 8)}`;
  }
  if (collection === 'presets') {
    return (item.name as string) || `Preset ${itemId.slice(0, 8)}`;
  }
  return `${collection}/${itemId.slice(0, 8)}`;
}
