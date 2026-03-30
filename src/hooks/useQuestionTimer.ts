import { useEffect, useState, useCallback, useRef } from 'react';
import {
  PerQuestionTiming,
  QuestionTimerState,
  PersistedTimerState,
  GenerationMode,
  GeneratedQuestion,
  McQuestion,
} from '@/types';
import { useAppStore } from '@/store';

// Utility: format seconds as mm:ss
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
  bankStatus: 'ahead' | 'behind' | 'on-pace';

  shouldAutoAdvance: boolean;

  startTiming: (questions: GeneratedQuestion[] | McQuestion[]) => void;
  onQuestionPresented: (questionId: string) => void;
  onQuestionAnswered: (questionId: string) => void;
  onQuestionIndexChanged: (newIndex: number) => void;
  finishSession: () => void;
  reset: () => void;

  getQuestionTiming: (questionId: string) => PerQuestionTiming | null;
  removeQuestion: (questionId: string) => void;
}

/** Convert a PersistedTimerState to QuestionTimerState */
function fromPersisted(p: PersistedTimerState): QuestionTimerState {
  return {
    byQuestionId: p.byQuestionId,
    totalTimeLimitSeconds: p.totalTimeLimitSeconds,
    sessionStartedAt: p.sessionStartedAt,
    sessionFinishedAt: p.sessionFinishedAt,
    bankedSeconds: p.bankedSeconds,
    parTimeSeconds: p.parTimeSeconds,
    isPaused: p.isPaused,
    pausedDurationMs: p.pausedDurationMs,
    activeQuestionIndex: p.activeQuestionIndex,
    mode: p.mode,
  };
}

/** Convert QuestionTimerState to PersistedTimerState for serialization */
function toPersisted(s: QuestionTimerState): PersistedTimerState {
  return {
    byQuestionId: s.byQuestionId,
    totalTimeLimitSeconds: s.totalTimeLimitSeconds,
    sessionStartedAt: s.sessionStartedAt,
    sessionFinishedAt: s.sessionFinishedAt,
    bankedSeconds: s.bankedSeconds,
    parTimeSeconds: s.parTimeSeconds,
    isPaused: s.isPaused,
    pausedDurationMs: s.pausedDurationMs,
    activeQuestionIndex: s.activeQuestionIndex,
    mode: s.mode,
  };
}

/** Build a fresh QuestionTimerState from scratch */
function buildFreshState(
  mode: GenerationMode,
  totalTimeLimitSeconds: number,
  questions: Array<GeneratedQuestion | McQuestion>
): QuestionTimerState {
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
      pausedDurationMsAtPresentation: 0,
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
}

export function useQuestionTimer(
  mode: GenerationMode,
  totalTimeLimitSeconds: number,
  questions: Array<GeneratedQuestion | McQuestion>,
  activeQuestionIndex: number,
  /** "written" or "mc" — determines which Zustand slice to read/write */
  sessionKey: 'written' | 'mc'
): UseQuestionTimerReturn {
  // --- Zustand selectors ---
  const zustandTimerState = useAppStore((s) =>
    sessionKey === 'written' ? s.writtenTimerState : s.mcTimerState
  );
  const setZustandTimerState = useAppStore((s) =>
    sessionKey === 'written' ? s.setWrittenTimerState : s.setMcTimerState
  );

  // --- Local state, initialized from Zustand ---
  const [timerState, setTimerState] = useState<QuestionTimerState>(() => {
    if (zustandTimerState) {
      return fromPersisted(zustandTimerState);
    }
    return buildFreshState(mode, totalTimeLimitSeconds, questions);
  });

  // Track pause start time (ms epoch) for accurate pausedDurationMs accumulation
  const pauseStartedAtRef = useRef<number | null>(null);

  // Stable ref for questions to avoid recreating the interval on question changes
  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // Stable ref for timerState so getQuestionTiming doesn't depend on timerState
  const timerStateRef = useRef(timerState);
  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  // Stable ref for activeQuestionIndex so the interval always ticks the correct question
  const activeIndexRef = useRef(activeQuestionIndex);
  useEffect(() => {
    activeIndexRef.current = activeQuestionIndex;
  }, [activeQuestionIndex]);

  // --- Sync local state → Zustand on every change ---
  const syncToZustand = useCallback(
    (s: QuestionTimerState) => {
      setZustandTimerState(toPersisted(s));
    },
    [setZustandTimerState]
  );

  // Helper: compute total effective paused ms, including any in-progress pause
  const getEffectivePausedMs = useCallback((s: QuestionTimerState): number => {
    const inProgressPause =
      s.isPaused && pauseStartedAtRef.current
        ? Date.now() - pauseStartedAtRef.current
        : 0;
    return s.pausedDurationMs + inProgressPause;
  }, []);

  // --- Resume from persisted state on mount ---
  useEffect(() => {
    if (!zustandTimerState) return;
    if (zustandTimerState.sessionStartedAt === null) return;
    if (zustandTimerState.sessionFinishedAt !== null) return;

    // Session was in progress — resume it
    const restored = fromPersisted(zustandTimerState);

    // If the app was closed while paused, keep it paused and let the user resume
    if (restored.isPaused) {
      pauseStartedAtRef.current = Date.now();
    }

    // Recalculate per-question timeUsedSeconds from wall-clock timestamps.
    // Use the persisted pausedDurationMsAtPresentation from each PerQuestionTiming
    // (which was correctly stored when the question was presented).
    const nowSec = Date.now() / 1000;
    const totalPausedSec = restored.pausedDurationMs / 1000;
    const updatedByQuestionId = { ...restored.byQuestionId };
    for (const [qId, q] of Object.entries(updatedByQuestionId)) {
      if (q.startedAt !== null && q.answeredAt === null && !q.isExpired) {
        const pausedAtPresentationSec = q.pausedDurationMsAtPresentation / 1000;
        const effectivePauseSec = totalPausedSec - pausedAtPresentationSec;
        const timeUsed = Math.max(
          0,
          Math.floor(nowSec - q.startedAt - effectivePauseSec)
        );
        const isExpired = timeUsed >= q.timeLimitSeconds;
        updatedByQuestionId[qId] = {
          ...q,
          timeUsedSeconds: Math.min(timeUsed, q.timeLimitSeconds),
          isExpired,
        };
      }
    }

    const finalState = { ...restored, byQuestionId: updatedByQuestionId };
    setTimerState(finalState);
    // Only run on mount when we have a persisted state to restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Detect external Zustand reset or post-hydration restore ---
  const prevZustandRef = useRef(zustandTimerState);
  useEffect(() => {
    if (zustandTimerState === null && prevZustandRef.current !== null) {
      // External reset — build fresh state
      const fresh = buildFreshState(mode, totalTimeLimitSeconds, questions);
      setTimerState(fresh);
      pauseStartedAtRef.current = null;
    } else if (zustandTimerState !== null && prevZustandRef.current === null) {
      // Hydration loaded an active timer after mount — restore it
      if (
        zustandTimerState.sessionStartedAt !== null &&
        zustandTimerState.sessionFinishedAt === null
      ) {
        const restored = fromPersisted(zustandTimerState);
        if (restored.isPaused) {
          pauseStartedAtRef.current = Date.now();
        }
        const nowSec = Date.now() / 1000;
        const totalPausedSec = restored.pausedDurationMs / 1000;
        const updatedByQuestionId = { ...restored.byQuestionId };
        for (const [qId, q] of Object.entries(updatedByQuestionId)) {
          if (q.startedAt !== null && q.answeredAt === null && !q.isExpired) {
            const pausedAtPresentationSec =
              q.pausedDurationMsAtPresentation / 1000;
            const effectivePauseSec = totalPausedSec - pausedAtPresentationSec;
            const timeUsed = Math.max(
              0,
              Math.floor(nowSec - q.startedAt - effectivePauseSec)
            );
            const isExpired = timeUsed >= q.timeLimitSeconds;
            updatedByQuestionId[qId] = {
              ...q,
              timeUsedSeconds: Math.min(timeUsed, q.timeLimitSeconds),
              isExpired,
            };
          }
        }
        setTimerState({ ...restored, byQuestionId: updatedByQuestionId });
      }
    }
    prevZustandRef.current = zustandTimerState;
  }, [zustandTimerState, mode, totalTimeLimitSeconds, questions]);

  // --- Timer tick logic ---
  useEffect(() => {
    if (
      timerState.sessionStartedAt === null ||
      timerState.sessionFinishedAt !== null
    )
      return;
    const interval = setInterval(() => {
      setTimerState((s) => {
        if (s.isPaused) return s;
        const qs = questionsRef.current;
        const currentQ = qs[activeIndexRef.current];
        if (!currentQ) return s;
        const q = s.byQuestionId[currentQ.id];
        if (!q || q.startedAt === null || q.isExpired || q.answeredAt !== null)
          return s;

        // Use pausedDurationMsAtPresentation from the PerQuestionTiming record
        // for consistent per-question pause accounting
        const totalPausedSec = getEffectivePausedMs(s) / 1000;
        const pausedAtPresentationSec = q.pausedDurationMsAtPresentation / 1000;
        const effectivePauseSec = totalPausedSec - pausedAtPresentationSec;
        const nowSec = Date.now() / 1000;
        const timeUsed = Math.max(
          0,
          Math.floor(nowSec - q.startedAt - effectivePauseSec)
        );
        const isExpired = timeUsed >= q.timeLimitSeconds;
        const newTimeUsed = Math.min(timeUsed, q.timeLimitSeconds);

        // Only update if the value actually changed
        if (q.timeUsedSeconds === newTimeUsed && q.isExpired === isExpired)
          return s;

        const byQuestionId = {
          ...s.byQuestionId,
          [currentQ.id]: {
            ...q,
            timeUsedSeconds: newTimeUsed,
            isExpired,
          },
        };
        const next = { ...s, byQuestionId };
        syncToZustand(next);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    syncToZustand,
    getEffectivePausedMs,
  ]);

  // --- Visibility change: auto-pause when app is backgrounded ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTimerState((s) => {
          if (
            s.sessionStartedAt === null ||
            s.sessionFinishedAt !== null ||
            s.isPaused
          )
            return s;
          pauseStartedAtRef.current = Date.now();
          const next = { ...s, isPaused: true };
          syncToZustand(next);
          return next;
        });
      } else {
        setTimerState((s) => {
          if (!s.isPaused || s.sessionStartedAt === null) return s;
          const additionalPause = pauseStartedAtRef.current
            ? Date.now() - pauseStartedAtRef.current
            : 0;
          pauseStartedAtRef.current = null;
          const next = {
            ...s,
            isPaused: false,
            pausedDurationMs: s.pausedDurationMs + additionalPause,
          };
          syncToZustand(next);
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncToZustand]);

  // --- Derived values ---
  const currentQ = questions[activeQuestionIndex];
  const qTiming = currentQ ? timerState.byQuestionId[currentQ.id] : null;
  const currentQuestionTimeUsed = qTiming?.timeUsedSeconds ?? 0;
  const currentQuestionTimeLimit = qTiming?.timeLimitSeconds ?? 0;
  const currentQuestionRemaining = Math.max(
    0,
    currentQuestionTimeLimit - currentQuestionTimeUsed
  );
  const formattedQuestionTime = formatTime(
    mode === 'exam' ? currentQuestionRemaining : currentQuestionTimeUsed
  );
  const parTimeSeconds = timerState.parTimeSeconds;
  const bankedSeconds = timerState.bankedSeconds;
  const formattedBank = formatTime(Math.abs(bankedSeconds));
  const bankStatus =
    bankedSeconds > 0 ? 'ahead' : bankedSeconds < 0 ? 'behind' : 'on-pace';
  const shouldAutoAdvance = false; // Never auto-advance in exam mode — questions are guides only

  // Session elapsed time accounts for pauses via pausedDurationMs + current active pause
  const effectivePausedMs = getEffectivePausedMs(timerState);
  const sessionElapsedSeconds =
    timerState.sessionStartedAt === null
      ? 0
      : Math.floor(
          (timerState.sessionFinishedAt ?? Date.now() / 1000) -
            timerState.sessionStartedAt -
            effectivePausedMs / 1000
        );
  const sessionRemainingSeconds = Math.max(
    0,
    timerState.totalTimeLimitSeconds - sessionElapsedSeconds
  );
  const formattedSessionTime = formatTime(
    mode === 'exam' ? sessionRemainingSeconds : sessionElapsedSeconds
  );
  const isPaused = timerState.isPaused;

  // --- Actions ---
  const togglePause = useCallback(() => {
    setTimerState((s) => {
      if (!s.sessionStartedAt) return s;
      const willPause = !s.isPaused;
      if (willPause) {
        pauseStartedAtRef.current = Date.now();
        const next = { ...s, isPaused: true };
        syncToZustand(next);
        return next;
      }
      const additionalPause = pauseStartedAtRef.current
        ? Date.now() - pauseStartedAtRef.current
        : 0;
      pauseStartedAtRef.current = null;
      const next = {
        ...s,
        isPaused: false,
        pausedDurationMs: s.pausedDurationMs + additionalPause,
      };
      syncToZustand(next);
      return next;
    });
  }, [syncToZustand]);

  const setPaused = useCallback(
    (paused: boolean) => {
      setTimerState((s) => {
        if (!s.sessionStartedAt || s.isPaused === paused) return s;
        if (paused) {
          pauseStartedAtRef.current = Date.now();
          const next = { ...s, isPaused: true };
          syncToZustand(next);
          return next;
        }
        const additionalPause = pauseStartedAtRef.current
          ? Date.now() - pauseStartedAtRef.current
          : 0;
        pauseStartedAtRef.current = null;
        const next = {
          ...s,
          isPaused: false,
          pausedDurationMs: s.pausedDurationMs + additionalPause,
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
  );

  const startTiming = useCallback(
    (qs: GeneratedQuestion[] | McQuestion[]) => {
      setTimerState((s) => {
        if (s.sessionStartedAt) return s;
        const nowSec = Date.now() / 1000;
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
            pausedDurationMsAtPresentation: 0,
          };
        }
        pauseStartedAtRef.current = null;
        const next = {
          ...s,
          byQuestionId,
          totalTimeLimitSeconds,
          sessionStartedAt: nowSec,
          sessionFinishedAt: null,
          isPaused: false,
          pausedDurationMs: 0,
          activeQuestionIndex: 0,
          mode,
        };
        syncToZustand(next);
        return next;
      });
    },
    [totalTimeLimitSeconds, mode, syncToZustand]
  );

  const onQuestionPresented = useCallback(
    (questionId: string) => {
      setTimerState((s) => {
        const nowSec = Date.now() / 1000;
        const q = s.byQuestionId[questionId];
        if (!q || q.startedAt !== null) return s;
        // Snapshot the current global pausedMs for per-question pause accounting.
        // Store it in both the ref (for immediate reads) and the PerQuestionTiming
        // record (for persistence).
        const currentPausedMs = getEffectivePausedMs(s);
        const next = {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [questionId]: {
              ...q,
              startedAt: nowSec,
              pausedDurationMsAtPresentation: currentPausedMs,
            },
          },
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand, getEffectivePausedMs]
  );

  const onQuestionAnswered = useCallback(
    (questionId: string) => {
      setTimerState((s) => {
        const q = s.byQuestionId[questionId];
        if (!q || q.answeredAt !== null) return s;
        let timeUsedSeconds = q.timeUsedSeconds;
        if (q.startedAt !== null) {
          // Compute time using the same formula as the tick interval
          const nowSec = Date.now() / 1000;
          const totalPausedSec = getEffectivePausedMs(s) / 1000;
          const pausedAtPresentationSec =
            q.pausedDurationMsAtPresentation / 1000;
          const effectivePauseSec = totalPausedSec - pausedAtPresentationSec;
          timeUsedSeconds = Math.max(
            0,
            Math.floor(nowSec - q.startedAt - effectivePauseSec)
          );
        }
        const finishedEarly = timeUsedSeconds < q.timeLimitSeconds;
        const cappedTimeUsed = Math.min(timeUsedSeconds, q.timeLimitSeconds);
        const bankDelta = q.timeLimitSeconds - cappedTimeUsed;
        const next = {
          ...s,
          bankedSeconds: s.bankedSeconds + bankDelta,
          byQuestionId: {
            ...s.byQuestionId,
            [questionId]: {
              ...q,
              answeredAt: Date.now() / 1000,
              finishedEarly,
              timeUsedSeconds: cappedTimeUsed,
            },
          },
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand, getEffectivePausedMs]
  );

  const onQuestionIndexChanged = useCallback(
    (newIndex: number) => {
      setTimerState((s) => {
        const next = { ...s, activeQuestionIndex: newIndex };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
  );

  // Auto-present the current question when the index changes or session starts
  useEffect(() => {
    if (
      timerState.sessionStartedAt === null ||
      timerState.sessionFinishedAt !== null
    )
      return;
    const q = questions[activeQuestionIndex];
    if (!q) return;
    const timing = timerState.byQuestionId[q.id];
    if (timing && timing.startedAt === null) {
      onQuestionPresented(q.id);
    }
  }, [
    activeQuestionIndex,
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    questions,
  ]);

  const finishSession = useCallback(() => {
    setTimerState((s) => {
      const next = { ...s, sessionFinishedAt: Date.now() / 1000 };
      syncToZustand(next);
      return next;
    });
  }, [syncToZustand]);

  const reset = useCallback(() => {
    pauseStartedAtRef.current = null;
    setTimerState(() => {
      const next = buildFreshState(mode, totalTimeLimitSeconds, questions);
      syncToZustand(next);
      return next;
    });
  }, [totalTimeLimitSeconds, questions, mode, syncToZustand]);

  // Stable callback: reads from ref so it doesn't need timerState as a dep
  const getQuestionTiming = useCallback(
    (questionId: string) =>
      timerStateRef.current.byQuestionId[questionId] ?? null,
    []
  );

  const removeQuestion = useCallback(
    (questionId: string) => {
      setTimerState((s) => {
        const q = s.byQuestionId[questionId];
        if (!q) return s;

        // Return the question's unspent time to the bank
        const { [questionId]: _, ...rest } = s.byQuestionId;
        const unspentSeconds = q.timeLimitSeconds - q.timeUsedSeconds;
        const next = {
          ...s,
          byQuestionId: rest,
          bankedSeconds: s.bankedSeconds + unspentSeconds,
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
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
    shouldAutoAdvance,
    startTiming,
    onQuestionPresented,
    onQuestionAnswered,
    onQuestionIndexChanged,
    finishSession,
    reset,
    getQuestionTiming,
    removeQuestion,
  };
}
