import { invoke } from '@tauri-apps/api/core';

import { cleanupOldSketchpadData } from '../components/sketchpadUtils';
import type {
  GenerationRecord,
  McHistoryEntry,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedSettings,
  PersistedWrittenSession,
  Preset,
  QuestionHistoryEntry,
  SavedQuestionSet,
  StreakData,
  StudyGoals,
  TimeAllocationConfig,
} from '../types';
import { APP_STATE_STORAGE_KEY, PERSISTED_APP_STATE_VERSION } from '../types';
import type { TimerState } from '../types/timer';

const DEFAULT_SETTINGS: PersistedSettings = {
  apiKey: '',
  model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
  markingModel: 'google/gemini-2.0-flash-lite-preview-02-05:free',
  useSeparateMarkingModel: false,
  imageMarkingModel: 'google/gemini-2.0-flash-lite-preview-02-05:free',
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
  customThemeSeedColor: '#3b82f6',
  globalRounding: 'md',
  interfaceFont: 'Manrope Variable',
  headingFont: 'Manrope Variable',
  tutorPersona: '',
  tutorModel: 'google/gemini-2.0-flash-lite-preview-02-05:free',
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
      return await invoke<PersistedAppState>('load_persisted_state');
    } catch (err) {
      console.error('Failed to load state from Tauri:', err);
      return EMPTY_PERSISTED_APP_STATE;
    }
  }

  const serialized = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
  if (!serialized) return EMPTY_PERSISTED_APP_STATE;
  try {
    return JSON.parse(serialized) as PersistedAppState;
  } catch {
    return EMPTY_PERSISTED_APP_STATE;
  }
}

export async function savePersistedAppState(
  state: PersistedAppState,
): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('save_persisted_state', { state });
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
  const model = asString(data.model) || DEFAULT_SETTINGS.model;
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    model,
  } as PersistedSettings;
}

function normalizePreferences(raw: unknown): PersistedGeneratorPreferences {
  const data = isRecord(raw) ? raw : {};
  return {
    ...DEFAULT_PREFERENCES,
    ...data,
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
  return data as SavedQuestionSet;
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
  return raw.map((item) => item as Preset);
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

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export function isTauriRuntime() {
  return isTauri;
}
