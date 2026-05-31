/**
 * Selector hooks over the Zustand store.
 *
 * useShallow ensures the returned object is stable — only re-renders when a
 * selected field's value actually changes (by reference/value equality).
 *
 * Prefer using useAppStore() directly with focused selectors where possible.
 * These hooks exist for cases where a component needs a bundle of related fields.
 */

import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from './store';

export function useAppSettings() {
  return useAppStore(
    useShallow((s) => ({
      apiKey: s.apiKey,
      setApiKey: s.setApiKey,
      showApiKey: s.showApiKey,
      setShowApiKey: s.setShowApiKey,
      model: s.model,
      setModel: s.setModel,
      markingModel: s.markingModel,
      setMarkingModel: s.setMarkingModel,
      useSeparateMarkingModel: s.useSeparateMarkingModel,
      setUseSeparateMarkingModel: s.setUseSeparateMarkingModel,
      imageMarkingModel: s.imageMarkingModel,
      setImageMarkingModel: s.setImageMarkingModel,
      useSeparateImageMarkingModel: s.useSeparateImageMarkingModel,
      setUseSeparateImageMarkingModel: s.setUseSeparateImageMarkingModel,
      debugMode: s.debugMode,
      setDebugMode: s.setDebugMode,
      showRawLlmOutput: s.showRawLlmOutput,
      setShowRawLlmOutput: s.setShowRawLlmOutput,
      questionTextSize: s.questionTextSize,
      setQuestionTextSize: s.setQuestionTextSize,
      responseTextSize: s.responseTextSize,
      setResponseTextSize: s.setResponseTextSize,
      includeExamContext: s.includeExamContext,
      setIncludeExamContext: s.setIncludeExamContext,
      autoSyncIntervalMinutes: s.autoSyncIntervalMinutes,
      setAutoSyncIntervalMinutes: s.setAutoSyncIntervalMinutes,
      syncApiKey: s.syncApiKey,
      setSyncApiKey: s.setSyncApiKey,
      localBackupFolderPath: s.localBackupFolderPath,
      setLocalBackupFolderPath: s.setLocalBackupFolderPath,
      localBackupIntervalMinutes: s.localBackupIntervalMinutes,
      setLocalBackupIntervalMinutes: s.setLocalBackupIntervalMinutes,
      theme: s.theme,
      setTheme: s.setTheme,
      customThemeSeedColor: s.customThemeSeedColor,
      setCustomThemeSeedColor: s.setCustomThemeSeedColor,
      interfaceFont: s.interfaceFont,
      setInterfaceFont: s.setInterfaceFont,
      headingFont: s.headingFont,
      setHeadingFont: s.setHeadingFont,
      tutorPersona: s.tutorPersona,
      setTutorPersona: s.setTutorPersona,
      tutorModel: s.tutorModel,
      setTutorModel: s.setTutorModel,
      markerStyle: s.markerStyle,
      setMarkerStyle: s.setMarkerStyle,
      customMarkerStyle: s.customMarkerStyle,
      setCustomMarkerStyle: s.setCustomMarkerStyle,
      modelReasoningEnabled: s.modelReasoningEnabled,
      setModelReasoningEnabled: s.setModelReasoningEnabled,
      modelReasoningEffort: s.modelReasoningEffort,
      setModelReasoningEffort: s.setModelReasoningEffort,
      markingReasoningEnabled: s.markingReasoningEnabled,
      setMarkingReasoningEnabled: s.setMarkingReasoningEnabled,
      markingReasoningEffort: s.markingReasoningEffort,
      setMarkingReasoningEffort: s.setMarkingReasoningEffort,
      clearApiKey: s.clearApiKey,
    })),
  );
}

export function useAppPreferences() {
  return useAppStore(
    useShallow((s) => ({
      selectedTopics: s.selectedTopics,
      setSelectedTopics: s.setSelectedTopics,
      difficulty: s.difficulty,
      setDifficulty: s.setDifficulty,
      techMode: s.techMode,
      setTechMode: s.setTechMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      setAvoidSimilarQuestions: s.setAvoidSimilarQuestions,
      selectedSubtopics: s.selectedSubtopics,
      setSelectedSubtopics: s.setSelectedSubtopics,
      toggleSubtopic: s.toggleSubtopic,
      questionCount: s.questionCount,
      setQuestionCount: s.setQuestionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      setAverageMarksPerQuestion: s.setAverageMarksPerQuestion,
      questionMode: s.questionMode,
      setQuestionMode: s.setQuestionMode,
      customFocusArea: s.customFocusArea,
      setCustomFocusArea: s.setCustomFocusArea,
      aiDifficultyScalingEnabled: s.aiDifficultyScalingEnabled,
      setAiDifficultyScalingEnabled: s.setAiDifficultyScalingEnabled,
      difficultyThresholds: s.difficultyThresholds,
      setDifficultyThresholds: s.setDifficultyThresholds,
      diversityEnabled: s.diversityEnabled,
      setDiversityEnabled: s.setDiversityEnabled,
      strictLatexValidation: s.strictLatexValidation,
      setStrictLatexValidation: s.setStrictLatexValidation,
      shuffleSubtopics: s.shuffleSubtopics,
      setShuffleSubtopics: s.setShuffleSubtopics,
      shuffleQuestions: s.shuffleQuestions,
      setShuffleQuestions: s.setShuffleQuestions,
      generationStrategy: s.generationStrategy,
      setGenerationStrategy: s.setGenerationStrategy,
      resetPreferences: s.resetPreferences,
    })),
  );
}

export function useWrittenSession() {
  return useAppStore(
    useShallow((s) => ({
      questions: s.questions,
      setQuestions: s.setQuestions,
      activeQuestionIndex: s.activeQuestionIndex,
      setActiveQuestionIndex: s.setActiveQuestionIndex,
      writtenQuestionPresentedAtById: s.writtenQuestionPresentedAtById,
      setWrittenQuestionPresentedAtById: s.setWrittenQuestionPresentedAtById,
      answersByQuestionId: s.answersByQuestionId,
      setAnswersByQuestionId: s.setAnswersByQuestionId,
      imagesByQuestionId: s.imagesByQuestionId,
      setImagesByQuestionId: s.setImagesByQuestionId,
      feedbackByQuestionId: s.feedbackByQuestionId,
      setFeedbackByQuestionId: s.setFeedbackByQuestionId,
      questionHistory: s.questionHistory,
      setQuestionHistory: s.setQuestionHistory,
      addQuestionHistoryEntry: s.addQuestionHistoryEntry,
      updateQuestionHistoryEntry: s.updateQuestionHistoryEntry,
      updateQuestionHistoryEntries: s.updateQuestionHistoryEntries,
      deleteQuestionHistoryEntry: s.deleteQuestionHistoryEntry,
      clearQuestionHistory: s.clearQuestionHistory,
      writtenRawModelOutput: s.writtenRawModelOutput,
      setWrittenRawModelOutput: s.setWrittenRawModelOutput,
      writtenGenerationTelemetry: s.writtenGenerationTelemetry,
      setWrittenGenerationTelemetry: s.setWrittenGenerationTelemetry,
      activeWrittenSavedSetId: s.activeWrittenSavedSetId,
      setActiveWrittenSavedSetId: s.setActiveWrittenSavedSetId,
      submitWrittenAnswer: s.submitWrittenAnswer,
      argueForWrittenMark: s.argueForWrittenMark,
      overrideWrittenMark: s.overrideWrittenMark,
      nextQuestion: s.nextQuestion,
      prevQuestion: s.prevQuestion,
      markAppealByQuestionId: s.markAppealByQuestionId,
      setMarkAppealByQuestionId: s.setMarkAppealByQuestionId,
      markOverrideInputByQuestionId: s.markOverrideInputByQuestionId,
      setMarkOverrideInputByQuestionId: s.setMarkOverrideInputByQuestionId,
      writtenMarkingDurationMsByQuestionId:
        s.writtenMarkingDurationMsByQuestionId,
      setWrittenMarkingDurationMsByQuestionId:
        s.setWrittenMarkingDurationMsByQuestionId,
      writtenResponseEnteredAtById: s.writtenResponseEnteredAtById,
      setWrittenResponseEnteredAtById: s.setWrittenResponseEnteredAtById,
    })),
  );
}

export function useMultipleChoiceSession() {
  return useAppStore(
    useShallow((s) => ({
      mcQuestions: s.mcQuestions,
      setMcQuestions: s.setMcQuestions,
      activeMcQuestionIndex: s.activeMcQuestionIndex,
      setActiveMcQuestionIndex: s.setActiveMcQuestionIndex,
      mcQuestionPresentedAtById: s.mcQuestionPresentedAtById,
      setMcQuestionPresentedAtById: s.setMcQuestionPresentedAtById,
      mcAnswersByQuestionId: s.mcAnswersByQuestionId,
      setMcAnswersByQuestionId: s.setMcAnswersByQuestionId,
      mcHistory: s.mcHistory,
      setMcHistory: s.setMcHistory,
      addMcHistoryEntry: s.addMcHistoryEntry,
      updateMcHistoryEntry: s.updateMcHistoryEntry,
      updateMcHistoryEntries: s.updateMcHistoryEntries,
      deleteMcHistoryEntry: s.deleteMcHistoryEntry,
      clearMcHistory: s.clearMcHistory,
      mcRawModelOutput: s.mcRawModelOutput,
      setMcRawModelOutput: s.setMcRawModelOutput,
      mcGenerationTelemetry: s.mcGenerationTelemetry,
      setMcGenerationTelemetry: s.setMcGenerationTelemetry,
      activeMcSavedSetId: s.activeMcSavedSetId,
      setActiveMcSavedSetId: s.setActiveMcSavedSetId,
      submitMcAnswer: s.submitMcAnswer,
      overrideMcMark: s.overrideMcMark,
      mcMarkOverrideInputByQuestionId: s.mcMarkOverrideInputByQuestionId,
      setMcMarkOverrideInputByQuestionId: s.setMcMarkOverrideInputByQuestionId,
      mcAwardedMarksByQuestionId: s.mcAwardedMarksByQuestionId,
      setMcAwardedMarksByQuestionId: s.setMcAwardedMarksByQuestionId,
    })),
  );
}

export function useSavedSets() {
  return useAppStore(
    useShallow((s) => ({
      savedSets: s.savedSets,
      saveCurrentSet: s.saveCurrentSet,
      loadSavedSet: s.loadSavedSet,
      needsSaveBeforeLoad: s.needsSaveBeforeLoad,
      deleteSavedSet: s.deleteSavedSet,
      deleteAllSavedSets: s.deleteAllSavedSets,
    })),
  );
}

export function useGenerationStatus() {
  return useAppStore(
    useShallow((s) => ({
      isGenerating: s.isGenerating,
      setIsGenerating: s.setIsGenerating,
      generationStatus: s.generationStatus,
      setGenerationStatus: s.setGenerationStatus,
      generationStartedAt: s.generationStartedAt,
      setGenerationStartedAt: s.setGenerationStartedAt,
      isMarking: s.isMarking,
      setIsMarking: s.setIsMarking,
      errorMessage: s.errorMessage,
      setErrorMessage: s.setErrorMessage,
      isKeyboardShortcutsOpen: s.isKeyboardShortcutsOpen,
      setIsKeyboardShortcutsOpen: s.setIsKeyboardShortcutsOpen,
      saveCurrentSet: s.saveCurrentSet,
      batchProgress: s.batchProgress,
      setBatchProgress: s.setBatchProgress,
      generationSubCallProgress: s.generationSubCallProgress,
      setGenerationSubCallProgress: s.setGenerationSubCallProgress,
      streamTexts: s.streamTexts,
      setStreamText: s.setStreamText,
      abortGeneration: s.abortGeneration,
    })),
  );
}
