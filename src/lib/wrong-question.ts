import type { McHistoryEntry, QuestionHistoryEntry } from '@/types';

export type WrittenWrongEntry = QuestionHistoryEntry & { kind: 'written' };
export type McWrongEntry = McHistoryEntry & { kind: 'multiple-choice' };
export type WrongEntry = WrittenWrongEntry | McWrongEntry;
export type ViewMode = 'list' | 'reattempt' | 'summary';
export type ReattemptResult = {
  id: string;
  correct: boolean;
  timeSeconds: number;
};

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function scoreBg(pct: number) {
  if (pct >= 0.75)
    return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
  if (pct >= 0.5)
    return 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400';
  return 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400';
}

export function criterionScoreClass(pct: number) {
  if (pct >= 1)
    return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
  if (pct >= 0.5)
    return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
  return 'bg-rose-100/70 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400';
}

export function getScoreInfo(
  entry: WrongEntry
): { scoreLabel: string; pct: number } | null {
  if (entry.kind !== 'written') return null;
  const pct =
    entry.markResponse.maxMarks > 0
      ? entry.markResponse.achievedMarks / entry.markResponse.maxMarks
      : 0;
  return {
    scoreLabel: `${entry.markResponse.achievedMarks}/${entry.markResponse.maxMarks}`,
    pct,
  };
}
