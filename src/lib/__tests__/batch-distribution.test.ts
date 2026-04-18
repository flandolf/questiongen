/**
 * Tests for Batch Distribution and Difficulty Estimation.
 * Verifies optimal topic/subtopic distribution and difficulty scaling based on performance.
 */
import { describe, expect, it } from 'vitest';

import type { Topic } from '@/types';

import {
  calculateOptimalBatchDistribution,
  calculateSubtopicDistribution,
  estimateNextDifficulty,
  recommendedQuestionCount,
  validateBatchDistribution,
} from '../batch-distribution';

describe('batch-distribution', () => {
  describe('calculateOptimalBatchDistribution', () => {
    it('should distribute questions evenly when total is less than minimum per topic', () => {
      const config = {
        topics: ['Mathematical Methods', 'Biology', 'Chemistry'] as Topic[],
        totalQuestions: 2,
        minPerTopic: 1,
      };
      const result = calculateOptimalBatchDistribution(config);
      expect(result.get('Mathematical Methods')).toBe(1);
      expect(result.get('Biology')).toBe(1);
      expect(result.get('Chemistry')).toBe(0);
    });

    it('should respect minimum per topic and distribute remaining proportionally', () => {
      const config = {
        topics: ['Mathematical Methods', 'Biology'] as Topic[],
        totalQuestions: 5,
        minPerTopic: 1,
      };
      const result = calculateOptimalBatchDistribution(config);
      expect(result.get('Mathematical Methods')).toBe(3);
      expect(result.get('Biology')).toBe(2);
    });
  });

  describe('calculateSubtopicDistribution', () => {
    it('should distribute questions across subtopics', () => {
      const subtopics = ['Sub1', 'Sub2'];
      const result = calculateSubtopicDistribution(subtopics, 3);
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.subtopic === 'Sub1')?.count).toBe(2);
      expect(result.find((r) => r.subtopic === 'Sub2')?.count).toBe(1);
    });
  });

  describe('validateBatchDistribution', () => {
    it('should report missing topics', () => {
      const topicCounts = new Map<Topic, number>([['Mathematical Methods', 5]]);
      const expectedTopics = ['Mathematical Methods', 'Biology'] as Topic[];
      const result = validateBatchDistribution(topicCounts, expectedTopics);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Missing topic: Biology');
    });

    it('should report over-concentration in a single topic', () => {
      const topicCounts = new Map<Topic, number>([
        ['Mathematical Methods', 80],
        ['Biology', 20],
      ]);
      const expectedTopics = ['Mathematical Methods', 'Biology'] as Topic[];
      const result = validateBatchDistribution(topicCounts, expectedTopics);
      expect(result.isValid).toBe(false);
      expect(result.issues[0]).toContain(
        'Over-represented topic "Mathematical Methods"',
      );
    });
  });

  describe('estimateNextDifficulty', () => {
    it('should decrease difficulty if average score is low', () => {
      expect(estimateNextDifficulty('Medium', 50)).toBe('Easy');
      expect(estimateNextDifficulty('Easy', 40)).toBe('Essential Skills');
    });

    it('should increase difficulty if average score is consistently high', () => {
      expect(estimateNextDifficulty('Medium', 90, [85, 95])).toBe('Hard');
    });

    it('should maintain current difficulty if score is in range', () => {
      expect(estimateNextDifficulty('Medium', 75)).toBe('Medium');
    });
  });

  describe('recommendedQuestionCount', () => {
    it('should recommend a reasonable question count based on time', () => {
      // 30 mins, 4 marks per question, 1.5 mins per mark = 6 mins per question
      // 30 / 6 = 5 questions
      expect(recommendedQuestionCount(30, 4, 1.5)).toBe(5);
    });

    it('should clamp the result between 1 and 20', () => {
      expect(recommendedQuestionCount(5, 10, 1.5)).toBe(1);
      expect(recommendedQuestionCount(1000, 1, 1)).toBe(20);
    });
  });
});
