import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { removeUndefined } from '@/lib/app-utils';

import { auth, db } from '../firebase-init';

/**
 * Direct, atomic mutations to Firestore.
 * These bypass the old queue system and rely on Firestore's native offline persistence.
 */

export async function saveQuestionHistoryEntry(entry: any) {
  const uid = getUid();
  if (!uid) {
    console.warn('[SyncV3] No UID available to save question history entry');
    return;
  }
  try {
    await setDoc(doc(db, `users/${uid}/questionHistory`, entry.id), removeUndefined({
      ...entry,
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    console.error('[SyncV3] Failed to save question history entry:', error);
  }
}

export async function deleteQuestionHistoryEntry(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/questionHistory`, id));
}

export async function saveMcHistoryEntry(entry: any) {
  const uid = getUid();
  if (!uid) {
    console.warn('[SyncV3] No UID available to save MC history entry');
    return;
  }
  try {
    await setDoc(doc(db, `users/${uid}/mcHistory`, entry.id), removeUndefined({
      ...entry,
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    console.error('[SyncV3] Failed to save MC history entry:', error);
  }
}

export async function deleteMcHistoryEntry(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/mcHistory`, id));
}

export async function saveSavedSet(entry: any) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, `users/${uid}/savedSets`, entry.id), removeUndefined({
      ...entry,
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    console.error('[SyncV3] Failed to save saved set:', error);
  }
}

export async function deleteSavedSet(id: string) {
  const uid = getUid();
  if (!uid) return;
  await deleteDoc(doc(db, `users/${uid}/savedSets`, id));
}

export async function updateStudyGoals(goals: any, streakData: any) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, `users/${uid}/settings`, 'goals'), removeUndefined({
      studyGoals: goals,
      streakData: streakData,
      updatedAt: serverTimestamp(),
    }), { merge: true });
  } catch (error) {
    console.error('[SyncV3] Failed to update study goals:', error);
  }
}

export async function updatePresets(presets: any[]) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, `users/${uid}/settings`, 'presets'), removeUndefined({
      presets,
      updatedAt: serverTimestamp(),
    }), { merge: true });
  } catch (error) {
    console.error('[SyncV3] Failed to update presets:', error);
  }
}

export async function updateApiKey(apiKey: string) {
  const uid = getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, `users/${uid}/settings`, 'main'), removeUndefined({
      apiKey,
      updatedAt: serverTimestamp(),
    }), { merge: true });
  } catch (error) {
    console.error('[SyncV3] Failed to update API key:', error);
  }
}

function getUid() {
  return auth.currentUser?.uid;
}
