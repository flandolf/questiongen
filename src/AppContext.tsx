import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ChemistrySubtopic,
  Difficulty,
  GeneratedQuestion,
  GenerationStatusEvent,
  GenerationTelemetry,
  HISTORY_ENTRY_LIMIT,
  MarkAnswerResponse,
  MathMethodsSubtopic,
  McHistoryEntry,
  McQuestion,
  PersistedAppState,
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedWrittenSession,
  PhysicalEducationSubtopic,
  QuestionHistoryEntry,
  QuestionMode,
  SAVED_SET_LIMIT,
  SavedQuestionSet,
  SpecialistMathSubtopic,
  StudentAnswerImage,
  TechMode,
  Topic,
} from "./types";
import { EMPTY_PERSISTED_APP_STATE, loadPersistedAppState, savePersistedAppState } from "./lib/persistence";
import { confirmAction } from "./lib/app-utils";
import { useSettingsState } from "./context/modules/useSettingsState";
import { usePreferencesState } from "./context/modules/usePreferencesState";
import { useWrittenSessionState } from "./context/modules/useWrittenSessionState";
import { useMultipleChoiceSessionState } from "./context/modules/useMultipleChoiceSessionState";

interface AppContextState {
  isHydrated: boolean;
  apiKey: string;
  setApiKey: (key: string) => void;
  showApiKey: boolean;
  setShowApiKey: (show: boolean) => void;
  selectedTopics: Topic[];
  setSelectedTopics: (topics: Topic[] | ((prev: Topic[]) => Topic[])) => void;
  difficulty: Difficulty;
  setDifficulty: (level: Difficulty) => void;
  techMode: TechMode;
  setTechMode: (mode: TechMode) => void;
  avoidSimilarQuestions: boolean;
  setAvoidSimilarQuestions: (enabled: boolean) => void;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  setMathMethodsSubtopics: (subtopics: MathMethodsSubtopic[] | ((prev: MathMethodsSubtopic[]) => MathMethodsSubtopic[])) => void;
  specialistMathSubtopics: SpecialistMathSubtopic[];
  setSpecialistMathSubtopics: (subtopics: SpecialistMathSubtopic[] | ((prev: SpecialistMathSubtopic[]) => SpecialistMathSubtopic[])) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  setChemistrySubtopics: (subtopics: ChemistrySubtopic[] | ((prev: ChemistrySubtopic[]) => ChemistrySubtopic[])) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  setPhysicalEducationSubtopics: (subtopics: PhysicalEducationSubtopic[] | ((prev: PhysicalEducationSubtopic[]) => PhysicalEducationSubtopic[])) => void;
  questionCount: number;
  setQuestionCount: (count: number) => void;
  maxMarksPerQuestion: number;
  setMaxMarksPerQuestion: (marks: number) => void;
  subtopicInstructions: Record<string, string>;
  setSubtopicInstructions: (instructions: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  model: string;
  setModel: (model: string) => void;
  markingModel: string;
  setMarkingModel: (model: string) => void;
  useSeparateMarkingModel: boolean;
  setUseSeparateMarkingModel: (enabled: boolean) => void;
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;

  questionMode: QuestionMode;
  setQuestionMode: (mode: QuestionMode) => void;

  questions: GeneratedQuestion[];
  setQuestions: (questions: GeneratedQuestion[]) => void;
  activeQuestionIndex: number;
  setActiveQuestionIndex: (idx: number) => void;
  writtenQuestionPresentedAtById: Record<string, number>;
  setWrittenQuestionPresentedAtById: (presentedAt: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  answersByQuestionId: Record<string, string>;
  setAnswersByQuestionId: (answers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  setImagesByQuestionId: (images: Record<string, StudentAnswerImage | undefined> | ((prev: Record<string, StudentAnswerImage | undefined>) => Record<string, StudentAnswerImage | undefined>)) => void;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  setFeedbackByQuestionId: (feedback: Record<string, MarkAnswerResponse> | ((prev: Record<string, MarkAnswerResponse>) => Record<string, MarkAnswerResponse>)) => void;
  questionHistory: QuestionHistoryEntry[];
  setQuestionHistory: (history: QuestionHistoryEntry[] | ((prev: QuestionHistoryEntry[]) => QuestionHistoryEntry[])) => void;

  mcQuestions: McQuestion[];
  setMcQuestions: (questions: McQuestion[]) => void;
  activeMcQuestionIndex: number;
  setActiveMcQuestionIndex: (idx: number) => void;
  mcQuestionPresentedAtById: Record<string, number>;
  setMcQuestionPresentedAtById: (presentedAt: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  mcAnswersByQuestionId: Record<string, string>;
  setMcAnswersByQuestionId: (answers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  mcHistory: McHistoryEntry[];
  setMcHistory: (history: McHistoryEntry[] | ((prev: McHistoryEntry[]) => McHistoryEntry[])) => void;
  writtenRawModelOutput: string;
  setWrittenRawModelOutput: (output: string) => void;
  mcRawModelOutput: string;
  setMcRawModelOutput: (output: string) => void;
  writtenGenerationTelemetry: GenerationTelemetry | null;
  setWrittenGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  mcGenerationTelemetry: GenerationTelemetry | null;
  setMcGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  activeWrittenSavedSetId: string | null;
  setActiveWrittenSavedSetId: (id: string | null) => void;
  activeMcSavedSetId: string | null;
  setActiveMcSavedSetId: (id: string | null) => void;
  savedSets: SavedQuestionSet[];
  saveCurrentSet: () => string | null;
  loadSavedSet: (savedSetId: string) => void;
  deleteSavedSet: (savedSetId: string) => void;

  isGenerating: boolean;
  setIsGenerating: (is: boolean) => void;
  generationStatus: GenerationStatusEvent | null;
  setGenerationStatus: (status: GenerationStatusEvent | null) => void;
  generationStartedAt: number | null;
  setGenerationStartedAt: (startedAt: number | null) => void;
  isMarking: boolean;
  setIsMarking: (is: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;

  clearApiKey: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

type ArrayStateUpdate<T> = T[] | ((prev: T[]) => T[]);

function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  const leadTopic = topics[0] ?? "Mixed Topics";
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === "written" ? "Written" : "Multiple Choice";
  if (extraCount === 0) {
    return `${leadTopic} ${modeLabel}`;
  }
  return `${leadTopic} +${extraCount} ${modeLabel}`;
}

function applyHistoryLimit<T>(entries: T[]) {
  return entries.slice(0, HISTORY_ENTRY_LIMIT);
}

function applySavedSetLimit(entries: SavedQuestionSet[]) {
  return entries.slice(0, SAVED_SET_LIMIT);
}

function resolveArrayStateUpdate<T>(update: ArrayStateUpdate<T>, previous: T[]) {
  return typeof update === "function" ? update(previous) : update;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const {
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    model,
    setModel,
    markingModel,
    setMarkingModel,
    useSeparateMarkingModel,
    setUseSeparateMarkingModel,
    debugMode,
    setDebugMode,
  } = useSettingsState();

  const {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
    setSubtopicInstructions,
  } = usePreferencesState();

  const {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    writtenQuestionPresentedAtById,
    setWrittenQuestionPresentedAtById,
    answersByQuestionId,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    feedbackByQuestionId,
    setFeedbackByQuestionId,
    questionHistory,
    setQuestionHistory,
    writtenRawModelOutput,
    setWrittenRawModelOutput,
    writtenGenerationTelemetry,
    setWrittenGenerationTelemetry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
  } = useWrittenSessionState();

  const {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcQuestionPresentedAtById,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    setMcHistory,
    mcRawModelOutput,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
  } = useMultipleChoiceSessionState();

  const [savedSets, setSavedSets] = useState<SavedQuestionSet[]>(EMPTY_PERSISTED_APP_STATE.savedSets);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatusEvent | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hydrateCompleteRef = useRef(false);

  const preferencesSnapshot = useMemo<PersistedGeneratorPreferences>(() => {
    return {
      selectedTopics,
      difficulty,
      techMode,
      avoidSimilarQuestions,
      mathMethodsSubtopics,
      specialistMathSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
      questionCount,
      maxMarksPerQuestion,
      questionMode,
      subtopicInstructions,
    };
  }, [
    selectedTopics,
    difficulty,
    techMode,
    avoidSimilarQuestions,
    mathMethodsSubtopics,
    specialistMathSubtopics,
    chemistrySubtopics,
    physicalEducationSubtopics,
    questionCount,
    maxMarksPerQuestion,
    questionMode,
    subtopicInstructions,
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const persisted = await loadPersistedAppState();
        if (cancelled) {
          return;
        }

        applyPersistedState(persisted);
      } catch {
        if (!cancelled) {
          setErrorMessage("Could not load saved app data.");
        }
      } finally {
        if (!cancelled) {
          hydrateCompleteRef.current = true;
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const settingsSnapshot = useMemo(() => ({
    apiKey,
    model,
    markingModel,
    useSeparateMarkingModel,
    debugMode,
  }), [apiKey, model, markingModel, useSeparateMarkingModel, debugMode]);

  const writtenSessionSnapshot = useMemo<PersistedWrittenSession>(() => ({
    questions,
    activeQuestionIndex,
    presentedAtByQuestionId: writtenQuestionPresentedAtById,
    answersByQuestionId,
    imagesByQuestionId,
    feedbackByQuestionId,
    rawModelOutput: writtenRawModelOutput,
    generationTelemetry: writtenGenerationTelemetry,
    savedSetId: activeWrittenSavedSetId,
  }), [
    questions,
    activeQuestionIndex,
    writtenQuestionPresentedAtById,
    answersByQuestionId,
    imagesByQuestionId,
    feedbackByQuestionId,
    writtenRawModelOutput,
    writtenGenerationTelemetry,
    activeWrittenSavedSetId,
  ]);

  const mcSessionSnapshot = useMemo<PersistedMcSession>(() => ({
    questions: mcQuestions,
    activeQuestionIndex: activeMcQuestionIndex,
    presentedAtByQuestionId: mcQuestionPresentedAtById,
    answersByQuestionId: mcAnswersByQuestionId,
    rawModelOutput: mcRawModelOutput,
    generationTelemetry: mcGenerationTelemetry,
    savedSetId: activeMcSavedSetId,
  }), [
    mcQuestions,
    activeMcQuestionIndex,
    mcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    mcRawModelOutput,
    mcGenerationTelemetry,
    activeMcSavedSetId,
  ]);

  const historySnapshot = useMemo(() => ({
    questionHistory: applyHistoryLimit(questionHistory),
    mcHistory: applyHistoryLimit(mcHistory),
  }), [questionHistory, mcHistory]);

  const savedSetsSnapshot = useMemo(() => applySavedSetLimit(savedSets), [savedSets]);

  useEffect(() => {
    let unlisten: undefined | (() => void);

    void listen<GenerationStatusEvent>("generation-status", (event) => {
      setGenerationStatus(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const persistedSnapshot = useMemo<PersistedAppState>(() => ({
    version: EMPTY_PERSISTED_APP_STATE.version,
    settings: settingsSnapshot,
    preferences: preferencesSnapshot,
    writtenSession: writtenSessionSnapshot,
    mcSession: mcSessionSnapshot,
    questionHistory: historySnapshot.questionHistory,
    mcHistory: historySnapshot.mcHistory,
    savedSets: savedSetsSnapshot,
  }), [
    settingsSnapshot,
    preferencesSnapshot,
    writtenSessionSnapshot,
    mcSessionSnapshot,
    historySnapshot,
    savedSetsSnapshot,
  ]);

  useEffect(() => {
    if (!hydrateCompleteRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePersistedAppState(persistedSnapshot).catch(() => {
        setErrorMessage((current) => current ?? "Could not save app data.");
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [persistedSnapshot]);

  function applyPersistedState(state: PersistedAppState) {
    setApiKey(state.settings.apiKey);
    setModel(state.settings.model);
    setMarkingModel(state.settings.markingModel);
    setUseSeparateMarkingModel(Boolean(state.settings.useSeparateMarkingModel));
    setDebugMode(state.settings.debugMode);
    setSelectedTopics(state.preferences.selectedTopics);
    setDifficulty(state.preferences.difficulty);
    setTechMode(state.preferences.techMode);
    setAvoidSimilarQuestions(state.preferences.avoidSimilarQuestions);
    setMathMethodsSubtopics(state.preferences.mathMethodsSubtopics);
    setSpecialistMathSubtopics(state.preferences.specialistMathSubtopics);
    setChemistrySubtopics(state.preferences.chemistrySubtopics);
    setPhysicalEducationSubtopics(state.preferences.physicalEducationSubtopics);
    setQuestionCount(state.preferences.questionCount);
    setMaxMarksPerQuestion(state.preferences.maxMarksPerQuestion);
    setQuestionMode(state.preferences.questionMode);
    setSubtopicInstructions(state.preferences.subtopicInstructions);

    setQuestions(state.writtenSession.questions);
    setActiveQuestionIndex(state.writtenSession.activeQuestionIndex);
    setWrittenQuestionPresentedAtById(state.writtenSession.presentedAtByQuestionId);
    setAnswersByQuestionId(state.writtenSession.answersByQuestionId);
    setImagesByQuestionId(state.writtenSession.imagesByQuestionId);
    setFeedbackByQuestionId(state.writtenSession.feedbackByQuestionId);
    setWrittenRawModelOutput(state.writtenSession.rawModelOutput);
    setWrittenGenerationTelemetry(state.writtenSession.generationTelemetry ?? null);
    setActiveWrittenSavedSetId(state.writtenSession.savedSetId ?? null);

    setMcQuestions(state.mcSession.questions);
    setActiveMcQuestionIndex(state.mcSession.activeQuestionIndex);
    setMcQuestionPresentedAtById(state.mcSession.presentedAtByQuestionId);
    setMcAnswersByQuestionId(state.mcSession.answersByQuestionId);
    setMcRawModelOutput(state.mcSession.rawModelOutput);
    setMcGenerationTelemetry(state.mcSession.generationTelemetry ?? null);
    setActiveMcSavedSetId(state.mcSession.savedSetId ?? null);

    setQuestionHistory(state.questionHistory);
    setMcHistory(state.mcHistory);
    setSavedSets(state.savedSets);
  }

  function saveCurrentSet() {
    const now = new Date().toISOString();

    if (questionMode === "written") {
      if (questions.length === 0) {
        return null;
      }

      const savedSetId = activeWrittenSavedSetId ?? `saved-written-${Date.now()}`;
      const existing = savedSets.find((entry) => entry.id === savedSetId);
      const nextEntry: SavedQuestionSet = {
        id: savedSetId,
        title: buildSavedSetTitle("written", selectedTopics),
        questionMode: "written",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        preferences: preferencesSnapshot,
        writtenSession: {
          questions,
          activeQuestionIndex,
          presentedAtByQuestionId: writtenQuestionPresentedAtById,
          answersByQuestionId,
          imagesByQuestionId,
          feedbackByQuestionId,
          rawModelOutput: writtenRawModelOutput,
          generationTelemetry: writtenGenerationTelemetry,
          savedSetId,
        },
      };

      // compute next saved sets and persist immediately for explicit save
      const nextSavedSets = applySavedSetLimit([nextEntry, ...savedSets.filter((entry) => entry.id !== savedSetId)]);
      setSavedSets(nextSavedSets);
      setActiveWrittenSavedSetId(savedSetId);

      const nextPersisted = { ...persistedSnapshot, savedSets: nextSavedSets };
      void savePersistedAppState(nextPersisted).catch(() => setErrorMessage((current) => current ?? "Could not save app data."));
      return savedSetId;
    }

    if (mcQuestions.length === 0) {
      return null;
    }

    const savedSetId = activeMcSavedSetId ?? `saved-mc-${Date.now()}`;
    const existing = savedSets.find((entry) => entry.id === savedSetId);
    const nextEntry: SavedQuestionSet = {
      id: savedSetId,
      title: buildSavedSetTitle("multiple-choice", selectedTopics),
      questionMode: "multiple-choice",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      preferences: preferencesSnapshot,
      mcSession: {
        questions: mcQuestions,
        activeQuestionIndex: activeMcQuestionIndex,
          presentedAtByQuestionId: mcQuestionPresentedAtById,
        answersByQuestionId: mcAnswersByQuestionId,
        rawModelOutput: mcRawModelOutput,
        generationTelemetry: mcGenerationTelemetry,
        savedSetId,
      },
    };

    const nextSavedSets = applySavedSetLimit([nextEntry, ...savedSets.filter((entry) => entry.id !== savedSetId)]);
    setSavedSets(nextSavedSets);
    setActiveMcSavedSetId(savedSetId);

    const nextPersisted = { ...persistedSnapshot, savedSets: nextSavedSets };
    void savePersistedAppState(nextPersisted).catch(() => setErrorMessage((current) => current ?? "Could not save app data."));
    return savedSetId;
  }

  function loadSavedSet(savedSetId: string) {
    const entry = savedSets.find((candidate) => candidate.id === savedSetId);
    if (!entry) {
      return;
    }
    // If user has an active non-empty session that isn't already the target saved set,
    // offer to save current work first (OK = save & load, Cancel = abort).
    const hasUnsaved = (questionMode === "written" ? questions.length > 0 : mcQuestions.length > 0) &&
      !(entry.id === (questionMode === "written" ? activeWrittenSavedSetId : activeMcSavedSetId));

    if (hasUnsaved) {
      const doSaveAndLoad = confirmAction("You have unsaved work. Click OK to save current session and load the selected set, or Cancel to abort.");
      if (!doSaveAndLoad) return;
      // attempt to save current session before loading
      try { saveCurrentSet(); } catch { /* ignore */ }
    }

    startTransition(() => {
      setSelectedTopics(entry.preferences.selectedTopics);
      setDifficulty(entry.preferences.difficulty);
      setTechMode(entry.preferences.techMode);
      setAvoidSimilarQuestions(entry.preferences.avoidSimilarQuestions);
      setMathMethodsSubtopics(entry.preferences.mathMethodsSubtopics);
      setChemistrySubtopics(entry.preferences.chemistrySubtopics);
      setPhysicalEducationSubtopics(entry.preferences.physicalEducationSubtopics);
      setSpecialistMathSubtopics(entry.preferences.specialistMathSubtopics);
      setQuestionCount(entry.preferences.questionCount);
      setQuestionMode(entry.questionMode);
      setSubtopicInstructions(entry.preferences.subtopicInstructions);

      if (entry.questionMode === "written" && entry.writtenSession) {
        setQuestions(entry.writtenSession.questions);
        setActiveQuestionIndex(entry.writtenSession.activeQuestionIndex);
        setWrittenQuestionPresentedAtById(entry.writtenSession.presentedAtByQuestionId);
        setAnswersByQuestionId(entry.writtenSession.answersByQuestionId);
        setImagesByQuestionId(entry.writtenSession.imagesByQuestionId);
        setFeedbackByQuestionId(entry.writtenSession.feedbackByQuestionId);
        setWrittenRawModelOutput(entry.writtenSession.rawModelOutput);
        setWrittenGenerationTelemetry(entry.writtenSession.generationTelemetry ?? null);
        setActiveWrittenSavedSetId(entry.id);
      }

      if (entry.questionMode === "multiple-choice" && entry.mcSession) {
        setMcQuestions(entry.mcSession.questions);
        setActiveMcQuestionIndex(entry.mcSession.activeQuestionIndex);
        setMcQuestionPresentedAtById(entry.mcSession.presentedAtByQuestionId);
        setMcAnswersByQuestionId(entry.mcSession.answersByQuestionId);
        setMcRawModelOutput(entry.mcSession.rawModelOutput);
        setMcGenerationTelemetry(entry.mcSession.generationTelemetry ?? null);
        setActiveMcSavedSetId(entry.id);
      }
    });
  }

  const setQuestionHistoryWithLimit = useCallback((history: ArrayStateUpdate<QuestionHistoryEntry>) => {
    setQuestionHistory((prev) => applyHistoryLimit(resolveArrayStateUpdate(history, prev)));
  }, []);

  const setMcHistoryWithLimit = useCallback((history: ArrayStateUpdate<McHistoryEntry>) => {
    setMcHistory((prev) => applyHistoryLimit(resolveArrayStateUpdate(history, prev)));
  }, []);

  function deleteSavedSet(savedSetId: string) {
    setSavedSets((prev) => prev.filter((entry) => entry.id !== savedSetId));
    if (activeWrittenSavedSetId === savedSetId) {
      setActiveWrittenSavedSetId(null);
    }
    if (activeMcSavedSetId === savedSetId) {
      setActiveMcSavedSetId(null);
    }
  }

  function clearApiKey() {
    setApiKey("");
  }

  return (
    <AppContext.Provider
      value={{
        isHydrated,
        apiKey,
        setApiKey,
        showApiKey,
        setShowApiKey,
        selectedTopics,
        setSelectedTopics,
        difficulty,
        setDifficulty,
        techMode,
        setTechMode,
        avoidSimilarQuestions,
        setAvoidSimilarQuestions,
        mathMethodsSubtopics,
        setMathMethodsSubtopics,
        specialistMathSubtopics,
        setSpecialistMathSubtopics,
        chemistrySubtopics,
        setChemistrySubtopics,
        physicalEducationSubtopics,
        setPhysicalEducationSubtopics,
        questionCount,
        setQuestionCount,
        maxMarksPerQuestion,
        setMaxMarksPerQuestion,
        subtopicInstructions,
        setSubtopicInstructions,
        model,
        setModel,
        markingModel,
        setMarkingModel,
        useSeparateMarkingModel,
        setUseSeparateMarkingModel,
        debugMode,
        setDebugMode,
        questionMode,
        setQuestionMode,
        questions,
        setQuestions,
        activeQuestionIndex,
        setActiveQuestionIndex,
        writtenQuestionPresentedAtById,
        setWrittenQuestionPresentedAtById,
        answersByQuestionId,
        setAnswersByQuestionId,
        imagesByQuestionId,
        setImagesByQuestionId,
        feedbackByQuestionId,
        setFeedbackByQuestionId,
        questionHistory,
        setQuestionHistory: setQuestionHistoryWithLimit,
        mcQuestions,
        setMcQuestions,
        activeMcQuestionIndex,
        setActiveMcQuestionIndex,
        mcQuestionPresentedAtById,
        setMcQuestionPresentedAtById,
        mcAnswersByQuestionId,
        setMcAnswersByQuestionId,
        mcHistory,
        setMcHistory: setMcHistoryWithLimit,
        writtenRawModelOutput,
        setWrittenRawModelOutput,
        mcRawModelOutput,
        setMcRawModelOutput,
        writtenGenerationTelemetry,
        setWrittenGenerationTelemetry,
        mcGenerationTelemetry,
        setMcGenerationTelemetry,
        activeWrittenSavedSetId,
        setActiveWrittenSavedSetId,
        activeMcSavedSetId,
        setActiveMcSavedSetId,
        savedSets,
        saveCurrentSet,
        loadSavedSet,
        deleteSavedSet,
        isGenerating,
        setIsGenerating,
        generationStatus,
        setGenerationStatus,
        generationStartedAt,
        setGenerationStartedAt,
        isMarking,
        setIsMarking,
        errorMessage,
        setErrorMessage,
        clearApiKey,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}

export function useAppPreferences() {
  const {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
    setSubtopicInstructions,
  } = useAppContext();

  return {
    selectedTopics,
    setSelectedTopics,
    difficulty,
    setDifficulty,
    techMode,
    setTechMode,
    avoidSimilarQuestions,
    setAvoidSimilarQuestions,
    mathMethodsSubtopics,
    setMathMethodsSubtopics,
    specialistMathSubtopics,
    setSpecialistMathSubtopics,
    chemistrySubtopics,
    setChemistrySubtopics,
    physicalEducationSubtopics,
    setPhysicalEducationSubtopics,
    questionCount,
    setQuestionCount,
    maxMarksPerQuestion,
    setMaxMarksPerQuestion,
    questionMode,
    setQuestionMode,
    subtopicInstructions,
    setSubtopicInstructions,
  };
}

export function useAppSettings() {
  const {
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    model,
    setModel,
    markingModel,
    setMarkingModel,
    useSeparateMarkingModel,
    setUseSeparateMarkingModel,
    debugMode,
    setDebugMode,
    clearApiKey,
  } = useAppContext();

  return {
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    model,
    setModel,
    markingModel,
    setMarkingModel,
    useSeparateMarkingModel,
    setUseSeparateMarkingModel,
    debugMode,
    setDebugMode,
    clearApiKey,
  };
}

export function useWrittenSession() {
  const {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    writtenQuestionPresentedAtById,
    setWrittenQuestionPresentedAtById,
    answersByQuestionId,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    feedbackByQuestionId,
    setFeedbackByQuestionId,
    questionHistory,
    setQuestionHistory,
    writtenRawModelOutput,
    setWrittenRawModelOutput,
    writtenGenerationTelemetry,
    setWrittenGenerationTelemetry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
  } = useAppContext();

  return {
    questions,
    setQuestions,
    activeQuestionIndex,
    setActiveQuestionIndex,
    writtenQuestionPresentedAtById,
    setWrittenQuestionPresentedAtById,
    answersByQuestionId,
    setAnswersByQuestionId,
    imagesByQuestionId,
    setImagesByQuestionId,
    feedbackByQuestionId,
    setFeedbackByQuestionId,
    questionHistory,
    setQuestionHistory,
    writtenRawModelOutput,
    setWrittenRawModelOutput,
    writtenGenerationTelemetry,
    setWrittenGenerationTelemetry,
    activeWrittenSavedSetId,
    setActiveWrittenSavedSetId,
  };
}

export function useMultipleChoiceSession() {
  const {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcQuestionPresentedAtById,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    setMcHistory,
    mcRawModelOutput,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
  } = useAppContext();

  return {
    mcQuestions,
    setMcQuestions,
    activeMcQuestionIndex,
    setActiveMcQuestionIndex,
    mcQuestionPresentedAtById,
    setMcQuestionPresentedAtById,
    mcAnswersByQuestionId,
    setMcAnswersByQuestionId,
    mcHistory,
    setMcHistory,
    mcRawModelOutput,
    setMcRawModelOutput,
    mcGenerationTelemetry,
    setMcGenerationTelemetry,
    activeMcSavedSetId,
    setActiveMcSavedSetId,
  };
}

export function useSavedSets() {
  const {
    savedSets,
    saveCurrentSet,
    loadSavedSet,
    deleteSavedSet,
  } = useAppContext();

  return {
    savedSets,
    saveCurrentSet,
    loadSavedSet,
    deleteSavedSet,
  };
}
