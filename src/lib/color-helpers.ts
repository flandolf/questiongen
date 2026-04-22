export const DEFAULT_CUSTOM_THEME_SEED_COLOR = '#3b82f6';

function expandShortHex(hex: string) {
  return hex
    .split('')
    .map((part) => part.repeat(2))
    .join('');
}

export function isValidHexColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const normalized = value.trim().replace(/^#/, '');
  return (
    /^[0-9a-fA-F]{3}$/.test(normalized) ||
    /^[0-9a-fA-F]{6}$/.test(normalized) ||
    /^[0-9a-fA-F]{8}$/.test(normalized)
  );
}

export function normalizeHexColor(
  value: unknown,
  fallback = DEFAULT_CUSTOM_THEME_SEED_COLOR,
) {
  if (!isValidHexColor(value)) {
    return fallback;
  }

  const normalized = value.trim().replace(/^#/, '').toLowerCase();
  if (normalized.length === 3) {
    return `#${expandShortHex(normalized)}`;
  }

  return `#${normalized}`;
}

export function getLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex).replace(/^#/, '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  // Relative luminance formula
  const [rl, gl, bl] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}
