import type { StateCreator } from 'zustand';

import { EMPTY_PERSISTED_APP_STATE } from '@/lib/persistence';
import type { BatchTopicProgress, GenerationSubCallProgress } from '@/types';

import { resolve } from '../helpers';
import type { AppActions, AppState } from '../types';

export interface SessionSlice {
  // Written session
  questions: AppState['questions'];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, AppState['imagesByQuestionId'][string]>;
  feedbackByQuestionId: Record<
    string,
    AppState['feedbackByQuestionId'][string]
  >;
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: AppState['writtenGenerationTelemetry'];
  activeWrittenSavedSetId: string | null;

  // MC session
  mcQuestions: AppState['mcQuestions'];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcRawModelOutput: string;
  mcGenerationTelemetry: AppState['mcGenerationTelemetry'];
  activeMcSavedSetId: string | null;

  // Generation / marking status
  isGenerating: boolean;
  generationStatus: AppState['generationStatus'];
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;
  isKeyboardShortcutsOpen: boolean;

  batchProgress: BatchTopicProgress[];
  generationSubCallProgress: GenerationSubCallProgress | null;

  // Timer v2
  writtenTimer: AppState['writtenTimer'];
  mcTimer: AppState['mcTimer'];

  // Actions
  setQuestions: (questions: AppState['questions']) => void;
  setActiveQuestionIndex: (idx: number) => void;
  setWrittenQuestionPresentedAtById: AppActions['setWrittenQuestionPresentedAtById'];
  setAnswersByQuestionId: AppActions['setAnswersByQuestionId'];
  setImagesByQuestionId: AppActions['setImagesByQuestionId'];
  setFeedbackByQuestionId: AppActions['setFeedbackByQuestionId'];
  setWrittenRawModelOutput: (output: string) => void;
  setWrittenGenerationTelemetry: (
    telemetry: AppState['writtenGenerationTelemetry'],
  ) => void;
  setActiveWrittenSavedSetId: (id: string | null) => void;

  setMcQuestions: (questions: AppState['mcQuestions']) => void;
  setActiveMcQuestionIndex: (idx: number) => void;
  setMcQuestionPresentedAtById: AppActions['setMcQuestionPresentedAtById'];
  setMcAnswersByQuestionId: AppActions['setMcAnswersByQuestionId'];
  setMcRawModelOutput: (output: string) => void;
  setMcGenerationTelemetry: (
    telemetry: AppState['mcGenerationTelemetry'],
  ) => void;
  setActiveMcSavedSetId: (id: string | null) => void;

  setIsGenerating: (is: boolean) => void;
  setGenerationStatus: (status: AppState['generationStatus']) => void;
  setGenerationStartedAt: (startedAt: number | null) => void;
  setIsMarking: (is: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setIsKeyboardShortcutsOpen: (isOpen: boolean) => void;

  setBatchProgress: (
    progress:
      | BatchTopicProgress[]
      | ((prev: BatchTopicProgress[]) => BatchTopicProgress[]),
  ) => void;
  setGenerationSubCallProgress: (
    progress: GenerationSubCallProgress | null,
  ) => void;

  setWrittenTimer: (state: AppState['writtenTimer']) => void;
  setMcTimer: (state: AppState['mcTimer']) => void;
}

export const createSessionSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  SessionSlice
> = (set) => ({
  questions: EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
  activeQuestionIndex:
    EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
  writtenQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
  answersByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
  imagesByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId,
  feedbackByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
  writtenRawModelOutput:
    EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
  writtenGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
  activeWrittenSavedSetId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null,

  mcQuestions: EMPTY_PERSISTED_APP_STATE.mcSession.questions,
  activeMcQuestionIndex:
    EMPTY_PERSISTED_APP_STATE.mcSession.activeQuestionIndex,
  mcQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.mcSession.presentedAtByQuestionId,
  mcAnswersByQuestionId:
    EMPTY_PERSISTED_APP_STATE.mcSession.answersByQuestionId,
  mcRawModelOutput: EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
  mcGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
  activeMcSavedSetId: EMPTY_PERSISTED_APP_STATE.mcSession.savedSetId ?? null,

  isGenerating: false,
  generationStatus: null,
  generationStartedAt: null,
  isMarking: false,
  errorMessage: null,
  isKeyboardShortcutsOpen: false,

  batchProgress: [],
  generationSubCallProgress: null,

  writtenTimer: null,
  mcTimer: null,

  setQuestions: (questions) => set({ questions }),
  setActiveQuestionIndex: (activeQuestionIndex) => set({ activeQuestionIndex }),
  setWrittenQuestionPresentedAtById: (update) =>
    set((s) => ({
      writtenQuestionPresentedAtById: resolve(
        update,
        s.writtenQuestionPresentedAtById,
      ),
    })),
  setAnswersByQuestionId: (update) =>
    set((s) => ({
      answersByQuestionId: resolve(update, s.answersByQuestionId),
    })),
  setImagesByQuestionId: (update) =>
    set((s) => ({ imagesByQuestionId: resolve(update, s.imagesByQuestionId) })),
  setFeedbackByQuestionId: (update) =>
    set((s) => ({
      feedbackByQuestionId: resolve(update, s.feedbackByQuestionId),
    })),
  setWrittenRawModelOutput: (writtenRawModelOutput) =>
    set({ writtenRawModelOutput }),
  setWrittenGenerationTelemetry: (writtenGenerationTelemetry) =>
    set({ writtenGenerationTelemetry }),
  setActiveWrittenSavedSetId: (activeWrittenSavedSetId) =>
    set({ activeWrittenSavedSetId }),

  setMcQuestions: (mcQuestions) => set({ mcQuestions }),
  setActiveMcQuestionIndex: (activeMcQuestionIndex) =>
    set({ activeMcQuestionIndex }),
  setMcQuestionPresentedAtById: (update) =>
    set((s) => ({
      mcQuestionPresentedAtById: resolve(update, s.mcQuestionPresentedAtById),
    })),
  setMcAnswersByQuestionId: (update) =>
    set((s) => ({
      mcAnswersByQuestionId: resolve(update, s.mcAnswersByQuestionId),
    })),
  setMcRawModelOutput: (mcRawModelOutput) => set({ mcRawModelOutput }),
  setMcGenerationTelemetry: (mcGenerationTelemetry) =>
    set({ mcGenerationTelemetry }),
  setActiveMcSavedSetId: (activeMcSavedSetId) => set({ activeMcSavedSetId }),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationStatus: (generationStatus) => set({ generationStatus }),
  setGenerationStartedAt: (generationStartedAt) => set({ generationStartedAt }),
  setIsMarking: (isMarking) => set({ isMarking }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setIsKeyboardShortcutsOpen: (isKeyboardShortcutsOpen) =>
    set({ isKeyboardShortcutsOpen }),

  setBatchProgress: (update) =>
    set((s) => ({ batchProgress: resolve(update, s.batchProgress) })),
  setGenerationSubCallProgress: (generationSubCallProgress) =>
    set({ generationSubCallProgress }),

  setWrittenTimer: (writtenTimer) => set({ writtenTimer }),
  setMcTimer: (mcTimer) => set({ mcTimer }),
});
