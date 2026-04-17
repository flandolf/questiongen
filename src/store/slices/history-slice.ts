import { startTransition } from 'react';
import type { StateCreator } from 'zustand';

import {
  deleteMcHistoryEntry as v3DeleteMcHistoryEntry,
  deleteQuestionHistoryEntry as v3DeleteQuestionHistoryEntry,
  deleteSavedSet as v3DeleteSavedSet,
  saveGenerationRecord as v3SaveGenerationRecord,
  saveMcHistoryEntry as v3SaveMcHistoryEntry,
  saveQuestionHistoryEntry as v3SaveQuestionHistoryEntry,
  saveSavedSet as v3SaveSavedSet,
  updateStudyGoals,
} from '@/context/modules/sync-v3/mutations';
import { EMPTY_PERSISTED_APP_STATE } from '@/lib/persistence';
import { createCard, isDue, reviewCard } from '@/lib/spaced-repetition';
import { getTodayKey } from '@/lib/utils';
import type {
  PersistedGeneratorPreferences,
  PersistedMcSession,
  PersistedWrittenSession,
  SavedQuestionSet,
} from '@/types';

import {
  buildSavedSetTitle,
  isMcSessionComplete,
  isWrittenSessionComplete,
  resolve,
} from '../helpers';
import type { AppActions, AppState } from '../types';

export interface HistorySlice {
  questionHistory: AppState['questionHistory'];
  mcHistory: AppState['mcHistory'];
  savedSets: AppState['savedSets'];
  spacedRepetitionCards: AppState['spacedRepetitionCards'];
  studyGoals: AppState['studyGoals'];
  streakData: AppState['streakData'];
  timeAllocations: AppState['timeAllocations'];
  generationHistory: AppState['generationHistory'];
  logs: AppState['logs'];

  // Actions
  setQuestionHistory: AppActions['setQuestionHistory'];
  setMcHistory: AppActions['setMcHistory'];
  saveCurrentSet: AppActions['saveCurrentSet'];
  loadSavedSet: AppActions['loadSavedSet'];
  needsSaveBeforeLoad: AppActions['needsSaveBeforeLoad'];
  deleteSavedSet: AppActions['deleteSavedSet'];
  deleteAllSavedSets: AppActions['deleteAllSavedSets'];
  deleteQuestionHistoryEntry: AppActions['deleteQuestionHistoryEntry'];
  deleteMcHistoryEntry: AppActions['deleteMcHistoryEntry'];
  addQuestionHistoryEntry: AppActions['addQuestionHistoryEntry'];
  addMcHistoryEntry: AppActions['addMcHistoryEntry'];
  updateQuestionHistoryEntry: AppActions['updateQuestionHistoryEntry'];
  updateMcHistoryEntry: AppActions['updateMcHistoryEntry'];
  clearQuestionHistory: AppActions['clearQuestionHistory'];
  clearMcHistory: AppActions['clearMcHistory'];

  reviewSpacedCard: AppActions['reviewSpacedCard'];
  getDueCards: AppActions['getDueCards'];

  setStudyGoals: AppActions['setStudyGoals'];
  recordCompletion: AppActions['recordCompletion'];
  getTodayCompletions: AppActions['getTodayCompletions'];

  setTimeAllocations: AppActions['setTimeAllocations'];

  addGenerationRecord: AppActions['addGenerationRecord'];
  addLog: AppActions['addLog'];
  clearLogs: AppActions['clearLogs'];
}

export const createHistorySlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  questionHistory: EMPTY_PERSISTED_APP_STATE.questionHistory,
  mcHistory: EMPTY_PERSISTED_APP_STATE.mcHistory,
  savedSets: EMPTY_PERSISTED_APP_STATE.savedSets,
  spacedRepetitionCards: {},
  studyGoals: {
    dailyQuestionGoal: 10,
    dailyWrittenGoal: 5,
    dailyMcGoal: 5,
    weeklyStreakGoal: 5,
  },
  streakData: {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    dailyCompletions: {},
  },
  timeAllocations: [
    { difficulty: 'Essential Skills', minutesPerMark: 0.8 },
    { difficulty: 'Easy', minutesPerMark: 1 },
    { difficulty: 'Medium', minutesPerMark: 1.25 },
    { difficulty: 'Hard', minutesPerMark: 1.5 },
    { difficulty: 'Extreme', minutesPerMark: 1.8 },
  ],
  generationHistory: [],
  logs: [],

  setQuestionHistory: (update) =>
    set((s) => ({ questionHistory: resolve(update, s.questionHistory) })),
  setMcHistory: (update) =>
    set((s) => ({ mcHistory: resolve(update, s.mcHistory) })),

  saveCurrentSet: () => {
    const s = get();
    console.info(`Saving current ${s.questionMode} session...`, {
      topics: s.selectedTopics,
      questionCount: s.questions.length || s.mcQuestions.length,
    });
    const now = new Date().toISOString();
    const nowMs = Date.now();
    if (s.questionMode === 'written') {
      if (s.questions.length === 0) {
        console.warn('Cannot save empty written session');
        return null;
      }
      const isComplete = isWrittenSessionComplete(
        s.questions,
        s.feedbackByQuestionId,
      );
      if (isComplete) {
        if (s.activeWrittenSavedSetId) {
          const completedSavedSetId = s.activeWrittenSavedSetId;
          set((state) => ({
            savedSets: state.savedSets.filter(
              (e) => e.id !== completedSavedSetId,
            ),
            activeWrittenSavedSetId: null,
          }));
          void v3DeleteSavedSet(completedSavedSetId);
        }
        return null;
      }
      const savedSetId =
        s.activeWrittenSavedSetId ?? `saved-written-${crypto.randomUUID()}`;
      const preferencesSnapshot: PersistedGeneratorPreferences = {
        selectedTopics: s.selectedTopics,
        difficulty: s.difficulty,
        techMode: s.techMode,
        avoidSimilarQuestions: s.avoidSimilarQuestions,
        selectedSubtopics: s.selectedSubtopics,
        questionCount: s.questionCount,
        averageMarksPerQuestion: s.averageMarksPerQuestion,
        questionMode: s.questionMode,
        diversityStrictness: s.diversityStrictness,
        strictLatexValidation: s.strictLatexValidation,
        generationStrategy: s.generationStrategy,
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
        title: buildSavedSetTitle('written', s.selectedTopics),
        questionMode: 'written',
        createdAt:
          s.savedSets.find((e) => e.id === savedSetId)?.createdAt ?? now,
        updatedAt: now,
        lastModified: nowMs,
        preferences: preferencesSnapshot,
        writtenSession,
      };
      const nextSavedSets = [
        nextEntry,
        ...s.savedSets.filter((e) => e.id !== savedSetId),
      ];
      set({ savedSets: nextSavedSets, activeWrittenSavedSetId: savedSetId });
      void v3SaveSavedSet(nextEntry);
      return savedSetId;
    }
    // MC logic
    if (s.mcQuestions.length === 0) return null;
    const isComplete = isMcSessionComplete(
      s.mcQuestions,
      s.mcAnswersByQuestionId,
    );
    if (isComplete) {
      if (s.activeMcSavedSetId) {
        const completedSavedSetId = s.activeMcSavedSetId;
        set((state) => ({
          savedSets: state.savedSets.filter(
            (e) => e.id !== completedSavedSetId,
          ),
          activeMcSavedSetId: null,
        }));
        void v3DeleteSavedSet(completedSavedSetId);
      }
      return null;
    }
    const savedSetId =
      s.activeMcSavedSetId ?? `saved-mc-${crypto.randomUUID()}`;
    const preferencesSnapshot: PersistedGeneratorPreferences = {
      selectedTopics: s.selectedTopics,
      difficulty: s.difficulty,
      techMode: s.techMode,
      avoidSimilarQuestions: s.avoidSimilarQuestions,
      selectedSubtopics: s.selectedSubtopics,
      questionCount: s.questionCount,
      averageMarksPerQuestion: s.averageMarksPerQuestion,
      questionMode: s.questionMode,
      diversityStrictness: s.diversityStrictness,
      strictLatexValidation: s.strictLatexValidation,
      generationStrategy: s.generationStrategy,
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
      title: buildSavedSetTitle('multiple-choice', s.selectedTopics),
      questionMode: 'multiple-choice',
      createdAt: s.savedSets.find((e) => e.id === savedSetId)?.createdAt ?? now,
      updatedAt: now,
      lastModified: nowMs,
      preferences: preferencesSnapshot,
      mcSession,
    };
    const nextSavedSets = [
      nextEntry,
      ...s.savedSets.filter((e) => e.id !== savedSetId),
    ];
    set({ savedSets: nextSavedSets, activeMcSavedSetId: savedSetId });
    void v3SaveSavedSet(nextEntry);
    return savedSetId;
  },

  loadSavedSet: (id) => {
    const entry = get().savedSets.find((e) => e.id === id);
    if (!entry) return;
    startTransition(() => {
      set({
        selectedTopics: entry.preferences.selectedTopics,
        difficulty: entry.preferences.difficulty,
        techMode: entry.preferences.techMode,
        avoidSimilarQuestions: entry.preferences.avoidSimilarQuestions,
        selectedSubtopics: entry.preferences.selectedSubtopics,
        questionCount: entry.preferences.questionCount,
        questionMode: entry.questionMode,
        writtenTimer: null,
        mcTimer: null,
        ...(entry.questionMode === 'written'
          ? {
              questions: entry.writtenSession!.questions,
              activeQuestionIndex: entry.writtenSession!.activeQuestionIndex,
              writtenQuestionPresentedAtById:
                entry.writtenSession!.presentedAtByQuestionId,
              answersByQuestionId: entry.writtenSession!.answersByQuestionId,
              imagesByQuestionId: entry.writtenSession!.imagesByQuestionId,
              feedbackByQuestionId: entry.writtenSession!.feedbackByQuestionId,
              writtenRawModelOutput: entry.writtenSession!.rawModelOutput,
              writtenGenerationTelemetry:
                entry.writtenSession!.generationTelemetry ?? null,
              activeWrittenSavedSetId: id,
              mcQuestions: [],
              activeMcQuestionIndex: 0,
              mcQuestionPresentedAtById: {},
              mcAnswersByQuestionId: {},
              activeMcSavedSetId: null,
            }
          : {
              mcQuestions: entry.mcSession!.questions,
              activeMcQuestionIndex: entry.mcSession!.activeQuestionIndex,
              mcQuestionPresentedAtById:
                entry.mcSession!.presentedAtByQuestionId,
              mcAnswersByQuestionId: entry.mcSession!.answersByQuestionId,
              mcRawModelOutput: entry.mcSession!.rawModelOutput,
              mcGenerationTelemetry:
                entry.mcSession!.generationTelemetry ?? null,
              activeMcSavedSetId: id,
              questions: [],
              activeQuestionIndex: 0,
              writtenQuestionPresentedAtById: {},
              answersByQuestionId: {},
              imagesByQuestionId: {},
              feedbackByQuestionId: {},
              activeWrittenSavedSetId: null,
            }),
      });
    });
  },

  needsSaveBeforeLoad: (id) => {
    const s = get();
    const currentId =
      s.questionMode === 'written'
        ? s.activeWrittenSavedSetId
        : s.activeMcSavedSetId;
    if (currentId === id) return false;
    const hasQuestions =
      s.questionMode === 'written'
        ? s.questions.length > 0
        : s.mcQuestions.length > 0;
    if (!hasQuestions) return false;
    return true;
  },

  deleteSavedSet: (id) => {
    set((s) => ({
      savedSets: s.savedSets.filter((e) => e.id !== id),
      activeWrittenSavedSetId:
        s.activeWrittenSavedSetId === id ? null : s.activeWrittenSavedSetId,
      activeMcSavedSetId:
        s.activeMcSavedSetId === id ? null : s.activeMcSavedSetId,
    }));
    void v3DeleteSavedSet(id);
  },

  deleteAllSavedSets: () => {
    set((s) => {
      s.savedSets.forEach((ss) => void v3DeleteSavedSet(ss.id));
      return {
        savedSets: [],
        activeWrittenSavedSetId: null,
        activeMcSavedSetId: null,
      };
    });
  },

  deleteQuestionHistoryEntry: (id) => {
    set((s) => ({
      questionHistory: s.questionHistory.filter((e) => e.id !== id),
    }));
    void v3DeleteQuestionHistoryEntry(id);
  },

  deleteMcHistoryEntry: (id) => {
    set((s) => ({ mcHistory: s.mcHistory.filter((e) => e.id !== id) }));
    void v3DeleteMcHistoryEntry(id);
  },

  addQuestionHistoryEntry: (entry) => {
    const nextEntry = { ...entry, isUploaded: false };
    set((s) => ({ questionHistory: [nextEntry, ...s.questionHistory] }));
    void v3SaveQuestionHistoryEntry(nextEntry);
  },

  addMcHistoryEntry: (entry) => {
    const nextEntry = { ...entry, isUploaded: false };
    set((s) => ({ mcHistory: [nextEntry, ...s.mcHistory] }));
    void v3SaveMcHistoryEntry(nextEntry);
  },

  updateQuestionHistoryEntry: (entry) => {
    set((s) => ({
      questionHistory: s.questionHistory.map((e) =>
        e.id === entry.id ? entry : e,
      ),
    }));
    void v3SaveQuestionHistoryEntry(entry);
  },

  updateMcHistoryEntry: (entry) => {
    set((s) => ({
      mcHistory: s.mcHistory.map((e) => (e.id === entry.id ? entry : e)),
    }));
    void v3SaveMcHistoryEntry(entry);
  },

  clearQuestionHistory: () => {
    set((s) => {
      s.questionHistory.forEach((e) => void v3DeleteQuestionHistoryEntry(e.id));
      return { questionHistory: [] };
    });
  },

  clearMcHistory: () => {
    set((s) => {
      s.mcHistory.forEach((e) => void v3DeleteMcHistoryEntry(e.id));
      return { mcHistory: [] };
    });
  },

  reviewSpacedCard: (id, q) =>
    set((s) => {
      const card = s.spacedRepetitionCards[id]
        ? reviewCard(s.spacedRepetitionCards[id], q)
        : reviewCard(createCard(), q);
      return {
        spacedRepetitionCards: { ...s.spacedRepetitionCards, [id]: card },
      };
    }),

  getDueCards: () =>
    Object.entries(get().spacedRepetitionCards)
      .filter(([, c]) => isDue(c))
      .map(([id, c]) => ({ questionId: id, card: c }))
      .sort(
        (a, b) =>
          new Date(a.card.nextReviewDate).getTime() -
          new Date(b.card.nextReviewDate).getTime(),
      ),

  setStudyGoals: (goals) =>
    set((s) => {
      const next = { ...s.studyGoals, ...goals };
      void updateStudyGoals(next, s.streakData);
      return { studyGoals: next };
    }),

  recordCompletion: (mode) => {
    const today = getTodayKey();
    set((s) => {
      const todayData = s.streakData.dailyCompletions[today] ?? {
        total: 0,
        written: 0,
        mc: 0,
      };
      const updatedDay = {
        total: todayData.total + 1,
        written: todayData.written + (mode === 'written' ? 1 : 0),
        mc: todayData.mc + (mode === 'multiple-choice' ? 1 : 0),
      };
      const nextStreakData = {
        ...s.streakData,
        currentStreak:
          todayData.total > 0
            ? s.streakData.currentStreak
            : s.streakData.currentStreak + 1,
        longestStreak: Math.max(
          s.streakData.longestStreak,
          s.streakData.currentStreak + 1,
        ),
        lastActiveDate: today,
        dailyCompletions: {
          ...s.streakData.dailyCompletions,
          [today]: updatedDay,
        },
      };
      void updateStudyGoals(s.studyGoals, nextStreakData);
      return { streakData: nextStreakData };
    });
  },

  getTodayCompletions: () =>
    get().streakData.dailyCompletions[getTodayKey()] ?? {
      total: 0,
      written: 0,
      mc: 0,
    },

  setTimeAllocations: (allocations) => set({ timeAllocations: allocations }),

  addGenerationRecord: (record) => {
    const nextRecord = { ...record, isUploaded: false };
    set((s) => ({
      generationHistory: [nextRecord, ...s.generationHistory].slice(0, 1000),
    }));
    void v3SaveGenerationRecord(nextRecord);
  },

  addLog: (entry) =>
    set((s) => ({
      logs: [
        {
          ...entry,
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        },
        ...s.logs,
      ].slice(0, 1000),
    })),

  clearLogs: () => set({ logs: [] }),
});
