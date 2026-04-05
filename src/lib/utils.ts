import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
