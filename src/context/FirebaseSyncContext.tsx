import React, { createContext, useContext, useMemo } from "react";
import { useFirebaseSync, UseFirebaseSyncReturn } from "./modules/useFirebaseSync";

const FirebaseSyncContext = createContext<UseFirebaseSyncReturn | null>(null);

export function FirebaseSyncProvider({ children }: { children: React.ReactNode }) {
  const firebaseSync = useFirebaseSync();

  const value = useMemo(() => firebaseSync, [firebaseSync]);
  return <FirebaseSyncContext.Provider value={value}>{children}</FirebaseSyncContext.Provider>;
}

export function useFirebaseSyncContext(): UseFirebaseSyncReturn {
  const value = useContext(FirebaseSyncContext);
  if (!value) {
    throw new Error("useFirebaseSyncContext must be used within FirebaseSyncProvider");
  }
  return value;
}
