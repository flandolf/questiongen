import type { StoreApi, UseBoundStore } from 'zustand';

import { normalizeHexColor } from '@/lib/color-helpers';
import {
  EMPTY_PERSISTED_APP_STATE,
  savePersistedAppState,
} from '@/lib/persistence';
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
      customThemeSeedColor: normalizeHexColor(s.customThemeSeedColor),
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
      activeTabByQuestionId: s.activeTabByQuestionId,
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

// eslint-disable-next-line complexity
export function snapshotToState(s: PersistedAppState): Partial<AppState> {
  const settings = s.settings;
  const prefs = s.preferences;
  const written = s.writtenSession;
  const mc = s.mcSession;
  const defaultSettings = EMPTY_PERSISTED_APP_STATE.settings;

  return {
    apiKey: settings.apiKey || defaultSettings.apiKey,
    model: settings.model?.trim() || defaultSettings.model,
    markingModel: settings.markingModel?.trim() || defaultSettings.markingModel,
    useSeparateMarkingModel: settings.useSeparateMarkingModel,
    imageMarkingModel:
      settings.imageMarkingModel?.trim() || defaultSettings.imageMarkingModel,
    useSeparateImageMarkingModel: settings.useSeparateImageMarkingModel,
    debugMode: settings.debugMode,
    questionTextSize:
      settings.questionTextSize ?? defaultSettings.questionTextSize,
    responseTextSize:
      settings.responseTextSize ?? defaultSettings.responseTextSize,
    includeExamContext:
      settings.includeExamContext ?? defaultSettings.includeExamContext,
    autoSyncIntervalMinutes:
      settings.autoSyncIntervalMinutes ??
      defaultSettings.autoSyncIntervalMinutes,
    syncApiKey: settings.syncApiKey,
    localBackupFolderPath:
      settings.localBackupFolderPath ?? defaultSettings.localBackupFolderPath,
    localBackupIntervalMinutes:
      settings.localBackupIntervalMinutes ??
      defaultSettings.localBackupIntervalMinutes,
    theme: normalizeThemeName(settings.theme ?? defaultSettings.theme),
    customThemeSeedColor: settings.customThemeSeedColor,
    globalRounding: ['sm', 'md', 'lg', 'xl'].includes(
      settings.globalRounding ? settings.globalRounding : '',
    )
      ? settings.globalRounding
      : defaultSettings.globalRounding,
    interfaceFont:
      settings.interfaceFont?.trim() || defaultSettings.interfaceFont,
    headingFont: settings.headingFont?.trim() || defaultSettings.headingFont,
    tutorPersona: settings.tutorPersona ?? defaultSettings.tutorPersona,
    tutorModel:
      settings.tutorModel?.trim() ||
      settings.model?.trim() ||
      defaultSettings.tutorModel,
    shuffleSubtopics:
      settings.shuffleSubtopics ?? defaultSettings.shuffleSubtopics,
    shuffleQuestions:
      settings.shuffleQuestions ?? defaultSettings.shuffleQuestions,

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
    activeTabByQuestionId: written.activeTabByQuestionId || {},
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
          console.error('Failed to persist app state:', err);
        });
    }, 500);
  });
}

export function setLastSavedSnapshot(snapshot: PersistedAppState | null) {
  lastSavedSnapshot = snapshot;
}
