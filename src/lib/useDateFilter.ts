import { useState } from 'react';

export type DateRangePreset =
  | '7d'
  | '30d'
  | '90d'
  | 'this-month'
  | 'this-year'
  | 'all';

export interface DateRange {
  preset: DateRangePreset;
  startDate: string | null;
  endDate: string | null;
  label: string;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  'this-month': 'This month',
  'this-year': 'This year',
  all: 'All time',
};

function computeRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = now;

  switch (preset) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'this-month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this-year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = null;
      end = null;
      break;
  }

  return {
    preset,
    startDate: start?.toISOString() ?? null,
    endDate: end?.toISOString() ?? null,
    label: PRESET_LABELS[preset],
  };
}

export function useDateFilter(initialPreset: DateRangePreset = 'all') {
  const [range, setRange] = useState<DateRange>(() =>
    computeRange(initialPreset),
  );

  const setPreset = (preset: DateRangePreset) => {
    setRange(computeRange(preset));
  };

  const isActive = range.preset !== 'all';

  return { range, setPreset, isActive };
}

export function filterAttemptsByDate<T extends { createdAt: string }>(
  attempts: T[],
  range: DateRange,
): T[] {
  if (!range.startDate && !range.endDate) return attempts;
  const startMs = range.startDate ? Date.parse(range.startDate) : 0;
  const endMs = range.endDate ? Date.parse(range.endDate) : Infinity;

  return attempts.filter((a) => {
    const t = Date.parse(a.createdAt);
    return t >= startMs && t <= endMs;
  });
}

export function computePreviousPeriod(range: DateRange): DateRange | null {
  if (!range.startDate) return null;
  const startMs = Date.parse(range.startDate);
  const endMs = range.endDate ? Date.parse(range.endDate) : Date.now();
  const duration = endMs - startMs;
  const prevStart = new Date(startMs - duration);
  const prevEnd = new Date(startMs);

  return {
    preset: range.preset,
    startDate: prevStart.toISOString(),
    endDate: prevEnd.toISOString(),
    label: `Previous ${range.label}`,
  };
}
