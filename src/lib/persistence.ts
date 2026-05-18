import { invoke } from '@tauri-apps/api/core';

import { APP_STATE_STORAGE_KEY, PERSISTED_APP_STATE_VERSION } from '@/types';
import type { TimerState } from '@/types/timer';

import type {
  CustomSubtopic,
  Difficulty,
  GeneratedQuestion,
  GenerationRecord,
  MarkAnswerResponse,
  McHistoryEntry,
  PdfMarkerHistoryEntry,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedSettings,
  PersistedWrittenSession,
  Preset,
  ProviderState,
  QuestionHistoryEntry,
  QuestionMode,
  SavedQuestionSet,
  StreakData,
  StudyGoals,
  TimeAllocationConfig,
  Topic,
} from '../types';
import {
  BUILTIN_PROVIDERS,
  createDefaultProviderState,
} from '../types/provider';
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
  showRawLlmOutput: false,
  questionTextSize: 16,
  responseTextSize: 16,
  includeExamContext: true,
  autoSyncIntervalMinutes: 0,
  syncApiKey: false,
  localBackupFolderPath: '',
  localBackupIntervalMinutes: 0,
  theme: 'claude',
  customThemeSeedColor: DEFAULT_CUSTOM_THEME_SEED_COLOR,
  interfaceFont: 'Inter Variable',
  headingFont: 'Manrope Variable',
  tutorPersona: '',
  tutorModel: 'openai/gpt-5.4-mini',
  shuffleSubtopics: false,
  shuffleQuestions: false,
  markerStyle: 'strict',
  customMarkerStyle: '',
  modelReasoningEnabled: false,
  modelReasoningEffort: 'medium',
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
  diversityEnabled: true,
  strictLatexValidation: true,
  generationStrategy: 'single-pass',
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
  if (isTauriRuntime()) {
    try {
      const persisted = await invoke<unknown>('load_persisted_state');

      // Decode and normalize the Tauri payload before removing fallback
      let decoded: unknown = persisted;
      try {
        if (typeof persisted === 'string') {
          const parsed: unknown = JSON.parse(persisted);
          decoded = parsed;
        }
        const migratedState = normalizePersistedAppState(decoded);

        // Only clear the redundant localStorage fallback after successful decode/normalize
        // to free up quota for other services (like Firebase).
        try {
          window.localStorage.removeItem(APP_STATE_STORAGE_KEY);
        } catch {
          /* Ignore cleanup errors */
        }

        return migratedState;
      } catch (decodeErr) {
        console.error('Failed to decode/normalize Tauri state:', decodeErr);
        throw decodeErr;
      }
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

  // Web fallback only
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
    pdfMarkerHistory: normalizePdfMarkerHistory(data.pdfMarkerHistory),
    savedSets: normalizeSavedSets(data.savedSets),
    studyGoals: normalizeStudyGoals(data.studyGoals),
    streakData: normalizeStreakData(data.streakData),
    generationHistory: normalizeGenerationHistory(data.generationHistory),
    presets: normalizePresets(data.presets),
    writtenTimer: normalizeTimerState(data.writtenTimer),
    mcTimer: normalizeTimerState(data.mcTimer),
    timeAllocations: normalizeTimeAllocations(data.timeAllocations),
    customSubtopics: normalizeCustomSubtopics(data.customSubtopics),
    customSubtopicsSynced:
      typeof data.customSubtopicsSynced === 'boolean'
        ? data.customSubtopicsSynced
        : false,
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

function migrateProviders(raw: Record<string, unknown>): {
  providers: Record<string, unknown>;
  activeProviderId: string;
} {
  const providers = raw.providers;
  if (isRecord(providers)) {
    // Already have provider data — ensure built-in providers exist
    const merged = { ...providers };
    for (const [id, config] of Object.entries(BUILTIN_PROVIDERS)) {
      if (!merged[id]) {
        merged[id] = createDefaultProviderState(config);
      }
    }
    return {
      providers: merged,
      activeProviderId:
        typeof raw.activeProviderId === 'string'
          ? raw.activeProviderId
          : 'openrouter',
    };
  }

  // Migration from old flat format: seed the openrouter provider
  const key = asString(raw.apiKey);
  const model = normalizeNonEmptyString(raw.model, 'openai/gpt-5.4-mini');
  const orProvider = createDefaultProviderState(BUILTIN_PROVIDERS.openrouter);
  orProvider.apiKey = key;
  orProvider.modelSelections.model = model;
  orProvider.modelSelections.markingModel = normalizeNonEmptyString(
    raw.markingModel,
    model,
  );
  orProvider.modelSelections.useSeparateMarkingModel =
    raw.useSeparateMarkingModel === true;
  orProvider.modelSelections.imageMarkingModel = normalizeNonEmptyString(
    raw.imageMarkingModel,
    model,
  );
  orProvider.modelSelections.useSeparateImageMarkingModel =
    raw.useSeparateImageMarkingModel === true;
  orProvider.modelSelections.tutorModel = normalizeNonEmptyString(
    raw.tutorModel,
    model,
  );

  const deepseekProvider = createDefaultProviderState(
    BUILTIN_PROVIDERS.deepseek,
  );

  return {
    providers: {
      openrouter: orProvider,
      deepseek: deepseekProvider,
    },
    activeProviderId: 'openrouter',
  };
}

function normalizeSettings(raw: unknown): PersistedSettings {
  const data = isRecord(raw) ? raw : {};
  const model = normalizeNonEmptyString(data.model, DEFAULT_SETTINGS.model);
  const migrated = migrateProviders(data);
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
    interfaceFont: normalizeNonEmptyString(
      data.interfaceFont,
      DEFAULT_SETTINGS.interfaceFont,
    ),
    headingFont: normalizeNonEmptyString(
      data.headingFont,
      DEFAULT_SETTINGS.headingFont,
    ),
    tutorPersona: asString(data.tutorPersona),
    tutorModel: normalizeNonEmptyString(data.tutorModel, model),
    shuffleSubtopics:
      typeof data.shuffleSubtopics === 'boolean'
        ? data.shuffleSubtopics
        : DEFAULT_SETTINGS.shuffleSubtopics,
    shuffleQuestions:
      typeof data.shuffleQuestions === 'boolean'
        ? data.shuffleQuestions
        : DEFAULT_SETTINGS.shuffleQuestions,
    markerStyle: normalizeMarkerStyle(data.markerStyle),
    customMarkerStyle: asString(data.customMarkerStyle),
    providers: migrated.providers as Record<string, ProviderState>,
    activeProviderId: migrated.activeProviderId,
  };
}

function normalizePreferences(raw: unknown): PersistedGeneratorPreferences {
  const data = isRecord(raw) ? raw : {};
  const questionMode = VALID_QUESTION_MODES.has(
    data.questionMode as QuestionMode,
  )
    ? (data.questionMode as QuestionMode)
    : DEFAULT_PREFERENCES.questionMode;
  const difficulty = normalizeDifficulty(data.difficulty);
  return {
    ...DEFAULT_PREFERENCES,
    ...data,
    difficulty,
    questionMode,
  };
}

function normalizeWrittenSession(raw: unknown): PersistedWrittenSession {
  const data = isRecord(raw) ? raw : {};
  return {
    ...DEFAULT_WRITTEN_SESSION,
    ...data,
  };
}

function normalizeMcSession(raw: unknown): PersistedMcSession {
  const data = isRecord(raw) ? raw : {};
  return {
    ...DEFAULT_MC_SESSION,
    ...data,
  };
}

export function normalizeSavedSets(raw: unknown): SavedQuestionSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeSavedSet(item))
    .filter((i): i is SavedQuestionSet => i !== null);
}

function normalizeTimestampToIso(value: unknown, fallbackMs: number): string {
  const toIsoFromMs = (ms: number) => {
    const date = new Date(ms);
    return Number.isNaN(date.getTime())
      ? new Date(fallbackMs).toISOString()
      : date.toISOString();
  };

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return new Date(fallbackMs).toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Support both milliseconds and unix-seconds inputs.
    const ms = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    return toIsoFromMs(ms);
  }

  if (value instanceof Date) {
    return toIsoFromMs(value.getTime());
  }

  if (isRecord(value)) {
    const maybeToDate = value.toDate;
    if (typeof maybeToDate === 'function') {
      const toDate = maybeToDate as (this: Record<string, unknown>) => unknown;
      const maybeDate = toDate.call(value);
      if (maybeDate instanceof Date && !Number.isNaN(maybeDate.getTime())) {
        return maybeDate.toISOString();
      }
    }

    const seconds = value.seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos =
        typeof value.nanoseconds === 'number' &&
        Number.isFinite(value.nanoseconds)
          ? value.nanoseconds
          : 0;
      const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return toIsoFromMs(ms);
    }
  }

  return new Date(fallbackMs).toISOString();
}

export function normalizeSavedSet(raw: unknown): SavedQuestionSet | null {
  const data = isRecord(raw) ? raw : null;
  if (!data || typeof data.id !== 'string') return null;

  const fallbackMs =
    typeof data.lastModified === 'number' && Number.isFinite(data.lastModified)
      ? data.lastModified
      : Date.now();

  return {
    ...data,
    createdAt: normalizeTimestampToIso(data.createdAt, fallbackMs),
    updatedAt: normalizeTimestampToIso(data.updatedAt, fallbackMs),
    lastModified: fallbackMs,
    isUploaded: data.isUploaded ?? true,
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

export function normalizePdfMarkerHistory(
  raw: unknown,
): PdfMarkerHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: PdfMarkerHistoryEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : crypto.randomUUID();
    const createdAt =
      typeof item.createdAt === 'string'
        ? item.createdAt
        : new Date().toISOString();
    const pdfBase64 =
      typeof item.pdfBase64 === 'string' ? item.pdfBase64 : null;
    const questions = (Array.isArray(item.questions)
      ? item.questions
      : []) as unknown as GeneratedQuestion[];
    const resultsRaw = item.resultsByQuestionId;
    const resultsByQuestionId = isRecord(resultsRaw)
      ? (resultsRaw as unknown as Record<string, MarkAnswerResponse>)
      : {};
    const pageMapping = (Array.isArray(item.pageMapping)
      ? item.pageMapping
      : []) as unknown as { questionIndex: number; pageIndices: number[] }[];
    const statsRecord = isRecord(item.stats) ? item.stats : {};
    const stats = {
      achieved:
        typeof statsRecord.achieved === 'number' ? statsRecord.achieved : 0,
      max: typeof statsRecord.max === 'number' ? statsRecord.max : 0,
      pct: typeof statsRecord.pct === 'number' ? statsRecord.pct : 0,
    };
    result.push({
      id,
      createdAt,
      pdfBase64,
      questions,
      resultsByQuestionId,
      pageMapping,
      stats,
    });
  }
  return result;
}

function normalizeStudyGoals(raw: unknown): StudyGoals {
  if (!isRecord(raw)) return DEFAULT_STUDY_GOALS;
  return { ...DEFAULT_STUDY_GOALS, ...raw };
}

function normalizeStreakData(raw: unknown): StreakData {
  if (!isRecord(raw)) return DEFAULT_STREAK_DATA;
  return { ...DEFAULT_STREAK_DATA, ...raw };
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

function normalizeCustomSubtopics(
  raw: unknown,
): Record<Topic, CustomSubtopic[]> {
  const empty: Record<Topic, CustomSubtopic[]> = {
    Biology: [],
    Chemistry: [],
    'General Mathematics': [],
    'Mathematical Methods': [],
    'Physical Education': [],
    'Specialist Mathematics': [],
  };

  if (!isRecord(raw)) return empty;

  for (const topic of Object.keys(empty) as Topic[]) {
    const entries = raw[topic];
    if (!Array.isArray(entries)) continue;

    empty[topic] = entries
      .map((entry) => normalizeCustomSubtopic(topic, entry))
      .filter((entry): entry is CustomSubtopic => entry !== null);
  }

  return empty;
}

function normalizeCustomSubtopic(
  topic: Topic,
  raw: unknown,
): CustomSubtopic | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string'
  ) {
    return null;
  }

  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;

  const techniqueNotes = isRecord(raw.technique_notes)
    ? raw.technique_notes
    : null;

  return {
    id: raw.id,
    topic,
    name: raw.name,
    technique_notes: techniqueNotes
      ? {
          core_concepts: asString(techniqueNotes.core_concepts),
          exam_style_guidelines: asString(techniqueNotes.exam_style_guidelines),
          anti_prompts: Array.isArray(techniqueNotes.anti_prompts)
            ? techniqueNotes.anti_prompts.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          tech_free_rules: asString(techniqueNotes.tech_free_rules),
          tech_active_rules: asString(techniqueNotes.tech_active_rules),
        }
      : undefined,
    group: typeof raw.group === 'string' ? raw.group : undefined,
    createdAt,
    updatedAt,
  };
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
  return text.length > 0 ? text : (fallback ?? '');
}

const VALID_MARKER_STYLES = new Set([
  'strict',
  'relaxed',
  'targeted',
  'custom',
]);

function normalizeMarkerStyle(
  value: unknown,
): 'strict' | 'relaxed' | 'targeted' | 'custom' {
  const text = asString(value).trim().toLowerCase();
  return VALID_MARKER_STYLES.has(text)
    ? (text as 'strict' | 'relaxed' | 'targeted' | 'custom')
    : 'strict';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (Boolean((window as any).__TAURI_INTERNALS__) ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    Boolean((window as any).__TAURI__) ||
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    Boolean((window as any).rpc?.notify));

export function isTauriRuntime() {
  return isTauri;
}
