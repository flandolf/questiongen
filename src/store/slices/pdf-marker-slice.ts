import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';

import { normalizeMarkResponse, readBackendError } from '@/lib/app-utils';
import type { AppActions, AppState } from '@/store/types';
import type {
  DiscoverPdfQuestionsResponse,
  MarkAnswerResponse,
  MarkPdfResultItem,
  PdfMarkerHistoryEntry,
} from '@/types';

export interface PdfMarkerSlice {
  pdfMarkerPdfBase64: string | null;
  pdfMarkerQuestions: AppState['pdfMarkerQuestions'];
  pdfMarkerPageMapping: AppState['pdfMarkerPageMapping'];
  pdfMarkerResultsByQuestionId: Record<string, MarkAnswerResponse>;
  pdfMarkerErrorsByQuestionId: Record<string, string>;
  pdfMarkerHistory: PdfMarkerHistoryEntry[];
  isPdfMarkerMarking: boolean;
  isPdfMarkerDiscovering: boolean;

  setPdfMarkerPdfBase64: (pdfBase64: string | null) => void;
  setPdfMarkerQuestions: (questions: AppState['pdfMarkerQuestions']) => void;
  reorderPdfMarkerQuestions: (fromIndex: number, toIndex: number) => void;
  setPdfMarkerPageMapping: (mapping: AppState['pdfMarkerPageMapping']) => void;
  markPdf: () => Promise<void>;
  markPdfSingle: (questionId: string) => Promise<void>;
  discoverPdfQuestions: () => Promise<void>;
  resetPdfMarker: () => void;
  clearPdfMarkerResults: () => void;
  deletePdfMarkerHistoryEntry: (id: string) => void;
  clearPdfMarkerHistory: () => void;
  loadPdfMarkerHistoryEntry: (id: string) => void;
}

export const createPdfMarkerSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  PdfMarkerSlice
> = (set, get) => ({
  pdfMarkerPdfBase64: null,
  pdfMarkerQuestions: [],
  pdfMarkerPageMapping: [],
  pdfMarkerResultsByQuestionId: {},
  pdfMarkerErrorsByQuestionId: {},
  pdfMarkerHistory: [],
  isPdfMarkerMarking: false,
  isPdfMarkerDiscovering: false,

  setPdfMarkerPdfBase64: (pdfMarkerPdfBase64) => set({ pdfMarkerPdfBase64 }),
  setPdfMarkerQuestions: (pdfMarkerQuestions) => set({ pdfMarkerQuestions }),
  setPdfMarkerPageMapping: (pdfMarkerPageMapping) =>
    set({ pdfMarkerPageMapping }),
  reorderPdfMarkerQuestions: (fromIndex: number, toIndex: number) => {
    const questions = get().pdfMarkerQuestions;
    if (fromIndex === toIndex) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    // Also reorder the page mapping to match
    const mapping = get().pdfMarkerPageMapping;
    const movedMapping = mapping.find((m) => m.questionIndex === fromIndex);
    const newMapping = mapping
      .filter((m) => m.questionIndex !== fromIndex)
      .map((m) => {
        if (m.questionIndex > fromIndex) {
          return { ...m, questionIndex: m.questionIndex - 1 };
        }
        if (m.questionIndex >= toIndex && m.questionIndex < fromIndex) {
          return { ...m, questionIndex: m.questionIndex + 1 };
        }
        return m;
      });
    if (movedMapping) {
      newMapping.push({ ...movedMapping, questionIndex: toIndex });
    }
    set({ pdfMarkerQuestions: reordered, pdfMarkerPageMapping: newMapping });
  },

  markPdf: async () => {
    const s = get();
    if (s.isPdfMarkerMarking) return;
    if (!s.apiKey.trim() || !s.markingModel.trim()) {
      toast.error('API key and marking model are required.');
      return;
    }

    if (!s.pdfMarkerPdfBase64) {
      toast.error('No PDF provided.');
      return;
    }

    if (s.pdfMarkerQuestions.length === 0) {
      toast.error('No questions provided.');
      return;
    }

    set({ isPdfMarkerMarking: true, pdfMarkerErrorsByQuestionId: {} });

    try {
      const response = await invoke<{ results: MarkPdfResultItem[] }>(
        'mark_pdf',
        {
          request: {
            pdfBase64: s.pdfMarkerPdfBase64,
            questions: s.pdfMarkerQuestions,
            pageMapping: s.pdfMarkerPageMapping,
            model: s.markingModel,
            apiKey: s.apiKey,
            markerStyle: s.markerStyle,
            customMarkerStyle: s.customMarkerStyle,
          },
        },
      );

      const newResults: Record<string, MarkAnswerResponse> = {};
      const newErrors: Record<string, string> = {};

      for (const item of response.results) {
        if (item.response) {
          const question = s.pdfMarkerQuestions.find(
            (q) => q.id === item.questionId,
          );
          newResults[item.questionId] = normalizeMarkResponse(
            item.response,
            question?.maxMarks ?? 10,
          );
        } else if (item.error) {
          newErrors[item.questionId] = item.error;
        }
      }

      set({
        pdfMarkerResultsByQuestionId: newResults,
        pdfMarkerErrorsByQuestionId: newErrors,
      });

      if (Object.keys(newResults).length > 0) {
        let achieved = 0;
        let max = 0;
        for (const r of Object.values(newResults)) {
          achieved += r.achievedMarks;
          max += r.maxMarks;
        }
        const pct = max > 0 ? (achieved / max) * 100 : 0;

        const historyEntry: PdfMarkerHistoryEntry = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          pdfBase64: s.pdfMarkerPdfBase64,
          questions: s.pdfMarkerQuestions,
          resultsByQuestionId: newResults,
          pageMapping: s.pdfMarkerPageMapping,
          stats: { achieved, max, pct },
        };

        set((state) => ({
          pdfMarkerHistory: [historyEntry, ...state.pdfMarkerHistory],
        }));
      }

      toast.success('PDF marking complete!');
    } catch (error) {
      const msg = readBackendError(error);
      set({ errorMessage: msg });
      toast.error(`Marking failed: ${msg}`);
    } finally {
      set({ isPdfMarkerMarking: false });
    }
  },

  markPdfSingle: async (questionId: string) => {
    const s = get();
    if (s.isPdfMarkerMarking) return;
    if (!s.apiKey.trim() || !s.markingModel.trim()) {
      toast.error('API key and marking model are required.');
      return;
    }

    if (!s.pdfMarkerPdfBase64) {
      toast.error('No PDF provided.');
      return;
    }

    const question = s.pdfMarkerQuestions.find((q) => q.id === questionId);
    if (!question) {
      toast.error('Question not found.');
      return;
    }

    set({ isPdfMarkerMarking: true });

    const questionIndex = s.pdfMarkerQuestions.findIndex((q) => q.id === questionId);
    const pageMapping = s.pdfMarkerPageMapping.filter(
      (m) => m.questionIndex === questionIndex,
    );

    try {
      const response = await invoke<{ results: MarkPdfResultItem[] }>(
        'mark_pdf',
        {
          request: {
            pdfBase64: s.pdfMarkerPdfBase64,
            questions: [question],
            pageMapping,
            model: s.markingModel,
            apiKey: s.apiKey,
            markerStyle: s.markerStyle,
            customMarkerStyle: s.customMarkerStyle,
          },
        },
      );

      const resultItem = response.results[0];

      if (resultItem.response) {
        const normalizedResult = normalizeMarkResponse(
          resultItem.response,
          question.maxMarks,
        );
        set((state) => ({
          pdfMarkerResultsByQuestionId: {
            ...state.pdfMarkerResultsByQuestionId,
            [questionId]: normalizedResult,
          },
        }));
        toast.success('Question marked successfully');
      } else if (resultItem.error) {
        set((state) => ({
          pdfMarkerErrorsByQuestionId: {
            ...state.pdfMarkerErrorsByQuestionId,
            [questionId]: resultItem.error || 'Unknown error',
          },
        }));
        toast.error(resultItem.error);
      }
    } catch (error) {
      const msg = readBackendError(error);
      set({ errorMessage: msg });
      toast.error(`Marking failed: ${msg}`);
    } finally {
      set({ isPdfMarkerMarking: false });
    }
  },

  discoverPdfQuestions: async () => {
    const s = get();
    if (s.isPdfMarkerDiscovering) return;
    if (!s.apiKey.trim() || !s.markingModel.trim()) {
      toast.error('API key and marking model are required.');
      return;
    }

    if (!s.pdfMarkerPdfBase64) {
      toast.error('No PDF provided.');
      return;
    }

    set({ isPdfMarkerDiscovering: true });

    try {
      const response = await invoke<DiscoverPdfQuestionsResponse>(
        'discover_pdf_questions',
        {
          request: {
            pdfBase64: s.pdfMarkerPdfBase64,
            model: s.markingModel,
            apiKey: s.apiKey,
          },
        },
      );

      const questions = response.questions.map((dq) => ({
        id: crypto.randomUUID(),
        topic: dq.topic,
        subtopic: '',
        promptMarkdown: dq.promptMarkdown,
        maxMarks: dq.maxMarks,
        techAllowed: true,
      }));

      const mapping = response.questions.map((dq, idx) => ({
        questionIndex: idx,
        pageIndices: dq.pageIndices,
      }));

      set({
        pdfMarkerQuestions: questions,
        pdfMarkerPageMapping: mapping,
      });

      toast.success(`Discovered ${questions.length} questions!`);
    } catch (error) {
      const msg = readBackendError(error);
      set({ errorMessage: msg });
      toast.error(`Discovery failed: ${msg}`);
    } finally {
      set({ isPdfMarkerDiscovering: false });
    }
  },

  resetPdfMarker: () =>
    set({
      pdfMarkerPdfBase64: null,
      pdfMarkerQuestions: [],
      pdfMarkerPageMapping: [],
      pdfMarkerResultsByQuestionId: {},
      pdfMarkerErrorsByQuestionId: {},
      isPdfMarkerMarking: false,
      isPdfMarkerDiscovering: false,
    }),
  clearPdfMarkerResults: () =>
    set({
      pdfMarkerResultsByQuestionId: {},
      pdfMarkerErrorsByQuestionId: {},
    }),
  deletePdfMarkerHistoryEntry: (id) =>
    set((state) => ({
      pdfMarkerHistory: state.pdfMarkerHistory.filter((h) => h.id !== id),
    })),

  clearPdfMarkerHistory: () => set({ pdfMarkerHistory: [] }),

  loadPdfMarkerHistoryEntry: (id) => {
    const entry = get().pdfMarkerHistory.find((h) => h.id === id);
    if (!entry) {
      toast.error('History entry not found');
      return;
    }

    set({
      pdfMarkerPdfBase64: entry.pdfBase64,
      pdfMarkerQuestions: entry.questions,
      pdfMarkerResultsByQuestionId: entry.resultsByQuestionId,
      pdfMarkerPageMapping: entry.pageMapping,
      pdfMarkerErrorsByQuestionId: {},
    });
  },
});