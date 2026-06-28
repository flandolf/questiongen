import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CostQuality, LlmStreamEvent, ModelRoute } from '@/types/events';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LlmStreamStatus = 'active' | 'ended' | 'error';

export type LlmStreamState = {
  requestId: string;
  task: string;
  route: ModelRoute;
  topic?: string;
  questionId?: string;
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    costUsd?: number;
    costQuality: CostQuality;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
  status: LlmStreamStatus;
  startedAt: number;
  endedAt: number | null;
};

export type LlmStreamEventCallback = (event: LlmStreamEvent) => void;

export type LlmStreamCallbacks = {
  onStart?: LlmStreamEventCallback;
  onToken?: LlmStreamEventCallback;
  onUsage?: LlmStreamEventCallback;
  onEnd?: LlmStreamEventCallback;
  onError?: LlmStreamEventCallback;
};

export type UseLlmStreamEventsReturn = {
  /** Map of active and recently-ended streams keyed by requestId. */
  streams: Record<string, LlmStreamState>;
  /** Array of streams sorted by start time (most recent first). */
  streamList: LlmStreamState[];
  /** The most recently updated stream, or null if no streams yet. */
  latestStream: LlmStreamState | null;
  /** Sum of costUsd across all streams that have reported usage. */
  totalCostUsd: number;
  /** Manually clear a stream from state (e.g. after user dismisses it). */
  dismissStream: (requestId: string) => void;
  /** Clear all ended and errored streams. */
  pruneFinishedStreams: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createStreamState(event: Extract<LlmStreamEvent, { event: 'start' }>): LlmStreamState {
  return {
    requestId: event.requestId,
    task: event.task,
    route: event.route,
    topic: event.topic,
    questionId: event.questionId,
    text: '',
    usage: null,
    error: null,
    status: 'active',
    startedAt: Date.now(),
    endedAt: null,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the unified `llm-stream-*` events emitted by the Tauri backend.
 *
 * Maintains a reactive map of stream states keyed by `requestId`. Each stream
 * accumulates tokens, captures usage metadata, and tracks error/termination
 * state. Callers can render the map directly or supply optional per-event
 * callbacks for side effects (e.g. toasting on error, logging usage).
 *
 * Streams remain in the map after they end/error so UI can show final state;
 * call `dismissStream` or `pruneFinishedStreams` to remove them.
 */
export function useLlmStreamEvents(
  callbacks?: LlmStreamCallbacks,
): UseLlmStreamEventsReturn {
  const [streams, setStreams] = useState<Record<string, LlmStreamState>>({});
  const callbacksRef = useRef<LlmStreamCallbacks | undefined>(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Token text is buffered in a ref and flushed to React state on RAF so
  // high-frequency token events don't force a re-render for every chunk.
  const tokenBufferRef = useRef<Record<string, string>>({});
  const tokenFlushRafRef = useRef<number | null>(null);

  const flushBufferedTokens = useCallback(() => {
    tokenFlushRafRef.current = null;
    const buffered = tokenBufferRef.current;
    tokenBufferRef.current = {};

    setStreams((prev) => {
      let changed = false;
      const next: Record<string, LlmStreamState> = {};
      for (const [id, stream] of Object.entries(prev)) {
        const chunk = buffered[id];
        if (chunk) {
          changed = true;
          next[id] = { ...stream, text: stream.text + chunk };
        } else {
          next[id] = stream;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const applyEvent = useCallback((event: LlmStreamEvent) => {
    switch (event.event) {
      case 'start': {
        setStreams((prev) => ({
          ...prev,
          [event.requestId]: createStreamState(event),
        }));
        break;
      }
      case 'token': {
        tokenBufferRef.current[event.requestId] =
          (tokenBufferRef.current[event.requestId] || '') + event.text;
        if (tokenFlushRafRef.current === null) {
          tokenFlushRafRef.current = requestAnimationFrame(flushBufferedTokens);
        }
        break;
      }
      case 'usage': {
        setStreams((prev) => {
          const existing = prev[event.requestId];
          if (!existing) return prev;
          if (existing.status === 'error') return prev;
          return {
            ...prev,
            [event.requestId]: {
              ...existing,
              usage: {
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens,
                totalTokens: event.totalTokens,
                reasoningTokens: event.reasoningTokens,
                costUsd: event.costUsd,
                costQuality: event.costQuality,
              },
            },
          };
        });
        break;
      }
      case 'end': {
        // Flush any pending tokens before marking ended.
        if (tokenFlushRafRef.current !== null) {
          cancelAnimationFrame(tokenFlushRafRef.current);
          flushBufferedTokens();
        }
        setStreams((prev) => {
          const existing = prev[event.requestId];
          if (!existing) return prev;
          if (existing.status === 'error') return prev;
          return {
            ...prev,
            [event.requestId]: {
              ...existing,
              status: 'ended',
              endedAt: Date.now(),
            },
          };
        });
        break;
      }
      case 'error': {
        // Flush any pending tokens before marking error.
        if (tokenFlushRafRef.current !== null) {
          cancelAnimationFrame(tokenFlushRafRef.current);
          flushBufferedTokens();
        }
        setStreams((prev) => {
          const existing = prev[event.requestId];
          if (!existing) return prev;
          return {
            ...prev,
            [event.requestId]: {
              ...existing,
              status: 'error',
              error: {
                code: event.code,
                message: event.message,
              },
              endedAt: Date.now(),
            },
          };
        });
        break;
      }
      default:
        break;
    }
  }, [flushBufferedTokens]);

  // Wrap event application + optional callback invocation.
  const handleEvent = useCallback(
    (event: LlmStreamEvent) => {
      applyEvent(event);
      const cb = callbacksRef.current;
      if (!cb) return;
      switch (event.event) {
        case 'start':
          cb.onStart?.(event);
          break;
        case 'token':
          cb.onToken?.(event);
          break;
        case 'usage':
          cb.onUsage?.(event);
          break;
        case 'end':
          cb.onEnd?.(event);
          break;
        case 'error':
          cb.onError?.(event);
          break;
      }
    },
    [applyEvent],
  );

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const names: Array<LlmStreamEvent['event']> = [
        'start',
        'token',
        'usage',
        'end',
        'error',
      ];
      for (const name of names) {
        const unlisten = await listen<LlmStreamEvent>(
          `llm-stream-${name}`,
          (evt) => {
            if (cancelled) return;
            handleEvent(evt.payload);
          },
        );
        if (cancelled) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      }
    };

    void setup().catch(() => {});

    return () => {
      cancelled = true;
      if (tokenFlushRafRef.current !== null) {
        cancelAnimationFrame(tokenFlushRafRef.current);
        tokenFlushRafRef.current = null;
      }
      tokenBufferRef.current = {};
      unlisteners.forEach((fn) => fn());
    };
  }, [handleEvent]);

  const dismissStream = useCallback((requestId: string) => {
    setStreams((prev) => {
      const { [requestId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const pruneFinishedStreams = useCallback(() => {
    setStreams((prev) => {
      const next: Record<string, LlmStreamState> = {};
      for (const [id, stream] of Object.entries(prev)) {
        if (stream.status === 'active') {
          next[id] = stream;
        }
      }
      return next;
    });
  }, []);

  const streamList = useMemo(
    () => Object.values(streams).sort((a, b) => b.startedAt - a.startedAt),
    [streams],
  );

  const latestStream = useMemo(
    () => streamList[0] ?? null,
    [streamList],
  );

  const totalCostUsd = useMemo(
    () =>
      streamList.reduce((sum, s) => {
        if (s.usage?.costUsd != null) return sum + s.usage.costUsd;
        return sum;
      }, 0),
    [streamList],
  );

  return {
    streams,
    streamList,
    latestStream,
    totalCostUsd,
    dismissStream,
    pruneFinishedStreams,
  };
}
