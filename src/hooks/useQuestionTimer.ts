import { useEffect, useState, useCallback, useRef } from 'react';
import {
  PerQuestionTiming,
  QuestionTimerState,
  PersistedTimerState,
  GeneratedQuestion,
  McQuestion,
} from '@/types';
import { useAppStore } from '@/store';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
  const total = Math.floor(Math.max(0, seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds elapsed on a question, accounting for pauses. */
function computeQuestionTimeUsed(
  q: PerQuestionTiming,
  totalPausedMs: number,
  nowSec: number
): number {
  if (q.startedAt === null) return q.timeUsedSeconds;
  const effectivePauseSec =
    (totalPausedMs - q.pausedDurationMsAtPresentation) / 1000;
  return Math.max(
    q.timeUsedSeconds,
    q.timeUsedSeconds + (nowSec - q.startedAt - effectivePauseSec)
  );
}

/** Total paused duration including any in-progress pause. */
function getEffectivePausedMs(
  s: QuestionTimerState,
  pauseStartedAt: number | null
): number {
  const inProgress =
    s.isPaused && pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  return s.pausedDurationMs + inProgress;
}

// ---------------------------------------------------------------------------
// State builders
// ---------------------------------------------------------------------------

function buildFreshState(
  totalTimeLimitSeconds: number,
  questions: Array<GeneratedQuestion | McQuestion>
): QuestionTimerState {
  const byQuestionId: Record<string, PerQuestionTiming> = {};
  for (const q of questions) {
    byQuestionId[q.id] = {
      timeLimitSeconds: 0,
      originalTimeLimitSeconds: 0,
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
    isPaused: false,
    pausedDurationMs: 0,
    activeQuestionIndex: 0,
  };
}

/**
 * Re-anchors any in-flight question timings after a restore from persisted
 * state (e.g. page refresh). Questions that have expired are closed out;
 * the currently active question gets a fresh startedAt anchor.
 * pauseStartedAt should be set before calling this if the session was paused.
 */
function reconcileRestoredState(
  restored: QuestionTimerState,
  currentQuestionId: string | undefined,
  pauseStartedAt: number | null
): QuestionTimerState {
  const nowSec = Date.now() / 1000;
  const totalPausedMs = getEffectivePausedMs(restored, pauseStartedAt);
  const updatedById = { ...restored.byQuestionId };

  for (const [qId, q] of Object.entries(updatedById)) {
    if (q.startedAt === null || q.answeredAt !== null || q.isExpired) continue;

    const timeUsed = Math.min(
      computeQuestionTimeUsed(q, totalPausedMs, nowSec),
      q.timeLimitSeconds
    );
    const isExpired = timeUsed >= q.timeLimitSeconds;
    const isActive = qId === currentQuestionId;

    updatedById[qId] = {
      ...q,
      timeUsedSeconds: timeUsed,
      isExpired,
      // Re-anchor only the active question; preserve startedAt for others
      // so their elapsed time resumes correctly if the user navigates back
      startedAt: isActive && !isExpired ? nowSec : q.startedAt,
      pausedDurationMsAtPresentation:
        isActive && !isExpired ? totalPausedMs : q.pausedDurationMsAtPresentation,
    };
  }

  return { ...restored, byQuestionId: updatedById };
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseQuestionTimerReturn {
  sessionElapsedSeconds: number;
  formattedSessionTime: string;
  isPaused: boolean;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;

  currentQuestionTimeUsed: number;
  formattedQuestionTime: string;

  startTiming: (questions: GeneratedQuestion[] | McQuestion[]) => void;
  onQuestionPresented: (questionId: string) => void;
  onQuestionAnswered: (questionId: string) => void;
  onQuestionIndexChanged: (newIndex: number) => void;
  finishSession: () => void;
  reset: () => void;

  getQuestionTiming: (questionId: string) => PerQuestionTiming | null;
  removeQuestion: (questionId: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQuestionTimer(
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

  // Mutable refs — never trigger re-renders
  const pauseStartedAtRef = useRef<number | null>(null);
  const questionsRef = useRef(questions);
  const timerStateRef = useRef<QuestionTimerState>(null!);

  // Always in sync without needing an effect — avoids one-render stale window
  questionsRef.current = questions;

  // -------------------------------------------------------------------------
  // State initialisation — restore from Zustand if an active session exists
  // -------------------------------------------------------------------------
  const [timerState, setTimerState] = useState<QuestionTimerState>(() => {
    if (
      zustandTimerState?.sessionStartedAt &&
      !zustandTimerState.sessionFinishedAt
    ) {
      if (zustandTimerState.isPaused) pauseStartedAtRef.current = Date.now();
      const currentQId = questions[zustandTimerState.activeQuestionIndex]?.id;
      return reconcileRestoredState(
        zustandTimerState as QuestionTimerState,
        currentQId,
        pauseStartedAtRef.current
      );
    }
    return buildFreshState(totalTimeLimitSeconds, questions);
  });

  timerStateRef.current = timerState;

  // -------------------------------------------------------------------------
  // Zustand sync helpers
  // -------------------------------------------------------------------------
  const syncToZustand = useCallback(
    (s: QuestionTimerState) => setZustandTimerState(s as PersistedTimerState),
    [setZustandTimerState]
  );

  // Periodic sync while the session is running (avoids syncing every tick)
  useEffect(() => {
    if (
      !timerState.sessionStartedAt ||
      timerState.sessionFinishedAt ||
      timerState.isPaused
    )
      return;
    const id = setInterval(() => syncToZustand(timerStateRef.current), 5_000);
    return () => clearInterval(id);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    timerState.isPaused,
    syncToZustand,
  ]);

  // React to an external Zustand reset (another tab cleared the session)
  const prevZustandRef = useRef(zustandTimerState);
  useEffect(() => {
    const prev = prevZustandRef.current;
    prevZustandRef.current = zustandTimerState;

    if (!zustandTimerState && prev) {
      // Session was cleared externally — start fresh.
      // Uses questionsRef to avoid questions array reference instability
      // causing spurious re-runs of this effect.
      pauseStartedAtRef.current = null;
      setTimerState(
        buildFreshState(totalTimeLimitSeconds, questionsRef.current)
      );
    }
  }, [zustandTimerState, totalTimeLimitSeconds]);

  // -------------------------------------------------------------------------
  // Ticker — runs every second while session is active and not paused
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!timerState.sessionStartedAt || timerState.sessionFinishedAt) return;
    // Don't create an interval while paused — browsers throttle/kill intervals
    // on hidden tabs, so we always create a fresh one on unpause rather than
    // relying on a pre-existing (potentially degraded) interval.
    if (timerState.isPaused) return;

    const id = setInterval(() => {
      setTimerState((s) => {
        if (s.isPaused) return s;

        const currentQ = questionsRef.current[activeQuestionIndex];
        if (!currentQ) return s;

        const q = s.byQuestionId[currentQ.id];
        if (!q || q.startedAt === null || q.isExpired || q.answeredAt !== null)
          return s;

        const nowSec = Date.now() / 1000;
        const totalPausedMs = getEffectivePausedMs(
          s,
          pauseStartedAtRef.current
        );
        const timeUsed = computeQuestionTimeUsed(q, totalPausedMs, nowSec);

        return {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [currentQ.id]: {
              ...q,
              timeUsedSeconds: timeUsed,
              // Re-anchor so next tick's delta is always ~1s, not cumulative
              startedAt: nowSec,
              pausedDurationMsAtPresentation: totalPausedMs,
            },
          },
        };
      });
    }, 1_000);

    return () => clearInterval(id);
  }, [
    timerState.sessionStartedAt,
    timerState.sessionFinishedAt,
    timerState.isPaused,
    activeQuestionIndex,
  ]);

  // -------------------------------------------------------------------------
  // Visibility — pause when tab is hidden
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handle = () => {
      if (document.hidden) {
        pauseStartedAtRef.current = Date.now();
        setTimerState((s) => {
          if (!s.sessionStartedAt || s.sessionFinishedAt || s.isPaused)
            return s;
          const next = { ...s, isPaused: true };
          syncToZustand(next);
          return next;
        });
      } else {
        const additionalMs = pauseStartedAtRef.current
          ? Date.now() - pauseStartedAtRef.current
          : 0;
        pauseStartedAtRef.current = null;
        setTimerState((s) => {
          if (!s.isPaused || !s.sessionStartedAt) return s;
          const next = {
            ...s,
            isPaused: false,
            pausedDurationMs: s.pausedDurationMs + additionalMs,
          };
          syncToZustand(next);
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [syncToZustand]);

  // -------------------------------------------------------------------------
  // Pause helpers (shared logic)
  // -------------------------------------------------------------------------

  // Ref mutations are intentionally kept outside state updaters — React may
  // invoke updaters more than once (e.g. Strict Mode double-invocation).
  const togglePause = useCallback(() => {
    const willPause = !timerStateRef.current.isPaused;
    if (willPause) {
      pauseStartedAtRef.current = Date.now();
      setTimerState((s) => {
        if (!s.sessionStartedAt || s.isPaused) return s;
        const next = { ...s, isPaused: true };
        syncToZustand(next);
        return next;
      });
    } else {
      const additionalMs = pauseStartedAtRef.current
        ? Date.now() - pauseStartedAtRef.current
        : 0;
      pauseStartedAtRef.current = null;
      setTimerState((s) => {
        if (!s.sessionStartedAt || !s.isPaused) return s;
        const next = {
          ...s,
          isPaused: false,
          pausedDurationMs: s.pausedDurationMs + additionalMs,
        };
        syncToZustand(next);
        return next;
      });
    }
  }, [syncToZustand]);

  const setPaused = useCallback(
    (paused: boolean) => {
      if (paused) {
        pauseStartedAtRef.current = Date.now();
        setTimerState((s) => {
          if (!s.sessionStartedAt || s.isPaused) return s;
          const next = { ...s, isPaused: true };
          syncToZustand(next);
          return next;
        });
      } else {
        const additionalMs = pauseStartedAtRef.current
          ? Date.now() - pauseStartedAtRef.current
          : 0;
        pauseStartedAtRef.current = null;
        setTimerState((s) => {
          if (!s.sessionStartedAt || !s.isPaused) return s;
          const next = {
            ...s,
            isPaused: false,
            pausedDurationMs: s.pausedDurationMs + additionalMs,
          };
          syncToZustand(next);
          return next;
        });
      }
    },
    [syncToZustand]
  );

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------
  const startTiming = useCallback(
    (qs: GeneratedQuestion[] | McQuestion[]) => {
      setTimerState((s) => {
        // Allow restart if the previous session has finished
        if (s.sessionStartedAt && !s.sessionFinishedAt) return s;

        const nowSec = Date.now() / 1000;
        const byQuestionId: Record<string, PerQuestionTiming> = {};
        for (const q of qs) {
          byQuestionId[q.id] = {
            timeLimitSeconds: 0,
            originalTimeLimitSeconds: 0,
            startedAt: null,
            answeredAt: null,
            timeUsedSeconds: 0,
            isExpired: false,
            finishedEarly: false,
            pausedDurationMsAtPresentation: 0,
          };
        }
        // Immediately start timing the first question
        if (qs[0]) {
          byQuestionId[qs[0].id] = {
            ...byQuestionId[qs[0].id],
            startedAt: nowSec,
          };
        }

        pauseStartedAtRef.current = null;
        const next: QuestionTimerState = {
          ...s,
          byQuestionId,
          totalTimeLimitSeconds,
          sessionStartedAt: nowSec,
          sessionFinishedAt: null,
          isPaused: false,
          pausedDurationMs: 0,
          activeQuestionIndex: 0,
        };
        syncToZustand(next);
        return next;
      });
    },
    [totalTimeLimitSeconds, syncToZustand]
  );

  const finishSession = useCallback(() => {
    setTimerState((s) => {
      const nowSec = Date.now() / 1000;
      const totalPausedMs = getEffectivePausedMs(s, pauseStartedAtRef.current);
      const updatedById = { ...s.byQuestionId };

      // Freeze the current question's elapsed time
      const currentQ = questionsRef.current[s.activeQuestionIndex];
      if (currentQ) {
        const q = updatedById[currentQ.id];
        if (q && q.startedAt !== null && q.answeredAt === null && !q.isExpired) {
          updatedById[currentQ.id] = {
            ...q,
            timeUsedSeconds: computeQuestionTimeUsed(q, totalPausedMs, nowSec),
            startedAt: null,
            pausedDurationMsAtPresentation: 0,
          };
        }
      }

      const next = {
        ...s,
        byQuestionId: updatedById,
        sessionFinishedAt: nowSec,
      };
      syncToZustand(next);
      return next;
    });
  }, [syncToZustand]);

  const reset = useCallback(() => {
    pauseStartedAtRef.current = null;
    const next = buildFreshState(totalTimeLimitSeconds, questionsRef.current);
    setTimerState(next);
    syncToZustand(next);
  }, [totalTimeLimitSeconds, syncToZustand]);

  // -------------------------------------------------------------------------
  // Per-question events
  // -------------------------------------------------------------------------
  const onQuestionPresented = useCallback(
    (questionId: string) => {
      setTimerState((s) => {
        const q = s.byQuestionId[questionId];
        if (!q || q.answeredAt !== null || q.isExpired || q.startedAt !== null)
          return s;

        const nowSec = Date.now() / 1000;
        const currentPausedMs = getEffectivePausedMs(
          s,
          pauseStartedAtRef.current
        );
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
    [syncToZustand]
  );

  const onQuestionAnswered = useCallback(
    (questionId: string) => {
      setTimerState((s) => {
        const q = s.byQuestionId[questionId];
        if (!q || q.answeredAt !== null) return s;

        const nowSec = Date.now() / 1000;
        const totalPausedMs = getEffectivePausedMs(
          s,
          pauseStartedAtRef.current
        );
        const timeUsedSeconds =
          q.startedAt !== null
            ? computeQuestionTimeUsed(q, totalPausedMs, nowSec)
            : q.timeUsedSeconds;

        const next = {
          ...s,
          byQuestionId: {
            ...s.byQuestionId,
            [questionId]: {
              ...q,
              answeredAt: nowSec,
              finishedEarly: false,
              timeUsedSeconds,
              startedAt: null,
            },
          },
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
  );

  const onQuestionIndexChanged = useCallback(
    (newIndex: number) => {
      setTimerState((s) => {
        if (s.activeQuestionIndex === newIndex) return s;

        const qs = questionsRef.current;
        const nowSec = Date.now() / 1000;
        const currentPausedMs = getEffectivePausedMs(
          s,
          pauseStartedAtRef.current
        );
        const updatedById = { ...s.byQuestionId };

        // Freeze the outgoing question's elapsed time
        const oldQ = qs[s.activeQuestionIndex];
        if (oldQ && updatedById[oldQ.id]?.startedAt !== null) {
          const oldTiming = updatedById[oldQ.id];
          updatedById[oldQ.id] = {
            ...oldTiming,
            timeUsedSeconds: computeQuestionTimeUsed(oldTiming, currentPausedMs, nowSec),
            startedAt: null,
            pausedDurationMsAtPresentation: 0,
          };
        }

        // Start the incoming question
        const newQ = qs[newIndex];
        if (newQ) {
          const newTiming = updatedById[newQ.id];
          if (newTiming && !newTiming.answeredAt && !newTiming.isExpired) {
            updatedById[newQ.id] = {
              ...newTiming,
              startedAt: nowSec,
              pausedDurationMsAtPresentation: currentPausedMs,
            };
          }
        }

        const next = {
          ...s,
          activeQuestionIndex: newIndex,
          byQuestionId: updatedById,
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
  );

  // Drive index changes from the parent's activeQuestionIndex prop
  const prevIndexRef = useRef(activeQuestionIndex);
  useEffect(() => {
    if (prevIndexRef.current !== activeQuestionIndex) {
      prevIndexRef.current = activeQuestionIndex;
      onQuestionIndexChanged(activeQuestionIndex);
    }
  }, [activeQuestionIndex, onQuestionIndexChanged]);

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

        const next = {
          ...s,
          byQuestionId: rest,
        };
        syncToZustand(next);
        return next;
      });
    },
    [syncToZustand]
  );

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------
  const effectivePausedMs = getEffectivePausedMs(
    timerState,
    pauseStartedAtRef.current
  );

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
  const formattedSessionTime = formatTime(sessionElapsedSeconds);

  const qTiming = questions[activeQuestionIndex]
    ? timerState.byQuestionId[questions[activeQuestionIndex].id]
    : null;
  const currentQuestionTimeUsed = qTiming?.timeUsedSeconds ?? 0;

  return {
    sessionElapsedSeconds,
    formattedSessionTime,
    isPaused: timerState.isPaused,
    togglePause,
    setPaused,

    currentQuestionTimeUsed,
    formattedQuestionTime: formatTime(currentQuestionTimeUsed),

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
