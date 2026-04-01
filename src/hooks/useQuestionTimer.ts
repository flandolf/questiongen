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

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Format seconds as "m:ss" (e.g., "3:05") */
function formatTime(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
  const totalSeconds = Math.floor(Math.max(0, seconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Compute effective time used on a question, excluding paused time */
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
    q.timeUsedSeconds + (nowSec - q.startedAt - effectivePauseSec)
  );
}

/** Apply a pause/resume transition to a timer state snapshot */
function applyPauseToggle(
  s: QuestionTimerState,
  pauseStartedAt: number | null,
  forcePause?: boolean
): { next: QuestionTimerState; newPauseStart: number | null } {
  const willPause = forcePause ?? !s.isPaused;

  if (willPause) {
    return {
      next: { ...s, isPaused: true },
      newPauseStart: Date.now(),
    };
  }

  const additionalPause = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  return {
    next: {
      ...s,
      isPaused: false,
      pausedDurationMs: s.pausedDurationMs + additionalPause,
    },
    newPauseStart: null,
  };
}

// ─── State Builders ───────────────────────────────────────────────────────────

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

// ─── Public Interface ─────────────────────────────────────────────────────────

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

  /** Reserved for future auto-advance feature (currently always false) */
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

  // Refs for stable access inside callbacks / intervals
  const pauseStartedAtRef = useRef<number | null>(null);
  const questionsRef = useRef(questions);
  const timerStateRef = useRef(timerState);
  const activeIndexRef = useRef(activeQuestionIndex);
  const startTimingJustSynced = useRef(false);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  // Persist local state to Zustand (survives navigation / reload)
  const syncToZustand = useCallback(
    (s: QuestionTimerState) => {
      setZustandTimerState(toPersisted(s));
    },
    [setZustandTimerState]
  );

  // Periodic Zustand sync every 5 s while session is running
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

  /** Total pause ms including any in-progress pause */
  const getEffectivePausedMs = useCallback((s: QuestionTimerState): number => {
    const inProgressPause =
      s.isPaused && pauseStartedAtRef.current
        ? Date.now() - pauseStartedAtRef.current
        : 0;
    return s.pausedDurationMs + inProgressPause;
  }, []);

  /** Restore a persisted Zustand snapshot into local state */
  const restoreFromZustand = useCallback((restored: QuestionTimerState) => {
    if (restored.isPaused) {
      pauseStartedAtRef.current = Date.now();
    } else {
      pauseStartedAtRef.current = null;
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
        const isCurrentActive =
          questionsRef.current[activeIndexRef.current]?.id === qId;

        updatedByQuestionId[qId] = {
          ...q,
          timeUsedSeconds: timeUsed,
          isExpired,
          startedAt: !isExpired && isCurrentActive ? nowSec : null,
          pausedDurationMsAtPresentation:
            !isExpired && isCurrentActive ? totalPausedMs : 0,
        };
      }
    }

    return { ...restored, byQuestionId: updatedByQuestionId };
  }, []);

  // Restore from Zustand on mount if a running session exists
  useEffect(() => {
    if (!zustandTimerState) return;
    if (zustandTimerState.sessionStartedAt === null) return;
    if (zustandTimerState.sessionFinishedAt !== null) return;

    setTimerState(restoreFromZustand(fromPersisted(zustandTimerState)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Zustand appearing / disappearing during the component lifecycle
  const prevZustandRef = useRef(zustandTimerState);
  useEffect(() => {
    if (zustandTimerState === null && prevZustandRef.current !== null) {
      const fresh = buildFreshState(mode, totalTimeLimitSeconds, questions);
      setTimerState(fresh);
      pauseStartedAtRef.current = null;
    } else if (zustandTimerState !== null && prevZustandRef.current === null) {
      if (startTimingJustSynced.current) {
        startTimingJustSynced.current = false;
      } else if (
        zustandTimerState.sessionStartedAt !== null &&
        zustandTimerState.sessionFinishedAt === null
      ) {
        setTimerState(restoreFromZustand(fromPersisted(zustandTimerState)));
      }
    }
    prevZustandRef.current = zustandTimerState;
  }, [
    zustandTimerState,
    mode,
    totalTimeLimitSeconds,
    questions,
    restoreFromZustand,
  ]);

  // ─── Tick: update timeUsedSeconds every second ────────────────────────────

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

        return {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [currentQ.id]: {
              ...q,
              timeUsedSeconds: timeUsed,
              isExpired,
            },
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

  // ─── Visibility change: auto-pause on tab hide ────────────────────────────

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
          const { next, newPauseStart } = applyPauseToggle(
            s,
            pauseStartedAtRef.current,
            true
          );
          pauseStartedAtRef.current = newPauseStart;
          syncToZustand(next);
          return next;
        });
      } else {
        setTimerState((s) => {
          if (!s.isPaused || s.sessionStartedAt === null) return s;
          const { next, newPauseStart } = applyPauseToggle(
            s,
            pauseStartedAtRef.current,
            false
          );
          pauseStartedAtRef.current = newPauseStart;
          syncToZustand(next);
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncToZustand]);

  // ─── Question navigation ──────────────────────────────────────────────────

  const onQuestionIndexChanged = useCallback(
    (newIndex: number) => {
      setTimerState((s) => {
        if (s.activeQuestionIndex === newIndex) return s;

        const qs = questionsRef.current;
        const oldQ = qs[s.activeQuestionIndex];
        const newQ = qs[newIndex];
        const nowSec = Date.now() / 1000;
        const currentPausedMs = getEffectivePausedMs(s);

        const updatedByQuestionId = { ...s.byQuestionId };

        // Freeze the old question's elapsed time
        if (oldQ && updatedByQuestionId[oldQ.id]) {
          const oldTiming = updatedByQuestionId[oldQ.id];
          if (oldTiming.startedAt !== null) {
            const timeUsedSoFar = Math.min(
              computeQuestionTimeUsed(oldTiming, currentPausedMs, nowSec),
              oldTiming.timeLimitSeconds
            );
            updatedByQuestionId[oldQ.id] = {
              ...oldTiming,
              timeUsedSeconds: timeUsedSoFar,
              startedAt: null,
              pausedDurationMsAtPresentation: 0,
            };
          }
        }

        // Start the new question's clock
        if (newQ && updatedByQuestionId[newQ.id]) {
          const newTiming = updatedByQuestionId[newQ.id];
          if (newTiming.answeredAt === null && !newTiming.isExpired) {
            updatedByQuestionId[newQ.id] = {
              ...newTiming,
              startedAt: nowSec,
              pausedDurationMsAtPresentation: currentPausedMs,
            };
          }
        }

        const next = {
          ...s,
          activeQuestionIndex: newIndex,
          byQuestionId: updatedByQuestionId,
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand, getEffectivePausedMs]
  );

  useEffect(() => {
    if (activeIndexRef.current !== activeQuestionIndex) {
      activeIndexRef.current = activeQuestionIndex;
      onQuestionIndexChanged(activeQuestionIndex);
    }
  }, [activeQuestionIndex, onQuestionIndexChanged]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const currentQ = questions[activeQuestionIndex];
  const qTiming = currentQ ? timerState.byQuestionId[currentQ.id] : null;
  const currentQuestionTimeUsed = qTiming?.timeUsedSeconds ?? 0;
  const currentQuestionTimeLimit = qTiming?.timeLimitSeconds ?? 0;
  const currentQuestionRemaining = Math.max(
    0,
    currentQuestionTimeLimit - currentQuestionTimeUsed
  );

  const formattedQuestionTime = formatTime(currentQuestionTimeUsed);
  const parTimeSeconds = timerState.parTimeSeconds;
  const bankedSeconds = timerState.bankedSeconds;
  const formattedBank = formatTime(Math.abs(bankedSeconds));
  const bankStatus =
    bankedSeconds > 0 ? 'ahead' : bankedSeconds < 0 ? 'behind' : 'on-pace';
  const shouldAutoAdvance = false; // Reserved for future feature

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

  // ─── Actions ──────────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    setTimerState((s) => {
      if (!s.sessionStartedAt) return s;
      const { next, newPauseStart } = applyPauseToggle(
        s,
        pauseStartedAtRef.current
      );
      pauseStartedAtRef.current = newPauseStart;
      syncToZustand(next);
      return next;
    });
  }, [syncToZustand]);

  const setPaused = useCallback(
    (paused: boolean) => {
      setTimerState((s) => {
        if (!s.sessionStartedAt || s.isPaused === paused) return s;
        const { next, newPauseStart } = applyPauseToggle(
          s,
          pauseStartedAtRef.current,
          paused
        );
        pauseStartedAtRef.current = newPauseStart;
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
        if (!q || q.answeredAt !== null || q.isExpired || q.startedAt !== null)
          return s;
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
              startedAt: null,
            },
          },
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand, getEffectivePausedMs]
  );

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
