export type DesignTheme = {
  name: string;
  label?: string;
};

export const themes = [
  { name: 'academic', label: 'Academic' },
  { name: 'claude', label: 'Claude' },
  { name: 'zen', label: 'Zen' },
  { name: 'blue', label: 'Blue' },
  { name: 'purple', label: 'Purple' },
  { name: 'pink', label: 'Pink' },
  { name: 'rose-pine', label: 'Rose Pine' },
  { name: 'forest', label: 'Forest' },
  { name: 'midnight', label: 'Midnight' },
  { name: 'sunset', label: 'Sunset' },
  { name: 'slate', label: 'Slate' },
  { name: 'nord', label: 'Nord' },
  { name: 'custom', label: 'Custom' },
] as const satisfies readonly DesignTheme[];

export const DEFAULT_THEME_NAME = 'claude';

function getThemeByName(name: string) {
  return themes.find((theme) => theme.name === name);
}

export function resolveDesignThemeName(
  name: string | null | undefined,
): string {
  const normalized = typeof name === 'string' ? name.trim() : '';
  return getThemeByName(normalized)?.name ?? DEFAULT_THEME_NAME;
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
