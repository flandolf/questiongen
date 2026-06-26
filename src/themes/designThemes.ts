export type DesignTheme = {
  name: string;
  label?: string;
};

/**
 * Core themes for the redesigned token-based system.
 * Reduced from 12 per-file themes to 4 semantic themes + custom.
 */
export const themes = [
  { name: 'light', label: 'Light' },
  { name: 'dark', label: 'Dark' },
  { name: 'academic', label: 'Academic' },
  { name: 'high-contrast', label: 'High Contrast' },
  { name: 'custom', label: 'Custom' },
] as const satisfies readonly DesignTheme[];

export const DEFAULT_THEME_NAME = 'light';

/**
 * Maps deprecated theme names to their new equivalents.
 * Ensures users with old themes selected get a graceful fallback.
 */
const THEME_MIGRATION_MAP: Record<string, string> = {
  // Warm/neutral themes → light
  claude: 'light',
  blue: 'light',
  purple: 'light',
  pink: 'light',
  zen: 'light',
  nord: 'light',
  slate: 'light',
  // Darker themes → dark
  midnight: 'dark',
  forest: 'dark',
  'rose-pine': 'dark',
  sunset: 'dark',
};

function getThemeByName(name: string) {
  return themes.find((theme) => theme.name === name);
}

export function resolveDesignThemeName(
  name: string | null | undefined,
): string {
  const normalized = typeof name === 'string' ? name.trim() : '';
  const theme = getThemeByName(normalized);
  if (theme) return theme.name;

  // Migrate deprecated theme names to new equivalents
  const migrated = THEME_MIGRATION_MAP[normalized];
  if (migrated) return migrated;

  return DEFAULT_THEME_NAME;
}

export function getDesignThemeLabel(theme: DesignTheme): string {
  if (theme.label && theme.label.trim()) {
    return theme.label;
  }

  return theme.name.charAt(0).toUpperCase() + theme.name.slice(1);
}

export function applyDesignTheme(name: string): string {
  const resolvedName = resolveDesignThemeName(name);
  document.documentElement.setAttribute('data-design-theme', resolvedName);
  return resolvedName;
}
