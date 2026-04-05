/**
 * Local cache layer using IndexedDB for offline-first reads.
 */

import { SYNC_CACHE_DB_NAME, SYNC_CACHE_STORE_NAME } from './config';
import type { CacheSnapshot, LocalCacheEntry, SyncCollection } from './types';

const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_CACHE_DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(new Error(request.error?.message || 'Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SYNC_CACHE_STORE_NAME)) {
        const store = db.createObjectStore(SYNC_CACHE_STORE_NAME, {
          keyPath: ['collection', 'id'],
        });
        store.createIndex('collection', 'collection', { unique: false });
        store.createIndex('lastModified', 'lastModified', { unique: false });
        store.createIndex('syncedAt', 'syncedAt', { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function cacheGet(
  collection: SyncCollection,
  id: string
): Promise<LocalCacheEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readonly');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    const request = store.get([collection, id]);
    request.onsuccess = () =>
      resolve(request.result ? (request.result as LocalCacheEntry) : null);
    request.onerror = () =>
      reject(
        new Error(request.error?.message || 'Failed to get from IndexedDB')
      );
  });
}

export async function cacheSet(entry: LocalCacheEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error(tx.error?.message || 'Failed to set in IndexedDB'));
  });
}

export async function cacheDelete(
  collection: SyncCollection,
  id: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    store.delete([collection, id]);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error(tx.error?.message || 'Failed to delete from IndexedDB'));
  });
}

export async function cacheGetAll(
  collection?: SyncCollection
): Promise<LocalCacheEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readonly');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    const request = collection
      ? store.index('collection').getAll(collection)
      : store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(request.error?.message || 'Failed to get all from IndexedDB')
      );
  });
}

export async function cacheGetChangedSince(
  collection: SyncCollection,
  timestamp: number
): Promise<LocalCacheEntry[]> {
  const all = await cacheGetAll(collection);
  return all.filter((e) => e.lastModified >= timestamp && !e.isDeleted);
}

export async function cacheApplySnapshot(
  entries: LocalCacheEntry[]
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    for (const entry of entries) {
      store.put(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(tx.error?.message || 'Failed to apply snapshot to IndexedDB')
      );
  });
}

export async function cacheClear(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_CACHE_STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error(tx.error?.message || 'Failed to clear IndexedDB'));
  });
}

export function buildSnapshot(entries: LocalCacheEntry[]): CacheSnapshot {
  const entriesMap = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    if (!entriesMap.has(entry.collection)) {
      entriesMap.set(entry.collection, new Map());
    }
    entriesMap.get(entry.collection)!.set(entry.id, entry.lastModified);
  }
  return {
    version: 1,
    timestamp: Date.now(),
    entries: entriesMap,
  };
}

export function snapshotToMap(
  snapshot: CacheSnapshot
): Map<string, Map<string, number>> {
  return snapshot.entries;
}

export function countSnapshotDiff(
  current: CacheSnapshot,
  previous: CacheSnapshot
): number {
  let count = 0;
  const allCollections = new Set([
    ...current.entries.keys(),
    ...previous.entries.keys(),
  ]);
  for (const coll of allCollections) {
    const curMap = current.entries.get(coll) ?? new Map();
    const prevMap = previous.entries.get(coll) ?? new Map();
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
  }
  return count;
}
