/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Implements the SuperMemo SM-2 algorithm for scheduling review intervals.
 * Quality ratings: 0 = complete blackout, 1 = wrong, 2 = wrong but remembered,
 * 3 = correct with difficulty, 4 = correct, 5 = perfect recall.
 */

import type { ReviewQuality, SpacedRepetitionCard } from '../types';

const DEFAULT_EASINESS_FACTOR = 2.5;
const MIN_EASINESS_FACTOR = 1.3;

/**
 * Create a new spaced repetition card for a question.
 */
export function createCard(nextReviewDate?: string): SpacedRepetitionCard {
  /**
   * Create a fresh spaced-repetition card object with sensible defaults.
   * @param nextReviewDate - Optional ISO string for the initial next review
   */
  const now = new Date();
  return {
    easinessFactor: DEFAULT_EASINESS_FACTOR,
    intervalDays: 0,
    repetitions: 0,
    nextReviewDate: nextReviewDate ?? now.toISOString(),
    lastReviewDate: now.toISOString(),
    lastQuality: 0,
    totalReviews: 0,
    correctReviews: 0,
  };
}

/**
 * Process a review and return the updated card.
 *
 * SM-2 rules:
 * - Quality < 3: reset repetitions to 0, interval to 1 day
 * - Quality >= 3:
 *   - repetitions == 0 → interval = 1 day
 *   - repetitions == 1 → interval = 6 days
 *   - repetitions >= 2 → interval *= easinessFactor
 * - Update easinessFactor based on quality
 */
export function reviewCard(
  card: SpacedRepetitionCard,
  quality: ReviewQuality,
): SpacedRepetitionCard {
  /**
   * Apply SM-2 update rules to a card given a `quality` rating (0-5).
   * Returns an updated card with recalculated interval and easiness.
   */
  const now = new Date();
  const nowIso = now.toISOString();

  // Calculate new easiness factor
  const newEf = Math.max(
    MIN_EASINESS_FACTOR,
    card.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  let newRepetitions: number;
  let newIntervalDays: number;

  if (quality < 3) {
    // Failed review — reset
    newRepetitions = 0;
    newIntervalDays = 1;
  } else {
    // Successful review
    if (card.repetitions === 0) {
      newRepetitions = 1;
      newIntervalDays = 1;
    } else if (card.repetitions === 1) {
      newRepetitions = 2;
      newIntervalDays = 6;
    } else {
      newRepetitions = card.repetitions + 1;
      newIntervalDays = Math.round(card.intervalDays * newEf);
    }
  }

  // Cap interval at 365 days
  newIntervalDays = Math.min(newIntervalDays, 365);

  // Calculate next review date
  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + newIntervalDays);

  return {
    easinessFactor: newEf,
    intervalDays: newIntervalDays,
    repetitions: newRepetitions,
    nextReviewDate: nextReview.toISOString(),
    lastReviewDate: nowIso,
    lastQuality: quality,
    totalReviews: card.totalReviews + 1,
    correctReviews: card.correctReviews + (quality >= 3 ? 1 : 0),
  };
}

/**
 * Check if a card is due for review.
 */
export function isDue(card: SpacedRepetitionCard): boolean {
  /**
   * Return true when the card's nextReviewDate is now or in the past.
   */
  return new Date(card.nextReviewDate).getTime() <= Date.now();
}

/**
 * Get the number of days until the next review.
 * Returns 0 if already due, negative if overdue.
 */
export function daysUntilReview(card: SpacedRepetitionCard): number {
  /**
   * Number of whole days until the card's `nextReviewDate` (0 if due).
   */
  const diffMs = new Date(card.nextReviewDate).getTime() - Date.now();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
