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

/**
 * Compute timeUsedSeconds for a question from wall-clock timestamps.
 */
function computeQuestionTimeUsed(
  q: PerQuestionTiming,
  totalPausedMs: number,
  nowSec: number
): number {
  if (q.startedAt === null) return q.timeUsedSeconds;
  const pausedAtPresentationSec = q.pausedDurationMsAtPresentation / 1000;
  const effectivePauseSec = totalPausedMs / 1000 - pausedAtPresentationSec;
  return Math.max(
    q.timeUsedSeconds,
    q.timeUsedSeconds + Math.floor(nowSec - q.startedAt - effectivePauseSec)
  );
}

export function useQuestionTimer(
  mode: GenerationMode,
  totalTimeLimitSeconds: number,
  questions: Array<GeneratedQuestion | McQuestion>,
  activeQuestionIndex: number,
  sessionKey: 'written' | 'mc'
): UseQuestionTimerReturn {
  const zustandTimerState = useAppStore((s) =>
    sessionKey === 'written' ? s.writtenTimerState : s.mcTimerState
  );
  const setZustandTimerState = useAppStore((s) =>
    sessionKey === 'written' ? s.setWrittenTimerState : s.setMcTimerState
  );

  const [timerState, setTimerState] = useState<QuestionTimerState>(() => {
    if (zustandTimerState) {
      return fromPersisted(zustandTimerState);
    }
    return buildFreshState(mode, totalTimeLimitSeconds, questions);
  });

  const pauseStartedAtRef = useRef<number | null>(null);
  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const timerStateRef = useRef(timerState);
  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  const activeIndexRef = useRef(activeQuestionIndex);
  useEffect(() => {
    activeIndexRef.current = activeQuestionIndex;
  }, [activeQuestionIndex]);

  const startTimingJustSynced = useRef(false);

  const syncToZustand = useCallback(
    (s: QuestionTimerState) => {
      setZustandTimerState(toPersisted(s));
    },
    [setZustandTimerState]
  );

  const ZUSTAND_SYNC_INTERVAL_MS = 5000;
  useEffect(() => {
    if (
      timerState.sessionStartedAt === null ||
      timerState.sessionFinishedAt !== null ||
      timerState.isPaused
    )
      return;
    const id = setInterval(() => {
      syncToZustand(timerStateRef.current);
    }, ZUSTAND_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    timerState.isPaused,
    syncToZustand,
  ]);

  const getEffectivePausedMs = useCallback((s: QuestionTimerState): number => {
    const inProgressPause =
      s.isPaused && pauseStartedAtRef.current
        ? Date.now() - pauseStartedAtRef.current
        : 0;
    return s.pausedDurationMs + inProgressPause;
  }, []);

  useEffect(() => {
    if (!zustandTimerState) return;
    if (zustandTimerState.sessionStartedAt === null) return;
    if (zustandTimerState.sessionFinishedAt !== null) return;

    const restored = fromPersisted(zustandTimerState);

    if (restored.isPaused) {
      pauseStartedAtRef.current = Date.now();
    }

    const nowMs = Date.now();
    const nowSec = nowMs / 1000;
    const totalPausedMs = restored.pausedDurationMs;
    const updatedByQuestionId = { ...restored.byQuestionId };

    for (const [qId, q] of Object.entries(updatedByQuestionId)) {
      if (q.startedAt !== null && q.answeredAt === null && !q.isExpired) {
        const timeUsed = Math.min(
          computeQuestionTimeUsed(q, totalPausedMs, nowSec),
          q.timeLimitSeconds
        );
        const isExpired = timeUsed >= q.timeLimitSeconds;

        updatedByQuestionId[qId] = {
          ...q,
          timeUsedSeconds: timeUsed,
          isExpired,
          startedAt: isExpired ? q.startedAt : nowSec,
          pausedDurationMsAtPresentation: isExpired
            ? q.pausedDurationMsAtPresentation
            : totalPausedMs,
        };
      }
    }

    const finalState = { ...restored, byQuestionId: updatedByQuestionId };
    setTimerState(finalState);
  }, []);

  const prevZustandRef = useRef(zustandTimerState);
  useEffect(() => {
    if (zustandTimerState === null && prevZustandRef.current !== null) {
      const fresh = buildFreshState(mode, totalTimeLimitSeconds, questions);
      setTimerState(fresh);
      pauseStartedAtRef.current = null;
    } else if (zustandTimerState !== null && prevZustandRef.current === null) {
      if (startTimingJustSynced.current) {
        startTimingJustSynced.current = false;
      } else {
        if (
          zustandTimerState.sessionStartedAt !== null &&
          zustandTimerState.sessionFinishedAt === null
        ) {
          const restored = fromPersisted(zustandTimerState);
          if (restored.isPaused) {
            pauseStartedAtRef.current = Date.now();
          }
          const nowSec = Date.now() / 1000;
          const totalPausedMs = restored.pausedDurationMs;
          const updatedByQuestionId = { ...restored.byQuestionId };

          for (const [qId, q] of Object.entries(updatedByQuestionId)) {
            if (q.startedAt !== null && q.answeredAt === null && !q.isExpired) {
              const timeUsed = Math.min(
                computeQuestionTimeUsed(q, totalPausedMs, nowSec),
                q.timeLimitSeconds
              );
              const isExpired = timeUsed >= q.timeLimitSeconds;
              updatedByQuestionId[qId] = {
                ...q,
                timeUsedSeconds: timeUsed,
                isExpired,
                startedAt: isExpired ? q.startedAt : nowSec,
                pausedDurationMsAtPresentation: isExpired
                  ? q.pausedDurationMsAtPresentation
                  : totalPausedMs,
              };
            }
          }
          setTimerState({ ...restored, byQuestionId: updatedByQuestionId });
        }
      }
    }
    prevZustandRef.current = zustandTimerState;
  }, [zustandTimerState, mode, totalTimeLimitSeconds, questions]);

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

        const nowSec = Date.now() / 1000;
        const totalPausedMs = getEffectivePausedMs(s);
        const timeUsed = Math.min(
          computeQuestionTimeUsed(q, totalPausedMs, nowSec),
          q.timeLimitSeconds
        );
        const isExpired = timeUsed >= q.timeLimitSeconds;

        if (q.timeUsedSeconds === timeUsed && q.isExpired === isExpired)
          return s;

        return {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [currentQ.id]: { ...q, timeUsedSeconds: timeUsed, isExpired },
          },
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    getEffectivePausedMs,
  ]);

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

  const currentQ = questions[activeQuestionIndex];
  const qTiming = currentQ ? timerState.byQuestionId[currentQ.id] : null;
  const currentQuestionTimeUsed = qTiming?.timeUsedSeconds ?? 0;
  const currentQuestionTimeLimit = qTiming?.timeLimitSeconds ?? 0;
  const currentQuestionRemaining = Math.max(
    0,
    currentQuestionTimeLimit - currentQuestionTimeUsed
  );

  // FIX: Display elapsed time (count-up) so the question timer starts at 00:00
  const formattedQuestionTime = formatTime(currentQuestionTimeUsed);

  const parTimeSeconds = timerState.parTimeSeconds;
  const bankedSeconds = timerState.bankedSeconds;
  const formattedBank = formatTime(Math.abs(bankedSeconds));
  const bankStatus =
    bankedSeconds > 0 ? 'ahead' : bankedSeconds < 0 ? 'behind' : 'on-pace';
  const shouldAutoAdvance = false;

  const effectivePausedMs = getEffectivePausedMs(timerState);
  const sessionElapsedSeconds =
    timerState.sessionStartedAt === null
      ? 0
      : Math.max(
          0,
          Math.floor(
            (timerState.sessionFinishedAt ?? Date.now() / 1000) -
              timerState.sessionStartedAt -
              effectivePausedMs / 1000
          )
        );
  const sessionRemainingSeconds = Math.max(
    0,
    timerState.totalTimeLimitSeconds - sessionElapsedSeconds
  );
  const formattedSessionTime = formatTime(
    mode === 'exam' ? sessionRemainingSeconds : sessionElapsedSeconds
  );
  const isPaused = timerState.isPaused;

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
        const firstQ = qs[0];
        if (firstQ) {
          byQuestionId[firstQ.id] = {
            ...byQuestionId[firstQ.id],
            startedAt: nowSec,
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
        startTimingJustSynced.current = true;
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
        if (!q) return s;
        const currentPausedMs = getEffectivePausedMs(s);

        if (q.startedAt === null) {
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
        }

        if (q.answeredAt !== null || q.isExpired) return s;

        const timeUsedBeforeLeaving = Math.min(
          computeQuestionTimeUsed(q, currentPausedMs, nowSec),
          q.timeLimitSeconds
        );

        const next = {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [questionId]: {
              ...q,
              timeUsedSeconds: timeUsedBeforeLeaving,
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
          const nowSec = Date.now() / 1000;
          const totalPausedMs = getEffectivePausedMs(s);
          timeUsedSeconds = Math.min(
            computeQuestionTimeUsed(q, totalPausedMs, nowSec),
            q.timeLimitSeconds
          );
        }
        const finishedEarly = timeUsedSeconds < q.timeLimitSeconds;
        const bankDelta = q.timeLimitSeconds - timeUsedSeconds;
        const next = {
          ...s,
          bankedSeconds: s.bankedSeconds + bankDelta,
          byQuestionId: {
            ...s.byQuestionId,
            [questionId]: {
              ...q,
              answeredAt: Date.now() / 1000,
              finishedEarly,
              timeUsedSeconds,
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
        const qs = questionsRef.current;
        const newQ = qs[newIndex];
        const next = { ...s, activeQuestionIndex: newIndex };

        if (newQ) {
          const q = s.byQuestionId[newQ.id];
          if (
            q &&
            q.startedAt !== null &&
            q.answeredAt === null &&
            !q.isExpired
          ) {
            const nowSec = Date.now() / 1000;
            const currentPausedMs = getEffectivePausedMs(s);
            const timeUsedSoFar = Math.min(
              computeQuestionTimeUsed(q, currentPausedMs, nowSec),
              q.timeLimitSeconds
            );
            next.byQuestionId = {
              ...s.byQuestionId,
              [newQ.id]: {
                ...q,
                timeUsedSeconds: timeUsedSoFar,
                startedAt: nowSec,
                pausedDurationMsAtPresentation: currentPausedMs,
              },
            };
          }
        }

        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand, getEffectivePausedMs]
  );

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
