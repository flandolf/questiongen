import { useEffect, useMemo } from 'react';

import { useTheme } from '@/components/theme-provider';
import { generateM3Theme } from '@/lib/color-utils';
import { useAppStore } from '@/store';

const ROUNDING_MAP = {
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
};

export function useAppearanceSettings() {
  const theme = useAppStore((s) => s.theme);
  const customThemeSeedColor = useAppStore((s) => s.customThemeSeedColor);
  const globalRounding = useAppStore((s) => s.globalRounding);
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

    // Apply M3 Colors
    if (m3Colors) {
      Object.entries(m3Colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    } else {
      const m3Keys = [
        '--background',
        '--foreground',
        '--card',
        '--card-foreground',
        '--popover',
        '--popover-foreground',
        '--primary',
        '--primary-foreground',
        '--secondary',
        '--secondary-foreground',
        '--muted',
        '--muted-foreground',
        '--accent',
        '--accent-foreground',
        '--destructive',
        '--destructive-foreground',
        '--border',
        '--input',
        '--ring',
        '--sidebar',
        '--sidebar-foreground',
        '--sidebar-primary',
        '--sidebar-primary-foreground',
        '--sidebar-accent',
        '--sidebar-accent-foreground',
        '--sidebar-border',
        '--sidebar-ring',
      ];
      m3Keys.forEach((key) => root.style.removeProperty(key));
    }

    // Apply Rounding
    root.style.setProperty('--global-radius', ROUNDING_MAP[globalRounding]);

    // Apply Fonts
    root.style.setProperty('--interface-font', `"${interfaceFont}"`);
    root.style.setProperty('--heading-font', `"${headingFont}"`);
  }, [m3Colors, globalRounding, interfaceFont, headingFont]);
}
