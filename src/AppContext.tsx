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

import React, { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { listen } from "@tauri-apps/api/event";
import { GenerationStatusEvent } from "./types";
import { useAppStore } from "./store";

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAppStore((s) => s.hydrate);
  const setGenerationStatus = useAppStore((s) => s.setGenerationStatus);
  
  // Hydrate from persisted storage on mount
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Forward backend SSE events into the store
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<GenerationStatusEvent>("generation-status", (event) => {
      setGenerationStatus(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [setGenerationStatus]);

  // Surface store errors via the global error state (already in store)
  // Nothing extra needed — the store sets errorMessage directly.

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
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      setMathMethodsSubtopics: s.setMathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      setSpecialistMathSubtopics: s.setSpecialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      setChemistrySubtopics: s.setChemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      setPhysicalEducationSubtopics: s.setPhysicalEducationSubtopics,
      questionCount: s.questionCount,
      setQuestionCount: s.setQuestionCount,
      maxMarksPerQuestion: s.maxMarksPerQuestion,
      setMaxMarksPerQuestion: s.setMaxMarksPerQuestion,
      subtopicInstructions: s.subtopicInstructions,
      setSubtopicInstructions: s.setSubtopicInstructions,
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
      questionMode: s.questionMode,
      setQuestionMode: s.setQuestionMode,
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
      writtenRawModelOutput: s.writtenRawModelOutput,
      setWrittenRawModelOutput: s.setWrittenRawModelOutput,
      mcRawModelOutput: s.mcRawModelOutput,
      setMcRawModelOutput: s.setMcRawModelOutput,
      writtenGenerationTelemetry: s.writtenGenerationTelemetry,
      setWrittenGenerationTelemetry: s.setWrittenGenerationTelemetry,
      mcGenerationTelemetry: s.mcGenerationTelemetry,
      setMcGenerationTelemetry: s.setMcGenerationTelemetry,
      activeWrittenSavedSetId: s.activeWrittenSavedSetId,
      setActiveWrittenSavedSetId: s.setActiveWrittenSavedSetId,
      activeMcSavedSetId: s.activeMcSavedSetId,
      setActiveMcSavedSetId: s.setActiveMcSavedSetId,
      savedSets: s.savedSets,
      saveCurrentSet: s.saveCurrentSet,
      loadSavedSet: s.loadSavedSet,
      needsSaveBeforeLoad: s.needsSaveBeforeLoad,
      deleteSavedSet: s.deleteSavedSet,
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
      clearApiKey: s.clearApiKey,
    }))
  );
}

// ─── Scoped convenience hooks ─────────────────────────────────────────────────

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
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      setMathMethodsSubtopics: s.setMathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      setSpecialistMathSubtopics: s.setSpecialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      setChemistrySubtopics: s.setChemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      setPhysicalEducationSubtopics: s.setPhysicalEducationSubtopics,
      questionCount: s.questionCount,
      setQuestionCount: s.setQuestionCount,
      maxMarksPerQuestion: s.maxMarksPerQuestion,
      setMaxMarksPerQuestion: s.setMaxMarksPerQuestion,
      questionMode: s.questionMode,
      setQuestionMode: s.setQuestionMode,
      subtopicInstructions: s.subtopicInstructions,
      setSubtopicInstructions: s.setSubtopicInstructions,
    }))
  );
}

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
      clearApiKey: s.clearApiKey,
    }))
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
      writtenRawModelOutput: s.writtenRawModelOutput,
      setWrittenRawModelOutput: s.setWrittenRawModelOutput,
      writtenGenerationTelemetry: s.writtenGenerationTelemetry,
      setWrittenGenerationTelemetry: s.setWrittenGenerationTelemetry,
      activeWrittenSavedSetId: s.activeWrittenSavedSetId,
      setActiveWrittenSavedSetId: s.setActiveWrittenSavedSetId,
    }))
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
      mcRawModelOutput: s.mcRawModelOutput,
      setMcRawModelOutput: s.setMcRawModelOutput,
      mcGenerationTelemetry: s.mcGenerationTelemetry,
      setMcGenerationTelemetry: s.setMcGenerationTelemetry,
      activeMcSavedSetId: s.activeMcSavedSetId,
      setActiveMcSavedSetId: s.setActiveMcSavedSetId,
    }))
  );
}

export function useSavedSets() {
  return useAppStore(
    useShallow((s) => ({
      savedSets: s.savedSets,
      saveCurrentSet: s.saveCurrentSet,
      loadSavedSet: s.loadSavedSet,
      deleteSavedSet: s.deleteSavedSet,
      needsSaveBeforeLoad: s.needsSaveBeforeLoad,
    }))
  );
}