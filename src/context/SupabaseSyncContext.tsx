import React, { createContext, useContext } from 'react';

import { useSync, type UseSyncReturn } from './modules/sync/useSync';

const SupabaseSyncContext = createContext<UseSyncReturn | null>(null);

export function SupabaseSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SupabaseSyncContext.Provider value={useSync()}>
      {children}
    </SupabaseSyncContext.Provider>
  );
}

export function useSupabaseSyncContext(): UseSyncReturn {
  const value = useContext(SupabaseSyncContext);
  if (!value) {
    throw new Error(
      'useSupabaseSyncContext must be used within SupabaseSyncProvider.',
    );
  }
  return value;
}
