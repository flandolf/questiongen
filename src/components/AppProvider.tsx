/**
 * AppProvider — triggers hydration on mount and listens for Tauri backend events.
 *
 * No React context or useState is used for app state — everything comes from
 * the Zustand store (store.ts).
 */

import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useEffect } from 'react';

import { useLocalBackupExport } from '../hooks/useLocalBackupExport';
import { checkForAppUpdate } from '../lib/updater';
import { useAppStore } from '../store';
import type { GenerationStatusEvent, LogEntry } from '../types';

export function AppProvider({ children }: { children: ReactNode }) {
  const hydrate = useAppStore((s) => s.hydrate);
  const setGenerationStatus = useAppStore((s) => s.setGenerationStatus);

  useLocalBackupExport();

  // Hydrate from persisted storage on mount
  useEffect(() => {
    void hydrate();
    void checkForAppUpdate();
  }, [hydrate]);

  // Forward backend SSE events into the store
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<GenerationStatusEvent>('generation-status', (event) => {
      setGenerationStatus(event.payload);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    const unlistenLog = listen<{
      level: string;
      message: string;
      data?: unknown;
    }>('rust-log', (event) => {
      useAppStore.getState().addLog({
        level: event.payload.level as LogEntry['level'],
        message: event.payload.message,
        data: event.payload.data,
      });
    });

    return () => {
      cancelled = true;
      unlisten?.();
      void unlistenLog.then((fn) => fn());
    };
  }, [setGenerationStatus]);

  return <>{children}</>;
}
