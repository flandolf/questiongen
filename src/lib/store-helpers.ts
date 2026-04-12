import type { QuestionMode, Topic } from '@/types';

export function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  /**
   * Build a human-friendly title for a saved question set based on the
   * primary topic and mode.
   * @param mode - `written` or `multiple-choice`
   * @param topics - Selected topics for the set
   * @returns A short descriptive title
   */
  const leadTopic = topics[0] ?? 'Mixed Topics';
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === 'written' ? 'Written' : 'Multiple Choice';
  return extraCount === 0
    ? `${leadTopic} ${modeLabel}`
    : `${leadTopic} +${extraCount} ${modeLabel}`;
}
