import type { StoreApi, UseBoundStore } from 'zustand';

import {
  EMPTY_PERSISTED_APP_STATE,
  isSavedSetComplete,
  savePersistedAppState,
} from '@/lib/persistence';
import { isDeepEqual } from '@/lib/utils';
import type {
  PersistedAppState,
  SavedQuestionSet,
  StreakData,
  StudyGoals,
  TimeAllocationConfig,
} from '@/types';

import { normalizeThemeName } from './helpers';
import type { AppActions, AppState } from './types';

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
      tutorPersona: s.tutorPersona,
      tutorModel: s.tutorModel,
      shuffleSubtopics: s.shuffleSubtopics,
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
    timeAllocations: s.timeAllocations,
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
      s.settings.useSeparateImageMarkingModel,
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
    tutorPersona: s.settings.tutorPersona ?? '',
    tutorModel: s.settings.tutorModel ?? s.settings.model,
    shuffleSubtopics: s.settings.shuffleSubtopics ?? false,
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
  const activeSavedSetIds = new Set(
    s.savedSets.map((entry: SavedQuestionSet) => entry.id),
  );
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

function mapHistory(
  s: PersistedAppState,
  defaultStudyGoals: StudyGoals,
  defaultStreakData: StreakData,
  defaultTimeAllocations: TimeAllocationConfig,
): Partial<AppState> {
  const savedSets = s.savedSets.filter(
    (savedSet: SavedQuestionSet) => !isSavedSetComplete(savedSet),
  );

  return {
    questionHistory: s.questionHistory,
    mcHistory: s.mcHistory,
    savedSets,
    spacedRepetitionCards: s.spacedRepetition ?? {},
    studyGoals: s.studyGoals ?? defaultStudyGoals,
    streakData: s.streakData ?? defaultStreakData,
    generationHistory: s.generationHistory ?? [],
    presets: s.presets ?? [],
    timeAllocations: s.timeAllocations ?? defaultTimeAllocations,
  };
}

export function snapshotToState(
  s: PersistedAppState,
  defaultState: AppState,
): Partial<AppState> {
  return {
    ...mapSettings(s),
    ...mapPreferences(s),
    ...mapSessions(s),
    ...mapHistory(
      s,
      defaultState.studyGoals,
      defaultState.streakData,
      defaultState.timeAllocations,
    ),
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

    // Skip if nothing meaningful has changed since last save
    if (lastSavedSnapshot && isDeepEqual(currentSnapshot, lastSavedSnapshot)) {
      return;
    }

    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      // Re-check before saving in case it changed back or another save happened
      const latestState = useAppStore.getState();
      const finalSnapshot = buildPersistedSnapshot(latestState);

      if (lastSavedSnapshot && isDeepEqual(finalSnapshot, lastSavedSnapshot)) {
        return;
      }

      void savePersistedAppState(finalSnapshot)
        .then(() => {
          lastSavedSnapshot = finalSnapshot;
        })
        .catch(console.error);
    }, 500);
  });
}

export function setLastSavedSnapshot(snapshot: PersistedAppState | null) {
  lastSavedSnapshot = snapshot;
}
