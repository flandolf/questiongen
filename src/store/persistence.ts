import type { StoreApi, UseBoundStore } from 'zustand';

import { savePersistedAppState } from '@/lib/persistence';
import { isDeepEqual } from '@/lib/utils';
import type { PersistedAppState } from '@/types';

import { normalizeThemeName } from './helpers';
import type { AppActions, AppState } from './types';

export function buildPersistedSnapshot(s: AppState): PersistedAppState {
  return {
    version: 2,
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
      customThemeSeedColor: s.customThemeSeedColor,
      globalRounding: s.globalRounding,
      interfaceFont: s.interfaceFont,
      headingFont: s.headingFont,
      tutorPersona: s.tutorPersona,
      tutorModel: s.tutorModel,
      shuffleSubtopics: s.shuffleSubtopics,
      shuffleQuestions: s.shuffleQuestions,
    },
    preferences: {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      selectedSubtopics: s.selectedSubtopics,
      questionCount: s.questionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      questionMode: s.questionMode,
      aiDifficultyScalingEnabled: s.aiDifficultyScalingEnabled,
      difficultyThresholds: s.difficultyThresholds,
      diversityStrictness: s.diversityStrictness,
      strictLatexValidation: s.strictLatexValidation,
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
    studyGoals: s.studyGoals,
    streakData: s.streakData,
    generationHistory: s.generationHistory,
    presets: s.presets,
    timeAllocations: s.timeAllocations,
  };
}

export function snapshotToState(s: PersistedAppState): Partial<AppState> {
  const settings = s.settings;
  const prefs = s.preferences;
  const written = s.writtenSession;
  const mc = s.mcSession;

  return {
    apiKey: settings.apiKey,
    model: settings.model,
    markingModel: settings.markingModel,
    useSeparateMarkingModel: settings.useSeparateMarkingModel,
    imageMarkingModel: settings.imageMarkingModel,
    useSeparateImageMarkingModel: settings.useSeparateImageMarkingModel,
    debugMode: settings.debugMode,
    questionTextSize: settings.questionTextSize,
    responseTextSize: settings.responseTextSize,
    includeExamContext: settings.includeExamContext,
    autoSyncIntervalMinutes: settings.autoSyncIntervalMinutes,
    syncApiKey: settings.syncApiKey,
    localBackupFolderPath: settings.localBackupFolderPath,
    localBackupIntervalMinutes: settings.localBackupIntervalMinutes,
    theme: normalizeThemeName(settings.theme ?? 'claude'),
    customThemeSeedColor: settings.customThemeSeedColor,
    globalRounding: settings.globalRounding,
    interfaceFont: settings.interfaceFont,
    headingFont: settings.headingFont,
    tutorPersona: settings.tutorPersona,
    tutorModel: settings.tutorModel,
    shuffleSubtopics: settings.shuffleSubtopics,
    shuffleQuestions: settings.shuffleQuestions,

    selectedTopics: prefs.selectedTopics,
    difficulty: prefs.difficulty,
    techMode: prefs.techMode,
    avoidSimilarQuestions: prefs.avoidSimilarQuestions,
    selectedSubtopics: prefs.selectedSubtopics,
    questionCount: prefs.questionCount,
    averageMarksPerQuestion: prefs.averageMarksPerQuestion,
    questionMode: prefs.questionMode,
    aiDifficultyScalingEnabled: prefs.aiDifficultyScalingEnabled,
    difficultyThresholds: prefs.difficultyThresholds,
    diversityStrictness: prefs.diversityStrictness,
    strictLatexValidation: prefs.strictLatexValidation,
    generationStrategy: prefs.generationStrategy,

    questions: written.questions,
    activeQuestionIndex: written.activeQuestionIndex,
    writtenQuestionPresentedAtById: written.presentedAtByQuestionId,
    answersByQuestionId: written.answersByQuestionId,
    imagesByQuestionId: written.imagesByQuestionId,
    feedbackByQuestionId: written.feedbackByQuestionId,
    writtenRawModelOutput: written.rawModelOutput,
    writtenGenerationTelemetry: written.generationTelemetry,
    activeWrittenSavedSetId: written.savedSetId,

    mcQuestions: mc.questions,
    activeMcQuestionIndex: mc.activeQuestionIndex,
    mcQuestionPresentedAtById: mc.presentedAtByQuestionId,
    mcAnswersByQuestionId: mc.answersByQuestionId,
    mcRawModelOutput: mc.rawModelOutput,
    mcGenerationTelemetry: mc.generationTelemetry,
    activeMcSavedSetId: mc.savedSetId,

    questionHistory: s.questionHistory,
    mcHistory: s.mcHistory,
    savedSets: s.savedSets,
    studyGoals: s.studyGoals,
    streakData: s.streakData,
    generationHistory: s.generationHistory,
    presets: s.presets,
    writtenTimer: s.writtenTimer,
    mcTimer: s.mcTimer,
    timeAllocations: s.timeAllocations,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedSnapshot: PersistedAppState | null = null;

export function setupPersistence(
  useAppStore: UseBoundStore<StoreApi<AppState & AppActions>>,
) {
  useAppStore.subscribe((state) => {
    if (!state.isHydrated) return;

    const currentSnapshot = buildPersistedSnapshot(state);

    if (lastSavedSnapshot && isDeepEqual(currentSnapshot, lastSavedSnapshot)) {
      return;
    }

    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const latestState = useAppStore.getState();

      try {
        const stored = localStorage.getItem('questiongen-ui-prefs');
        const prefs = stored
          ? (JSON.parse(stored) as Record<string, string>)
          : {};
        if (prefs.designTheme !== latestState.theme) {
          prefs.designTheme = latestState.theme;
          localStorage.setItem('questiongen-ui-prefs', JSON.stringify(prefs));
        }
      } catch {
        // Ignore parsing errors
      }

      const finalSnapshot = buildPersistedSnapshot(latestState);

      if (lastSavedSnapshot && isDeepEqual(finalSnapshot, lastSavedSnapshot)) {
        return;
      }

      void savePersistedAppState(finalSnapshot)
        .then(() => {
          lastSavedSnapshot = finalSnapshot;
        })
        .catch((err: unknown) => {
          // Persistence failure intentionally ignored for linting
          void err;
        });
    }, 500);
  });
}

export function setLastSavedSnapshot(snapshot: PersistedAppState | null) {
  lastSavedSnapshot = snapshot;
}
