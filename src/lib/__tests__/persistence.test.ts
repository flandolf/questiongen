import { describe, expect, it } from 'vitest';

import { normalizeHexColor } from '@/lib/color-helpers';
import { generateM3Theme } from '@/lib/color-utils';
import {
  normalizePersistedAppState,
  normalizeSavedSet,
} from '@/lib/persistence';
import { PERSISTED_APP_STATE_VERSION } from '@/types';

describe('persistence normalization', () => {
  it('defaults an invalid question mode to written', () => {
    const normalized = normalizePersistedAppState({
      preferences: {
        questionMode: 'mcq',
      },
    });

    expect(normalized.preferences.questionMode).toBe('written');
  });

  it('keeps models blank until ChatGPT model discovery', () => {
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

    expect(normalized.settings.model).toBe('');
    expect(normalized.settings.markingModel).toBe('');
    expect(normalized.settings.imageMarkingModel).toBe('');
    expect(normalized.settings.theme).toBe('default');
    expect(normalized.settings.interfaceFont).toBe('Inter Variable');
    expect(normalized.settings.headingFont).toBe('Manrope Variable');
    expect(normalized.settings.tutorModel).toBe('');
  });

  it('normalizes shorthand and invalid custom theme seed colors', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('not-a-color')).toBe('#3b82f6');
  });

  it('keeps theme generation safe for malformed seed colors', () => {
    const theme = generateM3Theme('not-a-color', false);

    expect(theme['--primary']).toMatch(/^#/);
  });

  it('normalizes timestamp-like saved set dates', () => {
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

  it('preserves cloud image fields while upgrading persisted state', () => {
    const normalized = normalizePersistedAppState({
      version: 2,
      writtenSession: {
        imagesByQuestionId: {
          q1: {
            id: 'img-1',
            dataUrl: 'data:image/png;base64,abc',
            storagePath: 'users/uid/questions/q1/img-1',
            downloadUrl: 'https://firebasestorage.googleapis.com/...',
            timestamp: '2026-01-01T00:00:00Z',
          },
        },
      },
      questionHistory: [
        {
          id: 'hist-1',
          question: { id: 'q1', promptMarkdown: 'Test', maxMarks: 1 },
          createdAt: '2026-01-01T00:00:00Z',
          uploadedAnswerImage: {
            id: 'img-2',
            dataUrl: 'data:image/png;base64,def',
            storagePath: 'users/uid/images/img-2',
            downloadUrl: 'https://firebasestorage.googleapis.com/...',
            timestamp: '2026-01-01T00:00:00Z',
          },
        },
      ],
      savedSets: [
        {
          id: 'set-1',
          title: 'Test set',
          questionMode: 'written',
          preferences: {},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          writtenSession: {
            imagesByQuestionId: {
              q2: {
                id: 'img-3',
                dataUrl: 'data:image/png;base64,ghi',
                storagePath: 'users/uid/questions/q2/img-3',
                downloadUrl: 'https://firebasestorage.googleapis.com/...',
                timestamp: '2026-01-01T00:00:00Z',
              },
            },
          },
        },
      ],
    });

    expect(normalized.version).toBe(PERSISTED_APP_STATE_VERSION);

    const writtenImg = normalized.writtenSession.imagesByQuestionId.q1;
    expect(writtenImg).toBeDefined();
    expect(writtenImg?.storagePath).toBe('users/uid/questions/q1/img-1');
    expect(writtenImg?.downloadUrl).toBe(
      'https://firebasestorage.googleapis.com/...',
    );
    expect(writtenImg?.dataUrl).toBe('data:image/png;base64,abc');

    const historyImg = normalized.questionHistory[0]?.uploadedAnswerImage;
    expect(historyImg).toBeDefined();
    expect(historyImg?.storagePath).toBe('users/uid/images/img-2');
    expect(historyImg?.downloadUrl).toBe(
      'https://firebasestorage.googleapis.com/...',
    );
    expect(historyImg?.dataUrl).toBe('data:image/png;base64,def');

    const savedSetImg = normalized.savedSets[0]?.writtenSession?.imagesByQuestionId.q2;
    expect(savedSetImg).toBeDefined();
    expect(savedSetImg?.storagePath).toBe('users/uid/questions/q2/img-3');
    expect(savedSetImg?.downloadUrl).toBe(
      'https://firebasestorage.googleapis.com/...',
    );
    expect(savedSetImg?.dataUrl).toBe('data:image/png;base64,ghi');
  });

  it('preserves cloud image fields when version is already current', () => {
    const normalized = normalizePersistedAppState({
      version: PERSISTED_APP_STATE_VERSION,
      writtenSession: {
        imagesByQuestionId: {
          q1: {
            id: 'img-1',
            dataUrl: 'data:image/png;base64,abc',
            storagePath: 'users/uid/questions/q1/img-1',
            downloadUrl: 'https://firebasestorage.googleapis.com/...',
            timestamp: '2026-01-01T00:00:00Z',
          },
        },
      },
    });

    const img = normalized.writtenSession.imagesByQuestionId.q1;
    expect(img?.storagePath).toBe('users/uid/questions/q1/img-1');
    expect(img?.downloadUrl).toBe(
      'https://firebasestorage.googleapis.com/...',
    );
  });
});
