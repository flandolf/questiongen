import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Topic,
  Difficulty,
  TechMode,
  MathMethodsSubtopic,
  ChemistrySubtopic,
  PhysicalEducationSubtopic,
  GeneratedQuestion,
  MarkAnswerResponse,
  QuestionHistoryEntry,
  StudentAnswerImage,
  QuestionMode,
  McQuestion,
  McHistoryEntry,
  API_KEY_STORAGE_KEY,
  QUESTION_HISTORY_STORAGE_KEY,
  MC_HISTORY_STORAGE_KEY,
} from "./types";

interface AppContextState {
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

  isGenerating: boolean;
  setIsGenerating: (is: boolean) => void;
  isMarking: boolean;
  setIsMarking: (is: boolean) => void;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;

  clearApiKey: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

function normalizeMarkResponse(entry: MarkAnswerResponse, _maxMarks: number): MarkAnswerResponse {
  // Normalize missing optional fields
  return {
    ...entry,
    vcaaMarkingScheme: entry.vcaaMarkingScheme || [],
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [techMode, setTechMode] = useState<TechMode>("mix");
  const [mathMethodsSubtopics, setMathMethodsSubtopics] = useState<MathMethodsSubtopic[]>([]);
  const [chemistrySubtopics, setChemistrySubtopics] = useState<ChemistrySubtopic[]>([]);
  const [physicalEducationSubtopics, setPhysicalEducationSubtopics] = useState<PhysicalEducationSubtopic[]>([]);
  const [questionCount, setQuestionCount] = useState(3);
  const [maxMarksPerQuestion, setMaxMarksPerQuestion] = useState(10);
  const [model, setModel] = useState("openrouter/healer-alpha");

  const [questionMode, setQuestionMode] = useState<QuestionMode>("written");

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>({});
  const [imagesByQuestionId, setImagesByQuestionId] = useState<Record<string, StudentAnswerImage | undefined>>({});
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState<Record<string, MarkAnswerResponse>>({});
  const [questionHistory, setQuestionHistory] = useState<QuestionHistoryEntry[]>([]);

  const [mcQuestions, setMcQuestions] = useState<McQuestion[]>([]);
  const [activeMcQuestionIndex, setActiveMcQuestionIndex] = useState(0);
  const [mcAnswersByQuestionId, setMcAnswersByQuestionId] = useState<Record<string, string>>({});
  const [mcHistory, setMcHistory] = useState<McHistoryEntry[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const persisted = window.localStorage.getItem(API_KEY_STORAGE_KEY);
    if (persisted) {
      setApiKey(persisted);
    }

    const persistedHistory = window.localStorage.getItem(QUESTION_HISTORY_STORAGE_KEY);
    if (!persistedHistory) {
      return;
    }

    try {
      const parsed = JSON.parse(persistedHistory) as QuestionHistoryEntry[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((entry) => {
          const questionMax = Number(entry?.question?.maxMarks) || 10;
          return {
            ...entry,
            question: {
              ...entry.question,
              maxMarks: questionMax,
            },
            markResponse: normalizeMarkResponse(entry.markResponse, questionMax),
          };
        });
        setQuestionHistory(normalized);
      }
    } catch {
      window.localStorage.removeItem(QUESTION_HISTORY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (apiKey.trim().length > 0) {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
      return;
    }
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  }, [apiKey]);

  useEffect(() => {
    window.localStorage.setItem(QUESTION_HISTORY_STORAGE_KEY, JSON.stringify(questionHistory));
  }, [questionHistory]);

  useEffect(() => {
    const persisted = window.localStorage.getItem(MC_HISTORY_STORAGE_KEY);
    if (!persisted) return;
    try {
      const parsed = JSON.parse(persisted) as McHistoryEntry[];
      if (Array.isArray(parsed)) setMcHistory(parsed);
    } catch {
      window.localStorage.removeItem(MC_HISTORY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MC_HISTORY_STORAGE_KEY, JSON.stringify(mcHistory));
  }, [mcHistory]);

  function clearApiKey() {
    setApiKey("");
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  return (
    <AppContext.Provider
      value={{
        apiKey, setApiKey,
        showApiKey, setShowApiKey,
        selectedTopics, setSelectedTopics,
        difficulty, setDifficulty,
        techMode, setTechMode,
        mathMethodsSubtopics, setMathMethodsSubtopics,
        chemistrySubtopics, setChemistrySubtopics,
        physicalEducationSubtopics, setPhysicalEducationSubtopics,
        questionCount, setQuestionCount,
        maxMarksPerQuestion, setMaxMarksPerQuestion,
        model, setModel,
        questionMode, setQuestionMode,
        questions, setQuestions,
        activeQuestionIndex, setActiveQuestionIndex,
        answersByQuestionId, setAnswersByQuestionId,
        imagesByQuestionId, setImagesByQuestionId,
        feedbackByQuestionId, setFeedbackByQuestionId,
        questionHistory, setQuestionHistory,
        mcQuestions, setMcQuestions,
        activeMcQuestionIndex, setActiveMcQuestionIndex,
        mcAnswersByQuestionId, setMcAnswersByQuestionId,
        mcHistory, setMcHistory,
        isGenerating, setIsGenerating,
        isMarking, setIsMarking,
        errorMessage, setErrorMessage,
        clearApiKey
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
