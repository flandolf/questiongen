/**
 * Tests for Spaced Repetition (SM-2) implementation.
 * Verifies card creation, review updates, and due date logic.
 */
import { describe, expect, it } from 'vitest';

import { createCard, isDue, reviewCard } from '../spaced-repetition';

describe('spaced-repetition', () => {
  describe('createCard', () => {
    it('should create a fresh card with default values', () => {
      const card = createCard();
      expect(card.easinessFactor).toBe(2.5);
      expect(card.intervalDays).toBe(0);
      expect(card.repetitions).toBe(0);
      expect(card.totalReviews).toBe(0);
    });
  });

  describe('reviewCard', () => {
    it('should correctly update a card for a failed review (quality < 3)', () => {
      const initialCard = createCard();
      const updatedCard = reviewCard(initialCard, 2);

      expect(updatedCard.repetitions).toBe(0);
      expect(updatedCard.intervalDays).toBe(1);
      expect(updatedCard.totalReviews).toBe(1);
      expect(updatedCard.correctReviews).toBe(0);
    });

    it('should correctly update a card for a successful initial review (repetitions = 0)', () => {
      const initialCard = createCard();
      const updatedCard = reviewCard(initialCard, 4);

      expect(updatedCard.repetitions).toBe(1);
      expect(updatedCard.intervalDays).toBe(1);
      expect(updatedCard.totalReviews).toBe(1);
      expect(updatedCard.correctReviews).toBe(1);
    });

    it('should correctly update a card for a second successful review (repetitions = 1)', () => {
      const initialCard = createCard();
      const cardAfterFirst = reviewCard(initialCard, 4);
      const cardAfterSecond = reviewCard(cardAfterFirst, 4);

      expect(cardAfterSecond.repetitions).toBe(2);
      expect(cardAfterSecond.intervalDays).toBe(6);
    });

    it('should scale the interval based on the easiness factor for subsequent reviews', () => {
      const initialCard = createCard();
      const card1 = reviewCard(initialCard, 4); // rep 1, int 1
      const card2 = reviewCard(card1, 4); // rep 2, int 6
      const card3 = reviewCard(card2, 4); // rep 3, int 6 * EF

      expect(card3.repetitions).toBe(3);
      expect(card3.intervalDays).toBe(Math.round(6 * card3.easinessFactor));
    });

    it('should adjust the easiness factor based on the review quality', () => {
      const initialCard = createCard();
      const cardPerfect = reviewCard(initialCard, 5);
      const cardHard = reviewCard(initialCard, 3);

      expect(cardPerfect.easinessFactor).toBeGreaterThan(
        initialCard.easinessFactor,
      );
      expect(cardHard.easinessFactor).toBeLessThan(initialCard.easinessFactor);
    });
  });

  describe('isDue', () => {
    it('should return true if the next review date is in the past', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString();
      const card = createCard(pastDate);
      expect(isDue(card)).toBe(true);
    });

    it('should return false if the next review date is in the future', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
      const card = createCard(futureDate);
      expect(isDue(card)).toBe(false);
    });
  });
});
