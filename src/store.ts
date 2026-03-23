/**
 * store.ts — Zustand replacement for AppContext.tsx
 *
 * Drop this file into your project alongside the updated AppContext.tsx.
 * All public hook APIs (useAppContext, useAppPreferences, useAppSettings,
 * useWrittenSession, useMultipleChoiceSession, useSavedSets) are preserved
 * so every consumer file is unchanged.
 */

import { create } from "zustand";
import { startTransition } from "react";
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
import {
  EMPTY_PERSISTED_APP_STATE,
  loadPersistedAppState,
  savePersistedAppState,
} from "./lib/persistence";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyHistoryLimit<T>(entries: T[]): T[] {
  return entries.slice(0, HISTORY_ENTRY_LIMIT);
}

function applySavedSetLimit(entries: SavedQuestionSet[]): SavedQuestionSet[] {
  return entries.slice(0, SAVED_SET_LIMIT);
}

function buildSavedSetTitle(mode: QuestionMode, topics: Topic[]) {
  const leadTopic = topics[0] ?? "Mixed Topics";
  const extraCount = Math.max(0, topics.length - 1);
  const modeLabel = mode === "written" ? "Written" : "Multiple Choice";
  return extraCount === 0
    ? `${leadTopic} ${modeLabel}`
    : `${leadTopic} +${extraCount} ${modeLabel}`;
}

// ─── State shape ──────────────────────────────────────────────────────────────

export interface AppState {
  // ── Hydration ──────────────────────────────────────────────────────────────
  isHydrated: boolean;

  // ── Settings ───────────────────────────────────────────────────────────────
  apiKey: string;
  showApiKey: boolean;
  model: string;
  markingModel: string;
  useSeparateMarkingModel: boolean;
  imageMarkingModel: string;
  useSeparateImageMarkingModel: boolean;
  debugMode: boolean;
  questionTextSize: number;

  // ── Preferences ────────────────────────────────────────────────────────────
  selectedTopics: Topic[];
  difficulty: Difficulty;
  techMode: TechMode;
  avoidSimilarQuestions: boolean;
  mathMethodsSubtopics: MathMethodsSubtopic[];
  specialistMathSubtopics: SpecialistMathSubtopic[];
  chemistrySubtopics: ChemistrySubtopic[];
  physicalEducationSubtopics: PhysicalEducationSubtopic[];
  questionCount: number;
  maxMarksPerQuestion: number;
  questionMode: QuestionMode;
  subtopicInstructions: Record<string, string>;

  // ── Written session ────────────────────────────────────────────────────────
  questions: GeneratedQuestion[];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, StudentAnswerImage | undefined>;
  feedbackByQuestionId: Record<string, MarkAnswerResponse>;
  questionHistory: QuestionHistoryEntry[];
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: GenerationTelemetry | null;
  activeWrittenSavedSetId: string | null;

  // ── MC session ─────────────────────────────────────────────────────────────
  mcQuestions: McQuestion[];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcHistory: McHistoryEntry[];
  mcRawModelOutput: string;
  mcGenerationTelemetry: GenerationTelemetry | null;
  activeMcSavedSetId: string | null;

  // ── Saved sets ─────────────────────────────────────────────────────────────
  savedSets: SavedQuestionSet[];

  // ── Generation / marking status ────────────────────────────────────────────
  isGenerating: boolean;
  generationStatus: GenerationStatusEvent | null;
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;
}

// ─── Actions shape ────────────────────────────────────────────────────────────

export interface AppActions {
  // Settings
  setApiKey: (key: string) => void;
  setShowApiKey: (show: boolean) => void;
  setModel: (model: string) => void;
  setMarkingModel: (model: string) => void;
  setUseSeparateMarkingModel: (enabled: boolean) => void;
  setImageMarkingModel: (model: string) => void;
  setUseSeparateImageMarkingModel: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  clearApiKey: () => void;
  setQuestionTextSize: (size: number) => void;

  // Preferences
  setSelectedTopics: (topics: Topic[] | ((prev: Topic[]) => Topic[])) => void;
  setDifficulty: (level: Difficulty) => void;
  setTechMode: (mode: TechMode) => void;
  setAvoidSimilarQuestions: (enabled: boolean) => void;
  setMathMethodsSubtopics: (
    subtopics: MathMethodsSubtopic[] | ((prev: MathMethodsSubtopic[]) => MathMethodsSubtopic[])
  ) => void;
  setSpecialistMathSubtopics: (
    subtopics:
      | SpecialistMathSubtopic[]
      | ((prev: SpecialistMathSubtopic[]) => SpecialistMathSubtopic[])
  ) => void;
  setChemistrySubtopics: (
    subtopics: ChemistrySubtopic[] | ((prev: ChemistrySubtopic[]) => ChemistrySubtopic[])
  ) => void;
  setPhysicalEducationSubtopics: (
    subtopics:
      | PhysicalEducationSubtopic[]
      | ((prev: PhysicalEducationSubtopic[]) => PhysicalEducationSubtopic[])
  ) => void;
  setQuestionCount: (count: number) => void;
  setMaxMarksPerQuestion: (marks: number) => void;
  setQuestionMode: (mode: QuestionMode) => void;
  setSubtopicInstructions: (
    instructions:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;

  // Written session
  setQuestions: (questions: GeneratedQuestion[]) => void;
  setActiveQuestionIndex: (idx: number) => void;
  setWrittenQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  setAnswersByQuestionId: (
    answers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setImagesByQuestionId: (
    images:
      | Record<string, StudentAnswerImage | undefined>
      | ((
          prev: Record<string, StudentAnswerImage | undefined>
        ) => Record<string, StudentAnswerImage | undefined>)
  ) => void;
  setFeedbackByQuestionId: (
    feedback:
      | Record<string, MarkAnswerResponse>
      | ((prev: Record<string, MarkAnswerResponse>) => Record<string, MarkAnswerResponse>)
  ) => void;
  setQuestionHistory: (
    history:
      | QuestionHistoryEntry[]
      | ((prev: QuestionHistoryEntry[]) => QuestionHistoryEntry[])
  ) => void;
  setWrittenRawModelOutput: (output: string) => void;
  setWrittenGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  setActiveWrittenSavedSetId: (id: string | null) => void;

  // MC session
  setMcQuestions: (questions: McQuestion[]) => void;
  setActiveMcQuestionIndex: (idx: number) => void;
  setMcQuestionPresentedAtById: (
    presentedAt:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>)
  ) => void;
  setMcAnswersByQuestionId: (
    answers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  setMcHistory: (
    history: McHistoryEntry[] | ((prev: McHistoryEntry[]) => McHistoryEntry[])
  ) => void;
  setMcRawModelOutput: (output: string) => void;
  setMcGenerationTelemetry: (telemetry: GenerationTelemetry | null) => void;
  setActiveMcSavedSetId: (id: string | null) => void;

  // Generation / marking status
  setIsGenerating: (is: boolean) => void;
  setGenerationStatus: (status: GenerationStatusEvent | null) => void;
  setGenerationStartedAt: (startedAt: number | null) => void;
  setIsMarking: (is: boolean) => void;
  setErrorMessage: (msg: string | null) => void;

  // Saved sets
  saveCurrentSet: () => string | null;
  loadSavedSet: (savedSetId: string) => void;
  needsSaveBeforeLoad: (savedSetId: string) => boolean;
  deleteSavedSet: (savedSetId: string) => void;

  // Persistence
  hydrate: () => Promise<void>;
}

// ─── Default state ────────────────────────────────────────────────────────────

const defaultState: AppState = {
  isHydrated: false,

  // Settings — pulled from the empty persisted state default
  apiKey: EMPTY_PERSISTED_APP_STATE.settings.apiKey,
  showApiKey: false,
  model: EMPTY_PERSISTED_APP_STATE.settings.model,
  markingModel: EMPTY_PERSISTED_APP_STATE.settings.markingModel,
  useSeparateMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.useSeparateMarkingModel,
  imageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.imageMarkingModel,
  useSeparateImageMarkingModel: EMPTY_PERSISTED_APP_STATE.settings.useSeparateImageMarkingModel,
  debugMode: EMPTY_PERSISTED_APP_STATE.settings.debugMode,
  questionTextSize: EMPTY_PERSISTED_APP_STATE.settings.questionTextSize ?? 16,

  // Preferences
  selectedTopics: EMPTY_PERSISTED_APP_STATE.preferences.selectedTopics,
  difficulty: EMPTY_PERSISTED_APP_STATE.preferences.difficulty,
  techMode: EMPTY_PERSISTED_APP_STATE.preferences.techMode,
  avoidSimilarQuestions: EMPTY_PERSISTED_APP_STATE.preferences.avoidSimilarQuestions,
  mathMethodsSubtopics: EMPTY_PERSISTED_APP_STATE.preferences.mathMethodsSubtopics,
  specialistMathSubtopics: EMPTY_PERSISTED_APP_STATE.preferences.specialistMathSubtopics,
  chemistrySubtopics: EMPTY_PERSISTED_APP_STATE.preferences.chemistrySubtopics,
  physicalEducationSubtopics: EMPTY_PERSISTED_APP_STATE.preferences.physicalEducationSubtopics,
  questionCount: EMPTY_PERSISTED_APP_STATE.preferences.questionCount,
  maxMarksPerQuestion: EMPTY_PERSISTED_APP_STATE.preferences.maxMarksPerQuestion,
  questionMode: EMPTY_PERSISTED_APP_STATE.preferences.questionMode,
  subtopicInstructions: EMPTY_PERSISTED_APP_STATE.preferences.subtopicInstructions,

  // Written session
  questions: EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
  activeQuestionIndex: EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
  writtenQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
  answersByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
  imagesByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId,
  feedbackByQuestionId: EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
  questionHistory: EMPTY_PERSISTED_APP_STATE.questionHistory,
  writtenRawModelOutput: EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
  writtenGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
  activeWrittenSavedSetId: EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null,

  // MC session
  mcQuestions: EMPTY_PERSISTED_APP_STATE.mcSession.questions,
  activeMcQuestionIndex: EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex,
  mcQuestionPresentedAtById: EMPTY_PERSISTED_APP_STATE.mcSession.presentedAtByQuestionId,
  mcAnswersByQuestionId: EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId,
  mcHistory: EMPTY_PERSISTED_APP_STATE.mcHistory,
  mcRawModelOutput: EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
  mcGenerationTelemetry: EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
  activeMcSavedSetId: EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId ?? null,

  // Saved sets
  savedSets: EMPTY_PERSISTED_APP_STATE.savedSets,

  // Status
  isGenerating: false,
  generationStatus: null,
  generationStartedAt: null,
  isMarking: false,
  errorMessage: null,
};

// ─── Functional updater resolution ───────────────────────────────────────────

type Updater<T> = T | ((prev: T) => T);

function resolve<T>(update: Updater<T>, previous: T): T {
  return typeof update === "function" ? (update as (prev: T) => T)(previous) : update;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...defaultState,

  // ── Hydration ──────────────────────────────────────────────────────────────

  hydrate: async () => {
    try {
      const persisted = await loadPersistedAppState();
      const s = persisted;
      set({
        // Settings
        apiKey: s.settings.apiKey,
        model: s.settings.model,
        markingModel: s.settings.markingModel,
        useSeparateMarkingModel: Boolean(s.settings.useSeparateMarkingModel),
        imageMarkingModel: s.settings.imageMarkingModel,
        useSeparateImageMarkingModel: Boolean(s.settings.useSeparateImageMarkingModel),
        debugMode: s.settings.debugMode,
        questionTextSize: typeof s.settings.questionTextSize === "number" ? s.settings.questionTextSize : 16,

        // Preferences
        selectedTopics: s.preferences.selectedTopics,
        difficulty: s.preferences.difficulty,
        techMode: s.preferences.techMode,
        avoidSimilarQuestions: s.preferences.avoidSimilarQuestions,
        mathMethodsSubtopics: s.preferences.mathMethodsSubtopics,
        specialistMathSubtopics: s.preferences.specialistMathSubtopics,
        chemistrySubtopics: s.preferences.chemistrySubtopics,
        physicalEducationSubtopics: s.preferences.physicalEducationSubtopics,
        questionCount: s.preferences.questionCount,
        maxMarksPerQuestion: s.preferences.maxMarksPerQuestion,
        questionMode: s.preferences.questionMode,
        subtopicInstructions: s.preferences.subtopicInstructions,

        // Written session
        questions: s.writtenSession.questions,
        activeQuestionIndex: s.writtenSession.activeQuestionIndex,
        writtenQuestionPresentedAtById: s.writtenSession.presentedAtByQuestionId,
        answersByQuestionId: s.writtenSession.answersByQuestionId,
        imagesByQuestionId: s.writtenSession.imagesByQuestionId,
        feedbackByQuestionId: s.writtenSession.feedbackByQuestionId,
        writtenRawModelOutput: s.writtenSession.rawModelOutput,
        writtenGenerationTelemetry: s.writtenSession.generationTelemetry ?? null,
        activeWrittenSavedSetId: s.writtenSession.savedSetId ?? null,

        // MC session
        mcQuestions: s.mcSession.questions,
        activeMcQuestionIndex: s.mcSession.activeQuestionIndex,
        mcQuestionPresentedAtById: s.mcSession.presentedAtByQuestionId,
        mcAnswersByQuestionId: s.mcSession.answersByQuestionId,
        mcRawModelOutput: s.mcSession.rawModelOutput,
        mcGenerationTelemetry: s.mcSession.generationTelemetry ?? null,
        activeMcSavedSetId: s.mcSession.savedSetId ?? null,

        // History + saved sets
        questionHistory: s.questionHistory,
        mcHistory: s.mcHistory,
        savedSets: s.savedSets,

        isHydrated: true,
      });
    } catch {
      set({ errorMessage: "Could not load saved app data.", isHydrated: true });
    }
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  setApiKey: (key) => set({ apiKey: key }),
  setShowApiKey: (show) => set({ showApiKey: show }),
  setModel: (model) => set({ model }),
  setMarkingModel: (markingModel) => set({ markingModel }),
  setUseSeparateMarkingModel: (useSeparateMarkingModel) => set({ useSeparateMarkingModel }),
  setImageMarkingModel: (imageMarkingModel) => set({ imageMarkingModel }),
  setUseSeparateImageMarkingModel: (useSeparateImageMarkingModel) =>
    set({ useSeparateImageMarkingModel }),
  setDebugMode: (debugMode) => set({ debugMode }),
  setQuestionTextSize: (questionTextSize) => set({ questionTextSize }),
  clearApiKey: () => set({ apiKey: "" }),

  // ── Preferences ────────────────────────────────────────────────────────────

  setSelectedTopics: (update) =>
    set((s) => ({ selectedTopics: resolve(update, s.selectedTopics) })),
  setDifficulty: (difficulty) => set({ difficulty }),
  setTechMode: (techMode) => set({ techMode }),
  setAvoidSimilarQuestions: (avoidSimilarQuestions) => set({ avoidSimilarQuestions }),
  setMathMethodsSubtopics: (update) =>
    set((s) => ({ mathMethodsSubtopics: resolve(update, s.mathMethodsSubtopics) })),
  setSpecialistMathSubtopics: (update) =>
    set((s) => ({ specialistMathSubtopics: resolve(update, s.specialistMathSubtopics) })),
  setChemistrySubtopics: (update) =>
    set((s) => ({ chemistrySubtopics: resolve(update, s.chemistrySubtopics) })),
  setPhysicalEducationSubtopics: (update) =>
    set((s) => ({ physicalEducationSubtopics: resolve(update, s.physicalEducationSubtopics) })),
  setQuestionCount: (questionCount) => set({ questionCount }),
  setMaxMarksPerQuestion: (maxMarksPerQuestion) => set({ maxMarksPerQuestion }),
  setQuestionMode: (questionMode) => set({ questionMode }),
  setSubtopicInstructions: (update) =>
    set((s) => ({ subtopicInstructions: resolve(update, s.subtopicInstructions) })),

  // ── Written session ────────────────────────────────────────────────────────

  setQuestions: (questions) => set({ questions }),
  setActiveQuestionIndex: (activeQuestionIndex) => set({ activeQuestionIndex }),
  setWrittenQuestionPresentedAtById: (update) =>
    set((s) => ({
      writtenQuestionPresentedAtById: resolve(update, s.writtenQuestionPresentedAtById),
    })),
  setAnswersByQuestionId: (update) =>
    set((s) => ({ answersByQuestionId: resolve(update, s.answersByQuestionId) })),
  setImagesByQuestionId: (update) =>
    set((s) => ({ imagesByQuestionId: resolve(update, s.imagesByQuestionId) })),
  setFeedbackByQuestionId: (update) =>
    set((s) => ({ feedbackByQuestionId: resolve(update, s.feedbackByQuestionId) })),
  setQuestionHistory: (update) =>
    set((s) => ({
      questionHistory: applyHistoryLimit(resolve(update, s.questionHistory)),
    })),
  setWrittenRawModelOutput: (writtenRawModelOutput) => set({ writtenRawModelOutput }),
  setWrittenGenerationTelemetry: (writtenGenerationTelemetry) =>
    set({ writtenGenerationTelemetry }),
  setActiveWrittenSavedSetId: (activeWrittenSavedSetId) => set({ activeWrittenSavedSetId }),

  // ── MC session ─────────────────────────────────────────────────────────────

  setMcQuestions: (mcQuestions) => set({ mcQuestions }),
  setActiveMcQuestionIndex: (activeMcQuestionIndex) => set({ activeMcQuestionIndex }),
  setMcQuestionPresentedAtById: (update) =>
    set((s) => ({ mcQuestionPresentedAtById: resolve(update, s.mcQuestionPresentedAtById) })),
  setMcAnswersByQuestionId: (update) =>
    set((s) => ({ mcAnswersByQuestionId: resolve(update, s.mcAnswersByQuestionId) })),
  setMcHistory: (update) =>
    set((s) => ({ mcHistory: applyHistoryLimit(resolve(update, s.mcHistory)) })),
  setMcRawModelOutput: (mcRawModelOutput) => set({ mcRawModelOutput }),
  setMcGenerationTelemetry: (mcGenerationTelemetry) => set({ mcGenerationTelemetry }),
  setActiveMcSavedSetId: (activeMcSavedSetId) => set({ activeMcSavedSetId }),

  // ── Status ─────────────────────────────────────────────────────────────────

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setGenerationStartedAt: (generationStartedAt) => set({ generationStartedAt }),
  setIsMarking: (isMarking) => set({ isMarking }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  // ── Saved sets ─────────────────────────────────────────────────────────────

  saveCurrentSet: () => {
    const s = get();
    const now = new Date().toISOString();

    if (s.questionMode === "written") {
      if (s.questions.length === 0) return null;

      const savedSetId = s.activeWrittenSavedSetId ?? `saved-written-${Date.now()}`;
      const existing = s.savedSets.find((e) => e.id === savedSetId);

      const preferencesSnapshot: PersistedGeneratorPreferences = {
        selectedTopics: s.selectedTopics,
        difficulty: s.difficulty,
        techMode: s.techMode,
        avoidSimilarQuestions: s.avoidSimilarQuestions,
        mathMethodsSubtopics: s.mathMethodsSubtopics,
        specialistMathSubtopics: s.specialistMathSubtopics,
        chemistrySubtopics: s.chemistrySubtopics,
        physicalEducationSubtopics: s.physicalEducationSubtopics,
        questionCount: s.questionCount,
        maxMarksPerQuestion: s.maxMarksPerQuestion,
        questionMode: s.questionMode,
        subtopicInstructions: s.subtopicInstructions,
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
        title: buildSavedSetTitle("written", s.selectedTopics),
        questionMode: "written",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        preferences: preferencesSnapshot,
        writtenSession,
      };

      const nextSavedSets = applySavedSetLimit([
        nextEntry,
        ...s.savedSets.filter((e) => e.id !== savedSetId),
      ]);

      set({ savedSets: nextSavedSets, activeWrittenSavedSetId: savedSetId });

      // Immediate persist for explicit save
      const persistedSnapshot = buildPersistedSnapshot({ ...s, savedSets: nextSavedSets });
      void savePersistedAppState(persistedSnapshot).catch(() =>
        set((cur) => ({ errorMessage: cur.errorMessage ?? "Could not save app data." }))
      );

      return savedSetId;
    }

    // Multiple choice
    if (s.mcQuestions.length === 0) return null;

    const savedSetId = s.activeMcSavedSetId ?? `saved-mc-${Date.now()}`;
    const existing = s.savedSets.find((e) => e.id === savedSetId);

    const preferencesSnapshot: PersistedGeneratorPreferences = {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      mathMethodsSubtopics: s.mathMethodsSubtopics,
      specialistMathSubtopics: s.specialistMathSubtopics,
      chemistrySubtopics: s.chemistrySubtopics,
      physicalEducationSubtopics: s.physicalEducationSubtopics,
      questionCount: s.questionCount,
      maxMarksPerQuestion: s.maxMarksPerQuestion,
      questionMode: s.questionMode,
      subtopicInstructions: s.subtopicInstructions,
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
      title: buildSavedSetTitle("multiple-choice", s.selectedTopics),
      questionMode: "multiple-choice",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      preferences: preferencesSnapshot,
      mcSession,
    };

    const nextSavedSets = applySavedSetLimit([
      nextEntry,
      ...s.savedSets.filter((e) => e.id !== savedSetId),
    ]);

    set({ savedSets: nextSavedSets, activeMcSavedSetId: savedSetId });

    const persistedSnapshot = buildPersistedSnapshot({ ...s, savedSets: nextSavedSets });
    void savePersistedAppState(persistedSnapshot).catch(() =>
      set((cur) => ({ errorMessage: cur.errorMessage ?? "Could not save app data." }))
    );

    return savedSetId;
  },

  loadSavedSet: (savedSetId) => {
    const entry = get().savedSets.find((c) => c.id === savedSetId);
    if (!entry) return;

    startTransition(() => {
      set({
        selectedTopics: entry.preferences.selectedTopics,
        difficulty: entry.preferences.difficulty,
        techMode: entry.preferences.techMode,
        avoidSimilarQuestions: entry.preferences.avoidSimilarQuestions,
        mathMethodsSubtopics: entry.preferences.mathMethodsSubtopics,
        specialistMathSubtopics: entry.preferences.specialistMathSubtopics,
        chemistrySubtopics: entry.preferences.chemistrySubtopics,
        physicalEducationSubtopics: entry.preferences.physicalEducationSubtopics,
        questionCount: entry.preferences.questionCount,
        questionMode: entry.questionMode,
        subtopicInstructions: entry.preferences.subtopicInstructions,
        ...(entry.questionMode === "written" && entry.writtenSession
          ? {
              questions: entry.writtenSession.questions,
              activeQuestionIndex: entry.writtenSession.activeQuestionIndex,
              writtenQuestionPresentedAtById: entry.writtenSession.presentedAtByQuestionId,
              answersByQuestionId: entry.writtenSession.answersByQuestionId,
              imagesByQuestionId: entry.writtenSession.imagesByQuestionId,
              feedbackByQuestionId: entry.writtenSession.feedbackByQuestionId,
              writtenRawModelOutput: entry.writtenSession.rawModelOutput,
              writtenGenerationTelemetry: entry.writtenSession.generationTelemetry ?? null,
              activeWrittenSavedSetId: entry.id,
            }
          : {}),
        ...(entry.questionMode === "multiple-choice" && entry.mcSession
          ? {
              mcQuestions: entry.mcSession.questions,
              activeMcQuestionIndex: entry.mcSession.activeQuestionIndex,
              mcQuestionPresentedAtById: entry.mcSession.presentedAtByQuestionId,
              mcAnswersByQuestionId: entry.mcSession.answersByQuestionId,
              mcRawModelOutput: entry.mcSession.rawModelOutput,
              mcGenerationTelemetry: entry.mcSession.generationTelemetry ?? null,
              activeMcSavedSetId: entry.id,
            }
          : {}),
      });
    });
  },

  needsSaveBeforeLoad: (savedSetId) => {
    const s = get();
    const entry = s.savedSets.find((c) => c.id === savedSetId);
    if (!entry) return false;
    const hasUnsaved =
      (s.questionMode === "written" ? s.questions.length > 0 : s.mcQuestions.length > 0) &&
      !(
        entry.id ===
        (s.questionMode === "written" ? s.activeWrittenSavedSetId : s.activeMcSavedSetId)
      );
    return hasUnsaved;
  },

  deleteSavedSet: (savedSetId) => {
    set((s) => ({
      savedSets: s.savedSets.filter((e) => e.id !== savedSetId),
      activeWrittenSavedSetId:
        s.activeWrittenSavedSetId === savedSetId ? null : s.activeWrittenSavedSetId,
      activeMcSavedSetId: s.activeMcSavedSetId === savedSetId ? null : s.activeMcSavedSetId,
    }));
  },
}));

// ─── Persistence snapshot builder ────────────────────────────────────────────

function buildPersistedSnapshot(s: AppState): PersistedAppState {
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
      maxMarksPerQuestion: s.maxMarksPerQuestion,
      questionMode: s.questionMode,
      subtopicInstructions: s.subtopicInstructions,
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
    questionHistory: applyHistoryLimit(s.questionHistory),
    mcHistory: applyHistoryLimit(s.mcHistory),
    savedSets: applySavedSetLimit(s.savedSets),
  };
}

// ─── Auto-persist on state changes (debounced) ───────────────────────────────
//
// Subscribe outside of React so this runs regardless of which component
// triggered the change. The debounce prevents hammering the file system
// on rapid keystrokes (e.g. answer textarea).

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydratedOnce = false;

useAppStore.subscribe((state) => {
  // Don't persist before the initial hydration is complete — that would
  // overwrite the persisted file with empty defaults.
  if (!state.isHydrated) return;

  // Mark that we've seen at least one post-hydration update.
  hydratedOnce = true;

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!hydratedOnce) return;
    const snapshot = buildPersistedSnapshot(state);
    void savePersistedAppState(snapshot).catch(() => {
      useAppStore.setState((cur) => ({
        errorMessage: cur.errorMessage ?? "Could not save app data.",
      }));
    });
  }, 500);
});