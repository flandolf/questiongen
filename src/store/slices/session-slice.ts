import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';

import { normalizeMarkResponse, readBackendError } from '@/lib/app-utils';
import { countWords, generateEntryId } from '@/lib/generator-helpers';
import { EMPTY_PERSISTED_APP_STATE } from '@/lib/persistence';
import { resolve } from '@/store/helpers';
import type { AppActions, AppState } from '@/store/types';
import type {
  BatchTopicProgress,
  GenerationSubCallProgress,
  MarkAnswerResponse,
  McHistoryEntry,
  QuestionHistoryEntry,
} from '@/types';

export interface SessionSlice {
  // Written session
  questions: AppState['questions'];
  activeQuestionIndex: number;
  writtenQuestionPresentedAtById: Record<string, number>;
  answersByQuestionId: Record<string, string>;
  imagesByQuestionId: Record<string, AppState['imagesByQuestionId'][string]>;
  activeTabByQuestionId: Record<string, 'response' | 'upload' | 'sketchpad'>;
  feedbackByQuestionId: Record<
    string,
    AppState['feedbackByQuestionId'][string]
  >;
  writtenRawModelOutput: string;
  writtenGenerationTelemetry: AppState['writtenGenerationTelemetry'];
  activeWrittenSavedSetId: string | null;
  markAppealByQuestionId: Record<string, string>;
  markOverrideInputByQuestionId: Record<string, string>;
  writtenMarkingDurationMsByQuestionId: Record<string, number>;
  writtenResponseEnteredAtById: Record<string, number>;

  // MC session
  mcQuestions: AppState['mcQuestions'];
  activeMcQuestionIndex: number;
  mcQuestionPresentedAtById: Record<string, number>;
  mcAnswersByQuestionId: Record<string, string>;
  mcRawModelOutput: string;
  mcGenerationTelemetry: AppState['mcGenerationTelemetry'];
  activeMcSavedSetId: string | null;
  mcMarkOverrideInputByQuestionId: Record<string, string>;
  mcAwardedMarksByQuestionId: Record<string, number>;

  // Generation / marking status
  isGenerating: boolean;
  generationStatus: AppState['generationStatus'];
  generationStartedAt: number | null;
  isMarking: boolean;
  errorMessage: string | null;
  isKeyboardShortcutsOpen: boolean;

  batchProgress: BatchTopicProgress[];
  generationSubCallProgress: GenerationSubCallProgress | null;
  streamTexts: Record<string, string>;

  // Timer v2
  writtenTimer: AppState['writtenTimer'];
  mcTimer: AppState['mcTimer'];

  // Actions
  setQuestions: (questions: AppState['questions']) => void;
  setActiveQuestionIndex: (idx: number) => void;
  setWrittenQuestionPresentedAtById: AppActions['setWrittenQuestionPresentedAtById'];
  setAnswersByQuestionId: AppActions['setAnswersByQuestionId'];
  setImagesByQuestionId: AppActions['setImagesByQuestionId'];
  setActiveTabByQuestionId: AppActions['setActiveTabByQuestionId'];
  setFeedbackByQuestionId: AppActions['setFeedbackByQuestionId'];
  setMarkAppealByQuestionId: AppActions['setMarkAppealByQuestionId'];
  setMarkOverrideInputByQuestionId: AppActions['setMarkOverrideInputByQuestionId'];
  setWrittenMarkingDurationMsByQuestionId: AppActions['setWrittenMarkingDurationMsByQuestionId'];
  setWrittenResponseEnteredAtById: AppActions['setWrittenResponseEnteredAtById'];
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
  setMcMarkOverrideInputByQuestionId: AppActions['setMcMarkOverrideInputByQuestionId'];
  setMcAwardedMarksByQuestionId: AppActions['setMcAwardedMarksByQuestionId'];

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
  setStreamText: (
    text: string | ((prev: string) => string),
    topic?: string,
  ) => void;

  setWrittenTimer: (state: AppState['writtenTimer']) => void;
  setMcTimer: (state: AppState['mcTimer']) => void;

  submitWrittenAnswer: AppActions['submitWrittenAnswer'];
  argueForWrittenMark: AppActions['argueForWrittenMark'];
  overrideWrittenMark: AppActions['overrideWrittenMark'];
  submitMcAnswer: AppActions['submitMcAnswer'];
  overrideMcMark: AppActions['overrideMcMark'];
  nextQuestion: AppActions['nextQuestion'];
  prevQuestion: AppActions['prevQuestion'];
  abortGeneration: () => Promise<void>;
}

export const createSessionSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  SessionSlice
> = (set, get) => ({
  questions: EMPTY_PERSISTED_APP_STATE.writtenSession.questions,
  activeQuestionIndex:
    EMPTY_PERSISTED_APP_STATE.writtenSession.activeQuestionIndex,
  writtenQuestionPresentedAtById:
    EMPTY_PERSISTED_APP_STATE.writtenSession.presentedAtByQuestionId,
  answersByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.answersByQuestionId,
  imagesByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.imagesByQuestionId,
  activeTabByQuestionId: {},
  feedbackByQuestionId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.feedbackByQuestionId,
  writtenRawModelOutput:
    EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
  writtenGenerationTelemetry:
    EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
  activeWrittenSavedSetId:
    EMPTY_PERSISTED_APP_STATE.writtenSession.savedSetId ?? null,
  markAppealByQuestionId: {},
  markOverrideInputByQuestionId: {},
  writtenMarkingDurationMsByQuestionId: {},
  writtenResponseEnteredAtById: {},

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
  mcMarkOverrideInputByQuestionId: {},
  mcAwardedMarksByQuestionId: {},

  isGenerating: false,
  generationStatus: null,
  generationStartedAt: null,
  isMarking: false,
  errorMessage: null,
  isKeyboardShortcutsOpen: false,

  batchProgress: [],
  generationSubCallProgress: null,
  streamTexts: {},

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
  setActiveTabByQuestionId: (questionId, tab) =>
    set((s) => ({
      activeTabByQuestionId: {
        ...s.activeTabByQuestionId,
        [questionId]: tab,
      },
    })),
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
  setMarkAppealByQuestionId: (update) =>
    set((s) => ({
      markAppealByQuestionId: resolve(update, s.markAppealByQuestionId),
    })),
  setMarkOverrideInputByQuestionId: (update) =>
    set((s) => ({
      markOverrideInputByQuestionId: resolve(
        update,
        s.markOverrideInputByQuestionId,
      ),
    })),
  setWrittenMarkingDurationMsByQuestionId: (update) =>
    set((s) => ({
      writtenMarkingDurationMsByQuestionId: resolve(
        update,
        s.writtenMarkingDurationMsByQuestionId,
      ),
    })),
  setWrittenResponseEnteredAtById: (update) =>
    set((s) => ({
      writtenResponseEnteredAtById: resolve(
        update,
        s.writtenResponseEnteredAtById,
      ),
    })),

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
  setMcMarkOverrideInputByQuestionId: (update) =>
    set((s) => ({
      mcMarkOverrideInputByQuestionId: resolve(
        update,
        s.mcMarkOverrideInputByQuestionId,
      ),
    })),
  setMcAwardedMarksByQuestionId: (update) =>
    set((s) => ({
      mcAwardedMarksByQuestionId: resolve(update, s.mcAwardedMarksByQuestionId),
    })),

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
  setStreamText: (update, topic) =>
    set((s) => {
      const key = topic || 'default';
      const prev = s.streamTexts[key] || '';
      const next = typeof update === 'function' ? update(prev) : update;
      return {
        streamTexts: {
          ...s.streamTexts,
          [key]: next,
        },
      };
    }),

  setWrittenTimer: (writtenTimer) => set({ writtenTimer }),
  setMcTimer: (mcTimer) => set({ mcTimer }),

  submitWrittenAnswer: async (markingModel) => {
    const s = get();
    const activeQuestion = s.questions[s.activeQuestionIndex];
    if (!activeQuestion) return;

    const answer = s.answersByQuestionId[activeQuestion.id] ?? '';
    const image = s.imagesByQuestionId[activeQuestion.id];

    if (!answer && !image) return;
    if (!s.apiKey.trim() || !markingModel.trim() || s.isMarking) return;

    set({ isMarking: true, errorMessage: null });

    try {
      const markStartedAt = Date.now();

      const rawResponse = await invoke<unknown>('mark_answer', {
        request: {
          question: activeQuestion,
          studentAnswer: answer,
          studentAnswerImageDataUrl: image?.dataUrl,
          model: markingModel,
          apiKey: s.apiKey,
          markerStyle: s.markerStyle,
          customMarkerStyle: s.customMarkerStyle,
        },
      });

      const markingLatencyMs = Date.now() - markStartedAt;
      const response = normalizeMarkResponse(
        rawResponse,
        activeQuestion.maxMarks,
      );

      set((state) => ({
        writtenMarkingDurationMsByQuestionId: {
          ...state.writtenMarkingDurationMsByQuestionId,
          [activeQuestion.id]: markingLatencyMs,
        },
        feedbackByQuestionId: {
          ...state.feedbackByQuestionId,
          [activeQuestion.id]: response,
        },
        markOverrideInputByQuestionId: {
          ...state.markOverrideInputByQuestionId,
          [activeQuestion.id]: String(response.achievedMarks),
        },
      }));

      // Append to history
      const now = Date.now();
      const entry: QuestionHistoryEntry = {
        id: generateEntryId(),
        createdAt: new Date(now).toISOString(),
        lastModified: now,
        question: activeQuestion,
        uploadedAnswer: answer,
        uploadedAnswerImage: image,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        markResponse: response,
        generationTelemetry: s.writtenGenerationTelemetry ?? undefined,
        difficulty: s.difficulty,
        analytics: {
          attemptKind: 'initial',
          attemptSequence:
            s.questionHistory.filter(
              (e: QuestionHistoryEntry) => e.question.id === activeQuestion.id,
            ).length + 1,
          answerCharacterCount: answer.length,
          answerWordCount: countWords(answer),
          usedImageUpload: Boolean(image),
          responseLatencyMs: undefined, // Timer logic handled in view
          markingLatencyMs,
        },
      };

      s.addQuestionHistoryEntry(entry);
      s.recordCompletion('written');
      toast.success(
        `Answer marked: ${response.achievedMarks}/${response.maxMarks} marks`,
      );
    } catch (error) {
      set({ errorMessage: readBackendError(error) });
    } finally {
      set({ isMarking: false });
    }
  },

  argueForWrittenMark: async (markingModel) => {
    const s = get();
    if (s.isMarking) return;

    const activeQuestion = s.questions[s.activeQuestionIndex];
    if (!activeQuestion) return;

    const appealText = s.markAppealByQuestionId[activeQuestion.id] || '';
    if (!appealText.trim() || !s.apiKey.trim() || !markingModel.trim()) return;

    set({ isMarking: true, errorMessage: null });

    try {
      const answer = s.answersByQuestionId[activeQuestion.id] ?? '';
      const image = s.imagesByQuestionId[activeQuestion.id];
      const markStartedAt = Date.now();
      const arguedAnswer = [
        answer,
        `Additional marking argument from student:\n${appealText}`,
      ]
        .filter((p) => p.trim())
        .join('\n\n');

      const rawResponse = await invoke<unknown>('mark_answer', {
        request: {
          question: activeQuestion,
          studentAnswer: arguedAnswer,
          studentAnswerImageDataUrl: image?.dataUrl,
          model: markingModel,
          apiKey: s.apiKey,
          markerStyle: s.markerStyle,
          customMarkerStyle: s.customMarkerStyle,
        },
      });

      const response = normalizeMarkResponse(
        rawResponse,
        activeQuestion.maxMarks,
      );

      set((state) => ({
        feedbackByQuestionId: {
          ...state.feedbackByQuestionId,
          [activeQuestion.id]: response,
        },
        markOverrideInputByQuestionId: {
          ...state.markOverrideInputByQuestionId,
          [activeQuestion.id]: String(response.achievedMarks),
        },
      }));

      // Add to history
      const now = Date.now();
      const entry: QuestionHistoryEntry = {
        id: generateEntryId(),
        createdAt: new Date(now).toISOString(),
        lastModified: now,
        question: activeQuestion,
        uploadedAnswer: answer,
        uploadedAnswerImage: image,
        workedSolutionMarkdown: response.workedSolutionMarkdown,
        markResponse: response,
        generationTelemetry: s.writtenGenerationTelemetry ?? undefined,
        difficulty: s.difficulty,
        analytics: {
          attemptKind: 'appeal',
          attemptSequence:
            s.questionHistory.filter(
              (e: QuestionHistoryEntry) => e.question.id === activeQuestion.id,
            ).length + 1,
          answerCharacterCount: answer.length,
          answerWordCount: countWords(answer),
          usedImageUpload: Boolean(image),
          markingLatencyMs: Date.now() - markStartedAt,
        },
      };
      s.addQuestionHistoryEntry(entry);
      toast.success(
        `Re-mark complete: ${response.achievedMarks}/${response.maxMarks} marks`,
      );
    } catch (error) {
      set({ errorMessage: readBackendError(error) });
    } finally {
      set({ isMarking: false });
    }
  },

  overrideWrittenMark: () => {
    const s = get();
    const activeQuestion = s.questions[s.activeQuestionIndex];
    const feedback = s.feedbackByQuestionId[activeQuestion?.id];
    if (!activeQuestion || !feedback) return;

    const input = s.markOverrideInputByQuestionId[activeQuestion.id];
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return;

    const clamped = Math.max(
      0,
      Math.min(feedback.maxMarks, Math.round(parsed)),
    );
    const updated: MarkAnswerResponse = {
      ...feedback,
      achievedMarks: clamped,
      verdict:
        clamped === feedback.maxMarks
          ? 'Correct'
          : clamped === 0
            ? 'Incorrect'
            : 'Overridden',
    };

    set((state) => ({
      feedbackByQuestionId: {
        ...state.feedbackByQuestionId,
        [activeQuestion.id]: updated,
      },
    }));

    const historyEntry = s.questionHistory
      .filter((e: QuestionHistoryEntry) => e.question.id === activeQuestion.id)
      .pop();
    if (historyEntry) {
      s.updateQuestionHistoryEntry({
        ...historyEntry,
        markResponse: updated,
        workedSolutionMarkdown: updated.workedSolutionMarkdown,
        lastModified: Date.now(),
      });
    }
    toast.message(`Mark overridden to ${clamped}/${feedback.maxMarks}`);
  },

  submitMcAnswer: (selectedLabel) => {
    const s = get();
    const activeMcQuestion = s.mcQuestions[s.activeMcQuestionIndex];
    if (!activeMcQuestion || s.mcAnswersByQuestionId[activeMcQuestion.id])
      return;

    const awardedMarks =
      selectedLabel === activeMcQuestion.correctAnswer ? 1 : 0;
    const now = Date.now();

    set((state) => ({
      mcAnswersByQuestionId: {
        ...state.mcAnswersByQuestionId,
        [activeMcQuestion.id]: selectedLabel,
      },
      mcAwardedMarksByQuestionId: {
        ...state.mcAwardedMarksByQuestionId,
        [activeMcQuestion.id]: awardedMarks,
      },
    }));

    const entry: McHistoryEntry = {
      type: 'multiple-choice',
      id: generateEntryId(),
      createdAt: new Date(now).toISOString(),
      lastModified: now,
      question: activeMcQuestion,
      selectedAnswer: selectedLabel,
      correct: awardedMarks >= 1,
      generationTelemetry: s.mcGenerationTelemetry ?? undefined,
      isUploaded: false,
    };

    s.addMcHistoryEntry(entry);
    s.recordCompletion('multiple-choice');

    // if (awardedMarks >= 1) {
    //   toast.success('Correct!');
    // } else {
    //   toast.error(
    //     `Incorrect. The correct answer was ${activeMcQuestion.correctAnswer}.`,
    //   );
    // }
  },

  overrideMcMark: () => {
    const s = get();
    const activeMcQuestion = s.mcQuestions[s.activeMcQuestionIndex];
    if (!activeMcQuestion) return;

    const selectedAnswer = s.mcAnswersByQuestionId[activeMcQuestion.id];
    if (!selectedAnswer) return;

    // Change the question's correctAnswer to match what the user selected
    const updatedQuestions = s.mcQuestions.map((q) =>
      q.id === activeMcQuestion.id
        ? { ...q, correctAnswer: selectedAnswer }
        : q,
    );

    set((state) => ({
      mcQuestions: updatedQuestions,
      mcAwardedMarksByQuestionId: {
        ...state.mcAwardedMarksByQuestionId,
        [activeMcQuestion.id]: 1,
      },
    }));

    const historyEntry = s.mcHistory.find(
      (e: McHistoryEntry) => e.question.id === activeMcQuestion.id,
    );
    if (historyEntry) {
      s.updateMcHistoryEntry({
        ...historyEntry,
        question: { ...historyEntry.question, correctAnswer: selectedAnswer },
        correct: true,
        lastModified: Date.now(),
      });
    }
    toast.message('Answer marked as correct');
  },

  nextQuestion: () => {
    const s = get();
    if (s.questionMode === 'written') {
      set({
        activeQuestionIndex: Math.min(
          Math.max(0, s.questions.length - 1),
          s.activeQuestionIndex + 1,
        ),
      });
    } else {
      set({
        activeMcQuestionIndex: Math.min(
          Math.max(0, s.mcQuestions.length - 1),
          s.activeMcQuestionIndex + 1,
        ),
      });
    }
  },

  prevQuestion: () => {
    const s = get();
    if (s.questionMode === 'written') {
      set({ activeQuestionIndex: Math.max(0, s.activeQuestionIndex - 1) });
    } else {
      set({
        activeMcQuestionIndex: Math.max(0, s.activeMcQuestionIndex - 1),
      });
    }
  },
  abortGeneration: async () => {
    try {
      await invoke('abort_generation');
      toast.info('Aborting generation...');
    } catch (e) {
      console.error('Failed to abort generation:', e);
    }
  },
});
