import React, { createContext, useContext, useMemo } from 'react';
import {
  useFirebaseSync,
  UseFirebaseSyncReturn,
} from './modules/useFirebaseSync';

const FirebaseSyncContext = createContext<UseFirebaseSyncReturn | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useFirebaseSync();

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
      conflicts: firebaseSync.conflicts,
      enableSync: firebaseSync.enableSync,
      disableSync: firebaseSync.disableSync,
      toggleSync: firebaseSync.toggleSync,
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
      firebaseSync.conflicts,
      firebaseSync.enableSync,
      firebaseSync.disableSync,
      firebaseSync.toggleSync,
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
