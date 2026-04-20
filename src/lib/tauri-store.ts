import type { Store } from '@tauri-apps/plugin-store';
import { load } from '@tauri-apps/plugin-store';

import { isTauriRuntime } from './persistence';

let storeInstance: Store | null = null;
const STORE_FILENAME = 'sketchpad.json';

export async function getSketchpadStore(): Promise<Store | null> {
  if (!isTauriRuntime()) return null;
  if (storeInstance) return storeInstance;

  try {
    storeInstance = await load(STORE_FILENAME, {
      autoSave: true,
      defaults: {},
    });
    return storeInstance;
  } catch (err) {
    console.error('Failed to load Tauri Store:', err);
    return null;
  }
}

export async function setStoreItem(key: string, value: unknown): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  const store = await getSketchpadStore();
  if (store) {
    await store.set(key, value);
    // autoSave is true, but we can force it if needed
    await store.save();
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export async function getStoreItem<T>(key: string): Promise<T | null> {
  if (!isTauriRuntime()) {
    const val = localStorage.getItem(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }

  const store = await getSketchpadStore();
  if (store) {
    const val = await store.get<T>(key);
    return val ?? null;
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
  if (!isTauriRuntime()) {
    localStorage.removeItem(key);
    return;
  }

  const store = await getSketchpadStore();
  if (store) {
    await store.delete(key);
    await store.save();
  } else {
    localStorage.removeItem(key);
  }
}

export async function clearStore(): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.clear();
    return;
  }

  const store = await getSketchpadStore();
  if (store) {
    await store.clear();
    await store.save();
  } else {
    localStorage.clear();
  }
}

export async function getAllStoreKeys(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return Object.keys(localStorage);
  }

  const store = await getSketchpadStore();
  if (store) {
    return await store.keys();
  }
  return Object.keys(localStorage);
}
