import debounce from 'lodash.debounce';

import { supabase } from '@/context/modules/supabase';
import { removeUndefined } from '@/lib/app-utils';
import { prepareCloudPayload } from '@/lib/supabase-storage';
import { useAppStore } from '@/store';
import type { CustomSubtopic } from '@/types';
import type {
  GenerationRecord,
  McHistoryEntry,
  QuestionHistoryEntry,
} from '@/types/history';
import type { SavedQuestionSet } from '@/types/persistence';
import type { Preset, StreakData, StudyGoals } from '@/types/study';

export type CloudCollection =
  | 'questionHistory'
  | 'mcHistory'
  | 'generationHistory'
  | 'savedSets'
  | 'customSubtopics'
  | 'settings';

type CloudRecord = {
  payload: unknown;
  updated_at: number;
  deleted_at: number | null;
};

const PENDING_DELETIONS_KEY = 'questiongen.supabasePendingDeletions';

type PendingDeletion = {
  userId: string;
  collection: CloudCollection;
  recordId: string;
};

function readPendingDeletions(): PendingDeletion[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PENDING_DELETIONS_KEY) ?? '[]',
    );
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is PendingDeletion =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as PendingDeletion).userId === 'string' &&
        typeof (item as PendingDeletion).collection === 'string' &&
        typeof (item as PendingDeletion).recordId === 'string',
    );
  } catch {
    return [];
  }
}

function writePendingDeletions(items: PendingDeletion[]) {
  localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(items));
}

function queuePendingDeletion(item: PendingDeletion) {
  const items = readPendingDeletions().filter(
    (existing) =>
      existing.userId !== item.userId ||
      existing.collection !== item.collection ||
      existing.recordId !== item.recordId,
  );
  writePendingDeletions([...items, item]);
}

async function getSessionUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function upsertRecord(
  collection: CloudCollection,
  recordId: string,
  payload: unknown,
): Promise<void> {
  if (!supabase) return;
  const userId = await getSessionUserId();
  if (!userId) return;
  const now = Date.now();
  const cloudPayload = await prepareCloudPayload(
    removeUndefined(payload),
    userId,
  );
  const { error } = await supabase.from('cloud_records').upsert(
    {
      user_id: userId,
      collection,
      record_id: recordId,
      payload: cloudPayload,
      updated_at: now,
      deleted_at: null,
    },
    { onConflict: 'user_id,collection,record_id' },
  );
  if (error) throw error;
}

async function tombstoneRecord(
  collection: CloudCollection,
  recordId: string,
): Promise<void> {
  if (!supabase) return;
  const userId = await getSessionUserId();
  if (!userId) return;
  try {
    await sendTombstone(userId, collection, recordId);
  } catch (error) {
    queuePendingDeletion({ userId, collection, recordId });
    throw error;
  }
}

async function sendTombstone(
  userId: string,
  collection: CloudCollection,
  recordId: string,
): Promise<void> {
  if (!supabase) return;
  const now = Date.now();
  const { error } = await supabase.from('cloud_records').upsert(
    {
      user_id: userId,
      collection,
      record_id: recordId,
      payload: {},
      updated_at: now,
      deleted_at: now,
    },
    { onConflict: 'user_id,collection,record_id' },
  );
  if (error) throw error;
}

export async function flushPendingDeletions(userId: string) {
  const pending = readPendingDeletions();
  const remaining = pending.filter((item) => item.userId !== userId);
  for (const item of pending.filter((entry) => entry.userId === userId)) {
    try {
      await sendTombstone(userId, item.collection, item.recordId);
    } catch {
      remaining.push(item);
    }
  }
  writePendingDeletions(remaining);
}

async function getRecord(
  collection: CloudCollection,
  recordId: string,
): Promise<CloudRecord | null> {
  if (!supabase) return null;
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('cloud_records')
    .select('payload,updated_at,deleted_at')
    .eq('user_id', userId)
    .eq('collection', collection)
    .eq('record_id', recordId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function logFailure(action: string, error: unknown) {
  console.error(`[SupabaseSync] Failed to ${action}:`, error);
}

export async function saveQuestionHistoryEntry(entry: QuestionHistoryEntry) {
  try {
    await upsertRecord('questionHistory', entry.id, {
      ...entry,
      isUploaded: true,
    });
  } catch (error) {
    logFailure('save question history entry', error);
  }
}

export async function deleteQuestionHistoryEntry(id: string) {
  try {
    await tombstoneRecord('questionHistory', id);
  } catch (error) {
    logFailure('delete question history entry', error);
  }
}

export async function saveMcHistoryEntry(entry: McHistoryEntry) {
  try {
    await upsertRecord('mcHistory', entry.id, {
      ...entry,
      isUploaded: true,
    });
  } catch (error) {
    logFailure('save MC history entry', error);
  }
}

export async function deleteMcHistoryEntry(id: string) {
  try {
    await tombstoneRecord('mcHistory', id);
  } catch (error) {
    logFailure('delete MC history entry', error);
  }
}

export async function saveGenerationRecord(entry: GenerationRecord) {
  try {
    await upsertRecord('generationHistory', entry.id, {
      ...entry,
      isUploaded: true,
    });
  } catch (error) {
    logFailure('save generation record', error);
  }
}

export async function deleteGenerationRecord(id: string) {
  try {
    await tombstoneRecord('generationHistory', id);
  } catch (error) {
    logFailure('delete generation record', error);
  }
}

export async function saveSavedSet(entry: SavedQuestionSet) {
  try {
    await upsertRecord('savedSets', entry.id, {
      ...entry,
      isUploaded: true,
    });
  } catch (error) {
    logFailure('save saved set', error);
  }
}

export async function deleteSavedSet(id: string) {
  try {
    await tombstoneRecord('savedSets', id);
  } catch (error) {
    logFailure('delete saved set', error);
  }
}

type PendingSettingsUpdate = {
  apiKey?: string;
  providerKeys?: Record<string, string>;
  studyGoals?: StudyGoals;
  streakData?: StreakData;
  presets?: Preset[];
};

let pendingSettingsUpdate: PendingSettingsUpdate = {};

const flushPendingSettingsUpdate = debounce(async () => {
  const patch = pendingSettingsUpdate;
  pendingSettingsUpdate = {};
  if (Object.keys(patch).length === 0) return;

  try {
    const existing = await getRecord('settings', 'profile');
    const now = Date.now();
    await upsertRecord('settings', 'profile', {
      ...(existing?.deleted_at ? {} : (existing?.payload ?? {})),
      ...patch,
      lastModified: now,
    });
    localStorage.setItem('sync_settings_lastWrite', now.toString());
  } catch (error) {
    logFailure('update settings profile', error);
  }
}, 1500);

function queueSettingsUpdate(update: PendingSettingsUpdate) {
  localStorage.setItem('sync_settings_lastWrite', Date.now().toString());
  pendingSettingsUpdate = { ...pendingSettingsUpdate, ...update };
  void flushPendingSettingsUpdate();
}

export function updateStudyGoals(goals: StudyGoals, streakData: StreakData) {
  queueSettingsUpdate({ studyGoals: goals, streakData });
}

export function updatePresets(presets: Preset[]) {
  queueSettingsUpdate({ presets });
}

export function updateProviderApiKeys(
  activeApiKey: string,
  providerKeys: Record<string, string>,
) {
  queueSettingsUpdate({ apiKey: activeApiKey, providerKeys });
}

export async function clearSyncedApiKeys() {
  pendingSettingsUpdate = {};
  try {
    const existing = await getRecord('settings', 'profile');
    const now = Date.now();
    await upsertRecord('settings', 'profile', {
      ...(existing?.deleted_at ? {} : (existing?.payload ?? {})),
      apiKey: '',
      providerKeys: {},
      lastModified: now,
    });
    localStorage.setItem('sync_settings_lastWrite', now.toString());
  } catch (error) {
    logFailure('clear synced API keys', error);
  }
}

function currentSettingsPayload(lastModified = Date.now()) {
  const state = useAppStore.getState();
  return {
    apiKey: state.syncApiKey ? state.apiKey : '',
    providerKeys: state.syncApiKey
      ? Object.fromEntries(
          Object.entries(state.providers).map(([id, provider]) => [
            id,
            provider.apiKey,
          ]),
        )
      : {},
    studyGoals: state.studyGoals,
    streakData: state.streakData,
    presets: state.presets,
    lastModified,
  };
}

export async function migrateSettings() {
  try {
    const existing = await getRecord('settings', 'profile');
    const remoteLastModified = existing?.deleted_at
      ? 0
      : ((existing?.payload as { lastModified?: number } | undefined)
          ?.lastModified ?? 0);
    const localLastModified = Number.parseInt(
      localStorage.getItem('sync_settings_lastWrite') ?? '0',
      10,
    );
    if (
      !existing ||
      existing.deleted_at ||
      localLastModified > remoteLastModified
    ) {
      await upsertRecord(
        'settings',
        'profile',
        currentSettingsPayload(localLastModified || Date.now()),
      );
    }
  } catch (error) {
    logFailure('initialize settings profile', error);
  }
}

export async function saveCustomSubtopics(
  topic: string,
  subtopics: CustomSubtopic[],
) {
  try {
    const now = Date.now();
    await upsertRecord('customSubtopics', topic, {
      subtopics,
      lastModified: now,
    });
  } catch (error) {
    logFailure('save custom subtopics', error);
  }
}

export async function loadCustomSubtopics(
  topic: string,
): Promise<CustomSubtopic[]> {
  try {
    const record = await getRecord('customSubtopics', topic);
    if (!record || record.deleted_at) return [];
    const payload = record.payload as { subtopics?: CustomSubtopic[] };
    return Array.isArray(payload.subtopics) ? payload.subtopics : [];
  } catch (error) {
    logFailure('load custom subtopics', error);
    return [];
  }
}

export async function loadAllCustomSubtopics(): Promise<
  Record<string, { subtopics: CustomSubtopic[]; updatedAt: number | null }>
> {
  if (!supabase) return {};
  const userId = await getSessionUserId();
  if (!userId) return {};
  const { data, error } = await supabase
    .from('cloud_records')
    .select('record_id,payload,updated_at,deleted_at')
    .eq('user_id', userId)
    .eq('collection', 'customSubtopics');
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    record_id: string;
    payload: unknown;
    updated_at: number;
    deleted_at: number | null;
  }>;
  const result: Record<
    string,
    { subtopics: CustomSubtopic[]; updatedAt: number | null }
  > = {};
  for (const row of rows) {
    if (row.deleted_at != null) continue;
    const payload = row.payload as {
      subtopics?: CustomSubtopic[];
      lastModified?: number;
    };
    result[row.record_id] = {
      subtopics: Array.isArray(payload.subtopics) ? payload.subtopics : [],
      updatedAt: payload.lastModified ?? row.updated_at,
    };
  }
  return result;
}

export async function deleteCustomSubtopic(topic: string, subtopicId: string) {
  const existing = await loadCustomSubtopics(topic);
  await saveCustomSubtopics(
    topic,
    existing.filter((subtopic) => subtopic.id !== subtopicId),
  );
}
