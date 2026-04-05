import React, { createContext, useContext, useMemo } from 'react';

import type { UseFirebaseSyncReturn } from './modules/sync-v2/useSyncV2';
import { useSyncV2 } from './modules/sync-v2/useSyncV2';

const FirebaseSyncContext = createContext<UseFirebaseSyncReturn | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useSyncV2();

  const value = useMemo<UseFirebaseSyncReturn>(
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
      pullSync: firebaseSync.pullSync,
      pushSync: firebaseSync.pushSync,
      forceSync: firebaseSync.forceSync,
      resolveConflicts: firebaseSync.resolveConflicts,
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
      firebaseSync.pullSync,
      firebaseSync.pushSync,
      firebaseSync.forceSync,
      firebaseSync.resolveConflicts,
    ]
  );
  return (
    <FirebaseSyncContext.Provider value={value}>
      {children}
    </FirebaseSyncContext.Provider>
  );
}

export function useFirebaseSyncContext(): UseFirebaseSyncReturn {
  const value = useContext(FirebaseSyncContext);
  if (!value) {
    throw new Error(
      'useFirebaseSyncContext must be used within FirebaseSyncProvider'
    );
  }
  return value;
}
