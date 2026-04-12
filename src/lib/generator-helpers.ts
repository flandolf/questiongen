import type { Difficulty, GeneratedQuestion, McQuestion } from '@/types';

export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function isMathTopic(topic?: string): boolean {
  return topic === 'Mathematical Methods' || topic === 'Specialist Mathematics';
}

export function getDifficultyBadgeClasses(level: Difficulty): string {
  switch (level) {
    case 'Essential Skills':
      return 'border-green-300 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200';
    case 'Easy':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'Medium':
      return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200';
    case 'Hard':
      return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200';
    case 'Extreme':
      return 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200';
    default:
      return '';
  }
}

export function removeKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function generateEntryId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function rekeyWritten(qs: GeneratedQuestion[]): GeneratedQuestion[] {
  const seen = new Map<string, number>();
  return qs.map((q) => {
    const signature = [
      q.topic,
      q.subtopic ?? '',
      q.promptMarkdown,
      String(q.maxMarks ?? ''),
    ].join('|');
    const hash = hashStringForSeed(signature).toString(36);
    const count = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, count);
    const id = count === 1 ? `q-${hash}` : `q-${hash}-${count}`;
    return { ...q, id };
  });
}

export function rekeyMc(qs: McQuestion[]): McQuestion[] {
  const seen = new Map<string, number>();
  return qs.map((q) => {
    const options = q.options
      ? q.options.map((o) => `${o.label}:${o.text}`).join('|')
      : '';
    const signature = [
      q.topic,
      q.subtopic ?? '',
      q.promptMarkdown,
      options,
      q.correctAnswer,
      q.explanationMarkdown,
    ].join('|');
    const hash = hashStringForSeed(signature).toString(36);
    const count = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, count);
    const id = count === 1 ? `mc-${hash}` : `mc-${hash}-${count}`;
    return { ...q, id };
  });
}

export function hashStringForSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash | 0);
}
