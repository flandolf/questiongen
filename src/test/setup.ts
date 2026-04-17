import '@testing-library/jest-dom';

import { vi } from 'vitest';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  open: vi.fn(),
}));

// Mock Firebase mutations to avoid initializing Firebase in tests
vi.mock('@/context/modules/sync-v3/mutations', () => ({
  deleteMcHistoryEntry: vi.fn(),
  deleteQuestionHistoryEntry: vi.fn(),
  deleteSavedSet: vi.fn(),
  saveGenerationRecord: vi.fn(),
  saveMcHistoryEntry: vi.fn(),
  saveQuestionHistoryEntry: vi.fn(),
  saveSavedSet: vi.fn(),
  updateApiKey: vi.fn(),
  updatePresets: vi.fn(),
  updateStudyGoals: vi.fn(),
}));

// Mock persistence to avoid tauri/fs calls
vi.mock('@/lib/persistence', () => ({
  EMPTY_PERSISTED_APP_STATE: {
    settings: {
      apiKey: '',
      model: 'gpt-4o',
      markingModel: 'gpt-4o',
      debugMode: false,
      theme: 'system',
    },
    preferences: {
      selectedTopics: [],
      difficulty: 'Medium',
      techMode: 'tech-active',
      questionCount: 5,
      questionMode: 'written',
    },
    writtenSession: {
      questions: [],
      activeQuestionIndex: 0,
      presentedAtByQuestionId: {},
      answersByQuestionId: {},
      imagesByQuestionId: {},
      feedbackByQuestionId: {},
    },
    mcSession: {
      questions: [],
      activeQuestionIndex: 0,
      presentedAtByQuestionId: {},
      answersByQuestionId: {},
    },
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  },
  loadPersistedAppState: vi.fn().mockResolvedValue({}),
}));
