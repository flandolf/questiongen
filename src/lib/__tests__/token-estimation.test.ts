/**
 * Tests for Token Estimation utilities.
 * Verifies persistence of regression coefficients and accuracy of token/cost estimates.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  estimateTokensAndCost,
  loadLogRegressionCoefficients,
  persistLogRegressionCoefficients,
} from '../token-estimation';

// Mock localStorage before importing the module under test
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key in store) delete store[key];
  }),
  length: 0,
  key: vi.fn((_index: number) => null),
};
vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('window', { localStorage: mockLocalStorage });

describe('token-estimation', () => {
  describe('persistence', () => {
    it('should save and load regression coefficients from localStorage', () => {
      const mockCoeffs = {
        bias: 10,
        logQuestionCount: 0.8,
        questionCount: 20,
        logTotalMarks: 0.4,
        totalMarks: 0.1,
        topicCoefficients: { Chemistry: 0.5 },
        difficultyCoefficients: { Hard: 0.2 },
        questionModeCoefficients: { written: 0.3 },
        techModeCoefficients: { 'tech-active': 0.1 },
        subtopicsCoefficient: 0.05,
        hasCustomFocusCoefficient: 0.1,
        multiPassCoefficient: 0.4,
        modelVersion: 'test-v1',
        trainedAt: Date.now(),
        sampleSize: 10,
        rSquared: 0.9,
      };

      persistLogRegressionCoefficients(mockCoeffs);
      const loaded = loadLogRegressionCoefficients();

      expect(loaded.bias).toBe(10);
      expect(loaded.modelVersion).toBe('test-v1');
    });
  });

  describe('estimateTokensAndCost', () => {
    it('should provide a baseline estimate with no history', () => {
      const estimate = estimateTokensAndCost(
        [],
        'Mathematical Methods',
        'Medium',
        5,
        'written',
        'tech-active',
      );

      expect(estimate.totalTokens).toBeGreaterThan(0);
      expect(estimate.totalPromptTokens).toBeGreaterThan(0);
      expect(estimate.totalCompletionTokens).toBeGreaterThan(0);
      expect(estimate.totalCost).toBe(0); // Cost is 0 since prices aren't provided
    });

    it('should scale estimates when question count increases', () => {
      const smallEstimate = estimateTokensAndCost(
        [],
        'Chemistry',
        'Medium',
        1,
        'multiple-choice',
        'tech-free',
      );

      const largeEstimate = estimateTokensAndCost(
        [],
        'Chemistry',
        'Medium',
        10,
        'multiple-choice',
        'tech-free',
      );

      expect(largeEstimate.totalTokens).toBeGreaterThan(
        smallEstimate.totalTokens,
      );
    });

    it('should correctly calculate costs when prices are provided', () => {
      const promptPrice = 0.00001;
      const completionPrice = 0.00003;

      const estimate = estimateTokensAndCost(
        [],
        'Specialist Mathematics',
        'Hard',
        3,
        'written',
        'tech-active',
        undefined,
        undefined,
        undefined,
        promptPrice,
        completionPrice,
      );

      const expectedPromptCost = estimate.totalPromptTokens * promptPrice;
      const expectedCompletionCost =
        estimate.totalCompletionTokens * completionPrice;

      expect(estimate.promptCost).toBeCloseTo(expectedPromptCost);
      expect(estimate.completionCost).toBeCloseTo(expectedCompletionCost);
      expect(estimate.totalCost).toBeCloseTo(
        expectedPromptCost + expectedCompletionCost,
      );
    });
  });
});
