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
