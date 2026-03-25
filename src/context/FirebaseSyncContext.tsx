import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../store";
import { useFirebaseSync, UseFirebaseSyncReturn } from "./modules/useFirebaseSync";

const FirebaseSyncContext = createContext<UseFirebaseSyncReturn | null>(null);

export function FirebaseSyncProvider({ children }: { children: React.ReactNode }) {
  const firebaseSync = useFirebaseSync();
  const isHydrated = useAppStore((s) => s.isHydrated);
  const startupSyncedUserRef = useRef<string | null>(null);
  const lastExitSyncAtRef = useRef(0);

  useEffect(() => {
    if (!firebaseSync.user || !firebaseSync.isSyncEnabled) {
      startupSyncedUserRef.current = null;
      return;
    }
    if (!isHydrated || !firebaseSync.isOnline || firebaseSync.isSyncing) {
      return;
    }

    const userId = firebaseSync.user.uid;
    if (startupSyncedUserRef.current === userId) {
      return;
    }
    startupSyncedUserRef.current = userId;
    void firebaseSync.forceSync();
  }, [isHydrated, firebaseSync.user, firebaseSync.isSyncEnabled, firebaseSync.isOnline, firebaseSync.isSyncing, firebaseSync.forceSync]);

  useEffect(() => {
    const maybeSyncOnExit = () => {
      const now = Date.now();
      if (now - lastExitSyncAtRef.current < 5000) {
        return;
      }
      if (!isHydrated || !firebaseSync.user || !firebaseSync.isSyncEnabled || !firebaseSync.isOnline || firebaseSync.isSyncing) {
        return;
      }
      lastExitSyncAtRef.current = now;
      void firebaseSync.forceSync();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        maybeSyncOnExit();
      }
    };

    window.addEventListener("beforeunload", maybeSyncOnExit);
    window.addEventListener("pagehide", maybeSyncOnExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", maybeSyncOnExit);
      window.removeEventListener("pagehide", maybeSyncOnExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHydrated, firebaseSync.user, firebaseSync.isOnline, firebaseSync.isSyncing, firebaseSync.forceSync]);

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
