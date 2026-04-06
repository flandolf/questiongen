import React, { createContext, useContext, useEffect, useMemo } from 'react';

import type { UseSyncV2Return } from './modules/sync-v2/useSyncV2';
import { useSyncV2 } from './modules/sync-v2/useSyncV2';

const FirebaseSyncContext = createContext<UseSyncV2Return | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useSyncV2();

  const value = useMemo<UseSyncV2Return>(
    () => ({
      user: firebaseSync.user,
      isLoading: firebaseSync.isLoading,
      isSyncing: firebaseSync.isSyncing,
      isSyncEnabled: firebaseSync.isSyncEnabled,
      isOnline: firebaseSync.isOnline,
      syncStatus: firebaseSync.syncStatus,
      lastSyncTime: firebaseSync.lastSyncTime,
      syncError: firebaseSync.syncError,
      syncEvents: firebaseSync.syncEvents,
      debugLogs: firebaseSync.debugLogs,
      pendingChanges: firebaseSync.pendingChanges,
      pendingDeletions: firebaseSync.pendingDeletions,
      queuedOpsCount: firebaseSync.queuedOpsCount,
      lastFlushTime: firebaseSync.lastFlushTime,
      syncTelemetry: firebaseSync.syncTelemetry,
      conflicts: firebaseSync.conflicts,
      enableSync: firebaseSync.enableSync,
      disableSync: firebaseSync.disableSync,
      toggleSync: firebaseSync.toggleSync,
      retryQueuedOpsNow: firebaseSync.retryQueuedOpsNow,
      resolveConflicts: firebaseSync.resolveConflicts,
      clearSyncEvents: firebaseSync.clearSyncEvents,
    }),
    [
      firebaseSync.user,
      firebaseSync.isLoading,
      firebaseSync.isSyncing,
      firebaseSync.isSyncEnabled,
      firebaseSync.isOnline,
      firebaseSync.syncStatus,
      firebaseSync.lastSyncTime,
      firebaseSync.syncError,
      firebaseSync.syncEvents,
      firebaseSync.debugLogs,
      firebaseSync.pendingChanges,
      firebaseSync.pendingDeletions,
      firebaseSync.queuedOpsCount,
      firebaseSync.lastFlushTime,
      firebaseSync.syncTelemetry,
      firebaseSync.conflicts,
      firebaseSync.enableSync,
      firebaseSync.disableSync,
      firebaseSync.toggleSync,
      firebaseSync.retryQueuedOpsNow,
      firebaseSync.resolveConflicts,
      firebaseSync.clearSyncEvents,
    ]
  );
  return (
    <FirebaseSyncContext.Provider value={value}>
      {children}
    </FirebaseSyncContext.Provider>
  );
}

export function useFirebaseSyncContext(): UseSyncV2Return {
  const fallbackValue = useSyncV2();
  const value = useContext(FirebaseSyncContext);

  useEffect(() => {
    if (!value && import.meta.env.DEV) {
      console.warn(
        'useFirebaseSyncContext used outside FirebaseSyncProvider; falling back to a standalone sync instance.'
      );
    }
  }, [value]);

  return value ?? fallbackValue;
}
