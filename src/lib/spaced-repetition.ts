/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Implements the SuperMemo SM-2 algorithm for scheduling review intervals.
 * Quality ratings: 0 = complete blackout, 1 = wrong, 2 = wrong but remembered,
 * 3 = correct with difficulty, 4 = correct, 5 = perfect recall.
 */

import type { SpacedRepetitionCard, ReviewQuality } from "../types";

const DEFAULT_EASINESS_FACTOR = 2.5;
const MIN_EASINESS_FACTOR = 1.3;

/**
 * Create a new spaced repetition card for a question.
 */
export function createCard(nextReviewDate?: string): SpacedRepetitionCard {
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
export function reviewCard(card: SpacedRepetitionCard, quality: ReviewQuality): SpacedRepetitionCard {
  const now = new Date();
  const nowIso = now.toISOString();

  // Calculate new easiness factor
  const newEf = Math.max(
    MIN_EASINESS_FACTOR,
    card.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
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
  return new Date(card.nextReviewDate).getTime() <= Date.now();
}

/**
 * Get the number of days until the next review.
 * Returns 0 if already due, negative if overdue.
 */
export function daysUntilReview(card: SpacedRepetitionCard): number {
  const diffMs = new Date(card.nextReviewDate).getTime() - Date.now();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Map a binary correct/incorrect to an SM-2 quality rating.
 * For MC questions where we only know right/wrong:
 * - correct = 4 (correct)
 * - incorrect = 1 (wrong but could guess again)
 */
export function binaryToQuality(correct: boolean): ReviewQuality {
  return correct ? 4 : 1;
}

/**
 * Map a percentage score (0-1) to an SM-2 quality rating.
 * For written questions with partial marks.
 */
export function scoreToQuality(scorePercent: number): ReviewQuality {
  if (scorePercent >= 0.95) return 5;
  if (scorePercent >= 0.75) return 4;
  if (scorePercent >= 0.5) return 3;
  if (scorePercent >= 0.25) return 2;
  if (scorePercent > 0) return 1;
  return 0;
}

/**
 * Get a human-readable label for the review quality.
 */
export function qualityLabel(q: ReviewQuality): string {
  switch (q) {
    case 0: return "Complete blackout";
    case 1: return "Incorrect";
    case 2: return "Incorrect, but remembered on seeing answer";
    case 3: return "Correct with difficulty";
    case 4: return "Correct";
    case 5: return "Perfect";
  }
}

/**
 * Get urgency level for display.
 */
export function urgencyLevel(card: SpacedRepetitionCard): "overdue" | "due-today" | "upcoming" {
  const days = daysUntilReview(card);
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  return "upcoming";
}
