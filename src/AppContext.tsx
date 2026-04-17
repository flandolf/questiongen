/**
 * AppContext.tsx — compatibility shim over the Zustand store (useShallow fix).
 *
 * All public hook APIs are preserved so every consumer is unchanged:
 *   useAppContext, useAppPreferences, useAppSettings,
 *   useWrittenSession, useMultipleChoiceSession, useSavedSets
 *
 * AppProvider now simply triggers hydration on mount and renders children.
 * No React context or useState is used for app state — everything comes from
 * the Zustand store (store.ts).
 */

import { listen } from '@tauri-apps/api/event';
import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useLocalBackupExport } from './hooks/useLocalBackupExport';
import { useAppStore } from './store';
import type { GenerationStatusEvent, LogEntry } from './types';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAppStore((s) => s.hydrate);
  const setGenerationStatus = useAppStore((s) => s.setGenerationStatus);

  useLocalBackupExport();

  // Hydrate from persisted storage on mount
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Forward backend SSE events into the store
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<GenerationStatusEvent>('generation-status', (event) => {
      setGenerationStatus(event.payload);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    const unlistenLog = listen<{
      level: string;
      message: string;
      data?: unknown;
    }>('rust-log', (event) => {
      useAppStore.getState().addLog({
        level: event.payload.level as LogEntry['level'],
        message: event.payload.message,
        data: event.payload.data,
      });
    });

    return () => {
      cancelled = true;
      unlisten?.();
      void unlistenLog.then((fn) => fn());
    };
  }, [setGenerationStatus]);

  return <>{children}</>;
}

// ─── Full context hook ────────────────────────────────────────────────────────
//
// useShallow ensures the returned object is stable — only re-renders when a
// selected field's value actually changes (by reference/value equality).

export function useAppContext() {
  return useAppStore(
    useShallow((s) => ({
      isHydrated: s.isHydrated,
      apiKey: s.apiKey,
      setApiKey: s.setApiKey,
      showApiKey: s.showApiKey,
      setShowApiKey: s.setShowApiKey,
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
      diversityStrictness: s.diversityStrictness,
      setDiversityStrictness: s.setDiversityStrictness,
      strictLatexValidation: s.strictLatexValidation,
      setStrictLatexValidation: s.setStrictLatexValidation,
      shuffleSubtopics: s.shuffleSubtopics,
      setShuffleSubtopics: s.setShuffleSubtopics,
      shuffleQuestions: s.shuffleQuestions,
      setShuffleQuestions: s.setShuffleQuestions,
      generationStrategy: s.generationStrategy,
      setGenerationStrategy: s.setGenerationStrategy,
      resetPreferences: s.resetPreferences,
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
      writtenRawModelOutput: s.writtenRawModelOutput,
      setWrittenRawModelOutput: s.setWrittenRawModelOutput,
      writtenGenerationTelemetry: s.writtenGenerationTelemetry,
      setWrittenGenerationTelemetry: s.setWrittenGenerationTelemetry,
      activeWrittenSavedSetId: s.activeWrittenSavedSetId,
      setActiveWrittenSavedSetId: s.setActiveWrittenSavedSetId,
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
      mcRawModelOutput: s.mcRawModelOutput,
      setMcRawModelOutput: s.setMcRawModelOutput,
      mcGenerationTelemetry: s.mcGenerationTelemetry,
      setMcGenerationTelemetry: s.setMcGenerationTelemetry,
      activeMcSavedSetId: s.activeMcSavedSetId,
      setActiveMcSavedSetId: s.setActiveMcSavedSetId,
      savedSets: s.savedSets,
      saveCurrentSet: s.saveCurrentSet,
      loadSavedSet: s.loadSavedSet,
      needsSaveBeforeLoad: s.needsSaveBeforeLoad,
      deleteSavedSet: s.deleteSavedSet,
      deleteAllSavedSets: s.deleteAllSavedSets,
      deleteQuestionHistoryEntry: s.deleteQuestionHistoryEntry,
      deleteMcHistoryEntry: s.deleteMcHistoryEntry,
      addQuestionHistoryEntry: s.addQuestionHistoryEntry,
      addMcHistoryEntry: s.addMcHistoryEntry,
      updateQuestionHistoryEntry: s.updateQuestionHistoryEntry,
      updateMcHistoryEntry: s.updateMcHistoryEntry,
      clearQuestionHistory: s.clearQuestionHistory,
      clearMcHistory: s.clearMcHistory,
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
      spacedRepetitionCards: s.spacedRepetitionCards,
      reviewSpacedCard: s.reviewSpacedCard,
      getDueCards: s.getDueCards,
      studyGoals: s.studyGoals,
      setStudyGoals: s.setStudyGoals,
      streakData: s.streakData,
      recordCompletion: s.recordCompletion,
      getTodayCompletions: s.getTodayCompletions,
      timeAllocations: s.timeAllocations,
      setTimeAllocations: s.setTimeAllocations,
      generationHistory: s.generationHistory,
      addGenerationRecord: s.addGenerationRecord,
      presets: s.presets,
      setPresets: s.setPresets,
      addPreset: s.addPreset,
      updatePreset: s.updatePreset,
      deletePreset: s.deletePreset,
      writtenTimer: s.writtenTimer,
      setWrittenTimer: s.setWrittenTimer,
      mcTimer: s.mcTimer,
      setMcTimer: s.setMcTimer,
      logs: s.logs,
      addLog: s.addLog,
      clearLogs: s.clearLogs,
      importState: s.importState,
    })),
  );
}

// ─── Subset hooks ─────────────────────────────────────────────────────────────

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
      globalRounding: s.globalRounding,
      setGlobalRounding: s.setGlobalRounding,
      interfaceFont: s.interfaceFont,
      setInterfaceFont: s.setInterfaceFont,
      headingFont: s.headingFont,
      setHeadingFont: s.setHeadingFont,
      tutorPersona: s.tutorPersona,
      setTutorPersona: s.setTutorPersona,
      tutorModel: s.tutorModel,
      setTutorModel: s.setTutorModel,
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
      diversityStrictness: s.diversityStrictness,
      setDiversityStrictness: s.setDiversityStrictness,
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
      deleteQuestionHistoryEntry: s.deleteQuestionHistoryEntry,
      clearQuestionHistory: s.clearQuestionHistory,
      writtenRawModelOutput: s.writtenRawModelOutput,
      setWrittenRawModelOutput: s.setWrittenRawModelOutput,
      writtenGenerationTelemetry: s.writtenGenerationTelemetry,
      setWrittenGenerationTelemetry: s.setWrittenGenerationTelemetry,
      activeWrittenSavedSetId: s.activeWrittenSavedSetId,
      setActiveWrittenSavedSetId: s.setActiveWrittenSavedSetId,
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
      deleteMcHistoryEntry: s.deleteMcHistoryEntry,
      clearMcHistory: s.clearMcHistory,
      mcRawModelOutput: s.mcRawModelOutput,
      setMcRawModelOutput: s.setMcRawModelOutput,
      mcGenerationTelemetry: s.mcGenerationTelemetry,
      setMcGenerationTelemetry: s.setMcGenerationTelemetry,
      activeMcSavedSetId: s.activeMcSavedSetId,
      setActiveMcSavedSetId: s.setActiveMcSavedSetId,
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
    })),
  );
}

export function useStudyStats() {
  return useAppStore(
    useShallow((s) => ({
      streakData: s.streakData,
      studyGoals: s.studyGoals,
      recordCompletion: s.recordCompletion,
      getTodayCompletions: s.getTodayCompletions,
    })),
  );
}
