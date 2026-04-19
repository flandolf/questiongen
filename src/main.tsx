import './App.css';
import './themes/fonts.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { ThemeProvider } from './components/theme-provider';
import { normalizeHexColor } from './lib/color-helpers';
import { generateM3Theme } from './lib/color-utils';
import { initLogger } from './lib/logger';
import { resolveDesignThemeName } from './themes/designThemes';

const APP_STATE_STORAGE_KEY = 'questiongen.appState';
const UI_PREFS_STORAGE_KEY = 'questiongen-ui-prefs';

type PersistedSettingsLike = {
  settings?: {
    theme?: unknown;
    customThemeSeedColor?: unknown;
  };
};

type ResolvedInitialAppearance = {
  designTheme: string;
  customThemeSeedColor: string;
};

function parseJsonSafely(raw: string | null): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function extractPersistedSettings(raw: unknown): {
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

function resolveCurrentMode(): 'dark' | 'light' {
  const uiPrefs = parseJsonSafely(
    localStorage.getItem(UI_PREFS_STORAGE_KEY),
  ) as Record<string, unknown> | null;
  const mode =
    (typeof uiPrefs?.mode === 'string' && uiPrefs.mode) ||
    localStorage.getItem('questiongen-theme') ||
    'dark';

  if (mode === 'dark') {
    return 'dark';
  }

  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  return 'light';
}

async function resolveInitialAppearance(): Promise<ResolvedInitialAppearance> {
  const uiPrefs = parseJsonSafely(
    localStorage.getItem(UI_PREFS_STORAGE_KEY),
  ) as Record<string, unknown> | null;

  const uiTheme =
    typeof uiPrefs?.designTheme === 'string' && uiPrefs.designTheme.trim()
      ? uiPrefs.designTheme
      : null;

  const uiCustomSeed =
    typeof uiPrefs?.customThemeSeedColor === 'string' &&
    uiPrefs.customThemeSeedColor.trim()
      ? normalizeHexColor(uiPrefs.customThemeSeedColor)
      : null;

  if (uiTheme) {
    return {
      designTheme: resolveDesignThemeName(uiTheme),
      customThemeSeedColor: uiCustomSeed ?? normalizeHexColor(null),
    };
  }

  const isTauriRuntime =
    '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

  if (isTauriRuntime) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const persistedRaw = await invoke<unknown>('load_persisted_state');
      const persisted =
        typeof persistedRaw === 'string'
          ? parseJsonSafely(persistedRaw)
          : persistedRaw;
      const extracted = extractPersistedSettings(persisted);

      if (extracted.theme) {
        return {
          designTheme: resolveDesignThemeName(extracted.theme),
          customThemeSeedColor:
            extracted.customThemeSeedColor ?? normalizeHexColor(null),
        };
      }
    } catch {
      // Ignore and continue to localStorage fallback.
    }
  }

  const localState = parseJsonSafely(
    localStorage.getItem(APP_STATE_STORAGE_KEY),
  );
  const extractedLocal = extractPersistedSettings(localState);

  return {
    designTheme: resolveDesignThemeName(extractedLocal.theme ?? 'claude'),
    customThemeSeedColor: extractedLocal.customThemeSeedColor ?? '#3b82f6',
  };
}

function persistUiPrefsAppearance(params: {
  designTheme: string;
  customThemeSeedColor: string;
  customThemeVars: Record<string, string> | null;
}) {
  try {
    const uiPrefs = parseJsonSafely(
      localStorage.getItem(UI_PREFS_STORAGE_KEY),
    ) as Record<string, unknown> | null;

    const next: Record<string, unknown> = {
      ...(uiPrefs ?? {}),
      designTheme: params.designTheme,
      customThemeSeedColor: params.customThemeSeedColor,
    };

    if (params.customThemeVars) {
      next.customThemeVars = params.customThemeVars;
    }

    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage parsing errors.
  }
}

async function bootstrap() {
  initLogger();

  const initialAppearance = await resolveInitialAppearance();
  const mode = resolveCurrentMode();
  const isDark = mode === 'dark';

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

  persistUiPrefsAppearance({
    designTheme: initialAppearance.designTheme,
    customThemeSeedColor: initialAppearance.customThemeSeedColor,
    customThemeVars,
  });

  if (/Android/i.test(window.navigator.userAgent)) {
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

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme='dark' storageKey='questiongen-theme'>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
