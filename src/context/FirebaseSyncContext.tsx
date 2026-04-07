import React, { createContext, useContext, useEffect } from 'react';

import { useSyncV3, type UseSyncV3Return } from './modules/sync-v3/useSyncV3';

const FirebaseSyncContext = createContext<UseSyncV3Return | null>(null);

export function FirebaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firebaseSync = useSyncV3();

  return (
    <FirebaseSyncContext.Provider value={firebaseSync}>
      {children}
    </FirebaseSyncContext.Provider>
  );
}

export function useFirebaseSyncContext(): UseSyncV3Return {
  const fallbackValue = useSyncV3();
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
