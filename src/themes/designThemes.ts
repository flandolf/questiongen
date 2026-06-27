export type DesignTheme = {
  name: string;
  label?: string;
};

/**
 * Core themes for the redesigned token-based system.
 * 'default' uses the base light/dark palettes. 'high-contrast' and 'custom'
 * override specific tokens for their aesthetic.
 */
export const themes = [
  { name: 'default', label: 'Default' },
  { name: 'high-contrast', label: 'High Contrast' },
  { name: 'custom', label: 'Custom' },
] as const satisfies readonly DesignTheme[];

export const DEFAULT_THEME_NAME = 'default';

/**
 * Maps deprecated theme names to their new equivalents.
 * Ensures users with old themes selected get a graceful fallback.
 */
const THEME_MIGRATION_MAP: Record<string, string> = {
  // Legacy base themes → default
  light: 'default',
  dark: 'default',
  academic: 'default',
  // Warm/neutral themes → default
  claude: 'default',
  blue: 'default',
  purple: 'default',
  pink: 'default',
  zen: 'default',
  nord: 'default',
  slate: 'default',
  // Darker themes → default
  midnight: 'default',
  forest: 'default',
  'rose-pine': 'default',
  sunset: 'default',
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
