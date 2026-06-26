const UI_PREFS_STORAGE_KEY = 'questiongen-ui-prefs';

export type UiPrefs = Record<string, unknown>;

export function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UiPrefs) : {};
  } catch {
    return {};
  }
}

export function writeUiPrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore localStorage errors (quota, private mode, etc.).
  }
}

export function patchUiPrefs(partial: UiPrefs): void {
  writeUiPrefs({ ...readUiPrefs(), ...partial });
}

/**
 * Atomically merge `add` over the current sidecar and delete `removeKeys`
 * from the resulting object — in a single read-modify-write cycle.
 */
export function updateUiPrefs(add: UiPrefs = {}, removeKeys: string[] = []) {
  const next = readUiPrefs();
  for (const key of removeKeys) {
    delete next[key];
  }
  Object.assign(next, add);
  writeUiPrefs(next);
}
