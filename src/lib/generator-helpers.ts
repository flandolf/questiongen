import type { Difficulty, GeneratedQuestion, McQuestion } from '@/types';

export function countWords(value: string): number {
  /**
   * Count words in a string using whitespace splitting.
   * @param value - Input text
   * @returns Number of words
   */
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function isMathTopic(topic?: string): boolean {
  /**
   * Return true when the topic is a math-related subject.
   */
  return topic === 'Mathematical Methods' || topic === 'Specialist Mathematics';
}

export function getDifficultyBadgeClasses(level: Difficulty): string {
  switch (level) {
    case 'Essential Skills':
      return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400';
    case 'Easy':
      return 'border-green-500/20 bg-green-500/5 text-green-600 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400';
    case 'Medium':
      return 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400';
    case 'Hard':
      return 'border-orange-500/20 bg-orange-500/5 text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400';
    case 'Extreme':
      return 'border-rose-500/20 bg-rose-500/5 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400';
    default:
      return '';
  }
}

export function removeKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  /**
   * Return a shallow copy of `record` with `key` removed.
   */
  const next = { ...record };
  delete next[key];
  return next;
}

export function generateEntryId(): string {
  /**
   * Generate a stable-ish unique id for entries using `crypto.randomUUID`
   * when available, otherwise falling back to timestamp + random suffix.
   */
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function rekeyWritten(qs: GeneratedQuestion[]): GeneratedQuestion[] {
  /**
   * Recompute deterministic ids for written questions based on their
   * content so duplicates can be detected and stable keys generated.
   */
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
  /**
   * Recompute deterministic ids for multiple-choice questions based on
   * prompt, options and explanation to produce stable ids.
   */
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
  /**
   * Lightweight string hash used for short stable seeds.
   * @returns Non-negative 32-bit integer
   */
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash | 0);
}
