import { useEffect } from 'react';

import {
  createExportEnvelope,
  exportAppState,
  exportEnvelopeToDirectory,
  isTauriApp,
} from '@/lib/import-export';
import { useAppStore } from '@/store';

/**
 * Periodically exports app data as JSON into the user-chosen backup folder (desktop only).
 */
export function useLocalBackupExport(): void {
  const isHydrated = useAppStore((s) => s.isHydrated);
  const folder = useAppStore((s) => s.localBackupFolderPath);
  const intervalMinutes = useAppStore((s) => s.localBackupIntervalMinutes);

  useEffect(() => {
    if (!isHydrated || !isTauriApp()) return;
    const trimmed = folder.trim();
    if (!trimmed || !intervalMinutes || intervalMinutes <= 0) return;

    const ms = intervalMinutes * 60 * 1000;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const s = useAppStore.getState();
          const envelope = createExportEnvelope(exportAppState(s));
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await exportEnvelopeToDirectory(
            trimmed,
            envelope,
            `questiongen-export-auto-${stamp}.json`,
          );
        } catch (e) {
          console.warn('[LocalBackup] Scheduled export failed', e);
        }
      })();
    }, ms);

    return () => clearInterval(id);
  }, [isHydrated, folder, intervalMinutes]);
}
