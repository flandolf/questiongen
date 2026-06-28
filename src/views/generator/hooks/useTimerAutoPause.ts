import { useEffect, useRef } from 'react';

import type { useTimer } from '@/hooks/useTimer';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape of the timer controller we depend on (subset of the useTimer API). */
export type TimerController = Pick<
  ReturnType<typeof useTimer>,
  'isPaused' | 'togglePause'
>;

/**
 * Auto-pause both written and MC session timers while a marking request is
 * in flight, and resume them once marking completes. Used by GeneratorView
 * to prevent the per-question timer from inflating during waits on the
 * upstream LLM/service.
 *
 * Behaviour matches the inline `useEffect` previously inlined in
 * GeneratorView:
 *   1. On entering `isMarking`, capture whether each timer was already
 *      running. Pause any timer that was running.
 *   2. On exiting `isMarking`, only resume timers that were running BEFORE
 *      marking started (so a timer the user paused manually stays paused).
 *   3. The hook is idempotent on transition edges — it only toggles if
 *      `isMarking`'s previous value differs (`wasMarkingRef`).
 */
export function useTimerAutoPause(
  isMarking: boolean,
  writtenTimer: TimerController,
  mcTimer: TimerController,
): void {
  const wasMarkingRef = useRef(false);
  const autoPausedTimersRef = useRef({ written: false, mc: false });

  useEffect(() => {
    if (isMarking && !wasMarkingRef.current) {
      autoPausedTimersRef.current = {
        written: !writtenTimer.isPaused,
        mc: !mcTimer.isPaused,
      };
      if (autoPausedTimersRef.current.written) {
        writtenTimer.togglePause();
      }
      if (autoPausedTimersRef.current.mc) {
        mcTimer.togglePause();
      }
    } else if (!isMarking && wasMarkingRef.current) {
      if (autoPausedTimersRef.current.written && writtenTimer.isPaused) {
        writtenTimer.togglePause();
      }
      if (autoPausedTimersRef.current.mc && mcTimer.isPaused) {
        mcTimer.togglePause();
      }
      autoPausedTimersRef.current = { written: false, mc: false };
    }
    wasMarkingRef.current = isMarking;
    // Deps intentionally use the primitive `isPaused` field and the
    // stable `togglePause` callback rather than the full `writtenTimer`
    // / `mcTimer` objects. `useTimer` returns a fresh wrapper object on
    // every render but `togglePause` is memoised with useCallback; using
    // the full timer object would force this effect to re-fire on every
    // parent render, which matches neither the original (pre-extraction)
    // behaviour nor the cost profile we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMarking,
    writtenTimer.isPaused,
    writtenTimer.togglePause,
    mcTimer.isPaused,
    mcTimer.togglePause,
  ]);
}
