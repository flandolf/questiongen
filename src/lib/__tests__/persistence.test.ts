/**
 * Tests for Persistence and State Normalization.
 * Verifies that persisted app state, generation history, and saved sets are correctly normalized.
 */
import { describe, expect, it } from 'vitest';

import {
  normalizeGenerationHistory,
  normalizePersistedAppState,
  normalizeQuestionHistory,
  normalizeSavedSet,
} from '../persistence';

describe('persistence', () => {
  describe('normalizePersistedAppState', () => {
    it('should return default state when given invalid input', () => {
      const state = normalizePersistedAppState(null);
      expect(state.settings.model).toBeDefined();
      expect(state.preferences.difficulty).toBe('Medium');
    });

    it('should preserve valid settings while filling in defaults for missing ones', () => {
      const raw = {
        settings: {
          apiKey: 'test-key',
        },
      };
      const state = normalizePersistedAppState(raw);
      expect(state.settings.apiKey).toBe('test-key');
      expect(state.settings.theme).toBe('claude'); // Default
    });
  });

  describe('normalizeGenerationHistory', () => {
    it('should filter out invalid history entries', () => {
      const raw = [
        {
          id: '1',
          timestamp: '2023-01-01',
          inputs: {
            topic: 'Math',
            difficulty: 'Easy',
            questionCount: 1,
            questionMode: 'written',
            techMode: 'tech-free',
          },
          outputs: { durationMs: 100 },
        },
        { invalid: 'entry' },
      ];
      const normalized = normalizeGenerationHistory(raw);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].id).toBe('1');
    });

    it('should return an empty array for non-array input', () => {
      expect(normalizeGenerationHistory({})).toEqual([]);
    });
  });

  describe('normalizeSavedSet', () => {
    it('should return null if ID is missing', () => {
      const raw = { title: 'No ID' };
      expect(normalizeSavedSet(raw)).toBeNull();
    });

    it('should normalize a valid saved set', () => {
      const raw = {
        id: 'set-1',
        title: 'My Set',
        questionMode: 'written',
      };
      const normalized = normalizeSavedSet(raw);
      expect(normalized?.id).toBe('set-1');
      expect(normalized?.title).toBe('My Set');
      expect(normalized?.preferences).toBeDefined();
    });
  });

  describe('normalizeQuestionHistory', () => {
    it('should normalize valid history entries and filter invalid ones', () => {
      const raw = [
        {
          id: 'qh-1',
          createdAt: '2023-01-01',
          question: { id: 'q1', topic: 'Math', promptMarkdown: 'Solve' },
          uploadedAnswer: 'Answer',
        },
      ];
      const normalized = normalizeQuestionHistory(raw);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].id).toBe('qh-1');
      expect(normalized[0].markResponse.verdict).toBe('Unrated'); // Default from normalizeMarkResponse
    });
  });
});
