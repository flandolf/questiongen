import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestion, McQuestion } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PendingCancel =
  | { type: 'written'; question: GeneratedQuestion; index: number }
  | { type: 'mc'; question: McQuestion; index: number };

export type CancelType = PendingCancel['type'] | null;

function buildDefaultMessage(pending: PendingCancel): string {
  return `Remove question ${pending.index + 1} ("${pending.question.topic}")? It will be taken out of your current set.`;
}

export type GeneratorConfirmModals = {
  // ── Cancel-question modal state ──
  cancelOpen: boolean;
  cancelMessage: string | null;
  pendingCancelType: CancelType;
  /** Open the cancel-question modal for the active written question. */
  openWrittenCancel: (question: GeneratedQuestion, index: number) => void;
  /** Open the cancel-question modal for the active MC question. */
  openMcCancel: (question: McQuestion, index: number) => void;
  /** Close the cancel modal without confirming. */
  cancelCancel: () => void;
  /** Close the cancel modal, run the bound removal handler, and toast success. */
  confirmCancel: () => void;
  /**
   * Bind the actual removal callback that performs store mutations and history
   * cleanup. The latest handler is always reachable because the hook stores
   * it in a ref. Call this from a `useEffect` in the view so the handler
   * always sees the latest store setters.
   */
  bindRemoveHandler: (handler: (type: CancelType) => void) => void;

  // ── Generation-failure retry modal state ──
  failureOpen: boolean;
  /** Mark a generation/marking attempt as failed so the retry modal opens. */
  reportFailure: (reason: string) => void;
  /** Close the failure retry modal without retrying. */
  dismissFailure: () => void;
  /**
   * Close the failure retry modal and run the bound retry handler. Call
   * `bindFailureHandler` from the view to register what "retry" actually
   * does (e.g. re-invoke `handleGenerateQuestions`).
   */
  confirmFailure: () => Promise<void>;
  bindFailureHandler: (handler: () => void | Promise<void>) => void;

  // ── Escape hatches (kept for backward compat with original behaviour) ──
  /** Clear the failure state without removing (used by other handlers). */
  clearFailure: () => void;
};

/**
 * Manages the two mutually-exclusive confirmation modals that previously
 * lived inline in GeneratorView:
 *
 * 1. "Remove Question?" — opened from SessionHeader's delete action, for
 *    the active written question or the active MC question.
 * 2. "Generation Failed" retry — opened when a marking attempt surfaces
 *    an error, so the user can retry with the same parameters.
 *
 * Two modals never stack: opening the cancel modal implicitly clears the
 * failure reason, and opening the failure modal implicitly dismisses any
 * pending cancel state.
 *
 * The hook is presentational + state-management only. It does NOT mutate
 * the question list, timers, or store fields directly. Callers wire in
 * removal and retry callbacks via `bindRemoveHandler` / `bindFailureHandler`.
 */
export function useGeneratorConfirmModals(): GeneratorConfirmModals {
  // ── Cancel modal state ──
  const [pendingCancel, setPendingCancel] = useState<PendingCancel | null>(null);

  // ── Failure retry state ──
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // ── Bound handler refs ──
  // Mutable so the bound handler always invokes the latest closure; callers
  // set these via `bindRemoveHandler` / `bindFailureHandler`. Using a ref
  // (not state) avoids forcing re-renders when a parent hand-rolled closure
  // changes identity on every render.
  const removeHandlerRef = useRef<((type: CancelType) => void) | null>(null);
  const failureHandlerRef = useRef<(() => void | Promise<void>) | null>(null);

  // ── Cancel modal actions ──
  const openWrittenCancel = useCallback(
    (question: GeneratedQuestion, index: number) => {
      setFailureReason(null); // Mutex: dismiss failure state on cancel open.
      setPendingCancel({ type: 'written', question, index });
    },
    [],
  );

  const openMcCancel = useCallback(
    (question: McQuestion, index: number) => {
      setFailureReason(null);
      setPendingCancel({ type: 'mc', question, index });
    },
    [],
  );

  const cancelCancel = useCallback(() => {
    setPendingCancel(null);
  }, []);

  const confirmCancel = useCallback(() => {
    const type = pendingCancel?.type ?? null;
    setPendingCancel(null);
    const handler = removeHandlerRef.current;
    if (handler && type !== null) {
      handler(type);
    }
    toast.success('Question removed from set');
  }, [pendingCancel]);

  const bindRemoveHandler = useCallback(
    (handler: (type: CancelType) => void) => {
      removeHandlerRef.current = handler;
    },
    [],
  );

  // ── Failure modal actions ──
  const reportFailure = useCallback((reason: string) => {
    setPendingCancel(null); // Mutex: clear cancel state when failure is reported.
    setFailureReason(reason);
  }, []);

  const dismissFailure = useCallback(() => {
    setFailureReason(null);
  }, []);

  const confirmFailure = useCallback(async () => {
    setFailureReason(null);
    const handler = failureHandlerRef.current;
    if (handler) {
      await handler();
    }
  }, []);

  const bindFailureHandler = useCallback(
    (handler: () => void | Promise<void>) => {
      failureHandlerRef.current = handler;
    },
    [],
  );

  const clearFailure = useCallback(() => {
    setFailureReason(null);
  }, []);

  return {
    cancelOpen: pendingCancel !== null,
    cancelMessage: pendingCancel ? buildDefaultMessage(pendingCancel) : null,
    pendingCancelType: pendingCancel?.type ?? null,
    openWrittenCancel,
    openMcCancel,
    cancelCancel,
    confirmCancel,
    bindRemoveHandler,
    failureOpen: failureReason !== null && pendingCancel === null,
    reportFailure,
    dismissFailure,
    confirmFailure,
    bindFailureHandler,
    clearFailure,
  };
}
