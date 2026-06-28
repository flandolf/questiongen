import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef } from 'react';

import type { GenerationTokenEvent } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type StreamTextUpdater = (
  next: string | ((prev: string) => string),
  topicKey?: string,
) => void;

type GenerationResetEvent = { topic?: string };

export type GeneratorStreamSubscription = {
  /**
   * Synchronously clears buffered chunks and cancels any pending flush.
   * Call this right before kicking off a new generation request so the
   * first batch of incoming tokens starts from a clean slate.
   */
  resetLocalBuffer: () => void;
};

/**
 * Listen for backend `generation-token` and `generation-reset` events and
 * forward text chunks into the store's `setStreamText` with per-topic
 * RAF-buffered flushing.
 *
 * Behaviour matches the inline implementation that previously lived in
 * GeneratorView:
 *   - Reset events clear the buffered chunk for that topic and reset the
 *     stored stream text.
 *   - Token events append to a per-topic buffer; the first token after an
 *     idle period schedules a single RAF that drains all buffered chunks
 *     for all topics in one frame.
 *   - Cleanup cancels the inflight RAF and unlistens from both events,
 *     even if the listener promises resolve after unmount.
 */
export function useGeneratorStreamSubscription(
  setStreamText: StreamTextUpdater,
): GeneratorStreamSubscription {
  // Buffer state lives here so subscription teardown is automatically
  // consistent with the listener lifecycle. The view calls `resetLocalBuffer`
  // synchronously before starting a new generation.
  const streamBufferRef = useRef<Record<string, string>>({});
  const streamFlushRafRef = useRef<number | null>(null);
  const setStreamTextRef = useRef<StreamTextUpdater>(setStreamText);

  useEffect(() => {
    setStreamTextRef.current = setStreamText;
  }, [setStreamText]);

  const resetLocalBuffer = useCallback(() => {
    streamBufferRef.current = {};
    if (streamFlushRafRef.current !== null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlistenReset: UnlistenFn | undefined;
    let unlistenToken: UnlistenFn | undefined;

    const flushBufferedTokens = () => {
      streamFlushRafRef.current = null;
      const buffered = streamBufferRef.current;
      streamBufferRef.current = {};
      for (const [key, chunk] of Object.entries(buffered)) {
        if (!chunk) continue;
        setStreamTextRef.current(
          (prev: string) => prev + chunk,
          key === 'default' ? undefined : key,
        );
      }
    };

    void listen<GenerationResetEvent>('generation-reset', (event) => {
      const key = event.payload.topic || 'default';
      delete streamBufferRef.current[key];
      setStreamTextRef.current('', event.payload.topic);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenReset = fn;
      })
      .catch(() => {});

    void listen<GenerationTokenEvent>('generation-token', (event) => {
      const key = event.payload.topic || 'default';
      streamBufferRef.current[key] =
        (streamBufferRef.current[key] || '') + event.payload.text;
      if (streamFlushRafRef.current === null) {
        streamFlushRafRef.current = requestAnimationFrame(flushBufferedTokens);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenToken = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (streamFlushRafRef.current !== null) {
        cancelAnimationFrame(streamFlushRafRef.current);
        streamFlushRafRef.current = null;
      }
      streamBufferRef.current = {};
      unlistenReset?.();
      unlistenToken?.();
    };
  }, []);

  return { resetLocalBuffer };
}
