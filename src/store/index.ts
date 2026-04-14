import { startTransition } from 'react';
import { create } from 'zustand';

import {
  deleteMcHistoryEntry as v3DeleteMcHistoryEntry,
  deleteQuestionHistoryEntry as v3DeleteQuestionHistoryEntry,
  deleteSavedSet as v3DeleteSavedSet,
  saveGenerationRecord as v3SaveGenerationRecord,
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
  loadPersistedAppState,
} from '@/lib/persistence';
import { createCard, isDue, reviewCard } from '@/lib/spaced-repetition';
import { getTodayKey } from '@/lib/utils';
import type {
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedWrittenSession,
  SavedQuestionSet,
} from '@/types';

import {
  buildSavedSetTitle,
  isMcSessionComplete,
  isWrittenSessionComplete,
  normalizeThemeName,
  resolve,
} from './helpers';
import {
  setLastSavedSnapshot,
  setupPersistence,
  snapshotToState,
} from './persistence';
import type { AppActions, AppState } from './types';

// ─── Default state ────────────────────────────────────────────────────────────

const defaultState: AppState = {
  isHydrated: false,
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  showApiKey: false,
  model: EMPTY_PERSISTED_APP_STATE.settings.model,
  markingModel: EMPTY_PERSISTED_APP_STATE.settings.markingModel,
  useSeparateMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel,
  ),
  imageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.imageMarkingModel,
  useSeparateImageMarkingModel: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.useSeparateImageMarkingModel,
  ),
  debugMode: EMPTY_PERSISTED_APP_STATE.settings.debugMode,
  questionTextSize: EMPTY_PERSISTED_APP_STATE.settings.questionTextSize ?? 16,
  responseTextSize: EMPTY_PERSISTED_APP_STATE.settings.responseTextSize ?? 16,
  includeExamContext: Boolean(
    EMPTY_PERSISTED_APP_STATE.settings.includeExamContext,
  ),
  autoSyncIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.autoSyncIntervalMinutes ?? 0,
  syncApiKey: Boolean(EMPTY_PERSISTED_APP_STATE.settings.syncApiKey),
  localBackupFolderPath:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupFolderPath ?? '',
  localBackupIntervalMinutes:
    EMPTY_PERSISTED_APP_STATE.settings.localBackupIntervalMinutes ?? 0,
  theme: normalizeThemeName(EMPTY_PERSISTED_APP_STATE.settings.theme),
  tutorPersona: EMPTY_PERSISTED_APP_STATE.settings.tutorPersona ?? '',
  tutorModel:
    EMPTY_PERSISTED_APP_STATE.settings.tutorModel ??
    EMPTY_PERSISTED_APP_STATE.settings.model,
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
  biologySubtopics: EMPTY_PERSISTED_APP_STATE.preferences.biologySubtopics,
  generalMathematicsSubtopics:
    EMPTY_PERSISTED_APP_STATE.preferences.generalMathematicsSubtopics,
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
  shuffleSubtopics: false,
  shuffleQuestions: false,
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
  timeAllocations: [
    {
      difficulty: 'Essential Skills',
      minutesPerMark: 0.8,
    },
    {
      difficulty: 'Easy',
      minutesPerMark: 1,
    },
    {
      difficulty: 'Medium',
      minutesPerMark: 1.25,
    },
    {
      difficulty: 'Hard',
      minutesPerMark: 1.5,
    },
    {
      difficulty: 'Extreme',
      minutesPerMark: 1.8,
    },
  ],
  generationHistory: [],
  presets: [],
  writtenTimer: null,
  mcTimer: null,
  logs: [],
};

// ─── Store ────────────────────────────────────────────────────────────────────

export { buildPersistedSnapshot, snapshotToState } from './persistence';
export type { AppActions, AppState } from './types';

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...defaultState,

  hydrate: async () => {
    console.info('Hydrating app store from persistent storage...');
    try {
      const persisted = await loadPersistedAppState();
      setLastSavedSnapshot(persisted);
      set({
        ...snapshotToState(persisted, defaultState),
        isHydrated: true,
      });
      console.info('Hydration successful', {
        version: persisted.version,
        savedSetsCount: persisted.savedSets.length,
        historyCount: persisted.questionHistory.length,
      });
    } catch (err) {
      console.error('Hydration failed', err);
      set({ errorMessage: 'Could not load saved app data.', isHydrated: true });
    }
  },

  addGenerationRecord: (record) => {
    const nextRecord = { ...record, isUploaded: false };
    set((s) => ({
      generationHistory: [nextRecord, ...s.generationHistory].slice(0, 1000),
    }));
    void v3SaveGenerationRecord(nextRecord);
  },
  setWrittenTimer: (writtenTimer) => set({ writtenTimer: writtenTimer }),
  setMcTimer: (mcTimer) => set({ mcTimer: mcTimer }),

  addLog: (entry) =>
    set((s) => ({
      logs: [
        {
          ...entry,
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        },
        ...s.logs,
      ].slice(0, 1000),
    })),
  clearLogs: () => set({ logs: [] }),

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
  setTutorPersona: (tutorPersona) => set({ tutorPersona }),
  setTutorModel: (tutorModel) => set({ tutorModel }),
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
  setBiologySubtopics: (update) =>
    set((s) => ({ biologySubtopics: resolve(update, s.biologySubtopics) })),
  setGeneralMathematicsSubtopics: (update) =>
    set((s) => ({
      generalMathematicsSubtopics: resolve(
        update,
        s.generalMathematicsSubtopics,
      ),
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
  setShuffleSubtopics: (shuffleSubtopics) => set({ shuffleSubtopics }),
  setShuffleQuestions: (shuffleQuestions) => set({ shuffleQuestions }),
  setGenerationStrategy: (generationStrategy) => set({ generationStrategy }),
  resetPreferences: () =>
    set({
      selectedTopics: defaultState.selectedTopics,
      difficulty: defaultState.difficulty,
      techMode: defaultState.techMode,
      avoidSimilarQuestions: defaultState.avoidSimilarQuestions,
      mathMethodsSubtopics: defaultState.mathMethodsSubtopics,
      specialistMathSubtopics: defaultState.specialistMathSubtopics,
      chemistrySubtopics: defaultState.chemistrySubtopics,
      physicalEducationSubtopics: defaultState.physicalEducationSubtopics,
      biologySubtopics: defaultState.biologySubtopics,
      generalMathematicsSubtopics: defaultState.generalMathematicsSubtopics,
      questionCount: defaultState.questionCount,
      averageMarksPerQuestion: defaultState.averageMarksPerQuestion,
      questionMode: defaultState.questionMode,
      aiDifficultyScalingEnabled: defaultState.aiDifficultyScalingEnabled,
      difficultyThresholds: defaultState.difficultyThresholds,
      diversityStrictness: defaultState.diversityStrictness,
      strictLatexValidation: defaultState.strictLatexValidation,
      strictSubtopicCoverage: defaultState.strictSubtopicCoverage,
      minSubtopicCoverageRatio: defaultState.minSubtopicCoverageRatio,
      shuffleSubtopics: defaultState.shuffleSubtopics,
      shuffleQuestions: defaultState.shuffleQuestions,
      generationStrategy: defaultState.generationStrategy,
    }),

  setQuestions: (questions) => set({ questions }),
  setActiveQuestionIndex: (activeQuestionIndex) => set({ activeQuestionIndex }),
  setWrittenQuestionPresentedAtById: (update) =>
    set((s) => ({
      writtenQuestionPresentedAtById: resolve(
        update,
        s.writtenQuestionPresentedAtById,
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
    console.info(`Saving current ${s.questionMode} session...`, {
      topics: s.selectedTopics,
      questionCount: s.questions.length || s.mcQuestions.length,
    });
    const now = new Date().toISOString();
    const nowMs = Date.now();
    if (s.questionMode === 'written') {
      if (s.questions.length === 0) {
        console.warn('Cannot save empty written session');
        return null;
      }
      const isComplete = isWrittenSessionComplete(
        s.questions,
        s.feedbackByQuestionId,
      );
      if (isComplete) {
        console.log(
          'Written session is complete, skipping save or deleting if it was already saved',
        );
        if (s.activeWrittenSavedSetId) {
          const completedSavedSetId = s.activeWrittenSavedSetId;
          set((state) => ({
            savedSets: state.savedSets.filter(
              (e) => e.id !== completedSavedSetId,
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
        biologySubtopics: s.biologySubtopics,
        generalMathematicsSubtopics: s.generalMathematicsSubtopics,
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
      console.info('Written session saved', { id: savedSetId });
      return savedSetId;
    }
    if (s.mcQuestions.length === 0) {
      console.warn('Cannot save empty MC session');
      return null;
    }
    const isComplete = isMcSessionComplete(
      s.mcQuestions,
      s.mcAnswersByQuestionId,
    );
    if (isComplete) {
      console.log(
        'MC session is complete, skipping save or deleting if it was already saved',
      );
      if (s.activeMcSavedSetId) {
        const completedSavedSetId = s.activeMcSavedSetId;
        set((state) => ({
          savedSets: state.savedSets.filter(
            (e) => e.id !== completedSavedSetId,
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
      biologySubtopics: s.biologySubtopics,
      generalMathematicsSubtopics: s.generalMathematicsSubtopics,
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
    console.info('MC session saved', { id: savedSetId });
    return savedSetId;
  },

  loadSavedSet: (id) => {
    const entry = get().savedSets.find((e) => e.id === id);
    if (!entry) {
      console.warn(`Could not find saved set with id: ${id}`);
      return;
    }
    console.info(`Loading saved set: ${entry.title}`, {
      id,
      mode: entry.questionMode,
    });
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
        writtenTimer: null,
        mcTimer: null,
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
    const nextEntry = { ...entry, isUploaded: false };
    set((s) => ({ questionHistory: [nextEntry, ...s.questionHistory] }));
    void v3SaveQuestionHistoryEntry(nextEntry);
  },
  addMcHistoryEntry: (entry) => {
    const nextEntry = { ...entry, isUploaded: false };
    set((s) => ({ mcHistory: [nextEntry, ...s.mcHistory] }));
    void v3SaveMcHistoryEntry(nextEntry);
  },
  updateQuestionHistoryEntry: (entry) => {
    set((s) => ({
      questionHistory: s.questionHistory.map((e) =>
        e.id === entry.id ? entry : e,
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
          new Date(b.card.nextReviewDate).getTime(),
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
          s.streakData.currentStreak + 1,
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

  setTimeAllocations: (allocations) => set({ timeAllocations: allocations }),

  importState: (imported) => {
    const s = get();
    const merged = mergeImportedState(s, imported);
    set(merged as Partial<AppState & AppActions>);
    void persistAndRehydrate(get());
  },
}));

setupPersistence(useAppStore);
