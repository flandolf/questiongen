import { useEffect, useState, useCallback, useRef } from "react";
import {
  FirebaseUser,
  signInWithEmail,
  signUpWithEmail,
  onAuthChange,
  subscribeToUserData,
  saveUserData,
  loadUserData,
  migrateUserDataForCompaction,
  SyncableData,
} from "./useFirebase";
import { useAppStore, AppState } from "../../store";
import type {
  QuestionHistoryEntry,
  McHistoryEntry,
  SavedQuestionSet,
} from "../../types";

const SYNC_DEBUG = true;

function getUserId(user: FirebaseUser | null): string {
  return user?.uid ?? "anonymous";
}

function mergeSyncableData(
  local: SyncableData | null,
  remote: SyncableData | null
): SyncableData {
  const defaultData: SyncableData = {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  };

  if (!local && !remote) {
    return defaultData;
  }

  if (!local) {
    return remote ?? defaultData;
  }

  if (!remote) {
    return local;
  }

  const merged: SyncableData = {
    settings: { ...local.settings, ...remote.settings },
    questionHistory: mergeById(local.questionHistory, remote.questionHistory),
    mcHistory: mergeById(local.mcHistory, remote.mcHistory),
    savedSets: mergeById(local.savedSets, remote.savedSets),
  };

  return merged;
}

function hasRemoteData(data: SyncableData | null): boolean {
  if (!data) {
    return false;
  }
  const hasSettings = Boolean(data.settings && Object.keys(data.settings).length > 0);
  return hasSettings
    || (data.questionHistory?.length ?? 0) > 0
    || (data.mcHistory?.length ?? 0) > 0
    || (data.savedSets?.length ?? 0) > 0;
}

interface HasId {
  id?: string;
  lastModified?: number;
  createdAt?: string;
  updatedAt?: string;
}

function mergeById<T extends HasId>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();

  for (const item of local) {
    if (item.id) {
      byId.set(item.id, item);
    }
  }

  for (const item of remote) {
    if (!item.id) {
      continue;
    }
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    const existingModified = getItemLastModified(existing);
    const remoteModified = getItemLastModified(item);
    if (remoteModified >= existingModified) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

function getItemLastModified(item: HasId): number {
  if (typeof item.lastModified === "number" && Number.isFinite(item.lastModified)) {
    return item.lastModified;
  }

  if (item.updatedAt) {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (item.createdAt) {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function extractSyncableData(state: AppState): SyncableData {
  return {
    settings: {
      apiKey: state.apiKey,
      model: state.model,
      markingModel: state.markingModel,
      useSeparateMarkingModel: state.useSeparateMarkingModel,
      imageMarkingModel: state.imageMarkingModel,
      useSeparateImageMarkingModel: state.useSeparateImageMarkingModel,
      debugMode: state.debugMode,
      questionTextSize: state.questionTextSize,
    },
    questionHistory: state.questionHistory,
    mcHistory: state.mcHistory,
    savedSets: state.savedSets,
  };
}

function applySyncableDataToStore(data: SyncableData): Partial<AppState> {
  return {
    apiKey: (data.settings?.apiKey as string) ?? "",
    model: (data.settings?.model as string) ?? "openrouter/healer-alpha",
    markingModel: (data.settings?.markingModel as string) ?? "openrouter/healer-alpha",
    useSeparateMarkingModel: Boolean(data.settings?.useSeparateMarkingModel),
    imageMarkingModel: (data.settings?.imageMarkingModel as string) ?? "openrouter/healer-alpha",
    useSeparateImageMarkingModel: Boolean(data.settings?.useSeparateImageMarkingModel),
    debugMode: Boolean(data.settings?.debugMode),
    questionTextSize: Number(data.settings?.questionTextSize) || 16,
    
    questionHistory: (data.questionHistory as QuestionHistoryEntry[]) ?? [],
    mcHistory: (data.mcHistory as McHistoryEntry[]) ?? [],
    savedSets: (data.savedSets as SavedQuestionSet[]) ?? [],
  };
}

export interface SyncEvent {
  id: string;
  timestamp: number;
  type: "upload" | "download" | "error" | "conflict";
  description: string;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  message: string;
  data?: unknown;
}

export interface UseFirebaseSyncReturn {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncTime: number | null;
  syncError: string | null;
  syncEvents: SyncEvent[];
  debugLogs: DebugLogEntry[];
  enableSync: (email: string, password: string, isSignUp?: boolean) => Promise<void>;
  disableSync: () => Promise<void>;
  forceSync: () => Promise<void>;
}

export function useFirebaseSync(): UseFirebaseSyncReturn {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  
  const debugLog = useCallback((message: string, data?: unknown) => {
    if (SYNC_DEBUG) {
      console.log("[FirebaseSync]", message, data);
      const entry: DebugLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        message: data ? `${message} ${JSON.stringify(data)}` : message,
        data,
      };
      setDebugLogs((prev) => [entry, ...prev].slice(0, 100));
    }
  }, []);
  
  const addSyncEvent = useCallback((type: SyncEvent["type"], description: string) => {
    const event: SyncEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      type,
      description,
    };
    debugLog(`Sync event: ${type} - ${description}`);
    setSyncEvents((prev) => [event, ...prev].slice(0, 50));
  }, []);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const localDataRef = useRef<SyncableData | null>(null);
  const isInitializedRef = useRef(false);
  const isFirstSyncRef = useRef(true);
  const suppressAutoSaveRef = useRef(false);
  const suppressAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suppressAutoSaveTemporarily = useCallback((ms = 1200) => {
    suppressAutoSaveRef.current = true;
    if (suppressAutoSaveTimerRef.current) {
      clearTimeout(suppressAutoSaveTimerRef.current);
    }
    suppressAutoSaveTimerRef.current = setTimeout(() => {
      suppressAutoSaveRef.current = false;
      suppressAutoSaveTimerRef.current = null;
    }, ms);
  }, []);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      debugLog("Auth changed:", firebaseUser?.uid ?? "null");
      setUser(firebaseUser);
      if (!firebaseUser) {
        setIsSyncEnabled(false);
        isInitializedRef.current = false;
      }
      setIsLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  useEffect(() => {
    if (!user || !isSyncEnabled) return;
    
    const userId = getUserId(user);
    
    const unsubscribe = subscribeToUserData(userId, async (remoteData) => {
      if (!isInitializedRef.current) return;
      
      setIsSyncing(true);
      
      try {
        if (remoteData && isFirstSyncRef.current) {
          isFirstSyncRef.current = false;
          const merged = mergeSyncableData(localDataRef.current, remoteData);
          const storeUpdates = applySyncableDataToStore(merged);
          suppressAutoSaveTemporarily();
          useAppStore.setState(storeUpdates);
          localDataRef.current = merged;
          addSyncEvent("download", "Initial data synced from cloud");
        } else if (remoteData) {
          const merged = mergeSyncableData(localDataRef.current, remoteData);
          const storeUpdates = applySyncableDataToStore(merged);
          suppressAutoSaveTemporarily();
          useAppStore.setState(storeUpdates);
          localDataRef.current = merged;
          addSyncEvent("download", "Data updated from cloud");
        }
        
        setLastSyncTime(Date.now());
      } catch (error) {
        console.error("Sync error:", error);
        setSyncError(error instanceof Error ? error.message : "Sync failed");
        addSyncEvent("error", `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setIsSyncing(false);
      }
    });
    unsubscribeRef.current = unsubscribe;
    
    return () => {
      unsubscribe();
      if (unsubscribeRef.current === unsubscribe) {
        unsubscribeRef.current = null;
      }
    };
  }, [user, isSyncEnabled, addSyncEvent]);
  
  useEffect(() => {
    if (!user || !isSyncEnabled) return;
    
    const userId = getUserId(user);
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    
    const unsubscribe = useAppStore.subscribe(async (state) => {
      if (!state.isHydrated || !isSyncEnabled || suppressAutoSaveRef.current) return;
      
      localDataRef.current = extractSyncableData(state);
      
      if (saveTimer) clearTimeout(saveTimer);
      
      saveTimer = setTimeout(async () => {
        try {
          setIsSyncing(true);
          const syncableData = extractSyncableData(state);
          debugLog("Auto-saving user data", {
            userId,
            settings: syncableData.settings,
            questionHistory: syncableData.questionHistory?.length,
            mcHistory: syncableData.mcHistory?.length,
            savedSets: syncableData.savedSets?.length,
          });
          await saveUserData(userId, syncableData);
          setLastSyncTime(Date.now());
          setSyncError(null);
          addSyncEvent("upload", "Data uploaded to cloud");
        } catch (error) {
          console.error("Failed to save to Firebase:", error);
          setSyncError(error instanceof Error ? error.message : "Save failed");
          addSyncEvent("error", `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
          setIsSyncing(false);
        }
      }, 1000);
    });
    
    return () => {
      unsubscribe();
      if (saveTimer) clearTimeout(saveTimer);
      if (suppressAutoSaveTimerRef.current) {
        clearTimeout(suppressAutoSaveTimerRef.current);
        suppressAutoSaveTimerRef.current = null;
      }
    };
  }, [user, isSyncEnabled, addSyncEvent, debugLog]);
  
  const enableSync = useCallback(async (email: string, password: string, isSignUp = false) => {
    debugLog("enableSync called", { email, isSignUp });
    setSyncError(null);
    
    try {
      let firebaseUser: FirebaseUser | null = null;
      
      if (isSignUp) {
        debugLog("Signing up...");
        firebaseUser = await signUpWithEmail(email, password);
      } else {
        debugLog("Signing in...");
        firebaseUser = await signInWithEmail(email, password);
      }
      
      if (!firebaseUser) {
        setSyncError("Failed to sign in");
        return;
      }
      
      debugLog("User authenticated:", firebaseUser.uid);
      setUser(firebaseUser);
      
      const userId = getUserId(firebaseUser);
      debugLog("Loading user data for:", userId);
      isInitializedRef.current = false;
      
      let remoteData = await loadUserData(userId);
      const remoteHasData = hasRemoteData(remoteData);
      debugLog("Remote data loaded:", {
        hasData: remoteHasData,
        settings: !!remoteData?.settings,
        questionHistory: remoteData?.questionHistory?.length,
        mcHistory: remoteData?.mcHistory?.length,
        savedSets: remoteData?.savedSets?.length,
      });

      if (remoteHasData) {
        const migrationResult = await migrateUserDataForCompaction(userId, remoteData);
        debugLog("Compaction migration result", migrationResult);
        if (migrationResult.migrated) {
          addSyncEvent(
            "upload",
            `Cloud compaction migrated ${migrationResult.questionHistoryCount} written, ${migrationResult.mcHistoryCount} MC, ${migrationResult.savedSetsCount} saved sets`
          );
          remoteData = await loadUserData(userId);
          debugLog("Remote data reloaded after compaction migration:", {
            hasData: hasRemoteData(remoteData),
            questionHistory: remoteData?.questionHistory?.length,
            mcHistory: remoteData?.mcHistory?.length,
            savedSets: remoteData?.savedSets?.length,
          });
        }
      }

      const localState = useAppStore.getState();
      const localData = extractSyncableData(localState);
      
      localDataRef.current = localData;
      
      if (hasRemoteData(remoteData)) {
        debugLog("ID check", {
          localIds: localData.questionHistory.map((q) => q.id),
          remoteIds: remoteData?.questionHistory?.map((q) => String(q.id ?? "")) ?? [],
          localMcIds: localData.mcHistory.map((q) => q.id),
          remoteMcIds: remoteData?.mcHistory?.map((q) => String(q.id ?? "")) ?? [],
        });
        const merged = mergeSyncableData(localData, remoteData ?? null);
        const storeUpdates = applySyncableDataToStore(merged);
        suppressAutoSaveTemporarily();
        useAppStore.setState(storeUpdates);
        localDataRef.current = merged;
        addSyncEvent("download", `Synced ${remoteData?.questionHistory?.length || 0} question history items`);
      }

      if (!hasRemoteData(remoteData)) {
        await saveUserData(userId, localDataRef.current);
        addSyncEvent("upload", "Initial data uploaded to cloud");
      }
      isInitializedRef.current = true;
      isFirstSyncRef.current = !hasRemoteData(remoteData);
      setIsSyncEnabled(true);
      setSyncError(null);
    } catch (error: unknown) {
      console.error("Failed to enable sync:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to enable sync";
      setSyncError(errorMessage);
      addSyncEvent("error", `Connection failed: ${errorMessage}`);
      setIsSyncEnabled(false);
    }
  }, []);
  
  const disableSync = useCallback(async () => {
    setIsSyncEnabled(false);
    isInitializedRef.current = false;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    addSyncEvent("upload", "Disconnected from cloud sync");
  }, []);
  
  const forceSync = useCallback(async () => {
    if (!user) {
      setSyncError("Not signed in");
      return;
    }
    
    debugLog("Manual sync started");
    setIsSyncing(true);
    
    const userId = getUserId(user);
    
    try {
      const state = useAppStore.getState();
      const localData = extractSyncableData(state);
      debugLog("Manual sync local snapshot", {
        settings: localData.settings,
        questionHistory: localData.questionHistory?.length,
        mcHistory: localData.mcHistory?.length,
        savedSets: localData.savedSets?.length,
      });

      const remoteData = await loadUserData(userId);
      const remoteHasData = hasRemoteData(remoteData);
      debugLog("Manual sync remote snapshot", {
        hasData: remoteHasData,
        questionHistory: remoteData?.questionHistory?.length ?? 0,
        mcHistory: remoteData?.mcHistory?.length ?? 0,
        savedSets: remoteData?.savedSets?.length ?? 0,
      });

      const merged = remoteHasData
        ? mergeSyncableData(localData, remoteData)
        : localData;

      if (remoteHasData) {
        const storeUpdates = applySyncableDataToStore(merged);
        suppressAutoSaveTemporarily();
        useAppStore.setState(storeUpdates);
        addSyncEvent("download", "Manual sync pulled remote updates");
      }

      debugLog("Uploading merged data to cloud", {
        questionHistory: merged.questionHistory?.length,
        mcHistory: merged.mcHistory?.length,
        savedSets: merged.savedSets?.length,
      });
      await saveUserData(userId, merged);
      localDataRef.current = merged;
      setLastSyncTime(Date.now());
      setSyncError(null);
      addSyncEvent("upload", "Manual sync completed");
      debugLog("Manual sync completed successfully");
    } catch (error) {
      console.error("Force sync failed:", error);
      setSyncError(error instanceof Error ? error.message : "Force sync failed");
      addSyncEvent("error", `Manual sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      debugLog("Manual sync failed", error);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);
  
  return {
    user,
    isLoading,
    isSyncing,
    isOnline,
    lastSyncTime,
    syncError,
    syncEvents,
    debugLogs,
    enableSync,
    disableSync,
    forceSync,
  };
}
