import { useEffect, useMemo } from 'react';

import { useTheme } from '@/components/theme-provider';
import { generateM3Theme } from '@/lib/color-utils';
import { M3_THEME_VARS } from '@/lib/theme-constants';
import { updateUiPrefs } from '@/lib/ui-prefs';
import { useAppStore } from '@/store';

export function useAppearanceSettings() {
  const theme = useAppStore((s) => s.theme);
  const customThemeSeedColor = useAppStore((s) => s.customThemeSeedColor);
  const interfaceFont = useAppStore((s) => s.interfaceFont);
  const headingFont = useAppStore((s) => s.headingFont);
  const { theme: mode } = useTheme();

  const isDark = useMemo(() => {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return mode === 'dark';
  }, [mode]);

  const m3Colors = useMemo(() => {
    if (theme === 'custom') {
      return generateM3Theme(customThemeSeedColor, isDark);
    }
    return null;
  }, [theme, customThemeSeedColor, isDark]);

  useEffect(() => {
    const root = document.documentElement;

    // Apply / wipe M3 tokens.
    if (m3Colors) {
      for (const [key, value] of Object.entries(m3Colors)) {
        root.style.setProperty(key, value);
      }
    } else {
      for (const key of M3_THEME_VARS) {
        root.style.removeProperty(key);
      }
    }

    root.style.setProperty('--interface-font', `"${interfaceFont}"`);
    root.style.setProperty('--heading-font', `"${headingFont}"`);

    // Mirror tokens into ui-prefs so the index.html inline injector stays in sync for next boot.
    // Single read-modify-write that also handles stale-key cleanup when theme leaves 'custom'.
    updateUiPrefs(
      {
        designTheme: theme,
        customThemeSeedColor,
        ...(m3Colors ? { customThemeVars: m3Colors } : {}),
      },
      m3Colors ? [] : ['customThemeVars'],
    );
  }, [theme, customThemeSeedColor, m3Colors, interfaceFont, headingFont]);
}
