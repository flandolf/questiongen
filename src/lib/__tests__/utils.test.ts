import { describe, expect, it } from 'vitest';

import { cn, getDayKey, getTodayKey, isDeepEqual } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names', () => {
      expect(cn('a', 'b')).toBe('a b');
      expect(cn('a', { b: true, c: false })).toBe('a b');
    });

    it('handles tailwind conflicts', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });
  });

  describe('isDeepEqual', () => {
    it('returns true for equal primitives', () => {
      expect(isDeepEqual(1, 1)).toBe(true);
      expect(isDeepEqual('a', 'a')).toBe(true);
      expect(isDeepEqual(true, true)).toBe(true);
      expect(isDeepEqual(null, null)).toBe(true);
    });

    it('returns false for unequal primitives', () => {
      expect(isDeepEqual(1, 2)).toBe(false);
      expect(isDeepEqual('a', 'b')).toBe(false);
      expect(isDeepEqual(true, false)).toBe(false);
      expect(isDeepEqual(null, undefined)).toBe(false);
    });

    it('returns true for equal objects', () => {
      expect(isDeepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    });

    it('returns false for unequal objects', () => {
      expect(isDeepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(isDeepEqual({ a: 1 }, { b: 1 })).toBe(false);
      expect(isDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('returns true for equal arrays', () => {
      expect(isDeepEqual([1, [2]], [1, [2]])).toBe(true);
    });

    it('returns false for unequal arrays', () => {
      expect(isDeepEqual([1], [2])).toBe(false);
      expect(isDeepEqual([1], [1, 2])).toBe(false);
    });
  });

  describe('date keys', () => {
    it('getTodayKey returns current date in YYYY-MM-DD', () => {
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(getTodayKey()).toBe(expected);
    });

    it('getDayKey returns formatted date for timestamp', () => {
      const date = new Date('2023-05-20T12:00:00');
      expect(getDayKey(date.getTime())).toBe('2023-05-20');
    });
  });
});