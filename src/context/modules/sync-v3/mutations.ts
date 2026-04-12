import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { removeUndefined } from '@/lib/app-utils';
import type { McHistoryEntry, QuestionHistoryEntry } from '@/types/history';
import type { SavedQuestionSet } from '@/types/persistence';
import type { Preset, StreakData, StudyGoals } from '@/types/study';

import { auth, db } from '../firebase-init';

/**
 * Direct, atomic mutations to Firestore.
 * These bypass the old queue system and rely on Firestore's native offline persistence.
 */

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
    console.warn('[SyncV3] No UID available to save question history entry');
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
    console.error('[SyncV3] Failed to save question history entry:', error);
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
    console.warn('[SyncV3] No UID available to save MC history entry');
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
    console.error('[SyncV3] Failed to save MC history entry:', error);
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
    console.error('[SyncV3] Failed to save saved set:', error);
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
 * Update the user's study goals and streak data under `users/{uid}/settings/goals`.
 * Performs a merge so only provided fields are updated.
 *
 * @param goals - The new study goals to persist.
 * @param streakData - The associated streak data to persist.
 */
export async function updateStudyGoals(
  goals: StudyGoals,
  streakData: StreakData,
) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(
      doc(db, `users/${uid}/settings`, 'goals'),
      removeUndefined({
        studyGoals: goals,
        streakData: streakData,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    console.error('[SyncV3] Failed to update study goals:', error);
  }
}

/**
 * Update the user's presets under `users/{uid}/settings/presets`.
 * Uses merge to avoid overwriting other settings.
 *
 * @param presets - Array of `Preset` objects to persist.
 */
export async function updatePresets(presets: Preset[]) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(
      doc(db, `users/${uid}/settings`, 'presets'),
      removeUndefined({
        presets,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    console.error('[SyncV3] Failed to update presets:', error);
  }
}

/**
 * Update the stored API key for the user under `users/{uid}/settings/main`.
 * Uses `merge: true` to preserve other main settings.
 *
 * @param apiKey - The API key string to persist.
 */
export async function updateApiKey(apiKey: string) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(
      doc(db, `users/${uid}/settings`, 'main'),
      removeUndefined({
        apiKey,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    console.error('[SyncV3] Failed to update API key:', error);
  }
}

function getUid() {
  return auth.currentUser?.uid;
}
