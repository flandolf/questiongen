import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import debounce from 'lodash.debounce';

import { auth, db } from '@/context/modules/firebase-init';
import { removeUndefined } from '@/lib/app-utils';
import type { CustomSubtopic } from '@/types';
import type {
  GenerationRecord,
  McHistoryEntry,
  QuestionHistoryEntry,
} from '@/types/history';
import type { SavedQuestionSet } from '@/types/persistence';
import type { Preset, StreakData, StudyGoals } from '@/types/study';

/**
 * Direct, atomic mutations to Firestore.
 * These bypass the old queue system and rely on Firestore's native offline persistence.
 */

type PendingSettingsUpdate = {
  apiKey?: string;
  studyGoals?: StudyGoals;
  streakData?: StreakData;
  presets?: Preset[];
};

let pendingSettingsUpdate: PendingSettingsUpdate = {};

const flushPendingSettingsUpdate = debounce(async () => {
  const patch = pendingSettingsUpdate;
  pendingSettingsUpdate = {};

  if (
    patch.apiKey === undefined &&
    patch.studyGoals === undefined &&
    patch.streakData === undefined &&
    patch.presets === undefined
  ) {
    return;
  }

  const uid = getUid();
  if (!uid) return;

  const now = Date.now();

  try {
    await setDoc(
      doc(db, `users/${uid}/settings`, 'profile'),
      removeUndefined({
        ...patch,
        updatedAt: serverTimestamp(),
        lastModified: now,
      }),
      { merge: true },
    );
    localStorage.setItem('sync_settings_lastWrite', now.toString());
  } catch (error) {
    console.error('[Sync] Failed to update settings profile:', error);
  }
}, 1500);

function queueSettingsUpdate(update: PendingSettingsUpdate) {
  const now = Date.now();
  localStorage.setItem('sync_settings_lastWrite', now.toString());
  pendingSettingsUpdate = {
    ...pendingSettingsUpdate,
    ...update,
  };
  void flushPendingSettingsUpdate();
}

/**
 * Persist a `QuestionHistoryEntry` to Firestore under the current user.
 * Marks the entry as uploaded and sets `updatedAt` to server time.
 *
 * Errors are caught and logged; callers do not receive thrown errors.
 *
 * @param entry - The question history entry to persist. Must include an `id`.
 */
export async function saveQuestionHistoryEntry(entry: QuestionHistoryEntry) {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to save question history entry');
    return;
  }
  try {
    await setDoc(
      doc(db, `users/${uid}/questionHistory`, entry.id),
      removeUndefined({
        ...entry,
        isUploaded: true,
        updatedAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    console.error('[Sync] Failed to save question history entry:', error);
  }
}

/**
 * Delete a `QuestionHistoryEntry` from the current user's Firestore.
 *
 * @param id - The id of the question history entry to delete.
 */
export async function deleteQuestionHistoryEntry(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/questionHistory`, id));
}

/**
 * Persist a `McHistoryEntry` to Firestore under the current user.
 * Marks the entry as uploaded and sets `updatedAt` to server time.
 *
 * @param entry - The multiple-choice history entry to persist. Must include an `id`.
 */
export async function saveMcHistoryEntry(entry: McHistoryEntry) {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to save MC history entry');
    return;
  }
  try {
    await setDoc(
      doc(db, `users/${uid}/mcHistory`, entry.id),
      removeUndefined({
        ...entry,
        isUploaded: true,
        updatedAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    console.error('[Sync] Failed to save MC history entry:', error);
  }
}

/**
 * Delete an `McHistoryEntry` from the current user's Firestore.
 *
 * @param id - The id of the MC history entry to delete.
 */
export async function deleteMcHistoryEntry(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/mcHistory`, id));
}

/**
 * Persist a `GenerationRecord` to Firestore under the current user.
 * Marks the entry as uploaded and sets `updatedAt` to server time.
 *
 * @param entry - The generation record to persist. Must include an `id`.
 */
export async function saveGenerationRecord(entry: GenerationRecord) {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to save generation record');
    return;
  }
  try {
    await setDoc(
      doc(db, `users/${uid}/generationHistory`, entry.id),
      removeUndefined({
        ...entry,
        isUploaded: true,
        updatedAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    console.error('[Sync] Failed to save generation record:', error);
  }
}

/**
 * Delete a `GenerationRecord` from the current user's Firestore.
 *
 * @param id - The id of the generation record to delete.
 */
export async function deleteGenerationRecord(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/generationHistory`, id));
}

/**
 * Save or update a `SavedQuestionSet` for the current user.
 * Writes `updatedAt` as a server timestamp.
 *
 * @param entry - The saved question set to persist. Must include an `id`.
 */
export async function saveSavedSet(entry: SavedQuestionSet) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(
      doc(db, `users/${uid}/savedSets`, entry.id),
      removeUndefined({
        ...entry,
        updatedAt: serverTimestamp(),
      }),
    );
  } catch (error) {
    console.error('[Sync] Failed to save saved set:', error);
  }
}

/**
 * Delete a saved question set for the current user.
 *
 * @param id - The id of the saved set to delete.
 */
export async function deleteSavedSet(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/savedSets`, id));
}

/**
 * Update the user's study goals and streak data under `users/{uid}/settings/profile`.
 * Writes are coalesced with other settings changes so rapid edits only emit one
 * Firestore write while preserving merge semantics.
 *
 * @param goals - The new study goals to persist.
 * @param streakData - The associated streak data to persist.
 */
export function updateStudyGoals(goals: StudyGoals, streakData: StreakData) {
  queueSettingsUpdate({ studyGoals: goals, streakData });
}

/**
 * Update the user's presets under `users/{uid}/settings/profile`.
 * Uses the shared settings queue so presets changes can batch with other fields.
 *
 * @param presets - Array of `Preset` objects to persist.
 */
export function updatePresets(presets: Preset[]) {
  queueSettingsUpdate({ presets });
}

/**
 * Update the stored API key for the user under `users/{uid}/settings/profile`.
 * Uses the shared settings queue so rapid changes across settings only emit a
 * single merged Firestore write.
 *
 * @param apiKey - The API key string to persist.
 */
export function updateApiKey(apiKey: string) {
  queueSettingsUpdate({ apiKey });
}

/**
 * Migrates old settings documents (main, goals, presets) to the consolidated 'profile' document.
 * This should be called once when the user logs in.
 */
export async function migrateSettings() {
  const uid = getUid();
  if (!uid) return;

  const profileRef = doc(db, `users/${uid}/settings`, 'profile');
  const profileSnap = await getDoc(profileRef);

  // If profile already exists, we assume migration is done (or it's a new user)
  if (profileSnap.exists()) return;

  console.info('[Sync] Starting settings migration to consolidated profile...');

  const mainRef = doc(db, `users/${uid}/settings`, 'main');
  const goalsRef = doc(db, `users/${uid}/settings`, 'goals');
  const presetsRef = doc(db, `users/${uid}/settings`, 'presets');

  const [mainSnap, goalsSnap, presetsSnap] = await Promise.all([
    getDoc(mainRef),
    getDoc(goalsRef),
    getDoc(presetsRef),
  ]);

  if (!mainSnap.exists() && !goalsSnap.exists() && !presetsSnap.exists()) {
    return;
  }

  const batch = writeBatch(db);
  const combinedData: DocumentData = {
    updatedAt: serverTimestamp(),
  };

  if (mainSnap.exists()) {
    Object.assign(combinedData, mainSnap.data());
    batch.delete(mainRef);
  }
  if (goalsSnap.exists()) {
    Object.assign(combinedData, goalsSnap.data());
    batch.delete(goalsRef);
  }
  if (presetsSnap.exists()) {
    Object.assign(combinedData, presetsSnap.data());
    batch.delete(presetsRef);
  }

  batch.set(profileRef, combinedData);

  try {
    await batch.commit();
    console.info('[Sync] Settings migration successful.');
  } catch (error) {
    console.error('[Sync] Settings migration failed:', error);
  }
}

// ─── Custom Subtopics ───────────────────────────────────────────────────────────

export async function saveCustomSubtopics(
  topic: string,
  subtopics: CustomSubtopic[],
) {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to save custom subtopics');
    return;
  }
  try {
    const now = Date.now();
    await setDoc(
      doc(db, `users/${uid}/customSubtopics`, topic),
      removeUndefined({
        subtopics,
        lastModified: now,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    console.error('[Sync] Failed to save custom subtopics:', error);
  }
}

export async function loadCustomSubtopics(
  topic: string,
): Promise<CustomSubtopic[]> {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to load custom subtopics');
    return [];
  }
  try {
    const snap = await getDoc(doc(db, `users/${uid}/customSubtopics`, topic));
    if (snap.exists()) {
      const data = snap.data();
      return (data.subtopics as CustomSubtopic[]) || [];
    }
  } catch (error) {
    console.error('[Sync] Failed to load custom subtopics:', error);
  }
  return [];
}

/**
 * Load all custom subtopics documents for the current user and return a mapping
 * of topic -> { subtopics, updatedAt } where `updatedAt` is normalized to ms.
 */
export async function loadAllCustomSubtopics(): Promise<
  Record<string, { subtopics: CustomSubtopic[]; updatedAt: number | null }>
> {
  const uid = getUid();
  if (!uid) {
    console.warn('[Sync] No UID available to load custom subtopics');
    return {};
  }

  type TimestampLike = {
    toDate?: () => Date;
    seconds?: number;
    nanoseconds?: number;
  };

  function toMs(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    }
    if (typeof value === 'object') {
      const ts = value as TimestampLike;
      const maybeToDate = ts.toDate;
      if (typeof maybeToDate === 'function') {
        try {
          const d = maybeToDate();
          if (d instanceof Date && !Number.isNaN(d.getTime())) {
            return d.getTime();
          }
        } catch {
          // fall through
        }
      }
      const seconds = ts.seconds;
      const nanos = ts.nanoseconds;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) {
        return seconds * 1000 + Math.floor((nanos ?? 0) / 1_000_000);
      }
    }
    return null;
  }

  try {
    const snap = await getDocs(collection(db, `users/${uid}/customSubtopics`));
    const result: Record<string, { subtopics: CustomSubtopic[]; updatedAt: number | null }> = {};
    snap.forEach((d) => {
      const data = d.data();
      const subtopics = (data.subtopics as CustomSubtopic[]) || [];
      const updatedAt = toMs(data.lastModified) ?? toMs(data.updatedAt);
      result[d.id] = { subtopics, updatedAt };
    });
    return result;
  } catch (error) {
    console.error('[Sync] Failed to load all custom subtopics:', error);
    throw error;
  }
}

export async function deleteCustomSubtopic(topic: string, subtopicId: string) {
  const uid = getUid();
  if (!uid) return;
  try {
    const existing = await loadCustomSubtopics(topic);
    const filtered = existing.filter((s) => s.id !== subtopicId);
    await saveCustomSubtopics(topic, filtered);
  } catch (error) {
    console.error('[Sync] Failed to delete custom subtopic:', error);
  }
}

function getUid() {
  return auth.currentUser?.uid;
}
