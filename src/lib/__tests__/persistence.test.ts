import { describe, expect, it } from 'vitest';

import { normalizeHexColor } from '@/lib/color-helpers';
import { generateM3Theme } from '@/lib/color-utils';
import {
  normalizePersistedAppState,
  normalizeSavedSet,
} from '@/lib/persistence';

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
        interfaceFont: '',
        headingFont: '',
        tutorModel: '',
      },
    });

    expect(normalized.settings.model).toBe('openai/gpt-5.4-mini');
    expect(normalized.settings.markingModel).toBe('openai/gpt-5.4-mini');
    expect(normalized.settings.imageMarkingModel).toBe('openai/gpt-5.4-mini');
    expect(normalized.settings.theme).toBe('claude');
    expect(normalized.settings.interfaceFont).toBe('Inter Variable');
    expect(normalized.settings.headingFont).toBe('Manrope Variable');
    expect(normalized.settings.tutorModel).toBe('openai/gpt-5.4-mini');
  });

  it('normalizes shorthand and invalid custom theme seed colors', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('not-a-color')).toBe('#3b82f6');
  });

  it('keeps theme generation safe for malformed seed colors', () => {
    const theme = generateM3Theme('not-a-color', false);

    expect(theme['--primary']).toMatch(/^#/);
  });

  it('normalizes Firestore Timestamp-like saved set dates', () => {
    const updatedAt = '2026-04-20T09:00:00.500Z';
    const set = normalizeSavedSet({
      id: 'saved-1',
      title: 'Test set',
      questionMode: 'written',
      preferences: {},
      createdAt: {
        toDate() {
          return new Date('2026-04-20T09:00:00.000Z');
        },
      },
      updatedAt: {
        seconds: Math.floor(Date.parse(updatedAt) / 1000),
        nanoseconds: 500_000_000,
      },
      writtenSession: {
        questions: [],
        activeQuestionIndex: 0,
        presentedAtByQuestionId: {},
        answersByQuestionId: {},
        imagesByQuestionId: {},
        feedbackByQuestionId: {},
        rawModelOutput: '',
      },
    });

    expect(set).not.toBeNull();
    expect(set?.createdAt).toBe('2026-04-20T09:00:00.000Z');
    expect(set?.updatedAt).toBe(updatedAt);
  });

  it('preserves custom subtopics during persistence normalization', () => {
    const normalized = normalizePersistedAppState({
      customSubtopicsSynced: true,
      customSubtopics: {
        Biology: [
          {
            id: 'bio-1',
            topic: 'Biology',
            name: 'Cell Signalling',
            group: 'unit3-cell-communication',
            technique_notes: {
              core_concepts: 'Signal transduction basics',
              anti_prompts: ['No rote recall'],
            },
            createdAt: 1713600000000,
            updatedAt: 1713603600000,
          },
        ],
      },
    });

    expect(normalized.customSubtopicsSynced).toBe(true);
    expect(normalized.customSubtopics?.Biology).toHaveLength(1);
    expect(normalized.customSubtopics?.Biology[0]).toMatchObject({
      id: 'bio-1',
      topic: 'Biology',
      name: 'Cell Signalling',
      group: 'unit3-cell-communication',
      createdAt: 1713600000000,
      updatedAt: 1713603600000,
    });
  });
});
