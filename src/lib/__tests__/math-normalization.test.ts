import { describe, expect, it } from 'vitest';

import { shieldMathForMarkdown } from '@/lib/math-normalization';

describe('math-normalization', () => {
  describe('shieldMathForMarkdown', () => {
    it('shields inline math', () => {
      const input = 'Solve $x + 1 = 2$.';
      const result = shieldMathForMarkdown(input);
      expect(result.markdown).toMatch(/Solve `QGMATH_TOKEN_0`\./);
      expect(result.placeholders[0][1]).toBe('$x + 1 = 2$');
    });

    it('shields display math', () => {
      const input = 'Equation: $$x^2 = 4$$';
      const result = shieldMathForMarkdown(input);
      expect(result.markdown).toMatch(/Equation: `QGMATH_TOKEN_0`/);
      expect(result.placeholders[0][1]).toBe('$$x^2 = 4$$');
    });

    it('handles multiple math blocks', () => {
      const input = '$x$ and $y$';
      const result = shieldMathForMarkdown(input);
      expect(result.placeholders).toHaveLength(2);
      expect(result.placeholders[0][1]).toBe('$x$');
      expect(result.placeholders[1][1]).toBe('$y$');
    });

    it('ignores math inside code blocks', () => {
      const input = 'Check `const x = $100`';
      const result = shieldMathForMarkdown(input);
      expect(result.markdown).toBe(input);
      expect(result.placeholders).toHaveLength(0);
    });

    it('ignores math inside fenced code blocks', () => {
      const input = '```\n$x = 1$\n```';
      const result = shieldMathForMarkdown(input);
      expect(result.markdown).toBe(input);
      expect(result.placeholders).toHaveLength(0);
    });

    it('handles escaped dollars', () => {
      const input = 'Price is \\$100.';
      const result = shieldMathForMarkdown(input);
      expect(result.markdown).toBe('Price is \\$100.');
      expect(result.placeholders).toHaveLength(0);
    });
  });
});
