/**
 * store.ts — Zustand replacement for AppContext.tsx
 */

import { startTransition } from 'react';
import { create } from 'zustand';

import {
  deleteMcHistoryEntry as v3DeleteMcHistoryEntry,
  deleteQuestionHistoryEntry as v3DeleteQuestionHistoryEntry,
  deleteSavedSet as v3DeleteSavedSet,
  saveMcHistoryEntry as v3SaveMcHistoryEntry,
  saveQuestionHistoryEntry as v3SaveQuestionHistoryEntry,
  saveSavedSet as v3SaveSavedSet,
  updateApiKey,
  updatePresets,
  updateStudyGoals,
} from '@/context/modules/sync-v3/mutations';
import { mergeImportedState, persistAndRehydrate } from '@/lib/import-export';
import {
  EMPTY_PERSISTED_APP_STATE,
  isSavedSetComplete,
  loadPersistedAppState,
  savePersistedAppState,
} from '@/lib/persistence';
import { createCard, isDue, reviewCard } from '@/lib/spaced-repetition';
import { getTodayKey } from '@/lib/utils';

import type {
  ChemistrySubtopic,
  Difficulty,
  GeneratedQuestion,
  GenerationRecord,
  GenerationStatusEvent,
  GenerationStrategy,
  GenerationTelemetry,
  MarkAnswerResponse,
  MathMethodsSubtopic,
  McHistoryEntry,
  McQuestion,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedWrittenSession,
  PhysicalEducationSubtopic,
  Preset,
  QuestionHistoryEntry,
  QuestionMode,
  ReviewQuality,
  SavedQuestionSet,
  SpacedRepetitionCard,
  SpecialistMathSubtopic,
  StreakData,
  StudentAnswerImage,
  StudyGoals,
  TechMode,
  Topic,
} from './types';
import type { TimerState } from './types/timer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  const leadTopic = topics[0] ?? 'Mixed Topics';
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === 'written' ? 'Written' : 'Multiple Choice';
  return extraCount === 0
    ? `${leadTopic} ${modeLabel}`
    : `${leadTopic} +${extraCount} ${modeLabel}`;
}

function isWrittenSessionComplete(
  questions: GeneratedQuestion[],
  feedbackByQuestionId: Record<string, MarkAnswerResponse>
) {
  return (
    questions.length > 0 &&
    questions.every((q) => Boolean(feedbackByQuestionId[q.id]))
  );
}

function isMcSessionComplete(
  questions: McQuestion[],
  answersByQuestionId: Record<string, string>
) {
  return (
    questions.length > 0 &&
    questions.every((q) => Boolean(answersByQuestionId[q.id]))
  );
}

function normalizeThemeName(theme: unknown): string {
  if (typeof theme !== 'string') {
    return 'claude';
  }

  const normalized = theme.trim();
  return normalized.length > 0 ? normalized : 'claude';
}

export interface AppState {
  // ── Hydration ──────────────────────────────────────────────────────────────
  isHydrated: boolean;

  // ── Settings ───────────────────────────────────────────────────────────────
  apiKey: string;
  showApiKey: boolean;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize: number;
  responseTextSize: number;
  includeExamContext: boolean;
  autoSyncIntervalMinutes: number;
  syncApiKey: boolean;
  localBackupFolderPath: string;
  localBackupIntervalMinutes: number;
  theme: string;

  // ── Preferences ────────────────────────────────────────────────────────────
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  averageMarksPerQuestion: number;
  questionMode: QuestionMode;

  // ── AI Difficulty Scaling ──────────────────────────────────────────────────
  aiDifficultyScalingEnabled: boolean;
  difficultyThresholds: { increase: number; decrease: number };
  // ── Generation flags ─────────────────────────────────────────────────────
  diversityStrictness: 'lenient' | 'moderate' | 'strict';
  strictLatexValidation: boolean;
  strictSubtopicCoverage: boolean;
  minSubtopicCoverageRatio: number;
  generationStrategy: GenerationStrategy;

  // ── Written session ────────────────────────────────────────────────────────
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  questionHistory: QuestionHistoryEntry[];
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: GenerationTelemetry | null;
  activeWrittenSavedSetId: string | null;

  // ── MC session ─────────────────────────────────────────────────────────────
  mcQuestions: McQuestion[];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcHistory: McHistoryEntry[];
  mcRawModelOutput: string;
  mcGenerationTelemetry: GenerationTelemetry | null;
  activeMcSavedSetId: string | null;

  // ── Saved sets ─────────────────────────────────────────────────────────────
  savedSets: SavedQuestionSet[];

  // ── Generation / marking status ────────────────────────────────────────────
  isGenerating: boolean;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;

  // ── Spaced repetition ─────────────────────────────────────────────────────
  spacedRepetitionCards: Record<string, SpacedRepetitionCard>;

  // ── Study goals & streaks ─────────────────────────────────────────────────
  studyGoals: StudyGoals;
  streakData: StreakData;

  generationHistory: GenerationRecord[];

  // ─── Generator Parameter Presets (Firebase-synced) ─────────────
  presets: Preset[];

  // ── Timer v2 ───────────────────────────────────────────────────
  writtenTimer: TimerState | null;
  mcTimer: TimerState | null;
}

// ─── Actions shape ────────────────────────────────────────────────────────────

export interface AppActions {
  // Preset management (Firebase-synced)
  setPresets: (presets: Preset[]) => void;
  addPreset: (preset: Preset) => void;
  updatePreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
  // Settings
  setApiKey: (key: string) => void;
  setShowApiKey: (show: boolean) => void;
  setModel: (model: string) => void;
  setMarkingModel: (model: string) => void;
  setUseSeparateMarkingModel: (enabled: boolean) => void;
  setImageMarkingModel: (model: string) => void;
  setUseSeparateImageMarkingModel: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  clearApiKey: () => void;
  setQuestionTextSize: (size: number) => void;
  setResponseTextSize: (size: number) => void;
  setIncludeExamContext: (enabled: boolean) => void;
  setAutoSyncIntervalMinutes: (minutes: number) => void;
  setSyncApiKey: (enabled: boolean) => void;
  setLocalBackupFolderPath: (path: string) => void;
  setLocalBackupIntervalMinutes: (minutes: number) => void;
  setTheme: (theme: string) => void;

  // Preferences
  setSelectedTopics: (topics: Topic[] | ((prev: Topic[]) => Topic[])) => void;
  setDifficulty: (level: Difficulty) => void;
  setTechMode: (mode: TechMode) => void;
  setAvoidSimilarQuestions: (enabled: boolean) => void;
  setMathMethodsSubtopics: (
    subtopics:
      | MathMethodsSubtopic[]
      | ((prev: MathMethodsSubtopic[]) => MathMethodsSubtopic[])
  ) => void;
  setSpecialistMathSubtopics: (
    subtopics:
      | SpecialistMathSubtopic[]
      | ((prev: SpecialistMathSubtopic[]) => SpecialistMathSubtopic[])
  ) => void;
  setChemistrySubtopics: (
    subtopics:
      | ChemistrySubtopic[]
      | ((prev: ChemistrySubtopic[]) => ChemistrySubtopic[])
  ) => void;
  setPhysicalEducationSubtopics: (
    subtopics:
      | PhysicalEducationSubtopic[]
      | ((prev: PhysicalEducationSubtopic[]) => PhysicalEducationSubtopic[])
  ) => void;
  setQuestionCount: (count: number) => void;
  setAverageMarksPerQuestion: (marks: number) => void;
  setQuestionMode: (mode: QuestionMode) => void;

  // AI Difficulty Scaling
  setAiDifficultyScalingEnabled: (enabled: boolean) => void;
  setDifficultyThresholds: (thresholds: {
    increase: number;
    decrease: number;
  }) => void;
  // Generation flags
  setDiversityStrictness: (level: 'lenient' | 'moderate' | 'strict') => void;
  setStrictLatexValidation: (enabled: boolean) => void;
  setStrictSubtopicCoverage: (enabled: boolean) => void;
  setMinSubtopicCoverageRatio: (ratio: number) => void;
  setGenerationStrategy: (strategy: GenerationStrategy) => void;

  // Written session
  setQuestions: (questions: GeneratedQuestion[]) => void;
  setActiveQuestionIndex: (idx: number) => void;
  setWrittenQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  setAnswersByQuestionId: (
    answers:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setImagesByQuestionId: (
    images:
      | Record<string, StudentAnswerImage | undefined>
      | ((
        prev: Record<string, StudentAnswerImage | undefined>
      ) => Record<string, StudentAnswerImage | undefined>)
  ) => void;
  setFeedbackByQuestionId: (
    feedback:
      | Record<string, MarkAnswerResponse>
      | ((
        prev: Record<string, MarkAnswerResponse>
      ) => Record<string, MarkAnswerResponse>)
  ) => void;
  setQuestionHistory: (
    history:
      | QuestionHistoryEntry[]
      | ((prev: QuestionHistoryEntry[]) => QuestionHistoryEntry[])
  ) => void;
  setWrittenRawModelOutput: (output: string) => void;
  setWrittenGenerationTelemetry: (
    telemetry: GenerationTelemetry | null
  ) => void;
  setActiveWrittenSavedSetId: (id: string | null) => void;

  // MC session
  setMcQuestions: (questions: McQuestion[]) => void;
  setActiveMcQuestionIndex: (idx: number) => void;
  setMcQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  setMcAnswersByQuestionId: (
    answers:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setMcHistory: (
    history: McHistoryEntry[] | ((prev: McHistoryEntry[]) => McHistoryEntry[])
  ) => void;
  setMcRawModelOutput: (output: string) => void;
  setMcGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  setActiveMcSavedSetId: (id: string | null) => void;

  // Generation / marking status
  setIsGenerating: (is: boolean) => void;
  setGenerationStatus: (status: GenerationStatusEvent | null) => void;
  setGenerationStartedAt: (startedAt: number | null) => void;
  setIsMarking: (is: boolean) => void;
  setErrorMessage: (msg: string | null) => void;

  // Saved sets
  saveCurrentSet: () => string | null;
  loadSavedSet: (savedSetId: string) => void;
  needsSaveBeforeLoad: (savedSetId: string) => boolean;
  deleteSavedSet: (savedSetId: string) => void;
  deleteAllSavedSets: () => void;
  deleteQuestionHistoryEntry: (id: string) => void;
  deleteMcHistoryEntry: (id: string) => void;
  addQuestionHistoryEntry: (entry: QuestionHistoryEntry) => void;
  addMcHistoryEntry: (entry: McHistoryEntry) => void;
  updateQuestionHistoryEntry: (entry: QuestionHistoryEntry) => void;
  updateMcHistoryEntry: (entry: McHistoryEntry) => void;
  clearQuestionHistory: () => void;
  clearMcHistory: () => void;

  // Spaced repetition
  reviewSpacedCard: (questionId: string, quality: ReviewQuality) => void;
  getDueCards: () => Array<{ questionId: string; card: SpacedRepetitionCard }>;

  // Study goals & streaks
  setStudyGoals: (goals: Partial<StudyGoals>) => void;
  recordCompletion: (mode: QuestionMode) => void;
  getTodayCompletions: () => { total: number; written: number; mc: number };

  // Persistence
  hydrate: () => Promise<void>;

  addGenerationRecord: (record: GenerationRecord) => void;

  // Timer v2
  setWrittenTimer: (state: TimerState | null) => void;
  setMcTimer: (state: TimerState | null) => void;

  // Import / Export
  importState: (imported: PersistedAppState) => void;
}

// ─── Default state ────────────────────────────────────────────────────────────

const defaultState: AppState = {
  isHydrated: false,
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  showApiKey: false,
  model: EMPTY_PERSISTED_APP_STATE.settings.model,
  markingModel: EMPTY_PERSISTED_APP_STATE.settings.markingModel,
  useSeparateMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel
  ),
  imageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.imageMarkingModel,
  useSeparateImageMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateImageMarkingModel
  ),
  debugMode: EMPTY_PERSISTED_APP_STATE.settings.debugMode,
  questionTextSize: EMPTY_PERSISTED_APP_STATE.settings.questionTextSize ?? 16,
  responseTextSize: EMPTY_PERSISTED_APP_STATE.settings.responseTextSize ?? 16,
  includeExamContext: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.includeExamContext
  ),
  autoSyncIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.autoSyncIntervalMinutes ?? 0,
  syncApiKey: Boolean(EMPTY_PERSISTED_APP_STATE.settings.syncApiKey),
  localBackupFolderPath:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupFolderPath ?? '',
  localBackupIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupIntervalMinutes ?? 0,
  theme: normalizeThemeName(EMPTY_PERSISTED_APP_STATE.settings.theme),
  selectedTopics: EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics,
  difficulty: EMPTY_PERSISTED_APP_STATE.preferences.difficulty,
  techMode: EMPTY_PERSISTED_APP_STATE.preferences.techMode,
  avoidSimilarQuestions:
    EMPTY_PERSISTED_APP_STATE.preferences.avoidSimilarQuestions,
  mathMethodsSubtopics:
    EMPTY_PERSISTED_APP_STATE.preferences.mathMethodsSubtopics,
  specialistMathSubtopics:
    EMPTY_PERSISTED_APP_STATE.preferences.specialistMathSubtopics,
  chemistrySubtopics: EMPTY_PERSISTED_APP_STATE.preferences.chemistrySubtopics,
  physicalEducationSubtopics:
    EMPTY_PERSISTED_APP_STATE.preferences.physicalEducationSubtopics,
  questionCount: EMPTY_PERSISTED_APP_STATE.preferences.questionCount,
  averageMarksPerQuestion:
    EMPTY_PERSISTED_APP_STATE.preferences.averageMarksPerQuestion,
  questionMode: EMPTY_PERSISTED_APP_STATE.preferences.questionMode,
  aiDifficultyScalingEnabled: true,
  difficultyThresholds: { increase: 85, decrease: 70 },
  diversityStrictness: 'moderate',
  strictLatexValidation: true,
  strictSubtopicCoverage: true,
  minSubtopicCoverageRatio: 0.6,
  generationStrategy: 'multi-pass',
  questions: EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
  activeQuestionIndex:
    EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
  writtenQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
  answersByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
  imagesByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId,
  feedbackByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
  questionHistory: EMPTY_PERSISTED_APP_STATE.questionHistory,
  writtenRawModelOutput:
    EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
  writtenGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
  activeWrittenSavedSetId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null,
  mcQuestions: EMPTY_PERSISTED_APP_STATE.mcSession.questions,
  activeMcQuestionIndex:
    EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex,
  mcQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.mcSession.presentedAtByQuestionId,
  mcAnswersByQuestionId:
    EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId,
  mcHistory: EMPTY_PERSISTED_APP_STATE.mcHistory,
  mcRawModelOutput: EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
  mcGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
  activeMcSavedSetId: EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId ?? null,
  savedSets: EMPTY_PERSISTED_APP_STATE.savedSets,
  isGenerating: false,
  generationStatus: null,
  generationStartedAt: null,
  isMarking: false,
  errorMessage: null,
  spacedRepetitionCards: {},
  studyGoals: {
    dailyQuestionGoal: 10,
    dailyWrittenGoal: 5,
    dailyMcGoal: 5,
    weeklyStreakGoal: 5,
  },
  streakData: {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    dailyCompletions: {},
  },
  generationHistory: [],
  presets: [],
  writtenTimer: null,
  mcTimer: null,
};

// ─── Functional updater resolution ───────────────────────────────────────────

type Updater<T> = T | ((prev: T) => T);

function resolve<T>(update: Updater<T>, previous: T): T {
  return typeof update === 'function'
    ? (update as (prev: T) => T)(previous)
    : update;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...defaultState,

  hydrate: async () => {
    try {
      const persisted = await loadPersistedAppState();
      set({
        ...snapshotToState(persisted),
        isHydrated: true,
      });
    } catch {
      console.error('Hydration failed');
      set({ errorMessage: 'Could not load saved app data.', isHydrated: true });
    }
  },

  addGenerationRecord: (record) =>
    set((s) => ({
      generationHistory: [record, ...s.generationHistory].slice(0, 1000),
    })),
  setWrittenTimer: (writtenTimer) => set({ writtenTimer: writtenTimer }),
  setMcTimer: (mcTimer) => set({ mcTimer: mcTimer }),
  setApiKey: (key) => {
    set({ apiKey: key });
    void updateApiKey(key);
  },
  setShowApiKey: (show) => set({ showApiKey: show }),
  setModel: (model) => set({ model }),
  setMarkingModel: (markingModel) => set({ markingModel }),
  setUseSeparateMarkingModel: (useSeparateMarkingModel) =>
    set({ useSeparateMarkingModel }),
  setImageMarkingModel: (imageMarkingModel) => set({ imageMarkingModel }),
  setUseSeparateImageMarkingModel: (useSeparateImageMarkingModel) =>
    set({ useSeparateImageMarkingModel }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setQuestionTextSize: (questionTextSize) => set({ questionTextSize }),
  setResponseTextSize: (responseTextSize) => set({ responseTextSize }),
  setIncludeExamContext: (includeExamContext) => set({ includeExamContext }),
  setAutoSyncIntervalMinutes: (autoSyncIntervalMinutes) =>
    set({ autoSyncIntervalMinutes }),
  setSyncApiKey: (syncApiKey) => set({ syncApiKey }),
  setLocalBackupFolderPath: (localBackupFolderPath) =>
    set({ localBackupFolderPath }),
  setLocalBackupIntervalMinutes: (localBackupIntervalMinutes) =>
    set({ localBackupIntervalMinutes }),
  setTheme: (theme) => set({ theme }),
  clearApiKey: () => set({ apiKey: '' }),

  setPresets: (presets) => set({ presets }),
  addPreset: (preset) =>
    set((s) => {
      const next = [preset, ...s.presets];
      void updatePresets(next);
      return { presets: next };
    }),
  updatePreset: (preset) =>
    set((s) => {
      const next = s.presets.map((p) => (p.id === preset.id ? preset : p));
      void updatePresets(next);
      return { presets: next };
    }),
  deletePreset: (id) =>
    set((s) => {
      const next = s.presets.filter((p) => p.id !== id);
      void updatePresets(next);
      return { presets: next };
    }),

  setSelectedTopics: (update) =>
    set((s) => ({ selectedTopics: resolve(update, s.selectedTopics) })),
  setDifficulty: (difficulty) => set({ difficulty }),
  setTechMode: (techMode) => set({ techMode }),
  setAvoidSimilarQuestions: (avoidSimilarQuestions) =>
    set({ avoidSimilarQuestions }),
  setMathMethodsSubtopics: (update) =>
    set((s) => ({
      mathMethodsSubtopics: resolve(update, s.mathMethodsSubtopics),
    })),
  setSpecialistMathSubtopics: (update) =>
    set((s) => ({
      specialistMathSubtopics: resolve(update, s.specialistMathSubtopics),
    })),
  setChemistrySubtopics: (update) =>
    set((s) => ({ chemistrySubtopics: resolve(update, s.chemistrySubtopics) })),
  setPhysicalEducationSubtopics: (update) =>
    set((s) => ({
      physicalEducationSubtopics: resolve(update, s.physicalEducationSubtopics),
    })),
  setQuestionCount: (questionCount) => set({ questionCount }),
  setAverageMarksPerQuestion: (averageMarksPerQuestion) =>
    set({ averageMarksPerQuestion }),
  setQuestionMode: (questionMode) => set({ questionMode }),

  setAiDifficultyScalingEnabled: (enabled) =>
    set({ aiDifficultyScalingEnabled: enabled }),
  setDifficultyThresholds: (thresholds) =>
    set({ difficultyThresholds: thresholds }),
  setDiversityStrictness: (diversityStrictness) => set({ diversityStrictness }),
  setStrictLatexValidation: (strictLatexValidation) =>
    set({ strictLatexValidation }),
  setStrictSubtopicCoverage: (strictSubtopicCoverage) =>
    set({ strictSubtopicCoverage }),
  setMinSubtopicCoverageRatio: (minSubtopicCoverageRatio) =>
    set({ minSubtopicCoverageRatio }),
  setGenerationStrategy: (generationStrategy) => set({ generationStrategy }),

  setQuestions: (questions) => set({ questions }),
  setActiveQuestionIndex: (activeQuestionIndex) => set({ activeQuestionIndex }),
  setWrittenQuestionPresentedAtById: (update) =>
    set((s) => ({
      writtenQuestionPresentedAtById: resolve(
        update,
        s.writtenQuestionPresentedAtById
      ),
    })),
  setAnswersByQuestionId: (update) =>
    set((s) => ({
      answersByQuestionId: resolve(update, s.answersByQuestionId),
    })),
  setImagesByQuestionId: (update) =>
    set((s) => ({ imagesByQuestionId: resolve(update, s.imagesByQuestionId) })),
  setFeedbackByQuestionId: (update) =>
    set((s) => ({
      feedbackByQuestionId: resolve(update, s.feedbackByQuestionId),
    })),
  setQuestionHistory: (update) =>
    set((s) => ({ questionHistory: resolve(update, s.questionHistory) })),
  setWrittenRawModelOutput: (writtenRawModelOutput) =>
    set({ writtenRawModelOutput }),
  setWrittenGenerationTelemetry: (writtenGenerationTelemetry) =>
    set({ writtenGenerationTelemetry }),
  setActiveWrittenSavedSetId: (activeWrittenSavedSetId) =>
    set({ activeWrittenSavedSetId }),

  setMcQuestions: (mcQuestions) => set({ mcQuestions }),
  setActiveMcQuestionIndex: (activeMcQuestionIndex) =>
    set({ activeMcQuestionIndex }),
  setMcQuestionPresentedAtById: (update) =>
    set((s) => ({
      mcQuestionPresentedAtById: resolve(update, s.mcQuestionPresentedAtById),
    })),
  setMcAnswersByQuestionId: (update) =>
    set((s) => ({
      mcAnswersByQuestionId: resolve(update, s.mcAnswersByQuestionId),
    })),
  setMcHistory: (update) =>
    set((s) => ({ mcHistory: resolve(update, s.mcHistory) })),
  setMcRawModelOutput: (mcRawModelOutput) => set({ mcRawModelOutput }),
  setMcGenerationTelemetry: (mcGenerationTelemetry) =>
    set({ mcGenerationTelemetry }),
  setActiveMcSavedSetId: (activeMcSavedSetId) => set({ activeMcSavedSetId }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setGenerationStartedAt: (generationStartedAt) => set({ generationStartedAt }),
  setIsMarking: (isMarking) => set({ isMarking }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  saveCurrentSet: () => {
    const s = get();
    const now = new Date().toISOString();
    const nowMs = Date.now();
    if (s.questionMode === 'written') {
      if (s.questions.length === 0) return null;
      const isComplete = isWrittenSessionComplete(
        s.questions,
        s.feedbackByQuestionId
      );
      if (isComplete) {
        if (s.activeWrittenSavedSetId) {
          const completedSavedSetId = s.activeWrittenSavedSetId;
          set((state) => ({
            savedSets: state.savedSets.filter(
              (e) => e.id !== completedSavedSetId
            ),
            activeWrittenSavedSetId: null,
          }));
          void v3DeleteSavedSet(completedSavedSetId);
        }
        return null;
      }
      const savedSetId =
        s.activeWrittenSavedSetId ?? `saved-written-${crypto.randomUUID()}`;
      const preferencesSnapshot: PersistedGeneratorPreferences = {
        selectedTopics: s.selectedTopics,
        difficulty: s.difficulty,
        techMode: s.techMode,
        avoidSimilarQuestions: s.avoidSimilarQuestions,
        mathMethodsSubtopics: s.mathMethodsSubtopics,
        specialistMathSubtopics: s.specialistMathSubtopics,
        chemistrySubtopics: s.chemistrySubtopics,
        physicalEducationSubtopics: s.physicalEducationSubtopics,
        questionCount: s.questionCount,
        averageMarksPerQuestion: s.averageMarksPerQuestion,
        questionMode: s.questionMode,
        diversityStrictness: s.diversityStrictness,
        strictLatexValidation: s.strictLatexValidation,
        strictSubtopicCoverage: s.strictSubtopicCoverage,
        minSubtopicCoverageRatio: s.minSubtopicCoverageRatio,
        generationStrategy: s.generationStrategy,
      };
      const writtenSession: PersistedWrittenSession = {
        questions: s.questions,
        activeQuestionIndex: s.activeQuestionIndex,
        presentedAtByQuestionId: s.writtenQuestionPresentedAtById,
        answersByQuestionId: s.answersByQuestionId,
        imagesByQuestionId: s.imagesByQuestionId,
        feedbackByQuestionId: s.feedbackByQuestionId,
        rawModelOutput: s.writtenRawModelOutput,
        generationTelemetry: s.writtenGenerationTelemetry,
        savedSetId,
      };
      const nextEntry: SavedQuestionSet = {
        id: savedSetId,
        title: buildSavedSetTitle('written', s.selectedTopics),
        questionMode: 'written',
        createdAt:
          s.savedSets.find((e) => e.id === savedSetId)?.createdAt ?? now,
        updatedAt: now,
        lastModified: nowMs,
        preferences: preferencesSnapshot,
        writtenSession,
      };
      const nextSavedSets = [
        nextEntry,
        ...s.savedSets.filter((e) => e.id !== savedSetId),
      ];
      set({ savedSets: nextSavedSets, activeWrittenSavedSetId: savedSetId });
      void v3SaveSavedSet(nextEntry);
      return savedSetId;
    }
    if (s.mcQuestions.length === 0) return null;
    const isComplete = isMcSessionComplete(
      s.mcQuestions,
      s.mcAnswersByQuestionId
    );
    if (isComplete) {
      if (s.activeMcSavedSetId) {
        const completedSavedSetId = s.activeMcSavedSetId;
        set((state) => ({
          savedSets: state.savedSets.filter(
            (e) => e.id !== completedSavedSetId
          ),
          activeMcSavedSetId: null,
        }));
        void v3DeleteSavedSet(completedSavedSetId);
      }
      return null;
    }
    const savedSetId =
      s.activeMcSavedSetId ?? `saved-mc-${crypto.randomUUID()}`;
    const preferencesSnapshot: PersistedGeneratorPreferences = {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      questionCount: s.questionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      questionMode: s.questionMode,
      diversityStrictness: s.diversityStrictness,
      strictLatexValidation: s.strictLatexValidation,
      strictSubtopicCoverage: s.strictSubtopicCoverage,
      minSubtopicCoverageRatio: s.minSubtopicCoverageRatio,
      generationStrategy: s.generationStrategy,
    };
    const mcSession: PersistedMcSession = {
      questions: s.mcQuestions,
      activeQuestionIndex: s.activeMcQuestionIndex,
      presentedAtByQuestionId: s.mcQuestionPresentedAtById,
      answersByQuestionId: s.mcAnswersByQuestionId,
      rawModelOutput: s.mcRawModelOutput,
      generationTelemetry: s.mcGenerationTelemetry,
      savedSetId,
    };
    const nextEntry: SavedQuestionSet = {
      id: savedSetId,
      title: buildSavedSetTitle('multiple-choice', s.selectedTopics),
      questionMode: 'multiple-choice',
      createdAt: s.savedSets.find((e) => e.id === savedSetId)?.createdAt ?? now,
      updatedAt: now,
      lastModified: nowMs,
      preferences: preferencesSnapshot,
      mcSession,
    };
    const nextSavedSets = [
      nextEntry,
      ...s.savedSets.filter((e) => e.id !== savedSetId),
    ];
    set({ savedSets: nextSavedSets, activeMcSavedSetId: savedSetId });
    void v3SaveSavedSet(nextEntry);
    return savedSetId;
  },

  loadSavedSet: (id) => {
    const entry = get().savedSets.find((e) => e.id === id);
    if (!entry) return;
    startTransition(() => {
      set({
        selectedTopics: entry.preferences.selectedTopics,
        difficulty: entry.preferences.difficulty,
        techMode: entry.preferences.techMode,
        avoidSimilarQuestions: entry.preferences.avoidSimilarQuestions,
        mathMethodsSubtopics: entry.preferences.mathMethodsSubtopics,
        specialistMathSubtopics: entry.preferences.specialistMathSubtopics,
        chemistrySubtopics: entry.preferences.chemistrySubtopics,
        physicalEducationSubtopics:
          entry.preferences.physicalEducationSubtopics,
        questionCount: entry.preferences.questionCount,
        questionMode: entry.questionMode,
        ...(entry.questionMode === 'written'
          ? {
            questions: entry.writtenSession!.questions,
            activeQuestionIndex: entry.writtenSession!.activeQuestionIndex,
            writtenQuestionPresentedAtById:
              entry.writtenSession!.presentedAtByQuestionId,
            answersByQuestionId: entry.writtenSession!.answersByQuestionId,
            imagesByQuestionId: entry.writtenSession!.imagesByQuestionId,
            feedbackByQuestionId: entry.writtenSession!.feedbackByQuestionId,
            writtenRawModelOutput: entry.writtenSession!.rawModelOutput,
            writtenGenerationTelemetry:
              entry.writtenSession!.generationTelemetry ?? null,
            activeWrittenSavedSetId: id,
            mcQuestions: [],
            activeMcQuestionIndex: 0,
            mcQuestionPresentedAtById: {},
            mcAnswersByQuestionId: {},
            activeMcSavedSetId: null,
          }
          : {
            mcQuestions: entry.mcSession!.questions,
            activeMcQuestionIndex: entry.mcSession!.activeQuestionIndex,
            mcQuestionPresentedAtById:
              entry.mcSession!.presentedAtByQuestionId,
            mcAnswersByQuestionId: entry.mcSession!.answersByQuestionId,
            mcRawModelOutput: entry.mcSession!.rawModelOutput,
            mcGenerationTelemetry:
              entry.mcSession!.generationTelemetry ?? null,
            activeMcSavedSetId: id,
            questions: [],
            activeQuestionIndex: 0,
            writtenQuestionPresentedAtById: {},
            answersByQuestionId: {},
            imagesByQuestionId: {},
            feedbackByQuestionId: {},
            activeWrittenSavedSetId: null,
          }),
      });
    });
  },

  needsSaveBeforeLoad: (id) => {
    const s = get();
    return (
      (s.questionMode === 'written'
        ? s.questions.length > 0
        : s.mcQuestions.length > 0) &&
      (s.questionMode === 'written'
        ? s.activeWrittenSavedSetId !== id
        : s.activeMcSavedSetId !== id)
    );
  },
  deleteSavedSet: (id) => {
    set((s) => ({
      savedSets: s.savedSets.filter((e) => e.id !== id),
      activeWrittenSavedSetId:
        s.activeWrittenSavedSetId === id ? null : s.activeWrittenSavedSetId,
      activeMcSavedSetId:
        s.activeMcSavedSetId === id ? null : s.activeMcSavedSetId,
    }));
    void v3DeleteSavedSet(id);
  },
  deleteAllSavedSets: () => {
    set((s) => {
      s.savedSets.forEach((ss) => void v3DeleteSavedSet(ss.id));
      return {
        savedSets: [],
        activeWrittenSavedSetId: null,
        activeMcSavedSetId: null,
      };
    });
  },
  deleteQuestionHistoryEntry: (id) => {
    set((s) => ({
      questionHistory: s.questionHistory.filter((e) => e.id !== id),
    }));
    void v3DeleteQuestionHistoryEntry(id);
  },
  deleteMcHistoryEntry: (id) => {
    set((s) => ({ mcHistory: s.mcHistory.filter((e) => e.id !== id) }));
    void v3DeleteMcHistoryEntry(id);
  },
  addQuestionHistoryEntry: (entry) => {
    set((s) => ({ questionHistory: [entry, ...s.questionHistory] }));
    void v3SaveQuestionHistoryEntry(entry);
  },
  addMcHistoryEntry: (entry) => {
    set((s) => ({ mcHistory: [entry, ...s.mcHistory] }));
    void v3SaveMcHistoryEntry(entry);
  },
  updateQuestionHistoryEntry: (entry) => {
    set((s) => ({
      questionHistory: s.questionHistory.map((e) =>
        e.id === entry.id ? entry : e
      ),
    }));
    void v3SaveQuestionHistoryEntry(entry);
  },
  updateMcHistoryEntry: (entry) => {
    set((s) => ({
      mcHistory: s.mcHistory.map((e) => (e.id === entry.id ? entry : e)),
    }));
    void v3SaveMcHistoryEntry(entry);
  },
  clearQuestionHistory: () => {
    set((s) => {
      s.questionHistory.forEach((e) => void v3DeleteQuestionHistoryEntry(e.id));
      return { questionHistory: [] };
    });
  },
  clearMcHistory: () => {
    set((s) => {
      s.mcHistory.forEach((e) => void v3DeleteMcHistoryEntry(e.id));
      return { mcHistory: [] };
    });
  },

  reviewSpacedCard: (id, q) =>
    set((s) => {
      const card = s.spacedRepetitionCards[id]
        ? reviewCard(s.spacedRepetitionCards[id], q)
        : reviewCard(createCard(), q);
      return {
        spacedRepetitionCards: { ...s.spacedRepetitionCards, [id]: card },
      };
    }),
  getDueCards: () =>
    Object.entries(get().spacedRepetitionCards)
      .filter(([, c]) => isDue(c))
      .map(([id, c]) => ({ questionId: id, card: c }))
      .sort(
        (a, b) =>
          new Date(a.card.nextReviewDate).getTime() -
          new Date(b.card.nextReviewDate).getTime()
      ),

  setStudyGoals: (goals) =>
    set((s) => {
      const next = { ...s.studyGoals, ...goals };
      void updateStudyGoals(next, s.streakData);
      return { studyGoals: next };
    }),
  recordCompletion: (mode) => {
    const today = getTodayKey();
    set((s) => {
      const todayData = s.streakData.dailyCompletions[today] ?? {
        total: 0,
        written: 0,
        mc: 0,
      };
      const updatedDay = {
        total: todayData.total + 1,
        written: todayData.written + (mode === 'written' ? 1 : 0),
        mc: todayData.mc + (mode === 'multiple-choice' ? 1 : 0),
      };
      const nextStreakData = {
        ...s.streakData,
        currentStreak:
          todayData.total > 0
            ? s.streakData.currentStreak
            : s.streakData.currentStreak + 1,
        longestStreak: Math.max(
          s.streakData.longestStreak,
          s.streakData.currentStreak + 1
        ),
        lastActiveDate: today,
        dailyCompletions: {
          ...s.streakData.dailyCompletions,
          [today]: updatedDay,
        },
      };
      void updateStudyGoals(s.studyGoals, nextStreakData);
      return { streakData: nextStreakData };
    });
  },
  getTodayCompletions: () =>
    get().streakData.dailyCompletions[getTodayKey()] ?? {
      total: 0,
      written: 0,
      mc: 0,
    },

  importState: (imported) => {
    const s = get();
    const merged = mergeImportedState(s, imported);
    set(merged as Partial<AppState & AppActions>);
    void persistAndRehydrate(get());
  },
}));

export function buildPersistedSnapshot(s: AppState): PersistedAppState {
  return {
    version: EMPTY_PERSISTED_APP_STATE.version,
    settings: {
      apiKey: s.apiKey,
      model: s.model,
      markingModel: s.markingModel,
      useSeparateMarkingModel: s.useSeparateMarkingModel,
      imageMarkingModel: s.imageMarkingModel,
      useSeparateImageMarkingModel: s.useSeparateImageMarkingModel,
      debugMode: s.debugMode,
      questionTextSize: s.questionTextSize,
      responseTextSize: s.responseTextSize,
      includeExamContext: s.includeExamContext,
      autoSyncIntervalMinutes: s.autoSyncIntervalMinutes,
      syncApiKey: s.syncApiKey,
      localBackupFolderPath: s.localBackupFolderPath,
      localBackupIntervalMinutes: s.localBackupIntervalMinutes,
      theme: s.theme,
    },
    preferences: {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      questionCount: s.questionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      questionMode: s.questionMode,
      aiDifficultyScalingEnabled: s.aiDifficultyScalingEnabled,
      difficultyThresholds: s.difficultyThresholds,
      diversityStrictness: s.diversityStrictness,
      strictLatexValidation: s.strictLatexValidation,
      strictSubtopicCoverage: s.strictSubtopicCoverage,
      minSubtopicCoverageRatio: s.minSubtopicCoverageRatio,
      generationStrategy: s.generationStrategy,
    },
    writtenSession: {
      questions: s.questions,
      activeQuestionIndex: s.activeQuestionIndex,
      presentedAtByQuestionId: s.writtenQuestionPresentedAtById,
      answersByQuestionId: s.answersByQuestionId,
      imagesByQuestionId: s.imagesByQuestionId,
      feedbackByQuestionId: s.feedbackByQuestionId,
      rawModelOutput: s.writtenRawModelOutput,
      generationTelemetry: s.writtenGenerationTelemetry,
      savedSetId: s.activeWrittenSavedSetId,
    },
    mcSession: {
      questions: s.mcQuestions,
      activeQuestionIndex: s.activeMcQuestionIndex,
      presentedAtByQuestionId: s.mcQuestionPresentedAtById,
      answersByQuestionId: s.mcAnswersByQuestionId,
      rawModelOutput: s.mcRawModelOutput,
      generationTelemetry: s.mcGenerationTelemetry,
      savedSetId: s.activeMcSavedSetId,
    },
    writtenTimer: s.writtenTimer,
    mcTimer: s.mcTimer,
    questionHistory: s.questionHistory,
    mcHistory: s.mcHistory,
    savedSets: s.savedSets,
    spacedRepetition: s.spacedRepetitionCards,
    studyGoals: s.studyGoals,
    streakData: s.streakData,
    generationHistory: s.generationHistory,
    presets: s.presets,
  };
}

function mapSettings(s: PersistedAppState): Partial<AppState> {
  return {
    apiKey: s.settings.apiKey,
    model: s.settings.model,
    markingModel: s.settings.markingModel,
    useSeparateMarkingModel: Boolean(s.settings.useSeparateMarkingModel),
    imageMarkingModel: s.settings.imageMarkingModel,
    useSeparateImageMarkingModel: Boolean(
      s.settings.useSeparateImageMarkingModel
    ),
    debugMode: s.settings.debugMode,
    questionTextSize: s.settings.questionTextSize ?? 16,
    responseTextSize: s.settings.responseTextSize ?? 16,
    includeExamContext: Boolean(s.settings.includeExamContext),
    autoSyncIntervalMinutes: s.settings.autoSyncIntervalMinutes ?? 0,
    syncApiKey: Boolean(s.settings.syncApiKey),
    localBackupFolderPath: s.settings.localBackupFolderPath ?? '',
    localBackupIntervalMinutes: s.settings.localBackupIntervalMinutes ?? 0,
    theme: normalizeThemeName(s.settings.theme),
  };
}

function mapPreferences(s: PersistedAppState): Partial<AppState> {
  const p = s.preferences;
  return {
    selectedTopics: p.selectedTopics,
    difficulty: p.difficulty,
    techMode: p.techMode,
    avoidSimilarQuestions: p.avoidSimilarQuestions,
    mathMethodsSubtopics: p.mathMethodsSubtopics,
    specialistMathSubtopics: p.specialistMathSubtopics,
    chemistrySubtopics: p.chemistrySubtopics,
    physicalEducationSubtopics: p.physicalEducationSubtopics,
    questionCount: p.questionCount,
    averageMarksPerQuestion: p.averageMarksPerQuestion,
    questionMode: p.questionMode,
    aiDifficultyScalingEnabled: p.aiDifficultyScalingEnabled ?? true,
    diversityStrictness: p.diversityStrictness ?? 'moderate',
    strictLatexValidation: p.strictLatexValidation ?? true,
    strictSubtopicCoverage: p.strictSubtopicCoverage ?? true,
    minSubtopicCoverageRatio: p.minSubtopicCoverageRatio ?? 0.6,
    generationStrategy: p.generationStrategy ?? 'multi-pass',
    difficultyThresholds: p.difficultyThresholds ?? {
      increase: 85,
      decrease: 70,
    },
  };
}

function mapSessions(s: PersistedAppState): Partial<AppState> {
  const activeSavedSetIds = new Set(s.savedSets.map((entry) => entry.id));
  const writtenSavedSetId =
    s.writtenSession.savedSetId &&
      activeSavedSetIds.has(s.writtenSession.savedSetId)
      ? s.writtenSession.savedSetId
      : null;
  const mcSavedSetId =
    s.mcSession.savedSetId && activeSavedSetIds.has(s.mcSession.savedSetId)
      ? s.mcSession.savedSetId
      : null;

  return {
    questions: s.writtenSession.questions,
    activeQuestionIndex: s.writtenSession.activeQuestionIndex,
    writtenQuestionPresentedAtById: s.writtenSession.presentedAtByQuestionId,
    answersByQuestionId: s.writtenSession.answersByQuestionId,
    imagesByQuestionId: s.writtenSession.imagesByQuestionId,
    feedbackByQuestionId: s.writtenSession.feedbackByQuestionId,
    writtenRawModelOutput: s.writtenSession.rawModelOutput,
    writtenGenerationTelemetry: s.writtenSession.generationTelemetry ?? null,
    activeWrittenSavedSetId: writtenSavedSetId,
    mcQuestions: s.mcSession.questions,
    activeMcQuestionIndex: s.mcSession.activeQuestionIndex,
    mcQuestionPresentedAtById: s.mcSession.presentedAtByQuestionId,
    mcAnswersByQuestionId: s.mcSession.answersByQuestionId,
    mcRawModelOutput: s.mcSession.rawModelOutput,
    mcGenerationTelemetry: s.mcSession.generationTelemetry ?? null,
    activeMcSavedSetId: mcSavedSetId,
    writtenTimer: s.writtenTimer ?? null,
    mcTimer: s.mcTimer ?? null,
  };
}

function mapHistory(s: PersistedAppState): Partial<AppState> {
  const savedSets = s.savedSets.filter(
    (savedSet) => !isSavedSetComplete(savedSet)
  );

  return {
    questionHistory: s.questionHistory,
    mcHistory: s.mcHistory,
    savedSets,
    spacedRepetitionCards: s.spacedRepetition ?? {},
    studyGoals: s.studyGoals ?? defaultState.studyGoals,
    streakData: s.streakData ?? defaultState.streakData,
    generationHistory: s.generationHistory ?? [],
    presets: s.presets ?? [],
  };
}

export function snapshotToState(s: PersistedAppState): Partial<AppState> {
  return {
    ...mapSettings(s),
    ...mapPreferences(s),
    ...mapSessions(s),
    ...mapHistory(s),
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
useAppStore.subscribe((state) => {
  if (!state.isHydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void savePersistedAppState(
      buildPersistedSnapshot(useAppStore.getState())
    ).catch(console.error);
  }, 500);
});
