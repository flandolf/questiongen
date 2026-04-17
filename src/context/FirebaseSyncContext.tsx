import React, { createContext, useContext } from 'react';

import { useSync, type UseSyncReturn } from './modules/sync/useSync';

const FirebaseSyncContext = createContext<UseSyncReturn | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useSync();

  /**
   * Provides Firebase sync functionality (listeners, auth helpers) to the
   * app via context. Wrap the application with `FirebaseSyncProvider` to
   * enable cloud sync features.
   */
  return (
    <FirebaseSyncContext.Provider value={firebaseSync}>
      {children}
    </FirebaseSyncContext.Provider>
  );
}

export function useFirebaseSyncContext(): UseSyncReturn {
  const value = useContext(FirebaseSyncContext);

  if (!value) {
    if (import.meta.env.DEV) {
      console.warn('useFirebaseSyncContext used outside FirebaseSyncProvider.');
    }
    throw new Error(
      'useFirebaseSyncContext must be used within FirebaseSyncProvider.',
    );
  }

  return value;
}
