import { create } from 'zustand';

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface TutorSession {
  questionId: string;
  messages: TutorMessage[];
}

export interface TutorState {
  isOpen: boolean;
  sessions: Record<string, TutorSession>;
  isGenerating: boolean;
  streamedContent: string;
  totalTokensSession: number;
  totalCostSession: number;
}

export interface TutorActions {
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  addMessage: (questionId: string, message: TutorMessage) => void;
  clearSession: (questionId: string) => void;
  clearAllSessions: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setStreamedContent: (content: string) => void;
  appendStreamedContent: (chunk: string) => void;
  updateMetrics: (tokens: number, cost: number) => void;
}

export const useTutorStore = create<TutorState & TutorActions>()((set) => ({
  isOpen: false,
  sessions: {},
  isGenerating: false,
  streamedContent: '',
  totalTokensSession: 0,
  totalCostSession: 0,

  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  addMessage: (questionId, message) =>
    set((state) => {
      const session = state.sessions[questionId] || {
        questionId,
        messages: [],
      };
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: [...session.messages, message],
          },
        },
      };
    }),

  clearSession: (questionId) =>
    set((state) => {
      const { [questionId]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        totalTokensSession: 0,
        totalCostSession: 0,
        streamedContent: '',
      };
    }),

  clearAllSessions: () =>
    set(() => ({
      sessions: {},
      totalTokensSession: 0,
      totalCostSession: 0,
      streamedContent: '',
      isOpen: false,
    })),

  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setStreamedContent: (streamedContent) => set({ streamedContent }),
  appendStreamedContent: (chunk) =>
    set((state) => ({ streamedContent: state.streamedContent + chunk })),

  updateMetrics: (tokens, cost) =>
    set((state) => ({
      totalTokensSession: state.totalTokensSession + tokens,
      totalCostSession: state.totalCostSession + cost,
    })),
}));
