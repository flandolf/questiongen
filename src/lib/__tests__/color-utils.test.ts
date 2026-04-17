/**
 * Tests for Color and Theme utilities.
 * Verifies the generation of Material Design 3 theme variables from seed colors.
 */
import { describe, expect, it } from 'vitest';

import { generateM3Theme } from '../color-utils';

describe('color-utils', () => {
  describe('generateM3Theme', () => {
    it('should generate a full set of CSS variables from a hex color', () => {
      const theme = generateM3Theme('#3b82f6', false);

      expect(theme).toHaveProperty('--primary');
      expect(theme).toHaveProperty('--background');
      expect(theme).toHaveProperty('--foreground');
      expect(theme).toHaveProperty('--border');

      // Hex colors should start with #
      expect(theme['--primary']).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should generate different colors for light and dark modes', () => {
      const lightTheme = generateM3Theme('#3b82f6', false);
      const darkTheme = generateM3Theme('#3b82f6', true);

      expect(lightTheme['--background']).not.toBe(darkTheme['--background']);
      expect(lightTheme['--primary']).not.toBe(darkTheme['--primary']);
    });

    it('should generate different colors for different scheme variants', () => {
      const seed = '#3b82f6';
      const fidelityTheme = generateM3Theme(seed, false, 'fidelity');
      const monochromeTheme = generateM3Theme(seed, false, 'monochrome');

      expect(fidelityTheme['--primary']).not.toBe(monochromeTheme['--primary']);
    });

    it('should include shadow variables with correct opacity based on mode', () => {
      const lightTheme = generateM3Theme('#3b82f6', false);
      const darkTheme = generateM3Theme('#3b82f6', true);

      expect(lightTheme['--shadow-sm']).toContain('0.05');
      expect(darkTheme['--shadow-sm']).toContain('0.2');
    });
  });
});
