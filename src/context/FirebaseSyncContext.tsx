import React, { createContext, useContext } from 'react';

import { useSyncV3, type UseSyncV3Return } from './modules/sync-v3/useSyncV3';

const FirebaseSyncContext = createContext<UseSyncV3Return | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useSyncV3();

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

export function useFirebaseSyncContext(): UseSyncV3Return {
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
