import { describe, expect, it } from 'vitest';

import { normalizeHexColor } from '../color-helpers';
import { generateM3Theme } from '../color-utils';
import { normalizePersistedAppState } from '../persistence';

describe('persistence normalization', () => {
  it('defaults an invalid question mode to written', () => {
    const normalized = normalizePersistedAppState({
      preferences: {
        questionMode: 'mcq',
      },
    });

    expect(normalized.preferences.questionMode).toBe('written');
  });

  it('fills blank settings with app defaults', () => {
    const normalized = normalizePersistedAppState({
      settings: {
        model: '',
        markingModel: '',
        imageMarkingModel: '',
        theme: '',
        globalRounding: '',
        interfaceFont: '',
        headingFont: '',
        tutorModel: '',
      },
    });

    expect(normalized.settings.model).toBe(
      'google/gemini-2.0-flash-lite-preview-02-05:free',
    );
    expect(normalized.settings.markingModel).toBe(
      'google/gemini-2.0-flash-lite-preview-02-05:free',
    );
    expect(normalized.settings.imageMarkingModel).toBe(
      'google/gemini-2.0-flash-lite-preview-02-05:free',
    );
    expect(normalized.settings.theme).toBe('claude');
    expect(normalized.settings.globalRounding).toBe('md');
    expect(normalized.settings.interfaceFont).toBe('Manrope Variable');
    expect(normalized.settings.headingFont).toBe('Manrope Variable');
    expect(normalized.settings.tutorModel).toBe(
      'google/gemini-2.0-flash-lite-preview-02-05:free',
    );
  });

  it('normalizes shorthand and invalid custom theme seed colors', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('not-a-color')).toBe('#3b82f6');
  });

  it('keeps theme generation safe for malformed seed colors', () => {
    const theme = generateM3Theme('not-a-color', false);

    expect(theme['--primary']).toMatch(/^#/);
  });
});
