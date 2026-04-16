import type {
  DynamicScheme} from '@material/material-color-utilities';
import {
  argbFromHex,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from '@material/material-color-utilities';

export type SchemeVariant =
  | 'tonal-spot'
  | 'vibrant'
  | 'expressive'
  | 'content'
  | 'rainbow'
  | 'fruit-salad'
  | 'monochrome'
  | 'neutral'
  | 'fidelity';

function getScheme(hct: Hct, isDark: boolean, variant: SchemeVariant) {
  const contrastLevel = 0;
  switch (variant) {
    case 'tonal-spot':
      return new SchemeTonalSpot(hct, isDark, contrastLevel);
    case 'vibrant':
      return new SchemeVibrant(hct, isDark, contrastLevel);
    case 'expressive':
      return new SchemeExpressive(hct, isDark, contrastLevel);
    case 'content':
      return new SchemeContent(hct, isDark, contrastLevel);
    case 'rainbow':
      return new SchemeRainbow(hct, isDark, contrastLevel);
    case 'fruit-salad':
      return new SchemeFruitSalad(hct, isDark, contrastLevel);
    case 'monochrome':
      return new SchemeMonochrome(hct, isDark, contrastLevel);
    case 'neutral':
      return new SchemeNeutral(hct, isDark, contrastLevel);
    case 'fidelity':
      return new SchemeFidelity(hct, isDark, contrastLevel);
    default:
      return new SchemeTonalSpot(hct, isDark, contrastLevel);
  }
}

/**
 * Generates application-specific CSS variables from a seed color.
 */
export function generateM3Theme(
  seedHex: string,
  isDark: boolean,
  variant: SchemeVariant = 'tonal-spot',
): Record<string, string> {
  const argb = argbFromHex(seedHex);
  const hct = Hct.fromInt(argb);
  const scheme = getScheme(hct, isDark, variant);

  const toHex = (color: { getArgb: (s: DynamicScheme) => number }) =>
    hexFromArgb(color.getArgb(scheme));

  return {
    '--background': toHex(MaterialDynamicColors.surface),
    '--foreground': toHex(MaterialDynamicColors.onSurface),
    '--card': toHex(MaterialDynamicColors.surfaceContainer),
    '--card-foreground': toHex(MaterialDynamicColors.onSurface),
    '--popover': toHex(MaterialDynamicColors.surfaceContainerHigh),
    '--popover-foreground': toHex(MaterialDynamicColors.onSurface),
    '--primary': toHex(MaterialDynamicColors.primary),
    '--primary-foreground': toHex(MaterialDynamicColors.onPrimary),
    '--secondary': toHex(MaterialDynamicColors.secondary),
    '--secondary-foreground': toHex(MaterialDynamicColors.onSecondary),
    '--muted': toHex(MaterialDynamicColors.surfaceVariant),
    '--muted-foreground': toHex(MaterialDynamicColors.onSurfaceVariant),
    '--accent': toHex(MaterialDynamicColors.tertiary),
    '--accent-foreground': toHex(MaterialDynamicColors.onTertiary),
    '--destructive': toHex(MaterialDynamicColors.error),
    '--destructive-foreground': toHex(MaterialDynamicColors.onError),
    '--border': toHex(MaterialDynamicColors.outlineVariant),
    '--input': toHex(MaterialDynamicColors.outline),
    '--ring': toHex(MaterialDynamicColors.primary),
    '--sidebar': toHex(MaterialDynamicColors.surfaceContainerLow),
    '--sidebar-foreground': toHex(MaterialDynamicColors.onSurface),
    '--sidebar-primary': toHex(MaterialDynamicColors.primary),
    '--sidebar-primary-foreground': toHex(MaterialDynamicColors.onPrimary),
    '--sidebar-accent': toHex(MaterialDynamicColors.surfaceContainerHigh),
    '--sidebar-accent-foreground': toHex(MaterialDynamicColors.onSurface),
    '--sidebar-border': toHex(MaterialDynamicColors.outlineVariant),
    '--sidebar-ring': toHex(MaterialDynamicColors.primary),
  };
}
