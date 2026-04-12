import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind/utility classnames and merge conflicting classes.
 *
 * Wrapper around `clsx` and `twMerge` to produce a single class string.
 *
 * @param inputs - Class values accepted by `clsx`
 * @returns Merged className string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a Date into a local YYYY-MM-DD key.
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD (local time)
 */
function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Returns today's date key in local time as YYYY-MM-DD */
export function getTodayKey(): string {
  return formatDateKey(new Date());
}

/** Returns the date key for a given ISO string or timestamp in local time */
export function getDayKey(date: string | number): string {
  return formatDateKey(new Date(date));
}

/**
 * Performs a deep equality comparison between two values.
 * Useful for determining if state changes require persistence.
 */
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (
      !isDeepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }

  return true;
}
