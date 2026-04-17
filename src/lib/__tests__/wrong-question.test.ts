/**
 * Tests for Wrong Question utilities.
 * Verifies scoring badges, background color mapping, and score info extraction for reattempts.
 */
import { describe, expect, it } from 'vitest';

import {
  criterionScoreClass,
  getScoreInfo,
  scoreBg,
  type WrongEntry,
} from '../wrong-question';

describe('wrong-question', () => {
  describe('scoreBg', () => {
    it('should return emerald background for high scores (>= 0.75)', () => {
      const result = scoreBg(0.8);
      expect(result).toContain('bg-emerald-500');
    });

    it('should return amber background for medium scores (>= 0.5 and < 0.75)', () => {
      const result = scoreBg(0.6);
      expect(result).toContain('bg-amber-500');
    });

    it('should return rose background for low scores (< 0.5)', () => {
      const result = scoreBg(0.3);
      expect(result).toContain('bg-rose-500');
    });
  });

  describe('criterionScoreClass', () => {
    it('should return emerald class for perfect score (>= 1)', () => {
      const result = criterionScoreClass(1);
      expect(result).toContain('bg-emerald-100');
    });

    it('should return amber class for partial score (>= 0.5 and < 1)', () => {
      const result = criterionScoreClass(0.5);
      expect(result).toContain('bg-amber-100');
    });

    it('should return rose class for low score (< 0.5)', () => {
      const result = criterionScoreClass(0.2);
      expect(result).toContain('bg-rose-100');
    });
  });

  describe('getScoreInfo', () => {
    it('should return score info for a written entry', () => {
      const entry: WrongEntry = {
        kind: 'written',
        id: '1',
        createdAt: '',
        question: {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: '',
          maxMarks: 4,
        },
        markResponse: {
          achievedMarks: 2,
          maxMarks: 4,
          verdict: 'partial',
          feedbackMarkdown: '',
          vcaaMarkingScheme: [],
          scoreOutOf10: 5,
          comparisonToSolutionMarkdown: '',
          workedSolutionMarkdown: '',
        },
        isUploaded: true,
        uploadedAnswer: '',
        workedSolutionMarkdown: '',
      };

      const info = getScoreInfo(entry);
      expect(info?.pct).toBe(0.5);
      expect(info?.scoreLabel).toBe('2/4');
    });

    it('should return null for a multiple-choice entry', () => {
      const entry = {
        kind: 'mc',
        id: '1',
      } as unknown as WrongEntry;

      const info = getScoreInfo(entry);
      expect(info).toBeNull();
    });

    it('should handle zero maxMarks gracefully', () => {
      const entry: WrongEntry = {
        kind: 'written',
        id: '1',
        createdAt: '',
        question: {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: '',
          maxMarks: 0,
        },
        markResponse: {
          achievedMarks: 0,
          maxMarks: 0,
          verdict: 'correct',
          feedbackMarkdown: '',
          vcaaMarkingScheme: [],
          scoreOutOf10: 10,
          comparisonToSolutionMarkdown: '',
          workedSolutionMarkdown: '',
        },
        isUploaded: true,
        uploadedAnswer: '',
        workedSolutionMarkdown: '',
      };

      const info = getScoreInfo(entry);
      expect(info?.pct).toBe(0);
    });
  });
});
