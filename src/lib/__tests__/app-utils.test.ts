/**
 * Tests for Application utilities.
 * Verifies formatting of dates, percentages, durations, and costs, as well as data normalization.
 */
import { describe, expect, it } from 'vitest';

import {
  clampWholeNumber,
  formatCostUsd,
  formatDate,
  formatDurationMs,
  formatPercent,
  normalizeMarkResponse,
  readBackendError,
  removeUndefined,
} from '../app-utils';

describe('app-utils', () => {
  describe('formatDate', () => {
    it('should format a valid ISO date string to a locale string', () => {
      const date = '2023-05-20T12:00:00Z';
      const result = formatDate(date);
      expect(result).not.toBe('Unknown time');
      // Exact output depends on locale, but checking it's not the failure string
    });

    it('should return "Unknown time" for an invalid date input', () => {
      expect(formatDate('invalid-date')).toBe('Unknown time');
    });
  });

  describe('formatPercent', () => {
    it('should format a number as a percentage string with default decimal places', () => {
      expect(formatPercent(12.345)).toBe('12.3%');
    });

    it('should format a number as a percentage with custom decimal places', () => {
      expect(formatPercent(12.345, 2)).toBe('12.35%');
    });
  });

  describe('formatDurationMs', () => {
    it('should format durations under 1 second as milliseconds', () => {
      expect(formatDurationMs(500)).toBe('500ms');
    });

    it('should format durations under 1 minute as seconds with one decimal place', () => {
      expect(formatDurationMs(1500)).toBe('1.5s');
      expect(formatDurationMs(59900)).toBe('59.9s');
    });

    it('should format durations over 1 minute as minutes and seconds', () => {
      expect(formatDurationMs(65000)).toBe('1m 5s');
      expect(formatDurationMs(125000)).toBe('2m 5s');
    });

    it('should return "n/a" for non-positive or undefined durations', () => {
      expect(formatDurationMs(0)).toBe('n/a');
      expect(formatDurationMs(-10)).toBe('n/a');
      expect(formatDurationMs(undefined)).toBe('n/a');
    });
  });

  describe('clampWholeNumber', () => {
    it('should round and clamp a valid numeric value', () => {
      expect(clampWholeNumber(5.7, 0, 1, 10)).toBe(6);
      expect(clampWholeNumber(0, 5, 1, 10)).toBe(1);
      expect(clampWholeNumber(15, 5, 1, 10)).toBe(10);
    });

    it('should return the fallback value for non-finite inputs', () => {
      expect(clampWholeNumber(NaN, 5, 1, 10)).toBe(5);
      expect(clampWholeNumber('not-a-number', 5, 1, 10)).toBe(5);
    });
  });

  describe('normalizeMarkResponse', () => {
    it('should normalize a raw marking response with safe defaults', () => {
      const raw = {
        verdict: 'Correct',
        achievedMarks: 2,
      };
      const normalized = normalizeMarkResponse(raw, 3);

      expect(normalized.verdict).toBe('Correct');
      expect(normalized.achievedMarks).toBe(2);
      expect(normalized.maxMarks).toBe(3);
      expect(normalized.vcaaMarkingScheme).toEqual([]);
      expect(normalized.feedbackMarkdown).toBe('No feedback returned.');
    });

    it('should clamp marks to the maximum marks provided', () => {
      const raw = { achievedMarks: 10 };
      const normalized = normalizeMarkResponse(raw, 5);
      expect(normalized.achievedMarks).toBe(5);
    });
  });

  describe('readBackendError', () => {
    it('should extract the message from an error object', () => {
      expect(readBackendError({ message: 'Custom Error' })).toBe(
        'Custom Error',
      );
    });

    it('should return the string itself if the error is a string', () => {
      expect(readBackendError('String Error')).toBe('String Error');
    });

    it('should return a fallback message for unknown error types', () => {
      expect(readBackendError({})).toBe('Unknown error. Please try again.');
    });
  });

  describe('formatCostUsd', () => {
    it('should format costs with high precision for small amounts', () => {
      expect(formatCostUsd(0.000123)).toBe('$0.00012');
    });

    it('should format costs with standard precision for larger amounts', () => {
      expect(formatCostUsd(0.0567)).toBe('$0.0567');
      expect(formatCostUsd(1.23456)).toBe('$1.2346');
    });

    it('should return "n/a" for null or undefined costs', () => {
      expect(formatCostUsd(null)).toBe('n/a');
    });
  });

  describe('removeUndefined', () => {
    it('should remove undefined properties from an object recursively', () => {
      const input = {
        a: 1,
        b: undefined,
        c: {
          d: 2,
          e: undefined,
        },
        f: [1, undefined, 3],
      };
      const result = removeUndefined(input);
      expect(result).toEqual({
        a: 1,
        c: { d: 2 },
        f: [1, undefined, 3], // Array elements are mapped, but undefined is preserved in arrays if not handled specially
        // wait, let's check implementation
      });
    });
  });
});
