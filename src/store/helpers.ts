import { resolveDesignThemeName } from '@/themes/designThemes';
import type {
  GeneratedQuestion,
  MarkAnswerResponse,
  McQuestion,
  QuestionMode,
  Topic,
} from '@/types';

import type { Updater } from './types';

export function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  const leadTopic = topics[0] ?? 'Mixed Topics';
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === 'written' ? 'Written' : 'Multiple Choice';
  return extraCount === 0
    ? `${leadTopic} ${modeLabel}`
    : `${leadTopic} +${extraCount} ${modeLabel}`;
}

export function isWrittenSessionComplete(
  questions: GeneratedQuestion[],
  feedbackByQuestionId: Record<string, MarkAnswerResponse>,
) {
  return (
    questions.length > 0 &&
    questions.every((q) => Boolean(feedbackByQuestionId[q.id]))
  );
}

export function isMcSessionComplete(
  questions: McQuestion[],
  answersByQuestionId: Record<string, string>,
) {
  return (
    questions.length > 0 &&
    questions.every((q) => Boolean(answersByQuestionId[q.id]))
  );
}

export function normalizeThemeName(theme: unknown): string {
  if (typeof theme !== 'string') {
    return resolveDesignThemeName(null);
  }

  const normalized = theme.trim();
  return resolveDesignThemeName(normalized.length > 0 ? normalized : null);
}

export function resolve<T>(update: Updater<T>, previous: T): T {
  return typeof update === 'function'
    ? (update as (prev: T) => T)(previous)
    : update;
}
