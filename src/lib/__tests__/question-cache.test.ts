/**
 * Tests for Question Cache and Quality utilities.
 * Verifies LRU caching of generation results and identification/removal of duplicate questions.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { GeneratedQuestion, Topic } from '@/types';

import {
  applyBatchQualityChecks,
  deduplicateQuestions,
  generationCache,
  identifyDuplicateQuestions,
  validateQuestionVariance,
} from '../question-cache';

describe('question-cache', () => {
  afterEach(() => {
    generationCache.clear();
  });

  describe('GenerationResultCache', () => {
    it('should store and retrieve questions from the cache', () => {
      const topics: Topic[] = ['Mathematical Methods'];
      const difficulty = 'Medium';
      const mode = 'written';
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Solve x',
          maxMarks: 1,
        },
      ];

      generationCache.set(topics, difficulty, mode, questions);
      const cached = generationCache.get(topics, difficulty, mode);

      expect(cached).toEqual(questions);
    });

    it('should return null for non-existent cache entries', () => {
      const cached = generationCache.get(
        ['Biology'],
        'Hard',
        'multiple-choice',
      );
      expect(cached).toBeNull();
    });

    it('should handle topic sorting in cache keys', () => {
      const topics1: Topic[] = [
        'Specialist Mathematics',
        'Mathematical Methods',
      ];
      const topics2: Topic[] = [
        'Mathematical Methods',
        'Specialist Mathematics',
      ];
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q1',
          maxMarks: 1,
        },
      ];

      generationCache.set(topics1, 'Easy', 'written', questions);
      const cached = generationCache.get(topics2, 'Easy', 'written');

      expect(cached).toEqual(questions);
    });
  });

  describe('identifyDuplicateQuestions', () => {
    it('should identify exact duplicate question prompts within the same topic', () => {
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Solve x + 1 = 2',
          maxMarks: 1,
        },
        {
          id: 'q2',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Solve x + 1 = 2',
          maxMarks: 1,
        },
        {
          id: 'q3',
          topic: 'Biology',
          promptMarkdown: 'Solve x + 1 = 2',
          maxMarks: 1,
        },
      ];

      const results = identifyDuplicateQuestions(questions);

      expect(results[0].isDuplicate).toBe(true);
      expect(results[0].duplicateIndices).toContain(1);
      expect(results[1].isDuplicate).toBe(false);
      expect(results[2].isDuplicate).toBe(false); // Different topic
    });

    it('should ignore differences in whitespace and casing when detecting duplicates', () => {
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Solve x',
          maxMarks: 1,
        },
        {
          id: 'q2',
          topic: 'Mathematical Methods',
          promptMarkdown: '  SOLVE x  ',
          maxMarks: 1,
        },
      ];

      const results = identifyDuplicateQuestions(questions);
      expect(results[0].isDuplicate).toBe(true);
    });
  });

  describe('deduplicateQuestions', () => {
    it('should remove later occurrences of duplicate questions while keeping the first', () => {
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'A',
          maxMarks: 1,
        },
        {
          id: 'q2',
          topic: 'Mathematical Methods',
          promptMarkdown: 'A',
          maxMarks: 1,
        },
        {
          id: 'q3',
          topic: 'Mathematical Methods',
          promptMarkdown: 'B',
          maxMarks: 1,
        },
      ];

      const deduplicated = deduplicateQuestions(questions);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated[0].id).toBe('q1');
      expect(deduplicated[1].id).toBe('q3');
    });
  });

  describe('validateQuestionVariance', () => {
    it('should return false if too many questions are from a single topic', () => {
      const questions: GeneratedQuestion[] = Array<GeneratedQuestion>(20).fill({
        id: 'q',
        topic: 'Mathematical Methods',
        promptMarkdown: 'Q',
        maxMarks: 1,
      });
      expect(validateQuestionVariance(questions)).toBe(false);
    });

    it('should return true if questions are distributed across multiple topics', () => {
      const questions: GeneratedQuestion[] = [
        ...Array<GeneratedQuestion>(10).fill({
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'Q1',
          maxMarks: 1,
        }),
        ...Array<GeneratedQuestion>(10).fill({
          id: 'q2',
          topic: 'Biology',
          promptMarkdown: 'Q2',
          maxMarks: 1,
        }),
      ];
      expect(validateQuestionVariance(questions)).toBe(true);
    });
  });

  describe('applyBatchQualityChecks', () => {
    it('should return cleaned questions and report issues', () => {
      const questions: GeneratedQuestion[] = [
        {
          id: 'q1',
          topic: 'Mathematical Methods',
          promptMarkdown: 'A',
          maxMarks: 1,
        },
        {
          id: 'q2',
          topic: 'Mathematical Methods',
          promptMarkdown: 'A',
          maxMarks: 1,
        }, // Duplicate
        { id: 'q3', topic: '' as Topic, promptMarkdown: 'B', maxMarks: 1 }, // Invalid (no topic)
      ];

      const { cleanedQuestions, issuesFound } =
        applyBatchQualityChecks(questions);

      expect(cleanedQuestions).toHaveLength(1);
      expect(cleanedQuestions[0].id).toBe('q1');
      expect(issuesFound).toContain('Found 1 potential duplicate questions');
      expect(issuesFound).toContain('1 questions missing required fields');
    });
  });
});
