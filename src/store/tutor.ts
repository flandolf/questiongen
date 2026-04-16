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
  modelOverride?: string;
  personaOverride?: string;
}

export interface TutorState {
  isOpen: boolean;
  sessions: Record<string, TutorSession>;
  isGenerating: boolean;
  streamedContent: string;
  totalTokensSession: number;
  totalCostSession: number;
  totalMessagesCount: number;
  totalErrorsCount: number;
  isCompact: boolean;
}

export interface TutorActions {
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  setIsCompact: (isCompact: boolean) => void;
  toggleCompact: () => void;
  addMessage: (questionId: string, message: TutorMessage) => void;
  updateSessionOverrides: (
    questionId: string,
    overrides: { model?: string; persona?: string },
  ) => void;
  removeLastMessage: (questionId: string) => void;
  clearSession: (questionId: string) => void;
  clearAllSessions: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setStreamedContent: (content: string) => void;
  appendStreamedContent: (chunk: string) => void;
  updateMetrics: (tokens: number, cost: number) => void;
  incrementErrorCount: () => void;
}

export const useTutorStore = create<TutorState & TutorActions>()((set) => ({
  isOpen: false,
  sessions: {},
  isGenerating: false,
  streamedContent: '',
  totalTokensSession: 0,
  totalCostSession: 0,
  totalMessagesCount: 0,
  totalErrorsCount: 0,
  isCompact: false,

  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setIsCompact: (isCompact) => set({ isCompact }),
  toggleCompact: () => set((state) => ({ isCompact: !state.isCompact })),

  addMessage: (questionId, message) =>
    set((state) => {
      const session = state.sessions[questionId] || {
        questionId,
        messages: [],
      };
      return {
        totalMessagesCount: state.totalMessagesCount + 1,
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: [...session.messages, message],
          },
        },
      };
    }),

  updateSessionOverrides: (questionId, overrides) =>
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
            modelOverride: overrides.model ?? session.modelOverride,
            personaOverride: overrides.persona ?? session.personaOverride,
          },
        },
      };
    }),

  removeLastMessage: (questionId) =>
    set((state) => {
      const session = state.sessions[questionId];
      if (!session || session.messages.length === 0) return state;
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: session.messages.slice(0, -1),
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
      totalMessagesCount: 0,
      totalErrorsCount: 0,
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

  incrementErrorCount: () =>
    set((state) => ({ totalErrorsCount: state.totalErrorsCount + 1 })),
}));
