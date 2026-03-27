import { useEffect, useState, useCallback } from "react";
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
    console.debug('[useQuestionTimer] INIT useState', {
      totalTimeLimitSeconds,
      questions,
      mode,
    });
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
    console.debug('[useQuestionTimer] Initial timerState', {
      byQuestionId,
      totalTimeLimitSeconds,
      par,
      questions,
      mode,
    });
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

  // --- Timer logic ---
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    console.debug('[useQuestionTimer] useEffect timer check', {
      isPaused: timerState.isPaused,
      sessionStartedAt: timerState.sessionStartedAt,
      sessionFinishedAt: timerState.sessionFinishedAt,
      activeQuestionIndex: timerState.activeQuestionIndex,
      questions,
    });
    if (timerState.isPaused || timerState.sessionStartedAt === null || timerState.sessionFinishedAt !== null) return;
    const interval = setInterval(() => {
      setTick(t => t + 1);
      setTimerState(s => {
        const now = Date.now() / 1000;
        let byQuestionId = { ...s.byQuestionId };
        const currentQ = questions[s.activeQuestionIndex];
        if (currentQ) {
          const q = byQuestionId[currentQ.id];
          if (q && q.startedAt !== null && !q.isExpired && q.answeredAt === null) {
            const timeUsed = Math.floor(now - q.startedAt);
            const isExpired = timeUsed >= q.timeLimitSeconds;
            byQuestionId[currentQ.id] = {
              ...q,
              timeUsedSeconds: Math.min(timeUsed, q.timeLimitSeconds),
              isExpired,
            };
            console.debug('[useQuestionTimer] TIMER TICK', {
              now,
              timeUsed,
              isExpired,
              byQuestionId: byQuestionId[currentQ.id],
              currentQ,
              activeQuestionIndex: s.activeQuestionIndex,
            });
          }
        }
        return { ...s, byQuestionId };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [
    timerState.isPaused,
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    timerState.activeQuestionIndex,
    questions.length,
    questions.map(q => q.id).join('|')
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
  const sessionElapsedSeconds = Math.floor((Date.now() / 1000) - (timerState.sessionStartedAt ?? Date.now() / 1000));
  const sessionRemainingSeconds = Math.max(0, timerState.totalTimeLimitSeconds - sessionElapsedSeconds);
  const formattedSessionTime = formatTime(mode === "exam" ? sessionRemainingSeconds : sessionElapsedSeconds);
  const isPaused = timerState.isPaused;

  // --- Actions ---
  const togglePause = useCallback(() => {
    console.debug('[useQuestionTimer] togglePause called');
    setTimerState(s => {
      if (!s.sessionStartedAt) return s;
      return { ...s, isPaused: !s.isPaused };
    });
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    console.debug('[useQuestionTimer] setPaused called', { paused });
    setTimerState(s => {
      if (!s.sessionStartedAt) return s;
      if (s.isPaused === paused) return s;
      return { ...s, isPaused: paused };
    });
  }, []);

  const startTiming = useCallback((qs: GeneratedQuestion[] | McQuestion[]) => {
    console.debug('[useQuestionTimer] startTiming called', { qs });
    setTimerState(s => {
      if (s.sessionStartedAt) {
        console.debug('[useQuestionTimer] startTiming: session already started', { sessionStartedAt: s.sessionStartedAt });
        return s;
      }
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
      console.debug('[useQuestionTimer] startTiming: initializing timerState', {
        byQuestionId,
        totalTimeLimitSeconds,
        now,
        par,
        mode,
        questions,
      });
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
  }, [totalTimeLimitSeconds, mode, questions]);

  const onQuestionPresented = useCallback((questionId: string) => {
    console.debug('[useQuestionTimer] onQuestionPresented called', { questionId });
    setTimerState(s => {
      const now = Date.now() / 1000;
      const byQuestionId = { ...s.byQuestionId };
      if (byQuestionId[questionId] && byQuestionId[questionId].startedAt === null) {
        byQuestionId[questionId] = {
          ...byQuestionId[questionId],
          startedAt: now,
        };
      }
      return { ...s, byQuestionId };
    });
  }, []);

  const onQuestionAnswered = useCallback((questionId: string) => {
    console.debug('[useQuestionTimer] onQuestionAnswered called', { questionId });
    setTimerState(s => {
      const now = Date.now() / 1000;
      const byQuestionId = { ...s.byQuestionId };
      if (byQuestionId[questionId] && byQuestionId[questionId].answeredAt === null) {
        byQuestionId[questionId] = {
          ...byQuestionId[questionId],
          answeredAt: now,
          finishedEarly: true,
        };
      }
      return { ...s, byQuestionId };
    });
  }, []);

  const onQuestionIndexChanged = useCallback((newIndex: number) => {
    console.debug('[useQuestionTimer] onQuestionIndexChanged called', { newIndex });
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
    console.debug('[useQuestionTimer] finishSession called');
    setTimerState(s => ({ ...s, sessionFinishedAt: Date.now() / 1000 }));
  }, []);

  const reset = useCallback(() => {
    console.debug('[useQuestionTimer] reset called');
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
      console.debug('[useQuestionTimer] reset: initializing timerState', {
        byQuestionId,
        totalTimeLimitSeconds,
        par,
        questions,
        mode,
      });
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

  const getQuestionTiming = useCallback((questionId: string) => timerState.byQuestionId[questionId] ?? null, [timerState]);

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
