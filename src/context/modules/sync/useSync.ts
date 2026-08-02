import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isSupabaseConfigured,
  supabase,
  type SupabaseUser,
} from '@/context/modules/supabase';
import {
  EMPTY_PERSISTED_APP_STATE,
  normalizeGenerationHistory,
  normalizeMcHistory,
  normalizeQuestionHistory,
  normalizeSavedSet,
} from '@/lib/persistence';
import { hydrateCloudPayloads } from '@/lib/supabase-storage';
import { useAppStore } from '@/store';
import type { AppState } from '@/store/types';
import type {
  CustomSubtopic,
  Preset,
  StreakData,
  StudyGoals,
  Topic,
} from '@/types';

import {
  type CloudCollection,
  flushPendingDeletions,
  migrateSettings,
  saveGenerationRecord,
  saveMcHistoryEntry,
  saveQuestionHistoryEntry,
  saveSavedSet,
} from './mutations';

type CloudRow = {
  collection: CloudCollection;
  record_id: string;
  payload: unknown;
  updated_at: number;
  deleted_at: number | null;
};

export function mergeById<
  T extends { id: string; lastModified?: number; isUploaded?: boolean },
>(
  local: T[],
  remote: T[],
  deletedIds: Set<string>,
): T[] {
  const result = [...remote];
  const remoteMap = new Map(remote.map((entry) => [entry.id, entry]));
  for (const localEntry of local) {
    if (deletedIds.has(localEntry.id)) continue;
    const remoteEntry = remoteMap.get(localEntry.id);
    if (!remoteEntry) {
      result.push({ ...localEntry, isUploaded: false });
    } else if (
      (localEntry.lastModified ?? 0) > (remoteEntry.lastModified ?? 0)
    ) {
      const index = result.findIndex((entry) => entry.id === localEntry.id);
      if (index >= 0) result[index] = localEntry;
    }
  }
  return result;
}

function latestSubtopicTimestamp(subtopics: CustomSubtopic[]): number {
  return Math.max(
    0,
    ...subtopics.map(
      (subtopic) => subtopic.updatedAt || subtopic.createdAt || 0,
    ),
  );
}

function mergeCustomSubtopics(
  local: Record<Topic, CustomSubtopic[]>,
  rows: CloudRow[],
): Record<Topic, CustomSubtopic[]> {
  const merged = { ...local };
  for (const row of rows) {
    if (row.deleted_at) continue;
    const topic = row.record_id as Topic;
    if (!(topic in merged)) continue;
    const payload = row.payload as {
      subtopics?: CustomSubtopic[];
      lastModified?: number;
    };
    const remote = Array.isArray(payload.subtopics) ? payload.subtopics : [];
    if (
      (payload.lastModified ?? row.updated_at) >=
      latestSubtopicTimestamp(local[topic] ?? [])
    ) {
      merged[topic] = remote;
    }
  }
  return merged;
}

type SettingsProfileUpdates = Partial<
  Pick<AppState, 'studyGoals' | 'streakData' | 'presets'>
>;

type SettingsProfile = {
  studyGoals?: StudyGoals;
  streakData?: StreakData;
  presets?: Preset[];
  lastModified?: number;
};

function applySettingsProfile(
  profile: SettingsProfile,
  localWriteTimestamp: number,
) {
  if ((profile.lastModified ?? 0) <= localWriteTimestamp) return;
  const updates: SettingsProfileUpdates = {};
  if (profile.studyGoals) updates.studyGoals = profile.studyGoals;
  if (profile.streakData) updates.streakData = profile.streakData;
  if (profile.presets) updates.presets = profile.presets;

  if (Object.keys(updates).length > 0) {
    useAppStore.setState(updates);
  }
}

const EMPTY_CUSTOM_SUBTOPICS: Record<Topic, CustomSubtopic[]> = {
  Biology: [],
  Chemistry: [],
  'General Mathematics': [],
  'Mathematical Methods': [],
  'Physical Education': [],
  'Specialist Mathematics': [],
};

function resetUserScopedSyncState() {
  useAppStore.setState({
    studyGoals: EMPTY_PERSISTED_APP_STATE.studyGoals,
    streakData: EMPTY_PERSISTED_APP_STATE.streakData,
    presets: EMPTY_PERSISTED_APP_STATE.presets,
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
    generationHistory: [],
    customSubtopics: EMPTY_CUSTOM_SUBTOPICS,
    customSubtopicsSynced: false,
    questions: [],
    activeQuestionIndex: 0,
    writtenQuestionPresentedAtById: {},
    answersByQuestionId: {},
    imagesByQuestionId: {},
    feedbackByQuestionId: {},
    writtenRawModelOutput:
      EMPTY_PERSISTED_APP_STATE.writtenSession.rawModelOutput,
    writtenGenerationTelemetry:
      EMPTY_PERSISTED_APP_STATE.writtenSession.generationTelemetry ?? null,
    activeWrittenSavedSetId: null,
    mcQuestions: [],
    activeMcQuestionIndex: 0,
    mcQuestionPresentedAtById: {},
    mcAnswersByQuestionId: {},
    mcRawModelOutput: EMPTY_PERSISTED_APP_STATE.mcSession.rawModelOutput,
    mcGenerationTelemetry:
      EMPTY_PERSISTED_APP_STATE.mcSession.generationTelemetry ?? null,
    activeMcSavedSetId: null,
  });
}

function rowsFor(rows: CloudRow[], collection: CloudCollection) {
  return rows.filter((row) => row.collection === collection);
}

function localWriteTimestamp(): number {
  const stored = localStorage.getItem('sync_settings_lastWrite');
  return stored ? Number.parseInt(stored, 10) || 0 : 0;
}

async function applyCloudRows(rows: CloudRow[]) {
  const hydrated = await hydrateCloudPayloads(rows.map((row) => row.payload));
  const hydratedRows = rows.map((row, index) => ({
    ...row,
    payload: hydrated[index],
  }));

  function mergeCollection<
    T extends { id: string; lastModified?: number; isUploaded?: boolean },
  >(
    collection: CloudCollection,
    local: T[],
    normalize: (value: unknown) => T[],
  ) {
    const collectionRows = rowsFor(hydratedRows, collection);
    const deleted = new Set(
      collectionRows
        .filter((row) => row.deleted_at != null)
        .map((row) => row.record_id),
    );
    const active = collectionRows
      .filter((row) => row.deleted_at == null)
      .map((row) => ({
        id: row.record_id,
        ...(row.payload as Record<string, unknown>),
        isUploaded: true,
      }));
    const remote = normalize(active);
    return mergeById(local, remote, deleted);
  }

  const state = useAppStore.getState();
  useAppStore.setState({
    questionHistory: mergeCollection(
      'questionHistory',
      state.questionHistory,
      normalizeQuestionHistory,
    ),
    mcHistory: mergeCollection(
      'mcHistory',
      state.mcHistory,
      normalizeMcHistory,
    ),
    generationHistory: mergeCollection(
      'generationHistory',
      state.generationHistory,
      normalizeGenerationHistory,
    ),
    savedSets: mergeCollection(
      'savedSets',
      state.savedSets,
      (values) =>
        (values as unknown[])
          .map(normalizeSavedSet)
          .filter((value): value is NonNullable<typeof value> => value != null),
    ),
    customSubtopics: mergeCustomSubtopics(
      state.customSubtopics,
      rowsFor(hydratedRows, 'customSubtopics'),
    ),
    customSubtopicsSynced: true,
  });

  const settings = rowsFor(hydratedRows, 'settings').find(
    (row) => row.record_id === 'profile' && row.deleted_at == null,
  );
  if (settings) {
    applySettingsProfile(
      settings.payload as SettingsProfile,
      localWriteTimestamp(),
    );
  }
}

export interface UseSyncReturn {
  user: SupabaseUser | null;
  isConfigured: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline' | 'connecting';
  enableSync: (
    email: string,
    password: string,
    isSignUp?: boolean,
  ) => Promise<void>;
  disableSync: () => Promise<void>;
  markLocalWrite: (key: string) => void;
}

export function useSync(): UseSyncReturn {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<UseSyncReturn['syncStatus']>(
    'idle',
  );
  const channelRef = useRef<RealtimeChannel | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUserIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
    if (channelRef.current && supabase) {
      void supabase.removeChannel(channelRef.current);
    }
    channelRef.current = null;
  }, []);

  const refresh = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('cloud_records')
      .select('collection,record_id,payload,updated_at,deleted_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    await applyCloudRows(data ?? []);
  }, []);

  const syncPending = useCallback(() => {
    const state = useAppStore.getState();
    state.questionHistory
      .filter((entry) => !entry.isUploaded)
      .forEach((entry) => void saveQuestionHistoryEntry(entry));
    state.mcHistory
      .filter((entry) => !entry.isUploaded)
      .forEach((entry) => void saveMcHistoryEntry(entry));
    state.generationHistory
      .filter((entry) => !entry.isUploaded)
      .forEach((entry) => void saveGenerationRecord(entry));
    state.savedSets
      .filter((entry) => !entry.isUploaded)
      .forEach((entry) => void saveSavedSet(entry));
  }, []);

  const startSync = useCallback(
    async (userId: string) => {
      if (!supabase) return;
      cleanup();
      setSyncStatus('syncing');
      try {
        const scheduleRefresh = () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => {
            void refresh(userId).catch((error) => {
              console.error('[SupabaseSync] Refresh failed:', error);
              setSyncStatus('error');
            });
          }, 100);
        };
        channelRef.current = supabase
          .channel(`cloud-records:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'cloud_records',
              filter: `user_id=eq.${userId}`,
            },
            scheduleRefresh,
          )
          .subscribe((status) => {
            if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR)
              setSyncStatus('error');
          });
        await flushPendingDeletions(userId);
        await refresh(userId);
        await migrateSettings();
        syncPending();
        void useAppStore.getState().syncCustomSubtopics?.();
        setSyncStatus('idle');
      } catch (error) {
        console.error('[SupabaseSync] Setup failed:', error);
        setSyncStatus('error');
      }
    },
    [cleanup, refresh, syncPending],
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const userId = activeUserIdRef.current;
      if (userId) void startSync(userId);
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (activeUserIdRef.current) setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [startSync]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      const previousUserId = activeUserIdRef.current;
      const nextUserId = nextUser?.id ?? null;
      if (previousUserId && previousUserId !== nextUserId) {
        resetUserScopedSyncState();
      }
      activeUserIdRef.current = nextUserId;
      setUser(nextUser);
      setIsLoading(false);
      if (nextUserId) void startSync(nextUserId);
      else {
        cleanup();
        setSyncStatus('idle');
      }
    });
    return () => {
      data.subscription.unsubscribe();
      cleanup();
    };
  }, [cleanup, startSync]);

  const enableSync = async (
    email: string,
    password: string,
    isSignUp = false,
  ) => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error('Supabase is not configured for this build.');
    }
    setSyncStatus('connecting');
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setSyncStatus('error');
      throw result.error;
    }
    if (!result.data.session) setSyncStatus('idle');
  };

  const disableSync = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const markLocalWrite = useCallback((key: string) => {
    if (key === 'settings') {
      localStorage.setItem('sync_settings_lastWrite', Date.now().toString());
    }
  }, []);

  return {
    user,
    isConfigured: isSupabaseConfigured,
    isLoading,
    isSyncing: syncStatus === 'syncing',
    isSyncEnabled: user != null,
    isOnline,
    syncStatus,
    enableSync,
    disableSync,
    markLocalWrite,
  };
}
