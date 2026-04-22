/**
 * Tests for Generator Helpers.
 * Verifies word counting, topic classification, and deterministic ID re-keying.
 */
import { describe, expect, it } from 'vitest';

import type { GeneratedQuestion, McQuestion } from '@/types';

import {
  countWords,
  getDifficultyBadgeClasses,
  hashStringForSeed,
  isMathTopic,
  rekeyMc,
  rekeyWritten,
  removeKey,
} from '../generator-helpers';

describe('generator-helpers', () => {
  describe('countWords', () => {
    it('should count words in a string', () => {
      expect(countWords('hello world')).toBe(2);
      expect(countWords('  hello   world  ')).toBe(2);
      expect(countWords('')).toBe(0);
    });
  });

  describe('isMathTopic', () => {
    it('should return true for math topics', () => {
      expect(isMathTopic('Mathematical Methods')).toBe(true);
      expect(isMathTopic('Specialist Mathematics')).toBe(true);
    });

    it('should return false for non-math topics', () => {
      expect(isMathTopic('Chemistry')).toBe(false);
      expect(isMathTopic('Biology')).toBe(false);
    });
  });

  describe('getDifficultyBadgeClasses', () => {
    it('should return specific classes for each difficulty level', () => {
      expect(getDifficultyBadgeClasses('Easy')).toContain('green');
      expect(getDifficultyBadgeClasses('Medium')).toContain('amber');
      expect(getDifficultyBadgeClasses('Extreme')).toContain('rose');
    });
  });

  describe('removeKey', () => {
    it('should return a new object with the specified key removed', () => {
      const obj = { a: 1, b: 2 };
      const result = removeKey(obj, 'a');
      expect(result).toEqual({ b: 2 });
      expect(obj).toEqual({ a: 1, b: 2 }); // Original unchanged
    });
  });

  describe('hashStringForSeed', () => {
    it('should produce a non-negative deterministic hash for a string', () => {
      const s = 'test-string';
      const hash1 = hashStringForSeed(s);
      const hash2 = hashStringForSeed(s);
      expect(hash1).toBeGreaterThanOrEqual(0);
      expect(hash1).toBe(hash2);
    });
  });

  describe('rekeyWritten', () => {
    it('should assign stable IDs based on question content', () => {
      const qs: GeneratedQuestion[] = [
        {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q1',
          maxMarks: 2,
        },
        {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q1',
          maxMarks: 2,
        }, // Same content
        {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q2',
          maxMarks: 2,
        },
      ];

      const rekeyed = rekeyWritten(qs);
      expect(rekeyed[0].id).toMatch(/^q-/);
      expect(rekeyed[1].id).toBe(`${rekeyed[0].id}-2`); // Suffix for same hash
      expect(rekeyed[2].id).not.toBe(rekeyed[0].id);
    });
  });

  describe('rekeyMc', () => {
    it('should assign stable IDs based on MCQ content', () => {
      const qs: McQuestion[] = [
        {
          id: '',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q1',
          options: [{ label: 'A', text: 'Opt' }],
          correctAnswer: 'A',
          explanationMarkdown: 'Exp',
        },
      ];

      const rekeyed = rekeyMc(qs);
      expect(rekeyed[0].id).toMatch(/^mc-/);
    });
  });
});
