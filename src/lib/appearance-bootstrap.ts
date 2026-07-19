// ─── Appearance bootstrap helpers ────────────────────────────────────────────
// Extracted from `src/main.tsx` to keep that file focused on the React entry
// point. Behaviour is preserved exactly: callers pass the resolved mode and
// initial appearance, and the helpers apply theme tokens + persist UI prefs
// without leaking global side effects.

import { resolveDesignThemeName } from '@/themes/designThemes';

import { normalizeHexColor } from './color-helpers';
import { generateM3Theme } from './color-utils';
import { patchUiPrefs, readUiPrefs } from './ui-prefs';

const APP_STATE_STORAGE_KEY = 'questiongen.appState';

type PersistedSettingsLike = {
  settings?: {
    theme?: unknown;
    customThemeSeedColor?: unknown;
  };
};

export type ResolvedInitialAppearance = {
  designTheme: string;
  customThemeSeedColor: string;
};

export function readStoredMode(): 'dark' | 'light' | 'system' {
  const prefs = readUiPrefs();
  const fromPrefs = typeof prefs.mode === 'string' ? prefs.mode : null;
  const fromLocal =
    fromPrefs ?? localStorage.getItem('questiongen-theme') ?? 'dark';
  if (fromLocal === 'dark' || fromLocal === 'light' || fromLocal === 'system') {
    return fromLocal;
  }
  return 'dark';
}

export function resolveCurrentMode(): 'dark' | 'light' {
  const mode = readStoredMode();
  if (mode === 'dark') return 'dark';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

export function parseJsonSafely(raw: string | null): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function extractPersistedSettings(raw: unknown): {
  theme: string | null;
  customThemeSeedColor: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { theme: null, customThemeSeedColor: null };
  }

  const state = raw as PersistedSettingsLike;
  const themeRaw = state.settings?.theme;
  const customSeedRaw = state.settings?.customThemeSeedColor;

  const theme =
    typeof themeRaw === 'string' && themeRaw.trim().length > 0
      ? themeRaw.trim()
      : null;

  const customThemeSeedColor =
    typeof customSeedRaw === 'string' && customSeedRaw.trim().length > 0
      ? normalizeHexColor(customSeedRaw)
      : null;

  return { theme, customThemeSeedColor };
}

/**
 * Resolve only appearance data that is already available in the webview.
 *
 * Native state is deliberately not read here. This function runs before React
 * mounts, and waiting for the Tauri bridge can leave a fresh install with an
 * empty root while the native runtime is still starting. The normal store
 * hydration path restores native settings after the loading UI has mounted.
 */
export function resolveInitialAppearance(): ResolvedInitialAppearance {
  const uiPrefs = readUiPrefs();

  const uiTheme =
    typeof uiPrefs.designTheme === 'string' && uiPrefs.designTheme.trim()
      ? uiPrefs.designTheme
      : null;

  const uiCustomSeed =
    typeof uiPrefs.customThemeSeedColor === 'string' &&
    uiPrefs.customThemeSeedColor.trim()
      ? normalizeHexColor(uiPrefs.customThemeSeedColor)
      : null;

  if (uiTheme) {
    return {
      designTheme: resolveDesignThemeName(uiTheme),
      customThemeSeedColor: uiCustomSeed ?? normalizeHexColor(null),
    };
  }

  const localState = parseJsonSafely(
    localStorage.getItem(APP_STATE_STORAGE_KEY),
  );
  const extractedLocal = extractPersistedSettings(localState);

  return {
    designTheme: resolveDesignThemeName(extractedLocal.theme ?? 'default'),
    customThemeSeedColor: extractedLocal.customThemeSeedColor ?? '#3b82f6',
  };
}

export function persistUiPrefsAppearance(params: {
  designTheme: string;
  customThemeSeedColor: string;
  customThemeVars: Record<string, string> | null;
}) {
  patchUiPrefs({
    designTheme: params.designTheme,
    customThemeSeedColor: params.customThemeSeedColor,
    ...(params.customThemeVars
      ? { customThemeVars: params.customThemeVars }
      : {}),
  });
}

export function applyAppearanceToDocument(params: {
  initialAppearance: ResolvedInitialAppearance;
  isDark: boolean;
}): Record<string, string> | null {
  const { initialAppearance, isDark } = params;
  document.documentElement.setAttribute(
    'data-design-theme',
    initialAppearance.designTheme,
  );

  let customThemeVars: Record<string, string> | null = null;
  if (initialAppearance.designTheme === 'custom') {
    customThemeVars = generateM3Theme(
      initialAppearance.customThemeSeedColor,
      isDark,
    );
    Object.entries(customThemeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    const bg = customThemeVars['--background'];
    if (bg) {
      document.documentElement.style.backgroundColor = bg;
    }
  }

  return customThemeVars;
}

export function setupAndroidViewportHeight(): void {
  if (!/Android/i.test(window.navigator.userAgent)) {
    return;
  }

  document.documentElement.classList.add('platform-android');

  const setAndroidViewportHeight = () => {
    const viewportHeight =
      window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty(
      '--android-app-height',
      `${Math.round(viewportHeight)}px`,
    );
  };

  setAndroidViewportHeight();
  window.visualViewport?.addEventListener('resize', setAndroidViewportHeight);
  window.addEventListener('resize', setAndroidViewportHeight);
}
