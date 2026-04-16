import { describe, expect, it } from 'vitest';

import { scoreColorClass, scoreLabel } from '../score-utils';

describe('score-utils', () => {
  describe('scoreColorClass', () => {
    it('returns emerald for high scores', () => {
      expect(scoreColorClass(0.8)).toBe('text-emerald-500');
    });
    it('returns amber for medium scores', () => {
      expect(scoreColorClass(0.6)).toBe('text-amber-500');
    });
    it('returns rose for low scores', () => {
      expect(scoreColorClass(0.3)).toBe('text-rose-500');
    });
  });

  describe('scoreLabel', () => {
    it('returns Excellent for >= 0.9', () => {
      expect(scoreLabel(0.95)).toBe('Excellent');
    });
    it('returns Good for >= 0.75', () => {
      expect(scoreLabel(0.8)).toBe('Good');
    });
    it('returns Fair for >= 0.5', () => {
      expect(scoreLabel(0.6)).toBe('Fair');
    });
    it('returns Needs work for < 0.5', () => {
      expect(scoreLabel(0.4)).toBe('Needs work');
    });
  });
});