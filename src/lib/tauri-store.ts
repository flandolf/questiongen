import { LazyStore } from '@tauri-apps/plugin-store';

import { isTauriRuntime } from './persistence';

const STORE_FILENAME = 'sketchpad.json';
let storeInstance: LazyStore | null = null;

export function getSketchpadStore(): LazyStore | null {
  if (!isTauriRuntime()) return null;
  if (!storeInstance) {
    storeInstance = new LazyStore(STORE_FILENAME, {
      autoSave: true,
      defaults: {},
    });
  }
  return storeInstance;
}

export async function setStoreItem(key: string, value: unknown): Promise<void> {
  const store = getSketchpadStore();
  if (store) {
    await store.set(key, value);
    await store.save();
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export async function getStoreItem<T>(key: string): Promise<T | null> {
  const store = getSketchpadStore();
  if (store) {
    try {
      const val = await store.get<T>(key);
      if (val !== undefined && val !== null) {
        return val;
      }
    } catch (err) {
      console.warn(`[Store] Failed to get key ${key}:`, err);
    }
  }

  const val = localStorage.getItem(key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function removeStoreItem(key: string): Promise<void> {
  const store = getSketchpadStore();
  if (store) {
    await store.delete(key);
    await store.save();
  } else {
    localStorage.removeItem(key);
  }
}

export async function clearStore(): Promise<void> {
  const store = getSketchpadStore();
  if (store) {
    await store.clear();
    await store.save();
  } else {
    localStorage.clear();
  }
}

export async function getAllStoreKeys(): Promise<string[]> {
  const store = getSketchpadStore();
  if (store) {
    return await store.keys();
  }
  return Object.keys(localStorage);
}
