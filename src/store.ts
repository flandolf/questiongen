/**
 * store.ts — Zustand replacement for AppContext.tsx
 *
 * Drop this file into your project alongside the updated AppContext.tsx.
 * All public hook APIs (useAppContext, useAppPreferences, useAppSettings,
 * useWrittenSession, useMultipleChoiceSession, useSavedSets) are preserved
 * so every consumer file is unchanged.
 */

import { startTransition } from 'react';
import { create } from 'zustand';

import type { DeletionTombstones } from '@/context/modules/deletion-tombstones';
import {
  addTombstone,
  EMPTY_TOMBSTONES,
} from '@/context/modules/deletion-tombstones';
import type { SyncableData } from '@/context/modules/useFirebase';
import {
  auth,
  deleteMcHistoryItems,
  deletePresets,
  deleteQuestionHistoryItems,
  deleteSavedSets,
  saveUserData,
  upsertMcHistoryItems,
  upsertPresets,
  upsertQuestionHistoryItems,
  upsertSavedSets,
} from '@/context/modules/useFirebase';
import { mergeImportedState, persistAndRehydrate } from '@/lib/import-export';
import {
  EMPTY_PERSISTED_APP_STATE,
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
  GenerationTelemetry,
  MarkAnswerResponse,
  MathMethodsSubtopic,
  McHistoryEntry,
  McQuestion,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedTimerState,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  const leadTopic = topics[0] ?? 'Mixed Topics';
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === 'written' ? 'Written' : 'Multiple Choice';
  return extraCount === 0
    ? `${leadTopic} ${modeLabel}`
    : `${leadTopic} +${extraCount} ${modeLabel}`;
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

  // ── Timer state (survives navigation) ──────────────────────────
  writtenTimerState: PersistedTimerState | null;
  mcTimerState: PersistedTimerState | null;

  // ── Deletion tombstones (tracks local deletes pending cloud sync) ─
  deletionTombstones: DeletionTombstones;
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

  // Timer state
  setWrittenTimerState: (state: PersistedTimerState | null) => void;
  setMcTimerState: (state: PersistedTimerState | null) => void;

  // Deletion tombstones
  setDeletionTombstones: (tombstones: DeletionTombstones) => void;

  // Import / Export
  importState: (imported: PersistedAppState) => void;
}

// ─── Default state ────────────────────────────────────────────────────────────

const defaultState: AppState = {
  isHydrated: false,

  // Settings — pulled from the empty persisted state default
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  showApiKey: false,
  model: EMPTY_PERSISTED_APP_STATE.settings.model,
  markingModel: EMPTY_PERSISTED_APP_STATE.settings.markingModel,
  useSeparateMarkingModel:
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel,
  imageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.imageMarkingModel,
  useSeparateImageMarkingModel:
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateImageMarkingModel,
  debugMode: EMPTY_PERSISTED_APP_STATE.settings.debugMode,
  questionTextSize: EMPTY_PERSISTED_APP_STATE.settings.questionTextSize ?? 16,
  responseTextSize: EMPTY_PERSISTED_APP_STATE.settings.responseTextSize ?? 16,
  includeExamContext:
    EMPTY_PERSISTED_APP_STATE.settings.includeExamContext ?? false,
  autoSyncIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.autoSyncIntervalMinutes ?? 0,
  syncApiKey: Boolean(EMPTY_PERSISTED_APP_STATE.settings.syncApiKey),
  localBackupFolderPath:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupFolderPath ?? '',
  localBackupIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupIntervalMinutes ?? 0,

  // Preferences
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

  // AI Difficulty Scaling
  aiDifficultyScalingEnabled: true,
  difficultyThresholds: { increase: 85, decrease: 70 },

  // Written session
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

  // MC session
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

  // Saved sets
  savedSets: EMPTY_PERSISTED_APP_STATE.savedSets,

  // Status
  isGenerating: false,
  generationStatus: null,
  generationStartedAt: null,
  isMarking: false,
  errorMessage: null,

  // Spaced repetition
  spacedRepetitionCards: {},

  // Study goals & streaks
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
  writtenTimerState: null,
  mcTimerState: null,
  deletionTombstones: { ...EMPTY_TOMBSTONES },
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

  // ── Hydration ──────────────────────────────────────────────────────────────

  // eslint-disable-next-line complexity
  hydrate: async () => {
    try {
      const persisted = await loadPersistedAppState();
      const s = persisted;
      set({
        // Settings
        apiKey: s.settings.apiKey,
        model: s.settings.model,
        markingModel: s.settings.markingModel,
        useSeparateMarkingModel: Boolean(s.settings.useSeparateMarkingModel),
        imageMarkingModel: s.settings.imageMarkingModel,
        useSeparateImageMarkingModel: Boolean(
          s.settings.useSeparateImageMarkingModel
        ),
        debugMode: s.settings.debugMode,
        questionTextSize:
          typeof s.settings.questionTextSize === 'number'
            ? s.settings.questionTextSize
            : 16,
        responseTextSize:
          typeof s.settings.responseTextSize === 'number'
            ? s.settings.responseTextSize
            : 16,
        includeExamContext: Boolean(s.settings.includeExamContext),
        autoSyncIntervalMinutes:
          typeof s.settings.autoSyncIntervalMinutes === 'number'
            ? s.settings.autoSyncIntervalMinutes
            : 0,
        syncApiKey: Boolean(s.settings.syncApiKey),
        localBackupFolderPath:
          typeof s.settings.localBackupFolderPath === 'string'
            ? s.settings.localBackupFolderPath
            : '',
        localBackupIntervalMinutes:
          typeof s.settings.localBackupIntervalMinutes === 'number' &&
          s.settings.localBackupIntervalMinutes >= 0
            ? s.settings.localBackupIntervalMinutes
            : 0,

        // Preferences
        selectedTopics: s.preferences.selectedTopics,
        difficulty: s.preferences.difficulty,
        techMode: s.preferences.techMode,
        avoidSimilarQuestions: s.preferences.avoidSimilarQuestions,
        mathMethodsSubtopics: s.preferences.mathMethodsSubtopics,
        specialistMathSubtopics: s.preferences.specialistMathSubtopics,
        chemistrySubtopics: s.preferences.chemistrySubtopics,
        physicalEducationSubtopics: s.preferences.physicalEducationSubtopics,
        questionCount: s.preferences.questionCount,
        averageMarksPerQuestion: s.preferences.averageMarksPerQuestion,
        questionMode: s.preferences.questionMode,
        aiDifficultyScalingEnabled:
          s.preferences.aiDifficultyScalingEnabled ?? true,
        difficultyThresholds: s.preferences.difficultyThresholds ?? {
          increase: 85,
          decrease: 70,
        },

        // Written session
        questions: s.writtenSession.questions,
        activeQuestionIndex: s.writtenSession.activeQuestionIndex,
        writtenQuestionPresentedAtById:
          s.writtenSession.presentedAtByQuestionId,
        answersByQuestionId: s.writtenSession.answersByQuestionId,
        imagesByQuestionId: s.writtenSession.imagesByQuestionId,
        feedbackByQuestionId: s.writtenSession.feedbackByQuestionId,
        writtenRawModelOutput: s.writtenSession.rawModelOutput,
        writtenGenerationTelemetry:
          s.writtenSession.generationTelemetry ?? null,
        activeWrittenSavedSetId: s.writtenSession.savedSetId ?? null,

        // MC session
        mcQuestions: s.mcSession.questions,
        activeMcQuestionIndex: s.mcSession.activeQuestionIndex,
        mcQuestionPresentedAtById: s.mcSession.presentedAtByQuestionId,
        mcAnswersByQuestionId: s.mcSession.answersByQuestionId,
        mcRawModelOutput: s.mcSession.rawModelOutput,
        mcGenerationTelemetry: s.mcSession.generationTelemetry ?? null,
        activeMcSavedSetId: s.mcSession.savedSetId ?? null,

        // History + saved sets
        questionHistory: s.questionHistory,
        mcHistory: s.mcHistory,
        savedSets: s.savedSets,

        // Spaced repetition
        spacedRepetitionCards: s.spacedRepetition ?? {},

        // Study goals & streaks
        studyGoals: s.studyGoals ?? defaultState.studyGoals,
        streakData: s.streakData ?? defaultState.streakData,

        isHydrated: true,
        generationHistory: s.generationHistory ?? [],
        presets: s.presets ?? [],
        writtenTimerState: s.writtenTimerState ?? null,
        mcTimerState: s.mcTimerState ?? null,
        deletionTombstones: (s as Record<string, unknown>).deletionTombstones
          ? ((s as Record<string, unknown>)
              .deletionTombstones as DeletionTombstones)
          : { ...EMPTY_TOMBSTONES },
      });
    } catch {
      console.error('Hydration failed');
      set({ errorMessage: 'Could not load saved app data.', isHydrated: true });
    }
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  addGenerationRecord: (record) =>
    set((s) => ({
      generationHistory: [record, ...s.generationHistory].slice(0, 1000),
    })),

  // Timer state
  setWrittenTimerState: (writtenTimerState) => set({ writtenTimerState }),
  setMcTimerState: (mcTimerState) => set({ mcTimerState }),

  // Deletion tombstones
  setDeletionTombstones: (deletionTombstones) => set({ deletionTombstones }),

  setApiKey: (key) => set({ apiKey: key }),
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
  clearApiKey: () => set({ apiKey: '' }),

  // ── Preset management (Firebase-synced) ──────────────────────────────────
  setPresets: (presets) => set({ presets }),
  addPreset: (preset) => set((s) => ({ presets: [preset, ...s.presets] })),
  updatePreset: (preset) =>
    set((s) => ({
      presets: s.presets.map((p) => (p.id === preset.id ? preset : p)),
    })),
  deletePreset: (id) =>
    set((s) => ({
      presets: s.presets.filter((p) => p.id !== id),
      deletionTombstones: addTombstone(s.deletionTombstones, 'presets', id),
    })),

  // ── Preferences ────────────────────────────────────────────────────────────

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

  // ── AI Difficulty Scaling ──────────────────────────────────────────────────
  setAiDifficultyScalingEnabled: (enabled) =>
    set({ aiDifficultyScalingEnabled: enabled }),
  setDifficultyThresholds: (thresholds) =>
    set({ difficultyThresholds: thresholds }),

  // ── Written session ────────────────────────────────────────────────────────

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
    set((s) => ({
      questionHistory: resolve(update, s.questionHistory),
    })),
  setWrittenRawModelOutput: (writtenRawModelOutput) =>
    set({ writtenRawModelOutput }),
  setWrittenGenerationTelemetry: (writtenGenerationTelemetry) =>
    set({ writtenGenerationTelemetry }),
  setActiveWrittenSavedSetId: (activeWrittenSavedSetId) =>
    set({ activeWrittenSavedSetId }),

  // ── MC session ─────────────────────────────────────────────────────────────

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

  // ── Status ─────────────────────────────────────────────────────────────────

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setGenerationStartedAt: (generationStartedAt) => set({ generationStartedAt }),
  setIsMarking: (isMarking) => set({ isMarking }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  // ── Saved sets ─────────────────────────────────────────────────────────────

  saveCurrentSet: () => {
    const s = get();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    if (s.questionMode === 'written') {
      if (s.questions.length === 0) return null;

      const savedSetId =
        s.activeWrittenSavedSetId ?? `saved-written-${crypto.randomUUID()}`;
      const existing = s.savedSets.find((e) => e.id === savedSetId);

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
        createdAt: existing?.createdAt ?? now,
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

      // Attempt immediate upload of the saved set to Firestore; failures will be queued
      try {
        const op: LiveRetryOp = {
          id: savedSetId,
          collection: 'savedSets',
          op: 'upsert',
          payload: nextEntry,
          attempts: 0,
          nextAttemptAt: Date.now(),
        };
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog(
              'info',
              `[LIVE] upsert savedSets/${op.id} immediate success`
            )
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert savedSets/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          id: savedSetId,
          collection: 'savedSets',
          op: 'upsert',
          payload: nextEntry,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }

      // Immediate persist for explicit save
      const persistedSnapshot = buildPersistedSnapshot(
        {
          ...s,
          savedSets: nextSavedSets,
        },
        { preserveImages: true }
      );
      void savePersistedAppState(persistedSnapshot).catch(() =>
        set((cur) => ({
          errorMessage: cur.errorMessage ?? 'Could not save app data.',
        }))
      );

      return savedSetId;
    }

    // Multiple choice
    if (s.mcQuestions.length === 0) return null;

    const savedSetId =
      s.activeMcSavedSetId ?? `saved-mc-${crypto.randomUUID()}`;
    const existing = s.savedSets.find((e) => e.id === savedSetId);

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
      createdAt: existing?.createdAt ?? now,
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

    const persistedSnapshot = buildPersistedSnapshot(
      {
        ...s,
        savedSets: nextSavedSets,
      },
      { preserveImages: true }
    );
    void savePersistedAppState(persistedSnapshot).catch(() =>
      set((cur) => ({
        errorMessage: cur.errorMessage ?? 'Could not save app data.',
      }))
    );

    return savedSetId;
  },

  loadSavedSet: (savedSetId) => {
    const entry = get().savedSets.find((c) => c.id === savedSetId);
    if (!entry) return;

    // Reset updatedAt timestamp on load so it moves to top of "Last saved" sort
    const now = new Date().toISOString();

    // Timer state: resume from saved session start time
    let generationStartedAt: number | null = null;
    if (entry.questionMode === 'written' && entry.writtenSession) {
      const presented = entry.writtenSession.presentedAtByQuestionId;
      generationStartedAt =
        presented && Object.values(presented).length > 0
          ? Math.min(...Object.values(presented))
          : Date.now();
    } else if (entry.questionMode === 'multiple-choice' && entry.mcSession) {
      const presented = entry.mcSession.presentedAtByQuestionId;
      generationStartedAt =
        presented && Object.values(presented).length > 0
          ? Math.min(...Object.values(presented))
          : Date.now();
    }

    // Update the saved set's updatedAt in the store for persistence
    const updatedSets = get().savedSets.map((ss) =>
      ss.id === savedSetId ? { ...ss, updatedAt: now } : ss
    );

    startTransition(() => {
      set({
        savedSets: updatedSets,
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
        ...(entry.questionMode === 'written' && entry.writtenSession
          ? {
              questions: entry.writtenSession.questions,
              activeQuestionIndex: entry.writtenSession.activeQuestionIndex,
              writtenQuestionPresentedAtById:
                entry.writtenSession.presentedAtByQuestionId,
              answersByQuestionId: entry.writtenSession.answersByQuestionId,
              imagesByQuestionId: entry.writtenSession.imagesByQuestionId,
              feedbackByQuestionId: entry.writtenSession.feedbackByQuestionId,
              writtenRawModelOutput: entry.writtenSession.rawModelOutput,
              writtenGenerationTelemetry:
                entry.writtenSession.generationTelemetry ?? null,
              activeWrittenSavedSetId: entry.id,
              // Clear opposite mode's session
              mcQuestions: [],
              activeMcQuestionIndex: 0,
              mcQuestionPresentedAtById: {},
              mcAnswersByQuestionId: {},
              mcHistory: [],
              mcRawModelOutput: '',
              mcGenerationTelemetry: null,
              activeMcSavedSetId: null,
            }
          : {}),
        ...(entry.questionMode === 'multiple-choice' && entry.mcSession
          ? {
              mcQuestions: entry.mcSession.questions,
              activeMcQuestionIndex: entry.mcSession.activeQuestionIndex,
              mcQuestionPresentedAtById:
                entry.mcSession.presentedAtByQuestionId,
              mcAnswersByQuestionId: entry.mcSession.answersByQuestionId,
              mcRawModelOutput: entry.mcSession.rawModelOutput,
              mcGenerationTelemetry:
                entry.mcSession.generationTelemetry ?? null,
              activeMcSavedSetId: entry.id,
              // Clear opposite mode's session
              questions: [],
              activeQuestionIndex: 0,
              writtenQuestionPresentedAtById: {},
              answersByQuestionId: {},
              imagesByQuestionId: {},
              feedbackByQuestionId: {},
              writtenRawModelOutput: '',
              writtenGenerationTelemetry: null,
              activeWrittenSavedSetId: null,
            }
          : {}),
        generationStartedAt,
      });
    });
  },

  needsSaveBeforeLoad: (savedSetId) => {
    const s = get();
    const entry = s.savedSets.find((c) => c.id === savedSetId);
    if (!entry) return false;
    const hasUnsaved =
      (s.questionMode === 'written'
        ? s.questions.length > 0
        : s.mcQuestions.length > 0) &&
      !(
        entry.id ===
        (s.questionMode === 'written'
          ? s.activeWrittenSavedSetId
          : s.activeMcSavedSetId)
      );
    return hasUnsaved;
  },

  deleteSavedSet: (savedSetId) => {
    set((s) => ({
      savedSets: s.savedSets.filter((e) => e.id !== savedSetId),
      activeWrittenSavedSetId:
        s.activeWrittenSavedSetId === savedSetId
          ? null
          : s.activeWrittenSavedSetId,
      activeMcSavedSetId:
        s.activeMcSavedSetId === savedSetId ? null : s.activeMcSavedSetId,
      deletionTombstones: addTombstone(
        s.deletionTombstones,
        'savedSets',
        savedSetId
      ),
    }));

    // Attempt an immediate live-delete; if it fails enqueue for retry
    try {
      const op: LiveRetryOp = {
        id: savedSetId,
        collection: 'savedSets',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      void tryPerformOpOnce(op)
        .then(() => {
          appendLiveLog(
            'info',
            `[LIVE] delete savedSets/${op.id} immediate success`
          );
        })
        .catch((err) => {
          appendLiveLog(
            'warn',
            `[LIVE] delete savedSets/${op.id} immediate failed, queued: ${String(err)}`
          );
          enqueueLiveRetryOp({
            ...op,
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
          void processLiveRetryQueue();
        });
    } catch {
      enqueueLiveRetryOp({
        id: savedSetId,
        collection: 'savedSets',
        op: 'delete',
        attempts: 1,
        nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
      });
    }
  },

  deleteAllSavedSets: () => {
    set((s) => {
      let tombstones = s.deletionTombstones;
      for (const ss of s.savedSets) {
        tombstones = addTombstone(tombstones, 'savedSets', ss.id);
      }
      const ids = s.savedSets.map((x) => x.id);
      // Fire off immediate delete attempts for all sets; failures will be queued
      for (const id of ids) {
        try {
          const op: LiveRetryOp = {
            id,
            collection: 'savedSets',
            op: 'delete',
            attempts: 0,
            nextAttemptAt: Date.now(),
          };
          void tryPerformOpOnce(op)
            .then(() =>
              appendLiveLog(
                'info',
                `[LIVE] delete savedSets/${op.id} immediate success`
              )
            )
            .catch((err) => {
              appendLiveLog(
                'warn',
                `[LIVE] delete savedSets/${op.id} immediate failed, queued: ${String(err)}`
              );
              enqueueLiveRetryOp({
                ...op,
                attempts: 1,
                nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
              });
              void processLiveRetryQueue();
            });
        } catch {
          enqueueLiveRetryOp({
            id,
            collection: 'savedSets',
            op: 'delete',
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
        }
      }

      return {
        savedSets: [],
        activeWrittenSavedSetId: null,
        activeMcSavedSetId: null,
        deletionTombstones: tombstones,
      };
    });
  },

  deleteQuestionHistoryEntry: (id) => {
    set((s) => ({
      questionHistory: s.questionHistory.filter((e) => e.id !== id),
      deletionTombstones: addTombstone(
        s.deletionTombstones,
        'questionHistory',
        id
      ),
    }));

    try {
      const op: LiveRetryOp = {
        id,
        collection: 'questionHistory',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      void tryPerformOpOnce(op)
        .then(() =>
          appendLiveLog(
            'info',
            `[LIVE] delete questionHistory/${op.id} immediate success`
          )
        )
        .catch((err) => {
          appendLiveLog(
            'warn',
            `[LIVE] delete questionHistory/${op.id} immediate failed, queued: ${String(err)}`
          );
          enqueueLiveRetryOp({
            ...op,
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
          void processLiveRetryQueue();
        });
    } catch {
      enqueueLiveRetryOp({
        id,
        collection: 'questionHistory',
        op: 'delete',
        attempts: 1,
        nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
      });
    }
  },

  deleteMcHistoryEntry: (id) => {
    set((s) => ({
      mcHistory: s.mcHistory.filter((e) => e.id !== id),
      deletionTombstones: addTombstone(s.deletionTombstones, 'mcHistory', id),
    }));

    try {
      const op: LiveRetryOp = {
        id,
        collection: 'mcHistory',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      void tryPerformOpOnce(op)
        .then(() =>
          appendLiveLog(
            'info',
            `[LIVE] delete mcHistory/${op.id} immediate success`
          )
        )
        .catch((err) => {
          appendLiveLog(
            'warn',
            `[LIVE] delete mcHistory/${op.id} immediate failed, queued: ${String(err)}`
          );
          enqueueLiveRetryOp({
            ...op,
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
          void processLiveRetryQueue();
        });
    } catch {
      enqueueLiveRetryOp({
        id,
        collection: 'mcHistory',
        op: 'delete',
        attempts: 1,
        nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
      });
    }
  },

  clearQuestionHistory: () => {
    set((s) => {
      let tombstones = s.deletionTombstones;
      for (const entry of s.questionHistory) {
        tombstones = addTombstone(tombstones, 'questionHistory', entry.id);
      }
      const ids = s.questionHistory.map((e) => e.id);
      for (const id of ids) {
        try {
          const op: LiveRetryOp = {
            id,
            collection: 'questionHistory',
            op: 'delete',
            attempts: 0,
            nextAttemptAt: Date.now(),
          };
          void tryPerformOpOnce(op)
            .then(() =>
              appendLiveLog(
                'info',
                `[LIVE] delete questionHistory/${op.id} immediate success`
              )
            )
            .catch((err) => {
              appendLiveLog(
                'warn',
                `[LIVE] delete questionHistory/${op.id} immediate failed, queued: ${String(err)}`
              );
              enqueueLiveRetryOp({
                ...op,
                attempts: 1,
                nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
              });
              void processLiveRetryQueue();
            });
        } catch {
          enqueueLiveRetryOp({
            id,
            collection: 'questionHistory',
            op: 'delete',
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
        }
      }

      return { questionHistory: [], deletionTombstones: tombstones };
    });
  },

  clearMcHistory: () => {
    set((s) => {
      let tombstones = s.deletionTombstones;
      for (const entry of s.mcHistory) {
        tombstones = addTombstone(tombstones, 'mcHistory', entry.id);
      }
      const ids = s.mcHistory.map((e) => e.id);
      for (const id of ids) {
        try {
          const op: LiveRetryOp = {
            id,
            collection: 'mcHistory',
            op: 'delete',
            attempts: 0,
            nextAttemptAt: Date.now(),
          };
          void tryPerformOpOnce(op)
            .then(() =>
              appendLiveLog(
                'info',
                `[LIVE] delete mcHistory/${op.id} immediate success`
              )
            )
            .catch((err) => {
              appendLiveLog(
                'warn',
                `[LIVE] delete mcHistory/${op.id} immediate failed, queued: ${String(err)}`
              );
              enqueueLiveRetryOp({
                ...op,
                attempts: 1,
                nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
              });
              void processLiveRetryQueue();
            });
        } catch {
          enqueueLiveRetryOp({
            id,
            collection: 'mcHistory',
            op: 'delete',
            attempts: 1,
            nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
          });
        }
      }

      return { mcHistory: [], deletionTombstones: tombstones };
    });
  },

  // ── Spaced repetition ─────────────────────────────────────────────────────

  reviewSpacedCard: (questionId, quality) => {
    set((s) => {
      const existing = s.spacedRepetitionCards[questionId];
      const updated = existing
        ? reviewCard(existing, quality)
        : reviewCard(createCard(), quality);
      return {
        spacedRepetitionCards: {
          ...s.spacedRepetitionCards,
          [questionId]: updated,
        },
      };
    });
  },

  getDueCards: () => {
    const cards = get().spacedRepetitionCards;
    return Object.entries(cards)
      .filter(([, card]) => isDue(card))
      .map(([questionId, card]) => ({ questionId, card }))
      .sort(
        (a, b) =>
          new Date(a.card.nextReviewDate).getTime() -
          new Date(b.card.nextReviewDate).getTime()
      );
  },

  // ── Study goals & streaks ─────────────────────────────────────────────────

  setStudyGoals: (goals) => {
    set((s) => ({ studyGoals: { ...s.studyGoals, ...goals } }));
  },

  recordCompletion: (mode) => {
    const today = getTodayKey(); // YYYY-MM-DD (local time)
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

      // Calculate streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      const hadYesterday =
        s.streakData.dailyCompletions[yesterdayKey]?.total > 0;
      const hadToday = todayData.total > 0;

      let newStreak = s.streakData.currentStreak;
      if (!hadToday) {
        // First completion today
        newStreak = hadYesterday ? s.streakData.currentStreak + 1 : 1;
      }

      return {
        streakData: {
          ...s.streakData,
          currentStreak: newStreak,
          longestStreak: Math.max(s.streakData.longestStreak, newStreak),
          lastActiveDate: today,
          dailyCompletions: {
            ...s.streakData.dailyCompletions,
            [today]: updatedDay,
          },
        },
      };
    });
  },

  getTodayCompletions: () => {
    const today = getTodayKey(); // YYYY-MM-DD (local time)
    return (
      get().streakData.dailyCompletions[today] ?? {
        total: 0,
        written: 0,
        mc: 0,
      }
    );
  },

  // ── Import / Export ──────────────────────────────────────────────────────

  importState: (imported) => {
    const s = get();
    const merged = mergeImportedState(s, imported);
    set(merged as Partial<AppState>);
    // Persist immediately so the UI reflects the merged state
    void persistAndRehydrate(get()).catch(() =>
      set((cur) => ({
        errorMessage: cur.errorMessage ?? 'Could not save imported data.',
      }))
    );
  },
}));

// ─── Persistence snapshot builder ────────────────────────────────────────────

function buildPersistedSnapshot(
  s: AppState,
  options?: { preserveImages?: boolean }
): PersistedAppState {
  const preserveImages = options?.preserveImages ?? false;
  // Strip base64 dataUrls from images to reduce serialized payload size.
  // Images for the active session are kept in the store (in-memory) for marking;
  // only names are persisted so the UI can show which images were uploaded.
  const strippedImages: Record<
    string,
    { name: string; dataUrl: string } | undefined
  > = {};
  for (const [key, img] of Object.entries(s.imagesByQuestionId)) {
    if (img) {
      strippedImages[key] = {
        name: img.name,
        dataUrl: preserveImages ? img.dataUrl : '',
      };
    }
  }

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
    },
    writtenSession: {
      questions: s.questions,
      activeQuestionIndex: s.activeQuestionIndex,
      presentedAtByQuestionId: s.writtenQuestionPresentedAtById,
      answersByQuestionId: s.answersByQuestionId,
      imagesByQuestionId: strippedImages,
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
    writtenTimerState: s.writtenTimerState,
    mcTimerState: s.mcTimerState,
    questionHistory: s.questionHistory.map((entry) =>
      entry.uploadedAnswerImage
        ? {
            ...entry,
            uploadedAnswerImage: {
              name: entry.uploadedAnswerImage.name,
              dataUrl: '',
            },
          }
        : entry
    ),
    mcHistory: s.mcHistory,
    savedSets: s.savedSets,
    spacedRepetition: s.spacedRepetitionCards,
    studyGoals: s.studyGoals,
    streakData: s.streakData,
    generationHistory: s.generationHistory,
    presets: s.presets,
    deletionTombstones: s.deletionTombstones as unknown as Record<
      string,
      Record<string, number>
    >,
  };
}

// ─── Auto-persist on state changes (debounced) ───────────────────────────────
//
// Subscribe outside of React so this runs regardless of which component
// triggered the change. The debounce prevents hammering the file system
// on rapid keystrokes (e.g. answer textarea).

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydratedOnce = false;
export let suppressPersistUntil = 0;

export function setSuppressPersistUntil(ms: number): void {
  suppressPersistUntil = ms;
}

useAppStore.subscribe((state) => {
  // Don't persist before the initial hydration is complete — that would
  // overwrite the persisted file with empty defaults.
  if (!state.isHydrated) return;

  // During Firebase sync merges we suppress immediate writes, but we still
  // schedule one deferred persist so merged cloud data survives app restart.
  if (Date.now() < suppressPersistUntil) {
    if (persistTimer) clearTimeout(persistTimer);
    const delay = Math.max(50, suppressPersistUntil - Date.now() + 50);
    persistTimer = setTimeout(() => {
      if (!hydratedOnce) return;
      if (Date.now() < suppressPersistUntil) return;
      const snapshot = buildPersistedSnapshot(useAppStore.getState());
      void savePersistedAppState(snapshot).catch(() => {
        useAppStore.setState((cur) => ({
          errorMessage: cur.errorMessage ?? 'Could not save app data.',
        }));
      });
    }, delay);
    return;
  }

  // Mark that we've seen at least one post-hydration update.
  hydratedOnce = true;

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!hydratedOnce) return;
    if (Date.now() < suppressPersistUntil) return;
    const snapshot = buildPersistedSnapshot(useAppStore.getState());
    void savePersistedAppState(snapshot).catch(() => {
      useAppStore.setState((cur) => ({
        errorMessage: cur.errorMessage ?? 'Could not save app data.',
      }));
    });
  }, 500);
});

// ─── Live immediate-write sync + retry queue ─────────────────────────────────
// This implements immediate per-item upsert/delete attempts when local state
// changes, and falls back to a persistent retry queue for transient failures.

const LIVE_RETRY_QUEUE_KEY = 'firebase_live_retry_queue_v1';
const LIVE_IMMEDIATE_LOGS_KEY = 'firebase_live_immediate_logs_v1';

// Retry/backoff tuning — adjustable
const LIVE_RETRY_BASE_DELAY_MS = 2000; // base delay
const LIVE_RETRY_MAX_DELAY_MS = 60000; // max backoff
const LIVE_RETRY_MAX_ATTEMPTS = 6; // attempts before final failure

type LiveCollection =
  | 'questionHistory'
  | 'mcHistory'
  | 'savedSets'
  | 'presets'
  | 'generationHistory';

type LiveOp = 'upsert' | 'delete';

interface LiveRetryOp {
  id: string; // document id (for deletes) or item id (for upserts)
  collection: LiveCollection;
  op: LiveOp;
  payload?: unknown; // for upserts
  attempts: number;
  nextAttemptAt: number; // epoch ms
}

interface LiveLogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

function loadLiveRetryQueue(): LiveRetryOp[] {
  try {
    const raw = localStorage.getItem(LIVE_RETRY_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LiveRetryOp[];
  } catch {
    console.warn('[LiveSync] Could not parse retry queue');
    return [];
  }
}

function saveLiveRetryQueue(queue: LiveRetryOp[]) {
  try {
    localStorage.setItem(LIVE_RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    console.warn('[LiveSync] Could not save retry queue');
  }
}

function appendLiveLog(level: LiveLogEntry['level'], message: string) {
  try {
    const raw = localStorage.getItem(LIVE_IMMEDIATE_LOGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const arr: LiveLogEntry[] = Array.isArray(parsed)
      ? (parsed as LiveLogEntry[])
      : [];
    arr.unshift({ ts: Date.now(), level, message });
    // keep recent
    localStorage.setItem(
      LIVE_IMMEDIATE_LOGS_KEY,
      JSON.stringify(arr.slice(0, 200))
    );
  } catch {
    console.warn('[LiveSync] Could not append log');
  }
}

function enqueueLiveRetryOp(op: LiveRetryOp) {
  const queue = loadLiveRetryQueue();
  queue.push(op);
  saveLiveRetryQueue(queue);
}

async function tryPerformOpOnce(op: LiveRetryOp): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');

  try {
    switch (op.collection) {
      case 'questionHistory':
        if (op.op === 'upsert') {
          await upsertQuestionHistoryItems(user.uid, [
            op.payload as Record<string, unknown>,
          ]);
        } else {
          await deleteQuestionHistoryItems(user.uid, [op.id]);
        }
        break;
      case 'mcHistory':
        if (op.op === 'upsert') {
          await upsertMcHistoryItems(user.uid, [
            op.payload as Record<string, unknown>,
          ]);
        } else {
          await deleteMcHistoryItems(user.uid, [op.id]);
        }
        break;
      case 'savedSets':
        if (op.op === 'upsert') {
          await upsertSavedSets(user.uid, [
            op.payload as Record<string, unknown>,
          ]);
        } else {
          await deleteSavedSets(user.uid, [op.id]);
        }
        break;
      case 'presets':
        if (op.op === 'upsert') {
          const presetsPayload = Array.isArray(op.payload) ? op.payload : [];
          await upsertPresets(user.uid, presetsPayload as Preset[]);
        } else {
          await deletePresets(user.uid, [op.id]);
        }
        break;
      case 'generationHistory':
        // generationHistory doesn't have per-item helpers; save user data merge
        if (op.op === 'upsert') {
          // attempt to append the single record via saveUserData (merge)
          const payload = op.payload as GenerationRecord | undefined;
          if (payload) {
            await saveUserData(user.uid, {
              generationHistory: [payload],
            } as unknown as SyncableData);
          }
        } else {
          // for deletes we'll fall back to tombstones / full sync — enqueue and let coalesced sync handle deletes
          throw new Error(
            'Delete for generationHistory not supported via immediate live-sync'
          );
        }
        break;
      default:
        throw new Error('Unsupported collection');
    }

    return true;
  } catch {
    // rethrow so caller handles enqueue/increment
    throw new Error('Operation failed');
  }
}

let liveRetryProcessorRunning = false;

export async function processLiveRetryQueue(): Promise<void> {
  if (liveRetryProcessorRunning) return;
  liveRetryProcessorRunning = true;
  try {
    let queue = loadLiveRetryQueue();
    if (!queue || queue.length === 0) return;

    queue = queue.sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
    for (const item of [...queue]) {
      if (item.nextAttemptAt > Date.now()) break;
      let lastError: Error | null = null;
      try {
        await tryPerformOpOnce(item);
        appendLiveLog(
          'info',
          `[LIVE] Retried ${item.op} ${item.collection}/${item.id} succeeded`
        );
        // remove from queue
        const idx = queue.findIndex((q) => q === item);
        if (idx >= 0) queue.splice(idx, 1);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        item.attempts = (item.attempts || 0) + 1;
        if (item.attempts >= LIVE_RETRY_MAX_ATTEMPTS) {
          appendLiveLog(
            'error',
            `[LIVE] ${item.op} ${item.collection}/${item.id} failed permanently after ${item.attempts} attempts: ${lastError.message}`
          );
          // drop
          const idx = queue.findIndex((q) => q === item);
          if (idx >= 0) queue.splice(idx, 1);
        } else {
          const jitter = Math.random() * 500;
          const delay = Math.min(
            LIVE_RETRY_BASE_DELAY_MS * Math.pow(2, item.attempts - 1) + jitter,
            LIVE_RETRY_MAX_DELAY_MS
          );
          item.nextAttemptAt = Date.now() + Math.round(delay);
          appendLiveLog(
            'warn',
            `[LIVE] ${item.op} ${item.collection}/${item.id} retry #${item.attempts}, next attempt in ${Math.round(delay)}ms`
          );
        }
      }
    }

    saveLiveRetryQueue(queue);
  } finally {
    liveRetryProcessorRunning = false;
  }
}

// kick the processor when we come back online
window.addEventListener('online', () => void processLiveRetryQueue());

// expose quick flush for UI
declare global {
  interface Window {
    __processLiveRetryQueue?: () => Promise<void>;
  }
}
window.__processLiveRetryQueue = processLiveRetryQueue;

// last-known snapshot for diffing
let _lastLiveState = useAppStore.getState();

function isLiveSyncEnabled(userId: string): boolean {
  try {
    const userScoped = localStorage.getItem(
      `firebase_sync_enabled_v2:${userId}`
    );
    if (userScoped !== null) return userScoped === 'true';
    const legacy = localStorage.getItem('firebase_sync_enabled');
    if (legacy === null) return true;
    return legacy === 'true';
  } catch {
    return true;
  }
}

// eslint-disable-next-line complexity
useAppStore.subscribe((state) => {
  try {
    // Only attempt immediate live writes when hydrated, sync enabled, online and signed in
    if (!state.isHydrated) {
      _lastLiveState = state;
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      _lastLiveState = state;
      return;
    }
    if (!isLiveSyncEnabled(user.uid)) {
      _lastLiveState = state;
      return;
    }
    if (!navigator.onLine) {
      _lastLiveState = state;
      return;
    }

    const hashEntity = (value: unknown): string => {
      try {
        return JSON.stringify(value) ?? '';
      } catch {
        return String(value);
      }
    };

    const diffCollection = <T extends { id?: string }>(
      prevArr: T[],
      curArr: T[]
    ) => {
      const prevById = new Map<string, T>();
      for (const item of prevArr) {
        if (item.id) prevById.set(item.id, item);
      }

      const curById = new Map<string, T>();
      for (const item of curArr) {
        if (item.id) curById.set(item.id, item);
      }

      const added: T[] = [];
      const updated: T[] = [];
      const removed: T[] = [];

      for (const item of curArr) {
        if (!item.id) continue;
        const previous = prevById.get(item.id);
        if (!previous) {
          added.push(item);
          continue;
        }
        if (hashEntity(previous) !== hashEntity(item)) {
          updated.push(item);
        }
      }

      for (const item of prevArr) {
        if (!item.id) continue;
        if (!curById.has(item.id)) {
          removed.push(item);
        }
      }

      return { added, updated, removed };
    };

    // questionHistory
    const qh = diffCollection(
      _lastLiveState.questionHistory,
      state.questionHistory
    );
    for (const added of [...qh.added, ...qh.updated]) {
      const op: LiveRetryOp = {
        id: added.id,
        collection: 'questionHistory',
        op: 'upsert',
        payload: added,
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      // try immediate
      try {
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog(
              'info',
              `[LIVE] upsert questionHistory/${op.id} immediate success`
            )
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert questionHistory/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }
    for (const removed of qh.removed) {
      const op: LiveRetryOp = {
        id: removed.id,
        collection: 'questionHistory',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() => {
            // Create tombstone to persist deletion across restarts
            useAppStore.setState((s) => ({
              deletionTombstones: addTombstone(
                s.deletionTombstones,
                'questionHistory',
                op.id
              ),
            }));
            appendLiveLog(
              'info',
              `[LIVE] delete questionHistory/${op.id} immediate success`
            );
          })
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] delete questionHistory/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }

    // mcHistory
    const mh = diffCollection(_lastLiveState.mcHistory, state.mcHistory);
    for (const added of [...mh.added, ...mh.updated]) {
      const op: LiveRetryOp = {
        id: added.id,
        collection: 'mcHistory',
        op: 'upsert',
        payload: added,
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog(
              'info',
              `[LIVE] upsert mcHistory/${op.id} immediate success`
            )
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert mcHistory/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }
    for (const removed of mh.removed) {
      const op: LiveRetryOp = {
        id: removed.id,
        collection: 'mcHistory',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() => {
            // Create tombstone to persist deletion across restarts
            useAppStore.setState((s) => ({
              deletionTombstones: addTombstone(
                s.deletionTombstones,
                'mcHistory',
                op.id
              ),
            }));
            appendLiveLog(
              'info',
              `[LIVE] delete mcHistory/${op.id} immediate success`
            );
          })
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] delete mcHistory/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }

    // savedSets
    const ss = diffCollection(_lastLiveState.savedSets, state.savedSets);
    for (const added of [...ss.added, ...ss.updated]) {
      const op: LiveRetryOp = {
        id: added.id,
        collection: 'savedSets',
        op: 'upsert',
        payload: added,
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog(
              'info',
              `[LIVE] upsert savedSets/${op.id} immediate success`
            )
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert savedSets/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }
    for (const removed of ss.removed) {
      const op: LiveRetryOp = {
        id: removed.id,
        collection: 'savedSets',
        op: 'delete',
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() => {
            // Create tombstone to persist deletion across restarts
            useAppStore.setState((s) => ({
              deletionTombstones: addTombstone(
                s.deletionTombstones,
                'savedSets',
                op.id
              ),
            }));
            appendLiveLog(
              'info',
              `[LIVE] delete savedSets/${op.id} immediate success`
            );
          })
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] delete savedSets/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }

    // presets
    const ps = diffCollection(_lastLiveState.presets, state.presets);
    if (ps.added.length > 0 || ps.updated.length > 0 || ps.removed.length > 0) {
      // For presets we prefer to call upsertPresets with the full array to keep consistency
      const op: LiveRetryOp = {
        id: 'presets',
        collection: 'presets',
        op: 'upsert',
        payload: state.presets,
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog('info', `[LIVE] upsert presets immediate success`)
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert presets immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }

    // generationHistory — attempt to upsert new entries by sending them to saveUserData
    const gh = diffCollection(
      _lastLiveState.generationHistory,
      state.generationHistory
    );
    for (const added of gh.added) {
      const op: LiveRetryOp = {
        id: added.id ?? String(Math.random()),
        collection: 'generationHistory',
        op: 'upsert',
        payload: added,
        attempts: 0,
        nextAttemptAt: Date.now(),
      };
      try {
        void tryPerformOpOnce(op)
          .then(() =>
            appendLiveLog(
              'info',
              `[LIVE] upsert generationHistory/${op.id} immediate success`
            )
          )
          .catch((err) => {
            appendLiveLog(
              'warn',
              `[LIVE] upsert generationHistory/${op.id} immediate failed, queued: ${String(err)}`
            );
            enqueueLiveRetryOp({
              ...op,
              attempts: 1,
              nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
            });
            void processLiveRetryQueue();
          });
      } catch {
        enqueueLiveRetryOp({
          ...op,
          attempts: 1,
          nextAttemptAt: Date.now() + LIVE_RETRY_BASE_DELAY_MS,
        });
      }
    }
  } finally {
    _lastLiveState = state;
  }
});
