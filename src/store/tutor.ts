import { create } from 'zustand';

export type TutorApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | TutorApiContentPart[];
  createdAt: number;
  feedback?: 'up' | 'down';
}

export interface TutorSession {
  questionId: string;
  messages: TutorMessage[];
  /** Alternate branches keyed by branch ID. Active messages are the current branch. */
  branches: Record<string, TutorMessage[]>;
  /** Message index in the parent where this branch forked from. */
  branchParentIndex: number;
  /** ID of the active branch, or null for the main branch. */
  activeBranchId: string | null;
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
  editMessage: (
    questionId: string,
    messageId: string,
    content: string | TutorApiContentPart[],
  ) => void;
  setMessageFeedback: (
    questionId: string,
    messageId: string,
    feedback: 'up' | 'down' | null,
  ) => void;
  updateSessionOverrides: (
    questionId: string,
    overrides: { model?: string; persona?: string },
  ) => void;
  removeLastMessage: (questionId: string) => void;
  /** Saves the last assistant+user pair into a branch and removes them from active messages. */
  createBranch: (questionId: string) => string;
  /** Switches the active branch. Pass null to return to the main branch. */
  switchBranch: (questionId: string, branchId: string | null) => void;
  clearSession: (questionId: string) => void;
  clearAllSessions: () => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setStreamedContent: (content: string) => void;
  appendStreamedContent: (chunk: string) => void;
  updateMetrics: (tokens: number, cost: number) => void;
  incrementErrorCount: () => void;
}

function defaultSession(questionId: string): TutorSession {
  return {
    questionId,
    messages: [],
    branches: {},
    branchParentIndex: 0,
    activeBranchId: null,
  };
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
      const session = state.sessions[questionId] || defaultSession(questionId);
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

  editMessage: (questionId, messageId, content) =>
    set((state) => {
      const session = state.sessions[questionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: session.messages.map((m) =>
              m.id === messageId ? { ...m, content } : m,
            ),
          },
        },
      };
    }),

  setMessageFeedback: (questionId, messageId, feedback) =>
    set((state) => {
      const session = state.sessions[questionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: session.messages.map((m) =>
              m.id === messageId
                ? { ...m, feedback: feedback ?? undefined }
                : m,
            ),
          },
        },
      };
    }),

  updateSessionOverrides: (questionId, overrides) =>
    set((state) => {
      const session = state.sessions[questionId] || defaultSession(questionId);
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
        totalMessagesCount: Math.max(0, state.totalMessagesCount - 1),
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: session.messages.slice(0, -1),
          },
        },
      };
    }),

  createBranch: (questionId) => {
    const branchId = crypto.randomUUID();
    set((state) => {
      const session = state.sessions[questionId];
      if (!session || session.messages.length < 2) return state;
      const forkIndex = session.messages.length - 2;
      const branchedMessages = session.messages.slice(forkIndex);
      const remainingMessages = session.messages.slice(0, forkIndex);
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: remainingMessages,
            branches: {
              ...session.branches,
              [branchId]: branchedMessages,
            },
            branchParentIndex: forkIndex,
            activeBranchId: null,
          },
        },
      };
    });
    return branchId;
  },

  switchBranch: (questionId, branchId) =>
    set((state) => {
      const session = state.sessions[questionId];
      if (!session) return state;
      if (branchId === null) {
        if (!session.activeBranchId) return state;
        const branches = { ...session.branches };
        const mainMessages = branches['__main__'] || [];
        delete branches['__main__'];
        return {
          sessions: {
            ...state.sessions,
            [questionId]: {
              ...session,
              messages:
                mainMessages.length > 0 ? mainMessages : session.messages,
              branches,
              activeBranchId: null,
            },
          },
        };
      }
      const targetBranch = session.branches[branchId];
      if (!targetBranch) return state;
      const updatedBranches = { ...session.branches };
      if (session.activeBranchId && session.branches[session.activeBranchId]) {
        updatedBranches[session.activeBranchId] = session.messages;
      } else if (
        session.activeBranchId === null &&
        session.messages.length > 0
      ) {
        updatedBranches['__main__'] = session.messages;
      }
      return {
        sessions: {
          ...state.sessions,
          [questionId]: {
            ...session,
            messages: targetBranch,
            branches: updatedBranches,
            activeBranchId: branchId,
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
