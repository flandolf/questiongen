import { invoke } from '@tauri-apps/api/core';

import { cleanupOldSketchpadData } from '../components/sketchpadUtils';
import type {
  Difficulty,
  GenerationRecord,
  McHistoryEntry,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedSettings,
  PersistedWrittenSession,
  Preset,
  QuestionHistoryEntry,
  QuestionMode,
  SavedQuestionSet,
  StreakData,
  StudyGoals,
  TimeAllocationConfig,
} from '../types';
import { APP_STATE_STORAGE_KEY, PERSISTED_APP_STATE_VERSION } from '../types';
import type { TimerState } from '../types/timer';
import {
  DEFAULT_CUSTOM_THEME_SEED_COLOR,
  normalizeHexColor,
} from './color-helpers';

const DEFAULT_SETTINGS: PersistedSettings = {
  apiKey: '',
  model: 'openai/gpt-5.4-mini',
  markingModel: 'openai/gpt-5.4-mini',
  useSeparateMarkingModel: false,
  imageMarkingModel: 'openai/gpt-5.4-mini',
  useSeparateImageMarkingModel: false,
  debugMode: false,
  questionTextSize: 16,
  responseTextSize: 16,
  includeExamContext: true,
  autoSyncIntervalMinutes: 0,
  syncApiKey: false,
  localBackupFolderPath: '',
  localBackupIntervalMinutes: 0,
  theme: 'claude',
  customThemeSeedColor: DEFAULT_CUSTOM_THEME_SEED_COLOR,
  globalRounding: 'md',
  interfaceFont: 'Inter Variable',
  headingFont: 'Manrope Variable',
  tutorPersona: '',
  tutorModel: 'openai/gpt-5.4-mini',
  shuffleSubtopics: false,
  shuffleQuestions: false,
};

const DEFAULT_PREFERENCES: PersistedGeneratorPreferences = {
  selectedTopics: [],
  difficulty: 'Medium',
  techMode: 'tech-active',
  avoidSimilarQuestions: false,
  selectedSubtopics: {},
  questionCount: 1,
  averageMarksPerQuestion: 3,
  questionMode: 'written',
  aiDifficultyScalingEnabled: true,
  difficultyThresholds: { increase: 85, decrease: 70 },
  diversityStrictness: 'moderate',
  strictLatexValidation: true,
  generationStrategy: 'multi-pass',
};

const VALID_QUESTION_MODES = new Set<QuestionMode>([
  'written',
  'multiple-choice',
]);

const VALID_DIFFICULTIES = new Set<Difficulty>([
  'Essential Skills',
  'Easy',
  'Medium',
  'Hard',
  'Extreme',
]);

const DEFAULT_WRITTEN_SESSION: PersistedWrittenSession = {
  questions: [],
  activeQuestionIndex: 0,
  presentedAtByQuestionId: {},
  answersByQuestionId: {},
  imagesByQuestionId: {},
  feedbackByQuestionId: {},
  rawModelOutput: '',
  generationTelemetry: null,
  savedSetId: null,
};

const DEFAULT_MC_SESSION: PersistedMcSession = {
  questions: [],
  activeQuestionIndex: 0,
  presentedAtByQuestionId: {},
  answersByQuestionId: {},
  rawModelOutput: '',
  generationTelemetry: null,
  savedSetId: null,
};

const DEFAULT_STUDY_GOALS: StudyGoals = {
  dailyQuestionGoal: 10,
  dailyWrittenGoal: 5,
  dailyMcGoal: 5,
  weeklyStreakGoal: 5,
};

const DEFAULT_STREAK_DATA: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  dailyCompletions: {},
};

const DEFAULT_TIME_ALLOCATIONS: TimeAllocationConfig = [
  { difficulty: 'Essential Skills', minutesPerMark: 0.8 },
  { difficulty: 'Easy', minutesPerMark: 1 },
  { difficulty: 'Medium', minutesPerMark: 1.25 },
  { difficulty: 'Hard', minutesPerMark: 1.75 },
  { difficulty: 'Extreme', minutesPerMark: 2 },
];

export const EMPTY_PERSISTED_APP_STATE: PersistedAppState = {
  version: PERSISTED_APP_STATE_VERSION,
  settings: DEFAULT_SETTINGS,
  preferences: DEFAULT_PREFERENCES,
  writtenSession: DEFAULT_WRITTEN_SESSION,
  mcSession: DEFAULT_MC_SESSION,
  questionHistory: [],
  mcHistory: [],
  savedSets: [],
  studyGoals: DEFAULT_STUDY_GOALS,
  streakData: DEFAULT_STREAK_DATA,
  generationHistory: [],
  presets: [],
  timeAllocations: DEFAULT_TIME_ALLOCATIONS,
};

export async function loadPersistedAppState(): Promise<PersistedAppState> {
  cleanupOldSketchpadData();

  if (isTauriRuntime()) {
    try {
      const persisted = await invoke<unknown>('load_persisted_state');
      let decoded: unknown = persisted;
      if (typeof persisted === 'string') {
        const parsed: unknown = JSON.parse(persisted);
        decoded = parsed;
      }
      return normalizePersistedAppState(decoded);
    } catch (err) {
      console.error('Failed to load state from Tauri:', err);
      return EMPTY_PERSISTED_APP_STATE;
    }
  }

  const serialized = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
  if (!serialized) return EMPTY_PERSISTED_APP_STATE;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return normalizePersistedAppState(parsed);
  } catch {
    return EMPTY_PERSISTED_APP_STATE;
  }
}

export async function savePersistedAppState(
  state: PersistedAppState,
): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await invoke('save_persisted_state', { state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/expected a string/i.test(message)) {
        await invoke('save_persisted_state', { state: JSON.stringify(state) });
      } else {
        throw err;
      }
    }
    return;
  }

  try {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save persisted state to localStorage:', err);
  }
}

export function normalizePersistedAppState(raw: unknown): PersistedAppState {
  const data = isRecord(raw) ? raw : {};
  return {
    version: PERSISTED_APP_STATE_VERSION,
    settings: normalizeSettings(data.settings),
    preferences: normalizePreferences(data.preferences),
    writtenSession: normalizeWrittenSession(data.writtenSession),
    mcSession: normalizeMcSession(data.mcSession),
    questionHistory: normalizeQuestionHistory(data.questionHistory),
    mcHistory: normalizeMcHistory(data.mcHistory),
    savedSets: normalizeSavedSets(data.savedSets),
    studyGoals: normalizeStudyGoals(data.studyGoals),
    streakData: normalizeStreakData(data.streakData),
    generationHistory: normalizeGenerationHistory(data.generationHistory),
    presets: normalizePresets(data.presets),
    writtenTimer: normalizeTimerState(data.writtenTimer),
    mcTimer: normalizeTimerState(data.mcTimer),
    timeAllocations: normalizeTimeAllocations(data.timeAllocations),
  };
}

export function normalizeGenerationHistory(raw: unknown): GenerationRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is GenerationRecord =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.timestamp === 'string' &&
        isRecord(item.inputs) &&
        typeof item.inputs.topic === 'string' &&
        typeof item.inputs.difficulty === 'string' &&
        typeof item.inputs.questionCount === 'number' &&
        typeof item.inputs.questionMode === 'string' &&
        typeof item.inputs.techMode === 'string' &&
        isRecord(item.outputs) &&
        typeof item.outputs.durationMs === 'number',
    )
    .map((item) => ({
      ...item,
      isUploaded: Boolean(item.isUploaded),
      lastModified:
        typeof item.lastModified === 'number' ? item.lastModified : undefined,
    }));
}

function normalizeSettings(raw: unknown): PersistedSettings {
  const data = isRecord(raw) ? raw : {};
  const model = normalizeNonEmptyString(data.model, DEFAULT_SETTINGS.model);
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    apiKey: asString(data.apiKey),
    model,
    markingModel: normalizeNonEmptyString(
      data.markingModel,
      DEFAULT_SETTINGS.markingModel,
    ),
    imageMarkingModel: normalizeNonEmptyString(
      data.imageMarkingModel,
      DEFAULT_SETTINGS.imageMarkingModel,
    ),
    includeExamContext:
      typeof data.includeExamContext === 'boolean'
        ? data.includeExamContext
        : DEFAULT_SETTINGS.includeExamContext,
    autoSyncIntervalMinutes:
      typeof data.autoSyncIntervalMinutes === 'number'
        ? data.autoSyncIntervalMinutes
        : DEFAULT_SETTINGS.autoSyncIntervalMinutes,
    syncApiKey:
      typeof data.syncApiKey === 'boolean'
        ? data.syncApiKey
        : DEFAULT_SETTINGS.syncApiKey,
    localBackupFolderPath: asString(data.localBackupFolderPath),
    localBackupIntervalMinutes:
      typeof data.localBackupIntervalMinutes === 'number'
        ? data.localBackupIntervalMinutes
        : DEFAULT_SETTINGS.localBackupIntervalMinutes,
    theme: normalizeNonEmptyString(data.theme, DEFAULT_SETTINGS.theme),
    customThemeSeedColor: normalizeHexColor(
      data.customThemeSeedColor,
      DEFAULT_CUSTOM_THEME_SEED_COLOR,
    ),
    globalRounding: normalizeRounding(
      data.globalRounding,
      DEFAULT_SETTINGS.globalRounding,
    ),
    interfaceFont: normalizeNonEmptyString(
      data.interfaceFont,
      DEFAULT_SETTINGS.interfaceFont,
    ),
    headingFont: normalizeNonEmptyString(
      data.headingFont,
      DEFAULT_SETTINGS.headingFont,
    ),
    tutorPersona: asString(data.tutorPersona),
    tutorModel: normalizeNonEmptyString(
      data.tutorModel,
      model,
    ),
    shuffleSubtopics:
      typeof data.shuffleSubtopics === 'boolean'
        ? data.shuffleSubtopics
        : DEFAULT_SETTINGS.shuffleSubtopics,
    shuffleQuestions:
      typeof data.shuffleQuestions === 'boolean'
        ? data.shuffleQuestions
        : DEFAULT_SETTINGS.shuffleQuestions,
  } as PersistedSettings;
}

function normalizePreferences(raw: unknown): PersistedGeneratorPreferences {
  const data = isRecord(raw) ? raw : {};
  const questionMode = VALID_QUESTION_MODES.has(data.questionMode as QuestionMode)
    ? (data.questionMode as QuestionMode)
    : DEFAULT_PREFERENCES.questionMode;
  const difficulty = normalizeDifficulty(data.difficulty);
  return {
    ...DEFAULT_PREFERENCES,
    ...data,
    difficulty,
    questionMode,
  } as PersistedGeneratorPreferences;
}

function normalizeWrittenSession(raw: unknown): PersistedWrittenSession {
  const data = isRecord(raw) ? raw : {};
  return {
    ...DEFAULT_WRITTEN_SESSION,
    ...data,
  } as PersistedWrittenSession;
}

function normalizeMcSession(raw: unknown): PersistedMcSession {
  const data = isRecord(raw) ? raw : {};
  return {
    ...DEFAULT_MC_SESSION,
    ...data,
  } as PersistedMcSession;
}

export function normalizeSavedSets(raw: unknown): SavedQuestionSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeSavedSet(item))
    .filter((i): i is SavedQuestionSet => i !== null);
}

export function normalizeSavedSet(raw: unknown): SavedQuestionSet | null {
  const data = isRecord(raw) ? raw : null;
  if (!data || !data.id) return null;
  return {
    ...data,
    preferences: normalizePreferences(data.preferences),
  } as SavedQuestionSet;
}

export function normalizeQuestionHistory(raw: unknown): QuestionHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => item as QuestionHistoryEntry);
}

export function normalizeMcHistory(raw: unknown): McHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => item as McHistoryEntry);
}

function normalizeStudyGoals(raw: unknown): StudyGoals {
  if (!isRecord(raw)) return DEFAULT_STUDY_GOALS;
  return { ...DEFAULT_STUDY_GOALS, ...raw } as StudyGoals;
}

function normalizeStreakData(raw: unknown): StreakData {
  if (!isRecord(raw)) return DEFAULT_STREAK_DATA;
  return { ...DEFAULT_STREAK_DATA, ...raw } as StreakData;
}

function normalizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const data = isRecord(item) ? item : {};
    return {
      ...data,
      preferences: normalizePreferences(data.preferences),
    } as unknown as Preset;
  });
}

function normalizeTimerState(raw: unknown): TimerState | null {
  if (!isRecord(raw)) return null;
  return raw as unknown as TimerState;
}

function normalizeTimeAllocations(raw: unknown): TimeAllocationConfig {
  if (!Array.isArray(raw)) return DEFAULT_TIME_ALLOCATIONS;
  return raw as TimeAllocationConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeNonEmptyString(
  value: unknown,
  fallback: string | undefined,
): string {
  const text = asString(value).trim();
  return text.length > 0 ? text : fallback ?? '';
}

const VALID_ROUNDINGS = new Set(['sm', 'md', 'lg', 'xl']);

function normalizeRounding(
  value: unknown,
  fallback: string | undefined,
): string {
  const text = asString(value).trim();
  return VALID_ROUNDINGS.has(text) ? text : fallback ?? 'md';
}

export function normalizeQuestionMode(value: unknown): QuestionMode {
  return VALID_QUESTION_MODES.has(value as QuestionMode)
    ? (value as QuestionMode)
    : DEFAULT_PREFERENCES.questionMode;
}

export function normalizeDifficulty(value: unknown): Difficulty {
  return VALID_DIFFICULTIES.has(value as Difficulty)
    ? (value as Difficulty)
    : DEFAULT_PREFERENCES.difficulty;
}

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export function isTauriRuntime() {
  return isTauri;
}
