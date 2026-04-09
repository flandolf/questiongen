import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStore } from '@/store';
import type { GeneratedQuestion, McQuestion } from '@/types';
import type { QuestionTiming, TimerState } from '@/types/timer';

export interface UseTimerReturn {
  sessionElapsedSeconds: number;
  formattedSessionTime: string;
  isPaused: boolean;
  isSessionComplete: boolean;

  currentQuestionElapsed: number;
  formattedQuestionTime: string;
  currentQuestionMarks: number;
  isCurrentQuestionWarning: boolean;

  start: (questions: GeneratedQuestion[] | McQuestion[]) => void;
  markAnswered: (questionId: string) => void;
  complete: () => void;
  reset: () => void;
  togglePause: () => void;
  removeQuestion: (questionId: string) => void;

  getQuestionTiming: (
    questionId: string
  ) => { elapsedSeconds: number; marks: number; isWarning: boolean } | null;
  getAllTimings: () => Array<{
    id: string;
    elapsedSeconds: number;
    marks: number;
  }>;
}

function getMarks(q: GeneratedQuestion | McQuestion): number {
  if ('marks' in q && typeof q.marks === 'number') {
    return q.marks;
  }
  return 1;
}

function formatTime(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0)
    return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function computeShouldWarn(elapsedSeconds: number, marks: number): boolean {
  const warningSecondsPerMark = 72;
  return marks > 0 && elapsedSeconds > marks * warningSecondsPerMark;
}

function createEmptyState(): TimerState {
  return {
    questions: {},
    activeQuestionId: null,
    isPaused: false,
    sessionStartedAt: null,
    sessionFinishedAt: null,
  };
}

type TimerStoreSlice = {
  writtenTimer: TimerState | null;
  mcTimer: TimerState | null;
  setWrittenTimer: (state: TimerState | null) => void;
  setMcTimer: (state: TimerState | null) => void;
};

function getElapsedSeconds(
  q: QuestionTiming | undefined,
  nowMs: number
): number {
  if (!q) return 0;
  if (q.runningSinceMs === null) return q.elapsedSeconds;
  const deltaSec = Math.max(0, Math.floor((nowMs - q.runningSinceMs) / 1000));
  return q.elapsedSeconds + deltaSec;
}

function stopQuestion(q: QuestionTiming, nowMs: number): QuestionTiming {
  if (q.runningSinceMs === null) return q;
  return {
    ...q,
    elapsedSeconds: getElapsedSeconds(q, nowMs),
    runningSinceMs: null,
    lastUpdatedAt: nowMs,
  };
}

function startQuestion(q: QuestionTiming, nowMs: number): QuestionTiming {
  if (q.runningSinceMs !== null || q.answeredAt !== null) return q;
  return {
    ...q,
    runningSinceMs: nowMs,
    lastUpdatedAt: nowMs,
  };
}

export function useTimer(
  questions: Array<GeneratedQuestion | McQuestion>,
  activeQuestionIndex: number,
  sessionKey: 'written' | 'mc'
): UseTimerReturn {
  const [timerState, setTimerState] = useState<TimerState>(() => {
    const store = useAppStore.getState() as TimerStoreSlice;
    const persisted =
      sessionKey === 'written' ? store.writtenTimer : store.mcTimer;
    return persisted ?? createEmptyState();
  });
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;

  const [nowMs, setNowMs] = useState(() => Date.now());

  const syncToStore = useCallback(
    (state: TimerState) => {
      const store = useAppStore.getState() as TimerStoreSlice;
      if (sessionKey === 'written') {
        store.setWrittenTimer(state);
      } else {
        store.setMcTimer(state);
      }
    },
    [sessionKey]
  );

  useEffect(() => {
    syncToStore(timerState);
  }, [timerState, syncToStore]);

  useEffect(() => {
    const activeQuestionId = timerState.activeQuestionId;
    if (!timerState.sessionStartedAt || timerState.sessionFinishedAt) return;
    if (timerState.isPaused || !activeQuestionId) return;
    const activeQuestion = timerState.questions[activeQuestionId];
    if (!activeQuestion || activeQuestion.runningSinceMs === null) return;

    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    timerState.isPaused,
    timerState.activeQuestionId,
    timerState.questions,
  ]);

  useEffect(() => {
    if (!timerState.sessionStartedAt || timerState.sessionFinishedAt) return;

    const current = questions[activeQuestionIndex];
    if (!current) return;

    const now = Date.now();
    setTimerState((prev) => {
      const nextQuestions = { ...prev.questions };

      if (prev.activeQuestionId && prev.activeQuestionId !== current.id) {
        const outgoing = nextQuestions[prev.activeQuestionId];
        if (outgoing) {
          nextQuestions[prev.activeQuestionId] = stopQuestion(outgoing, now);
        }
      }

      const incoming = nextQuestions[current.id];
      if (incoming && !prev.isPaused) {
        nextQuestions[current.id] = startQuestion(incoming, now);
      }

      const sameActive = prev.activeQuestionId === current.id;
      const sameQuestions =
        Object.keys(nextQuestions).every(
          (id) => nextQuestions[id] === prev.questions[id]
        ) &&
        Object.keys(prev.questions).length ===
          Object.keys(nextQuestions).length;
      if (sameActive && sameQuestions) return prev;

      return {
        ...prev,
        questions: nextQuestions,
        activeQuestionId: current.id,
      };
    });
  }, [
    activeQuestionIndex,
    questions,
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
  ]);

  const start = useCallback(
    (qs: GeneratedQuestion[] | McQuestion[]) => {
      const s = timerStateRef.current;
      if (s.sessionStartedAt && !s.sessionFinishedAt) return;

      const initializedQuestions: TimerState['questions'] = {};
      for (const q of qs) {
        initializedQuestions[q.id] = {
          marks: getMarks(q),
          elapsedSeconds: 0,
          runningSinceMs: null,
          answeredAt: null,
          lastUpdatedAt: Date.now(),
          isWarning: false,
        };
      }

      const firstId = qs[activeQuestionIndex]?.id ?? qs[0]?.id ?? null;
      const now = Date.now();
      if (firstId && initializedQuestions[firstId]) {
        initializedQuestions[firstId] = {
          ...initializedQuestions[firstId],
          runningSinceMs: now,
          lastUpdatedAt: now,
        };
      }

      setTimerState({
        questions: initializedQuestions,
        activeQuestionId: firstId,
        isPaused: false,
        sessionStartedAt: now,
        sessionFinishedAt: null,
      });
      setNowMs(now);
    },
    [activeQuestionIndex]
  );

  const markAnswered = useCallback((questionId: string) => {
    const now = Date.now();
    setTimerState((prev) => {
      const q = prev.questions[questionId];
      if (!q || q.answeredAt !== null) return prev;
      const stopped = stopQuestion(q, now);
      const elapsedSeconds = stopped.elapsedSeconds;

      return {
        ...prev,
        questions: {
          ...prev.questions,
          [questionId]: {
            ...stopped,
            answeredAt: now / 1000,
            isWarning: computeShouldWarn(elapsedSeconds, stopped.marks),
            lastUpdatedAt: now,
          },
        },
      };
    });
    setNowMs(now);
  }, []);

  const complete = useCallback(() => {
    const now = Date.now();
    setTimerState((prev) => {
      if (!prev.sessionStartedAt || prev.sessionFinishedAt) return prev;

      const nextQuestions: TimerState['questions'] = {};
      for (const [id, q] of Object.entries(prev.questions)) {
        const stopped = stopQuestion(q, now);
        nextQuestions[id] = {
          ...stopped,
          isWarning: computeShouldWarn(stopped.elapsedSeconds, stopped.marks),
        };
      }

      return {
        ...prev,
        questions: nextQuestions,
        activeQuestionId: null,
        isPaused: false,
        sessionFinishedAt: now,
      };
    });
    setNowMs(now);
  }, []);

  const reset = useCallback(() => {
    setTimerState(createEmptyState());
    setNowMs(Date.now());
  }, []);

  const togglePause = useCallback(() => {
    const now = Date.now();
    setTimerState((prev) => {
      if (!prev.sessionStartedAt || prev.sessionFinishedAt) return prev;

      const nextQuestions = { ...prev.questions };
      if (!prev.isPaused && prev.activeQuestionId) {
        const active = nextQuestions[prev.activeQuestionId];
        if (active) {
          nextQuestions[prev.activeQuestionId] = stopQuestion(active, now);
        }
      }

      if (prev.isPaused && prev.activeQuestionId) {
        const active = nextQuestions[prev.activeQuestionId];
        if (active) {
          nextQuestions[prev.activeQuestionId] = startQuestion(active, now);
        }
      }

      return {
        ...prev,
        questions: nextQuestions,
        isPaused: !prev.isPaused,
      };
    });
    setNowMs(now);
  }, []);

  const removeQuestion = useCallback((questionId: string) => {
    setTimerState((prev) => {
      if (!prev.questions[questionId]) return prev;
      const { [questionId]: _, ...rest } = prev.questions;
      return {
        ...prev,
        questions: rest,
        activeQuestionId:
          prev.activeQuestionId === questionId ? null : prev.activeQuestionId,
      };
    });
    setNowMs(Date.now());
  }, []);

  const getQuestionTiming = useCallback(
    (questionId: string) => {
      const q = timerState.questions[questionId];
      if (!q) return null;
      const elapsedSeconds = getElapsedSeconds(q, nowMs);
      return {
        elapsedSeconds,
        marks: q.marks,
        isWarning: computeShouldWarn(elapsedSeconds, q.marks),
      };
    },
    [timerState.questions, nowMs]
  );

  const getAllTimings = useCallback(() => {
    return Object.entries(timerState.questions)
      .map(([id, q]) => ({
        id,
        elapsedSeconds: getElapsedSeconds(q, nowMs),
        marks: q.marks,
      }))
      .sort((a, b) => a.marks - b.marks);
  }, [timerState.questions, nowMs]);

  const currentQuestionId =
    questions[activeQuestionIndex]?.id ?? timerState.activeQuestionId;
  const currentQ = currentQuestionId
    ? timerState.questions[currentQuestionId]
    : null;
  const currentQuestionElapsed = getElapsedSeconds(
    currentQ ?? undefined,
    nowMs
  );
  const currentQuestionMarks = currentQ?.marks ?? 0;
  const isCurrentQuestionWarning = computeShouldWarn(
    currentQuestionElapsed,
    currentQuestionMarks
  );

  const sessionElapsedSeconds = Object.values(timerState.questions).reduce(
    (total, q) => total + getElapsedSeconds(q, nowMs),
    0
  );

  return {
    sessionElapsedSeconds,
    formattedSessionTime: formatTime(sessionElapsedSeconds),
    isPaused: timerState.isPaused,
    isSessionComplete: timerState.sessionFinishedAt !== null,

    currentQuestionElapsed,
    formattedQuestionTime: formatTime(currentQuestionElapsed),
    currentQuestionMarks,
    isCurrentQuestionWarning,

    start,
    markAnswered,
    complete,
    reset,
    togglePause,
    removeQuestion,

    getQuestionTiming,
    getAllTimings,
  };
}
