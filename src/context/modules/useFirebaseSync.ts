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
  deleteArchivedItems,
  SyncableData,
} from "./useFirebase";
import { useAppStore, AppState } from "../../store";
import type {
  QuestionHistoryEntry,
  McHistoryEntry,
  SavedQuestionSet,
} from "../../types";

const SYNC_DEBUG = true;

// Data archiving limits
const ARCHIVE_QUESTION_HISTORY_LIMIT = 100;
const ARCHIVE_MC_HISTORY_LIMIT = 100;
const ARCHIVE_SAVED_SETS_LIMIT = 50;

// Debug log / sync event memory limits
const DEBUG_LOG_LIMIT = 50;
const SYNC_EVENT_LIMIT = 30;

// Operation queue for preventing race conditions
interface QueuedOperation {
  id: string;
  execute: () => Promise<void>;
}

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
    // Settings sync is intentionally disabled due to cross-device instability.
    settings: {},
    questionHistory: mergeById(local.questionHistory, remote.questionHistory),
    mcHistory: mergeById(local.mcHistory, remote.mcHistory),
    savedSets: mergeById(local.savedSets, remote.savedSets),
  };

  // Archive old history items to keep in-memory and sync sizes bounded
  if (merged.questionHistory.length > ARCHIVE_QUESTION_HISTORY_LIMIT) {
    merged.questionHistory = merged.questionHistory.slice(0, ARCHIVE_QUESTION_HISTORY_LIMIT);
  }
  if (merged.mcHistory.length > ARCHIVE_MC_HISTORY_LIMIT) {
    merged.mcHistory = merged.mcHistory.slice(0, ARCHIVE_MC_HISTORY_LIMIT);
  }
  if (merged.savedSets.length > ARCHIVE_SAVED_SETS_LIMIT) {
    merged.savedSets = merged.savedSets.slice(0, ARCHIVE_SAVED_SETS_LIMIT);
  }

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
    // Keep settings out of cloud payloads; sync only content/history.
    settings: {},
    questionHistory: state.questionHistory,
    mcHistory: state.mcHistory,
    savedSets: state.savedSets,
  };
}

function applySyncableDataToStore(data: SyncableData): Partial<AppState> {
  return {
    // Settings are intentionally not applied from cloud.
    questionHistory: (data.questionHistory as QuestionHistoryEntry[]) ?? [],
    mcHistory: (data.mcHistory as McHistoryEntry[]) ?? [],
    savedSets: (data.savedSets as SavedQuestionSet[]) ?? [],
  };
}

export type SyncStatus = "idle" | "connecting" | "syncing" | "error" | "offline";

export interface SyncEvent {
  id: string;
  timestamp: number;
  type: "upload" | "download" | "error" | "conflict" | "archive" | "retry";
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
  syncStatus: SyncStatus;
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  
  const debugLog = useCallback((message: string, data?: unknown) => {
    if (SYNC_DEBUG) {
      console.log("[FirebaseSync]", message, data);
      const entry: DebugLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        message: data ? `${message} ${JSON.stringify(data)}` : message,
        data,
      };
      setDebugLogs((prev) => [entry, ...prev].slice(0, DEBUG_LOG_LIMIT));
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
    setSyncEvents((prev) => [event, ...prev].slice(0, SYNC_EVENT_LIMIT));
  }, []);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const localDataRef = useRef<SyncableData | null>(null);
  const isInitializedRef = useRef(false);
  const isFirstSyncRef = useRef(true);
  const suppressAutoSaveRef = useRef(false);
  const suppressAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Operation queue for serializing sync writes
  const operationQueueRef = useRef<QueuedOperation[]>([]);
  const isProcessingQueueRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    while (operationQueueRef.current.length > 0) {
      const op = operationQueueRef.current.shift();
      if (!op) break;
      try {
        await op.execute();
      } catch (error) {
        console.error(`[FirebaseSync] Queued operation ${op.id} failed:`, error);
      }
    }
    isProcessingQueueRef.current = false;
  }, []);

  const enqueueOperation = useCallback((id: string, execute: () => Promise<void>) => {
    operationQueueRef.current.push({ id, execute });
    void processQueue();
  }, [processQueue]);

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
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus((prev) => prev === "offline" ? "idle" : prev);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
    };
    
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
        setSyncStatus("idle");
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
      setSyncStatus("syncing");
      
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
        setSyncStatus("idle");
      } catch (error) {
        console.error("Sync error:", error);
        setSyncError(error instanceof Error ? error.message : "Sync failed");
        setSyncStatus("error");
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
      
      saveTimer = setTimeout(() => {
        enqueueOperation(`auto-save-${Date.now()}`, async () => {
          try {
            setIsSyncing(true);
            setSyncStatus("syncing");
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
            setSyncStatus("idle");
            addSyncEvent("upload", "Data uploaded to cloud");
          } catch (error) {
            console.error("Failed to save to Firebase:", error);
            setSyncError(error instanceof Error ? error.message : "Save failed");
            setSyncStatus("error");
            addSyncEvent("error", `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          } finally {
            setIsSyncing(false);
          }
        });
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
  }, [user, isSyncEnabled, addSyncEvent, debugLog, enqueueOperation]);
  
  const enableSync = useCallback(async (email: string, password: string, isSignUp = false) => {
    debugLog("enableSync called", { email, isSignUp });
    setSyncError(null);
    setSyncStatus("connecting");
    
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

        // Archive old items from Firestore after merge
        const qhKeepIds = new Set(merged.questionHistory.map((item) => String(item.id ?? "")));
        const mcKeepIds = new Set(merged.mcHistory.map((item) => String(item.id ?? "")));
        void deleteArchivedItems(userId, "questionHistory", qhKeepIds).then((deleted) => {
          if (deleted > 0) addSyncEvent("archive", `Archived ${deleted} old question history items`);
        });
        void deleteArchivedItems(userId, "mcHistory", mcKeepIds).then((deleted) => {
          if (deleted > 0) addSyncEvent("archive", `Archived ${deleted} old MC history items`);
        });
      }

      if (!hasRemoteData(remoteData)) {
        await saveUserData(userId, localDataRef.current);
        addSyncEvent("upload", "Initial data uploaded to cloud");
      }
      isInitializedRef.current = true;
      isFirstSyncRef.current = !hasRemoteData(remoteData);
      setIsSyncEnabled(true);
      setSyncError(null);
      setSyncStatus("idle");
    } catch (error: unknown) {
      console.error("Failed to enable sync:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to enable sync";
      setSyncError(errorMessage);
      addSyncEvent("error", `Connection failed: ${errorMessage}`);
      setIsSyncEnabled(false);
      setSyncStatus("error");
    }
  }, []);
  
  const disableSync = useCallback(async () => {
    setIsSyncEnabled(false);
    isInitializedRef.current = false;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setSyncStatus("idle");
    addSyncEvent("upload", "Disconnected from cloud sync");
  }, []);
  
  const forceSync = useCallback(async () => {
    if (!user) {
      setSyncError("Not signed in");
      return;
    }
    
    debugLog("Manual sync started");
    setIsSyncing(true);
    setSyncStatus("syncing");
    
    const userId = getUserId(user);
    
    enqueueOperation(`force-sync-${Date.now()}`, async () => {
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
        setSyncStatus("idle");
        addSyncEvent("upload", "Manual sync completed");
        debugLog("Manual sync completed successfully");
      } catch (error) {
        console.error("Force sync failed:", error);
        setSyncError(error instanceof Error ? error.message : "Force sync failed");
        setSyncStatus("error");
        addSyncEvent("error", `Manual sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        debugLog("Manual sync failed", error);
      } finally {
        setIsSyncing(false);
      }
    });
  }, [user, enqueueOperation]);
  
  return {
    user,
    isLoading,
    isSyncing,
    isOnline,
    syncStatus,
    lastSyncTime,
    syncError,
    syncEvents,
    debugLogs,
    enableSync,
    disableSync,
    forceSync,
  };
}
