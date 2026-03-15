import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ChemistrySubtopic,
  Difficulty,
  GeneratedQuestion,
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
  StudentAnswerImage,
  TechMode,
  Topic,
} from "./types";
import { EMPTY_PERSISTED_APP_STATE, loadPersistedAppState, savePersistedAppState } from "./lib/persistence";

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
  mathMethodsSubtopics: MathMethodsSubtopic[];
  setMathMethodsSubtopics: (subtopics: MathMethodsSubtopic[] | ((prev: MathMethodsSubtopic[]) => MathMethodsSubtopic[])) => void;
  chemistrySubtopics: ChemistrySubtopic[];
  setChemistrySubtopics: (subtopics: ChemistrySubtopic[] | ((prev: ChemistrySubtopic[]) => ChemistrySubtopic[])) => void;
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  setPhysicalEducationSubtopics: (subtopics: PhysicalEducationSubtopic[] | ((prev: PhysicalEducationSubtopic[]) => PhysicalEducationSubtopic[])) => void;
  questionCount: number;
  setQuestionCount: (count: number) => void;
  maxMarksPerQuestion: number;
  setMaxMarksPerQuestion: (marks: number) => void;
  model: string;
  setModel: (model: string) => void;
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;

  questionMode: QuestionMode;
  setQuestionMode: (mode: QuestionMode) => void;

  questions: GeneratedQuestion[];
  setQuestions: (questions: GeneratedQuestion[]) => void;
  activeQuestionIndex: number;
  setActiveQuestionIndex: (idx: number) => void;
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
  isMarking: boolean;
  setIsMarking: (is: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;

  clearApiKey: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [apiKey, setApiKey] = useState(EMPTY_PERSISTED_APP_STATE.settings.apiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics);
  const [difficulty, setDifficulty] = useState<Difficulty>(EMPTY_PERSISTED_APP_STATE.preferences.difficulty);
  const [techMode, setTechMode] = useState<TechMode>(EMPTY_PERSISTED_APP_STATE.preferences.techMode);
  const [mathMethodsSubtopics, setMathMethodsSubtopics] = useState<MathMethodsSubtopic[]>(EMPTY_PERSISTED_APP_STATE.preferences.mathMethodsSubtopics);
  const [chemistrySubtopics, setChemistrySubtopics] = useState<ChemistrySubtopic[]>(EMPTY_PERSISTED_APP_STATE.preferences.chemistrySubtopics);
  const [physicalEducationSubtopics, setPhysicalEducationSubtopics] = useState<PhysicalEducationSubtopic[]>(EMPTY_PERSISTED_APP_STATE.preferences.physicalEducationSubtopics);
  const [questionCount, setQuestionCount] = useState(EMPTY_PERSISTED_APP_STATE.preferences.questionCount);
  const [maxMarksPerQuestion, setMaxMarksPerQuestion] = useState(EMPTY_PERSISTED_APP_STATE.preferences.maxMarksPerQuestion);
  const [model, setModel] = useState(EMPTY_PERSISTED_APP_STATE.settings.model);
  const [debugMode, setDebugMode] = useState(EMPTY_PERSISTED_APP_STATE.settings.debugMode);

  const [questionMode, setQuestionMode] = useState<QuestionMode>(EMPTY_PERSISTED_APP_STATE.preferences.questionMode);

  const [questions, setQuestions] = useState<GeneratedQuestion[]>(EMPTY_PERSISTED_APP_STATE.writtenSession.questions);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>(EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId);
  const [imagesByQuestionId, setImagesByQuestionId] = useState<Record<string, StudentAnswerImage | undefined>>(EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId);
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState<Record<string, MarkAnswerResponse>>(EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId);
  const [questionHistory, setQuestionHistory] = useState<QuestionHistoryEntry[]>(EMPTY_PERSISTED_APP_STATE.questionHistory);
  const [writtenRawModelOutput, setWrittenRawModelOutput] = useState(EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput);
  const [writtenGenerationTelemetry, setWrittenGenerationTelemetry] = useState<GenerationTelemetry | null>(EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null);
  const [activeWrittenSavedSetId, setActiveWrittenSavedSetId] = useState<string | null>(EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null);

  const [mcQuestions, setMcQuestions] = useState<McQuestion[]>(EMPTY_PERSISTED_APP_STATE.mcSession.questions);
  const [activeMcQuestionIndex, setActiveMcQuestionIndex] = useState(EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex);
  const [mcAnswersByQuestionId, setMcAnswersByQuestionId] = useState<Record<string, string>>(EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId);
  const [mcHistory, setMcHistory] = useState<McHistoryEntry[]>(EMPTY_PERSISTED_APP_STATE.mcHistory);
  const [mcRawModelOutput, setMcRawModelOutput] = useState(EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput);
  const [mcGenerationTelemetry, setMcGenerationTelemetry] = useState<GenerationTelemetry | null>(EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null);
  const [activeMcSavedSetId, setActiveMcSavedSetId] = useState<string | null>(EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId ?? null);

  const [savedSets, setSavedSets] = useState<SavedQuestionSet[]>(EMPTY_PERSISTED_APP_STATE.savedSets);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hydrateCompleteRef = useRef(false);

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

  const persistedSnapshot = useMemo<PersistedAppState>(() => {
    const preferencesSnapshot: PersistedGeneratorPreferences = {
      selectedTopics,
      difficulty,
      techMode,
      mathMethodsSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
      questionCount,
      maxMarksPerQuestion,
      questionMode,
    };

    const writtenSession: PersistedWrittenSession = {
      questions,
      activeQuestionIndex,
      answersByQuestionId,
      imagesByQuestionId,
      feedbackByQuestionId,
      rawModelOutput: writtenRawModelOutput,
      generationTelemetry: writtenGenerationTelemetry,
      savedSetId: activeWrittenSavedSetId,
    };

    const multipleChoiceSession: PersistedMcSession = {
      questions: mcQuestions,
      activeQuestionIndex: activeMcQuestionIndex,
      answersByQuestionId: mcAnswersByQuestionId,
      rawModelOutput: mcRawModelOutput,
      generationTelemetry: mcGenerationTelemetry,
      savedSetId: activeMcSavedSetId,
    };

    return {
      version: EMPTY_PERSISTED_APP_STATE.version,
      settings: {
        apiKey,
        model,
        debugMode,
      },
      preferences: preferencesSnapshot,
      writtenSession,
      mcSession: multipleChoiceSession,
      questionHistory: applyHistoryLimit(questionHistory),
      mcHistory: applyHistoryLimit(mcHistory),
      savedSets: applySavedSetLimit(savedSets),
    };
  }, [
    activeMcQuestionIndex,
    activeMcSavedSetId,
    activeQuestionIndex,
    activeWrittenSavedSetId,
    answersByQuestionId,
    apiKey,
    chemistrySubtopics,
    debugMode,
    difficulty,
    feedbackByQuestionId,
    imagesByQuestionId,
    mathMethodsSubtopics,
    maxMarksPerQuestion,
    mcAnswersByQuestionId,
    mcGenerationTelemetry,
    mcHistory,
    mcQuestions,
    mcRawModelOutput,
    model,
    physicalEducationSubtopics,
    questionCount,
    questionHistory,
    questionMode,
    questions,
    savedSets,
    selectedTopics,
    techMode,
    writtenGenerationTelemetry,
    writtenRawModelOutput,
  ]);

  useEffect(() => {
    if (!hydrateCompleteRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePersistedAppState(persistedSnapshot).catch(() => {
        setErrorMessage((current) => current ?? "Could not save app data.");
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [persistedSnapshot]);

  function applyPersistedState(state: PersistedAppState) {
    setApiKey(state.settings.apiKey);
    setModel(state.settings.model);
    setDebugMode(state.settings.debugMode);
    setSelectedTopics(state.preferences.selectedTopics);
    setDifficulty(state.preferences.difficulty);
    setTechMode(state.preferences.techMode);
    setMathMethodsSubtopics(state.preferences.mathMethodsSubtopics);
    setChemistrySubtopics(state.preferences.chemistrySubtopics);
    setPhysicalEducationSubtopics(state.preferences.physicalEducationSubtopics);
    setQuestionCount(state.preferences.questionCount);
    setMaxMarksPerQuestion(state.preferences.maxMarksPerQuestion);
    setQuestionMode(state.preferences.questionMode);

    setQuestions(state.writtenSession.questions);
    setActiveQuestionIndex(state.writtenSession.activeQuestionIndex);
    setAnswersByQuestionId(state.writtenSession.answersByQuestionId);
    setImagesByQuestionId(state.writtenSession.imagesByQuestionId);
    setFeedbackByQuestionId(state.writtenSession.feedbackByQuestionId);
    setWrittenRawModelOutput(state.writtenSession.rawModelOutput);
    setWrittenGenerationTelemetry(state.writtenSession.generationTelemetry ?? null);
    setActiveWrittenSavedSetId(state.writtenSession.savedSetId ?? null);

    setMcQuestions(state.mcSession.questions);
    setActiveMcQuestionIndex(state.mcSession.activeQuestionIndex);
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
    const preferencesSnapshot: PersistedGeneratorPreferences = {
      selectedTopics,
      difficulty,
      techMode,
      mathMethodsSubtopics,
      chemistrySubtopics,
      physicalEducationSubtopics,
      questionCount,
      maxMarksPerQuestion,
      questionMode,
    };

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
          answersByQuestionId,
          imagesByQuestionId,
          feedbackByQuestionId,
          rawModelOutput: writtenRawModelOutput,
          generationTelemetry: writtenGenerationTelemetry,
          savedSetId,
        },
      };

      setSavedSets((prev) => {
        const remaining = prev.filter((entry) => entry.id !== savedSetId);
        return applySavedSetLimit([nextEntry, ...remaining]);
      });
      setActiveWrittenSavedSetId(savedSetId);
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
        answersByQuestionId: mcAnswersByQuestionId,
        rawModelOutput: mcRawModelOutput,
        generationTelemetry: mcGenerationTelemetry,
        savedSetId,
      },
    };

    setSavedSets((prev) => {
      const remaining = prev.filter((entry) => entry.id !== savedSetId);
      return applySavedSetLimit([nextEntry, ...remaining]);
    });
    setActiveMcSavedSetId(savedSetId);
    return savedSetId;
  }

  function loadSavedSet(savedSetId: string) {
    const entry = savedSets.find((candidate) => candidate.id === savedSetId);
    if (!entry) {
      return;
    }

    setSelectedTopics(entry.preferences.selectedTopics);
    setDifficulty(entry.preferences.difficulty);
    setTechMode(entry.preferences.techMode);
    setMathMethodsSubtopics(entry.preferences.mathMethodsSubtopics);
    setChemistrySubtopics(entry.preferences.chemistrySubtopics);
    setPhysicalEducationSubtopics(entry.preferences.physicalEducationSubtopics);
    setQuestionCount(entry.preferences.questionCount);
    setMaxMarksPerQuestion(entry.preferences.maxMarksPerQuestion);
    setQuestionMode(entry.questionMode);

    if (entry.questionMode === "written" && entry.writtenSession) {
      setQuestions(entry.writtenSession.questions);
      setActiveQuestionIndex(entry.writtenSession.activeQuestionIndex);
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
      setMcAnswersByQuestionId(entry.mcSession.answersByQuestionId);
      setMcRawModelOutput(entry.mcSession.rawModelOutput);
      setMcGenerationTelemetry(entry.mcSession.generationTelemetry ?? null);
      setActiveMcSavedSetId(entry.id);
    }
  }

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
        mathMethodsSubtopics,
        setMathMethodsSubtopics,
        chemistrySubtopics,
        setChemistrySubtopics,
        physicalEducationSubtopics,
        setPhysicalEducationSubtopics,
        questionCount,
        setQuestionCount,
        maxMarksPerQuestion,
        setMaxMarksPerQuestion,
        model,
        setModel,
        debugMode,
        setDebugMode,
        questionMode,
        setQuestionMode,
        questions,
        setQuestions,
        activeQuestionIndex,
        setActiveQuestionIndex,
        answersByQuestionId,
        setAnswersByQuestionId,
        imagesByQuestionId,
        setImagesByQuestionId,
        feedbackByQuestionId,
        setFeedbackByQuestionId,
        questionHistory,
        setQuestionHistory: (history) => {
          setQuestionHistory((prev) => applyHistoryLimit(typeof history === "function" ? history(prev) : history));
        },
        mcQuestions,
        setMcQuestions,
        activeMcQuestionIndex,
        setActiveMcQuestionIndex,
        mcAnswersByQuestionId,
        setMcAnswersByQuestionId,
        mcHistory,
        setMcHistory: (history) => {
          setMcHistory((prev) => applyHistoryLimit(typeof history === "function" ? history(prev) : history));
        },
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
