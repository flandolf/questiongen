import { useEffect, useState, useCallback, useRef } from "react";
import { PerQuestionTiming, QuestionTimerState, GenerationMode, GeneratedQuestion, McQuestion } from "@/types";

// Utility: format seconds as mm:ss
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface UseQuestionTimerReturn {
  sessionElapsedSeconds: number;
  sessionRemainingSeconds: number;
  formattedSessionTime: string;
  isPaused: boolean;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;

  currentQuestionTimeUsed: number;
  currentQuestionTimeLimit: number;
  currentQuestionRemaining: number;
  formattedQuestionTime: string;
  parTimeSeconds: number;

  bankedSeconds: number;
  formattedBank: string;
  bankStatus: "ahead" | "behind" | "on-pace";

  isQuestionExpired: boolean;
  shouldAutoAdvance: boolean;

  startTiming: (questions: GeneratedQuestion[] | McQuestion[]) => void;
  onQuestionPresented: (questionId: string) => void;
  onQuestionAnswered: (questionId: string) => void;
  onQuestionIndexChanged: (newIndex: number) => void;
  finishSession: () => void;
  reset: () => void;

  getQuestionTiming: (questionId: string) => PerQuestionTiming | null;
}

export function useQuestionTimer(
  mode: GenerationMode,
  totalTimeLimitSeconds: number,
  questions: Array<GeneratedQuestion | McQuestion>,
  activeQuestionIndex: number
): UseQuestionTimerReturn {
  // --- State ---
  const [timerState, setTimerState] = useState<QuestionTimerState>(() => {
    const par = Math.floor(totalTimeLimitSeconds / (questions.length || 1));
    const byQuestionId: Record<string, PerQuestionTiming> = {};
    for (const q of questions) {
      byQuestionId[q.id] = {
        timeLimitSeconds: par,
        originalTimeLimitSeconds: par,
        startedAt: null,
        answeredAt: null,
        timeUsedSeconds: 0,
        isExpired: false,
        finishedEarly: false,
      };
    }
    return {
      byQuestionId,
      totalTimeLimitSeconds,
      sessionStartedAt: null,
      sessionFinishedAt: null,
      bankedSeconds: 0,
      parTimeSeconds: par,
      isPaused: false,
      pausedDurationMs: 0,
      activeQuestionIndex: 0,
      mode,
    };
  });

  // Track pause start time for accurate pausedDurationMs accumulation
  const pauseStartedAtRef = useRef<number | null>(null);

  // Stable ref for questions to avoid recreating the interval on question changes
  const questionsRef = useRef(questions);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  // Stable ref for timerState so getQuestionTiming doesn't depend on timerState
  const timerStateRef = useRef(timerState);
  useEffect(() => { timerStateRef.current = timerState; }, [timerState]);

  // --- Timer logic ---
  useEffect(() => {
    if (timerState.isPaused || timerState.sessionStartedAt === null || timerState.sessionFinishedAt !== null) return;
    const interval = setInterval(() => {
      setTimerState(s => {
        const now = Date.now() / 1000;
        const qs = questionsRef.current;
        const currentQ = qs[s.activeQuestionIndex];
        if (!currentQ) return s;
        const q = s.byQuestionId[currentQ.id];
        if (!q || q.startedAt === null || q.isExpired || q.answeredAt !== null) return s;

        const timeUsed = Math.floor(now - q.startedAt);
        const isExpired = timeUsed >= q.timeLimitSeconds;
        const newTimeUsed = Math.min(timeUsed, q.timeLimitSeconds);

        // Only update if the value actually changed
        if (q.timeUsedSeconds === newTimeUsed && q.isExpired === isExpired) return s;

        const byQuestionId = {
          ...s.byQuestionId,
          [currentQ.id]: {
            ...q,
            timeUsedSeconds: newTimeUsed,
            isExpired,
          },
        };
        return { ...s, byQuestionId };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [
    timerState.isPaused,
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
  ]);

  // --- Derived values ---
  const currentQ = questions[activeQuestionIndex];
  const qTiming = currentQ ? timerState.byQuestionId[currentQ.id] : null;
  const currentQuestionTimeUsed = qTiming?.timeUsedSeconds ?? 0;
  const currentQuestionTimeLimit = qTiming?.timeLimitSeconds ?? 0;
  const currentQuestionRemaining = Math.max(0, currentQuestionTimeLimit - currentQuestionTimeUsed);
  const formattedQuestionTime = formatTime(mode === "exam" ? currentQuestionRemaining : currentQuestionTimeUsed);
  const parTimeSeconds = timerState.parTimeSeconds;
  const bankedSeconds = timerState.bankedSeconds;
  const formattedBank = formatTime(Math.abs(bankedSeconds));
  const bankStatus = bankedSeconds > 0 ? "ahead" : bankedSeconds < 0 ? "behind" : "on-pace";
  const isQuestionExpired = !!qTiming?.isExpired;
  const shouldAutoAdvance = isQuestionExpired && mode === "exam";

  // Session elapsed time accounts for pauses via pausedDurationMs
  const sessionElapsedSeconds = timerState.sessionStartedAt === null
    ? 0
    : Math.floor(
        ((timerState.sessionFinishedAt ?? Date.now() / 1000) - timerState.sessionStartedAt - (timerState.pausedDurationMs / 1000))
      );
  const sessionRemainingSeconds = Math.max(0, timerState.totalTimeLimitSeconds - sessionElapsedSeconds);
  const formattedSessionTime = formatTime(mode === "exam" ? sessionRemainingSeconds : sessionElapsedSeconds);
  const isPaused = timerState.isPaused;

  // --- Actions ---
  const togglePause = useCallback(() => {
    setTimerState(s => {
      if (!s.sessionStartedAt) return s;
      const willPause = !s.isPaused;
      if (willPause) {
        pauseStartedAtRef.current = Date.now();
        return { ...s, isPaused: true };
      }
      // Resuming: accumulate paused duration
      const additionalPause = pauseStartedAtRef.current ? (Date.now() - pauseStartedAtRef.current) : 0;
      pauseStartedAtRef.current = null;
      return { ...s, isPaused: false, pausedDurationMs: s.pausedDurationMs + additionalPause };
    });
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setTimerState(s => {
      if (!s.sessionStartedAt || s.isPaused === paused) return s;
      if (paused) {
        pauseStartedAtRef.current = Date.now();
        return { ...s, isPaused: true };
      }
      // Resuming: accumulate paused duration
      const additionalPause = pauseStartedAtRef.current ? (Date.now() - pauseStartedAtRef.current) : 0;
      pauseStartedAtRef.current = null;
      return { ...s, isPaused: false, pausedDurationMs: s.pausedDurationMs + additionalPause };
    });
  }, []);

  const startTiming = useCallback((qs: GeneratedQuestion[] | McQuestion[]) => {
    setTimerState(s => {
      if (s.sessionStartedAt) return s;
      const now = Date.now() / 1000;
      const par = Math.floor(totalTimeLimitSeconds / (qs.length || 1));
      const byQuestionId: Record<string, PerQuestionTiming> = {};
      for (const q of qs) {
        byQuestionId[q.id] = {
          timeLimitSeconds: par,
          originalTimeLimitSeconds: par,
          startedAt: null,
          answeredAt: null,
          timeUsedSeconds: 0,
          isExpired: false,
          finishedEarly: false,
        };
      }
      pauseStartedAtRef.current = null;
      return {
        ...s,
        byQuestionId,
        totalTimeLimitSeconds,
        sessionStartedAt: now,
        sessionFinishedAt: null,
        isPaused: false,
        pausedDurationMs: 0,
        activeQuestionIndex: 0,
        mode,
      };
    });
  }, [totalTimeLimitSeconds, mode]);

  const onQuestionPresented = useCallback((questionId: string) => {
    setTimerState(s => {
      const now = Date.now() / 1000;
      const q = s.byQuestionId[questionId];
      if (!q || q.startedAt !== null) return s;
      return {
        ...s,
        byQuestionId: {
          ...s.byQuestionId,
          [questionId]: { ...q, startedAt: now },
        },
      };
    });
  }, []);

  const onQuestionAnswered = useCallback((questionId: string) => {
    setTimerState(s => {
      const now = Date.now() / 1000;
      const q = s.byQuestionId[questionId];
      if (!q || q.answeredAt !== null) return s;
      return {
        ...s,
        byQuestionId: {
          ...s.byQuestionId,
          [questionId]: { ...q, answeredAt: now, finishedEarly: true },
        },
      };
    });
  }, []);

  const onQuestionIndexChanged = useCallback((newIndex: number) => {
    setTimerState(s => ({ ...s, activeQuestionIndex: newIndex }));
  }, []);

  // Auto-present the current question when the index changes or session starts
  useEffect(() => {
    if (timerState.sessionStartedAt === null || timerState.sessionFinishedAt !== null) return;
    const q = questions[activeQuestionIndex];
    if (!q) return;
    const timing = timerState.byQuestionId[q.id];
    if (timing && timing.startedAt === null) {
      onQuestionPresented(q.id);
    }
  }, [activeQuestionIndex, timerState.sessionStartedAt, timerState.sessionFinishedAt, questions]);

  const finishSession = useCallback(() => {
    setTimerState(s => ({ ...s, sessionFinishedAt: Date.now() / 1000 }));
  }, []);

  const reset = useCallback(() => {
    pauseStartedAtRef.current = null;
    setTimerState(() => {
      const par = Math.floor(totalTimeLimitSeconds / (questions.length || 1));
      const byQuestionId: Record<string, PerQuestionTiming> = {};
      for (const q of questions) {
        byQuestionId[q.id] = {
          timeLimitSeconds: par,
          originalTimeLimitSeconds: par,
          startedAt: null,
          answeredAt: null,
          timeUsedSeconds: 0,
          isExpired: false,
          finishedEarly: false,
        };
      }
      return {
        byQuestionId,
        totalTimeLimitSeconds,
        sessionStartedAt: null,
        sessionFinishedAt: null,
        bankedSeconds: 0,
        parTimeSeconds: par,
        isPaused: false,
        pausedDurationMs: 0,
        activeQuestionIndex: 0,
        mode,
      };
    });
  }, [totalTimeLimitSeconds, questions, mode]);

  // Stable callback: reads from ref so it doesn't need timerState as a dep
  const getQuestionTiming = useCallback(
    (questionId: string) => timerStateRef.current.byQuestionId[questionId] ?? null,
    []
  );

  return {
    sessionElapsedSeconds,
    sessionRemainingSeconds,
    formattedSessionTime,
    isPaused,
    togglePause,
    setPaused,
    currentQuestionTimeUsed,
    currentQuestionTimeLimit,
    currentQuestionRemaining,
    formattedQuestionTime,
    parTimeSeconds,
    bankedSeconds,
    formattedBank,
    bankStatus,
    isQuestionExpired,
    shouldAutoAdvance,
    startTiming,
    onQuestionPresented,
    onQuestionAnswered,
    onQuestionIndexChanged,
    finishSession,
    reset,
    getQuestionTiming,
  };
}
