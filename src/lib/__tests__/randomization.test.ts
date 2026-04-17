/**
 * Tests for Randomization utilities.
 * Verifies seeded random generation, deterministic shuffling, and sampling.
 */
import { describe, expect, it } from 'vitest';

import {
  createSeededRandom,
  generateSeedFromTopics,
  sampleWithSeed,
  shuffleWithSeed,
  validateMcqQuality,
} from '../randomization';

describe('randomization', () => {
  describe('createSeededRandom', () => {
    it('should produce the same sequence of numbers for the same seed', () => {
      const seed = 12345;
      const rng1 = createSeededRandom(seed);
      const rng2 = createSeededRandom(seed);

      expect(rng1.next()).toBe(rng2.next());
      expect(rng1.nextInt(100)).toBe(rng2.nextInt(100));
      expect(rng1.next()).toBe(rng2.next());
    });

    it('should produce different sequences for different seeds', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(54321);

      expect(rng1.next()).not.toBe(rng2.next());
    });
  });

  describe('generateSeedFromTopics', () => {
    it('should generate the same numeric seed for identical topic lists', () => {
      const topics1 = ['Math', 'Physics'];
      const topics2 = ['Math', 'Physics'];
      expect(generateSeedFromTopics(topics1)).toBe(
        generateSeedFromTopics(topics2),
      );
    });

    it('should generate different seeds for different topic lists', () => {
      const topics1 = ['Math', 'Physics'];
      const topics2 = ['Math', 'Chemistry'];
      expect(generateSeedFromTopics(topics1)).not.toBe(
        generateSeedFromTopics(topics2),
      );
    });
  });

  describe('shuffleWithSeed', () => {
    it('should deterministically shuffle an array given a seed', () => {
      const arr = [1, 2, 3, 4, 5];
      const seed = 42;
      const shuffled1 = shuffleWithSeed(arr, seed);
      const shuffled2 = shuffleWithSeed(arr, seed);

      expect(shuffled1).toEqual(shuffled2);
      expect(shuffled1).not.toEqual(arr); // Most likely different
      expect(shuffled1).toHaveLength(arr.length);
      expect(new Set(shuffled1)).toEqual(new Set(arr));
    });
  });

  describe('sampleWithSeed', () => {
    it('should deterministically sample k items from an array', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const seed = 7;
      const sampled1 = sampleWithSeed(arr, 3, seed);
      const sampled2 = sampleWithSeed(arr, 3, seed);

      expect(sampled1).toEqual(sampled2);
      expect(sampled1).toHaveLength(3);
      expect(arr).toEqual(expect.arrayContaining(sampled1));
    });
  });

  describe('validateMcqQuality', () => {
    it('should return isValid true for a high-quality MCQ', () => {
      const mcq = {
        options: [
          { label: 'A', text: 'Opt A' },
          { label: 'B', text: 'Opt B' },
          { label: 'C', text: 'Opt C' },
          { label: 'D', text: 'Opt D' },
        ],
        correctAnswer: 'A',
      };
      const result = validateMcqQuality(mcq);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should report issues for an MCQ with fewer than 4 options', () => {
      const mcq = {
        options: [{ label: 'A', text: 'Opt A' }],
        correctAnswer: 'A',
      };
      const result = validateMcqQuality(mcq);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('MCQ has fewer than 4 options');
    });

    it('should report an issue for missing correct answer', () => {
      const mcq = {
        options: [
          { label: 'A', text: 'Opt A' },
          { label: 'B', text: 'Opt B' },
          { label: 'C', text: 'Opt C' },
          { label: 'D', text: 'Opt D' },
        ],
      };
      const result = validateMcqQuality(mcq);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('MCQ has no correct answer specified');
    });

    it('should report an issue for duplicate option texts', () => {
      const mcq = {
        options: [
          { label: 'A', text: 'Duplicate' },
          { label: 'B', text: 'Duplicate' },
          { label: 'C', text: 'Opt C' },
          { label: 'D', text: 'Opt D' },
        ],
        correctAnswer: 'C',
      };
      const result = validateMcqQuality(mcq);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('MCQ has duplicate options');
    });
  });
});
