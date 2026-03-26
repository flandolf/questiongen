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
  SyncMetadata,
  buildVersionMap,
} from "./useFirebase";
import { useAppStore, AppState } from "../../store";
import type {
  QuestionHistoryEntry,
  McHistoryEntry,
  SavedQuestionSet,
} from "../../types";

const SYNC_DEBUG = true;

// Optimized constants for better sync performance
const AUTO_SAVE_DEBOUNCE_MS = 10000; // Reduced from 60000ms (10s instead of 60s)
const SYNC_STALE_THRESHOLD_MS = 60000; // Force full sync if stale for > 1 minute
const STORE_CHANGE_THROTTLE_MS = 2000; // Throttle store subscriptions to avoid excessive saves

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
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  syncError: string | null;
  syncEvents: SyncEvent[];
  debugLogs: DebugLogEntry[];
  enableSync: (email: string, password: string, isSignUp?: boolean) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
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
  
  // Track sync metadata for delta sync
  const syncMetadataRef = useRef<SyncMetadata>({
    lastSyncTime: 0,
    questionHistorySyncTime: 0,
    mcHistorySyncTime: 0,
    savedSetsSyncTime: 0,
    lastSyncVersions: {
      questionHistory: {},
      mcHistory: {},
      savedSets: {},
    },
  });
  
  // Track last store update time for throttling
  const lastStoreUpdateRef = useRef<number>(0);

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
  
  // (moved below forceSync definition)
// (removed duplicate/broken code)
  
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
    let isDirty = false;
    let lastSavedSnapshot = "";

    const trySave = (state: AppState) => {
      if (!state.isHydrated || !isSyncEnabled || suppressAutoSaveRef.current) return;
      
      // Throttle: skip if we just saved recently
      const now = Date.now();
      if (now - lastStoreUpdateRef.current < STORE_CHANGE_THROTTLE_MS) {
        // Mark dirty but don't trigger save immediately
        isDirty = true;
        lastStoreUpdateRef.current = now;
        return;
      }
      lastStoreUpdateRef.current = now;
      
      // Create snapshot to detect actual changes
      const syncableData = extractSyncableData(state);
      const snapshot = JSON.stringify({
        qh: syncableData.questionHistory.map(q => ({ id: q.id, lm: getItemLastModified(q) })),
        mch: syncableData.mcHistory.map(q => ({ id: q.id, lm: getItemLastModified(q) })),
        ss: syncableData.savedSets.map(q => ({ id: q.id, lm: getItemLastModified(q) })),
      });
      
      // Skip if nothing changed since last save
      if (snapshot === lastSavedSnapshot) {
        debugLog("No changes detected, skipping save");
        return;
      }
      
      lastSavedSnapshot = snapshot;
      localDataRef.current = syncableData;
      isDirty = true;
      
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (!isDirty) return;
        isDirty = false;
        enqueueOperation(`auto-save-${Date.now()}`, async () => {
          try {
            setIsSyncing(true);
            setSyncStatus("syncing");
            const currentData = extractSyncableData(useAppStore.getState());
            debugLog("Auto-saving user data", {
              userId,
              settings: currentData.settings,
              questionHistory: currentData.questionHistory?.length,
              mcHistory: currentData.mcHistory?.length,
              savedSets: currentData.savedSets?.length,
            });
            
            // Check if sync is stale (force full sync)
            const timeSinceLastSync = now - syncMetadataRef.current.lastSyncTime;
            const isStale = timeSinceLastSync > SYNC_STALE_THRESHOLD_MS;
            
            // Use delta sync - only save changed items
            const result = await saveUserData(userId, currentData, {
              deltaSyncVersions: syncMetadataRef.current.lastSyncVersions,
              fullSync: isStale,
            });
            
            // Update sync metadata after successful save
            syncMetadataRef.current.lastSyncTime = Date.now();
            syncMetadataRef.current.questionHistorySyncTime = Date.now();
            syncMetadataRef.current.mcHistorySyncTime = Date.now();
            syncMetadataRef.current.savedSetsSyncTime = Date.now();
            syncMetadataRef.current.lastSyncVersions.questionHistory = buildVersionMap(
              currentData.questionHistory as Array<Record<string, unknown>>,
              syncMetadataRef.current.lastSyncVersions.questionHistory
            );
            syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
              currentData.mcHistory as Array<Record<string, unknown>>,
              syncMetadataRef.current.lastSyncVersions.mcHistory
            );
            syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
              currentData.savedSets as Array<Record<string, unknown>>,
              syncMetadataRef.current.lastSyncVersions.savedSets
            );
            
            debugLog("Auto-save completed", {
              totalWrites: result.totalWrites,
              deltaSavings: result.deltaSavings,
              skippedUnchanged: result.skippedUnchanged,
              wasFullSync: isStale,
            });
            
            setLastSyncTime(Date.now());
            setSyncError(null);
            setSyncStatus("idle");
            addSyncEvent("upload", `Data uploaded to cloud (${result.totalWrites} writes, ${result.deltaSavings} delta savings)`);
          } catch (error) {
            console.error("Failed to save to Firebase:", error);
            setSyncError(error instanceof Error ? error.message : "Save failed");
            setSyncStatus("error");
            addSyncEvent("error", `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          } finally {
            setIsSyncing(false);
          }
        });
      }, AUTO_SAVE_DEBOUNCE_MS); // Reduced from 60000ms
    };

    const unsubscribe = useAppStore.subscribe(trySave);

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
        
        // Initialize sync metadata from merged data (for delta sync tracking)
        const now = Date.now();
        syncMetadataRef.current.lastSyncTime = now;
        syncMetadataRef.current.questionHistorySyncTime = now;
        syncMetadataRef.current.mcHistorySyncTime = now;
        syncMetadataRef.current.savedSetsSyncTime = now;
        syncMetadataRef.current.lastSyncVersions.questionHistory = buildVersionMap(
          merged.questionHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
          merged.mcHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
          merged.savedSets as Array<Record<string, unknown>>,
          {}
        );
        
        debugLog("Sync metadata initialized", {
          questionHistoryVersions: Object.keys(syncMetadataRef.current.lastSyncVersions.questionHistory).length,
          mcHistoryVersions: Object.keys(syncMetadataRef.current.lastSyncVersions.mcHistory).length,
          savedSetsVersions: Object.keys(syncMetadataRef.current.lastSyncVersions.savedSets).length,
        });
        
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
        // Initialize sync metadata for first-time sync
        const now = Date.now();
        syncMetadataRef.current.lastSyncTime = now;
        syncMetadataRef.current.questionHistorySyncTime = now;
        syncMetadataRef.current.mcHistorySyncTime = now;
        syncMetadataRef.current.savedSetsSyncTime = now;
        syncMetadataRef.current.lastSyncVersions.questionHistory = buildVersionMap(
          localDataRef.current.questionHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
          localDataRef.current.mcHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
          localDataRef.current.savedSets as Array<Record<string, unknown>>,
          {}
        );
        
        // Full sync for first upload
        await saveUserData(userId, localDataRef.current, { fullSync: true });
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

  const toggleSync = useCallback(() => {
    if (isSyncEnabled) {
      setIsSyncEnabled(false);
      isInitializedRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setSyncStatus("idle");
      addSyncEvent("upload", "Cloud sync paused");
    } else if (user) {
      setIsSyncEnabled(true);
      setSyncStatus("idle");
      addSyncEvent("download", "Cloud sync resumed");
    }
  }, [isSyncEnabled, user, addSyncEvent]);
  
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

        debugLog("Uploading merged data to cloud (full sync)", {
          questionHistory: merged.questionHistory?.length,
          mcHistory: merged.mcHistory?.length,
          savedSets: merged.savedSets?.length,
        });
        
        // Force full sync for manual sync
        await saveUserData(userId, merged, { fullSync: true });
        localDataRef.current = merged;
        
        // Update sync metadata after full sync
        const now = Date.now();
        syncMetadataRef.current.lastSyncTime = now;
        syncMetadataRef.current.questionHistorySyncTime = now;
        syncMetadataRef.current.mcHistorySyncTime = now;
        syncMetadataRef.current.savedSetsSyncTime = now;
        syncMetadataRef.current.lastSyncVersions.questionHistory = buildVersionMap(
          merged.questionHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.mcHistory = buildVersionMap(
          merged.mcHistory as Array<Record<string, unknown>>,
          {}
        );
        syncMetadataRef.current.lastSyncVersions.savedSets = buildVersionMap(
          merged.savedSets as Array<Record<string, unknown>>,
          {}
        );
        
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

  // Sync on focus/visibility change (must be after forceSync is defined)
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user && isSyncEnabled && !isSyncing) {
        forceSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, isSyncEnabled, isSyncing, forceSync]);
  
  return {
    user,
    isLoading,
    isSyncing,
    isSyncEnabled,
    isOnline,
    syncStatus,
    lastSyncTime,
    syncError,
    syncEvents,
    debugLogs,
    enableSync,
    disableSync,
    toggleSync,
    forceSync,
  };
}
