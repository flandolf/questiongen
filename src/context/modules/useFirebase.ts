import { Preset } from "@/types";
// ─── Preset Firestore Helpers ─────────────────────────────────────────────

function getPresetsCollectionRef(userId: string) {
  return collection(db, "users", userId, "presets");
}

export async function listPresets(userId: string): Promise<Preset[]> {
  const colRef = getPresetsCollectionRef(userId);
  const snapshot = await getDocs(query(colRef, orderBy("updatedAt", "desc")));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Preset));
}

export async function savePreset(userId: string, preset: Preset): Promise<void> {
  const colRef = getPresetsCollectionRef(userId);
  const docRef = doc(colRef, preset.id);
  await setDoc(docRef, { ...preset, updatedAt: new Date().toISOString() });
}

export async function deletePreset(userId: string, presetId: string): Promise<void> {
  const colRef = getPresetsCollectionRef(userId);
  const docRef = doc(colRef, presetId);
  await setDoc(docRef, {}, { merge: false }); // Overwrite with empty to delete
  // Firestore best practice is to use deleteDoc, but setDoc({}, {merge:false}) is a safe fallback
}

// ─── Goals & Streak Firestore Helpers ──────────────────────────────────────

function getGoalsDocRef(userId: string) {
  return doc(db, "users", userId, "settings", "goals");
}

export async function saveGoalsData(
  userId: string,
  studyGoals: Record<string, unknown>,
  streakData: Record<string, unknown>,
): Promise<void> {
  const goalsRef = getGoalsDocRef(userId);
  await withRetry(
    () => withTimeout(
      setDoc(goalsRef, {
        studyGoals: removeUndefined(studyGoals),
        streakData: removeUndefined(streakData),
        _lastModified: serverTimestamp(),
      }, { merge: true }),
      "saving goals data"
    ),
    "saving goals data"
  );
}

export async function loadGoalsData(userId: string): Promise<{
  studyGoals: Record<string, unknown> | null;
  streakData: Record<string, unknown> | null;
}> {
  const goalsRef = getGoalsDocRef(userId);
  const snapshot = await withTimeout(getDoc(goalsRef), "loading goals data");
  if (!snapshot.exists()) {
    return { studyGoals: null, streakData: null };
  }
  const data = snapshot.data();
  return {
    studyGoals: typeof data.studyGoals === "object" && data.studyGoals !== null && !Array.isArray(data.studyGoals) ? data.studyGoals : null,
    streakData: typeof data.streakData === "object" && data.streakData !== null && !Array.isArray(data.streakData) ? data.streakData : null,
  };
}

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";
import { 
  initializeFirestore,
  getFirestore, 
  doc, 
  getDoc, 
  getDocs, 
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "@/firebaseConfig";
import { SUBTOPIC_INSTRUCTIONS } from "@/types";

let app = getApps()[0];
if (!app) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase app initialized");
}

const auth = getAuth(app);
const isTauriRuntime =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const shouldForceLongPolling =
  isTauriRuntime
  || (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));

const db = (() => {
  try {
    if (shouldForceLongPolling) {
      console.log("[Firebase] Android detected; enabling Firestore long-polling transport");
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    }
    return getFirestore(app);
  } catch (error) {
    console.warn("[Firebase] Firestore init fallback to default transport", error);
    return getFirestore(app);
  }
})();

console.log("Firebase initialized, auth:", !!auth, "db:", !!db);

export { app, auth, db };

export type FirebaseUser = User;

export async function signInWithEmail(email: string, password: string): Promise<FirebaseUser | null> {
  try {
    console.log("Attempting sign in with:", email);
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log("Sign in successful, user:", result.user?.uid);
    return result.user;
  } catch (error) {
    console.error("Firebase sign-in error:", error);
    throw error;
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<FirebaseUser | null> {
  try {
    console.log("Attempting sign up with:", email);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error("Firebase sign-up error:", error);
    throw error;
  }
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Firebase sign-out error:", error);
  }
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export interface SyncableData {
  settings: Record<string, unknown>;
  questionHistory: Record<string, unknown>[];
  mcHistory: Record<string, unknown>[];
  savedSets: Record<string, unknown>[];
  presets?: Preset[];
  studyGoals?: Record<string, unknown>;
  streakData?: Record<string, unknown>;
}

// Track last sync timestamps per collection to enable delta sync
export interface SyncMetadata {
  lastSyncTime: number;
  questionHistorySyncTime: number;
  mcHistorySyncTime: number;
  savedSetsSyncTime: number;
  lastSyncVersions: {
    questionHistory: Record<string, number>;
    mcHistory: Record<string, number>;
    savedSets: Record<string, number>;
  };
}

const DEFAULT_SYNC_METADATA: SyncMetadata = {
  lastSyncTime: 0,
  questionHistorySyncTime: 0,
  mcHistorySyncTime: 0,
  savedSetsSyncTime: 0,
  lastSyncVersions: {
    questionHistory: {},
    mcHistory: {},
    savedSets: {},
  },
};

export function createInitialSyncMetadata(): SyncMetadata {
  return { ...DEFAULT_SYNC_METADATA, lastSyncVersions: { questionHistory: {}, mcHistory: {}, savedSets: {} } };
}

// Helper to get item's lastModified timestamp
function getItemLastModified(item: Record<string, unknown>): number {
  if (typeof item.lastModified === "number" && Number.isFinite(item.lastModified)) {
    return item.lastModified;
  }
  if (typeof item.updatedAt === "string") {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof item.createdAt === "string") {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// Check which items have changed since last sync
export function getChangedItems<T extends { id?: string; lastModified?: number; updatedAt?: string; createdAt?: string }>(
  items: T[],
  lastSyncVersions: Record<string, number>
): T[] {
  return items.filter((item) => {
    if (!item.id) return false;
    const itemModified = getItemLastModified(item as Record<string, unknown>);
    const lastKnownVersion = lastSyncVersions[item.id] ?? 0;
    return itemModified > lastKnownVersion;
  });
}

// Get changed items by comparing with remote versions
export function getDeltaItems<T extends { id?: string }>(
  localItems: T[],
  lastSyncVersions: Record<string, number>
): { changed: T[]; unchanged: T[] } {
  const changed: T[] = [];
  const unchanged: T[] = [];
  
  for (const item of localItems) {
    if (!item.id) {
      unchanged.push(item);
      continue;
    }
    // If item was not previously synced, consider it changed
    if (!(item.id in lastSyncVersions)) {
      changed.push(item);
    } else {
      unchanged.push(item);
    }
  }
  
  return { changed, unchanged };
}

// Build new version map after sync
export function buildVersionMap<T extends { id?: string; lastModified?: number; updatedAt?: string; createdAt?: string }>(
  items: T[],
  existingVersions: Record<string, number>
): Record<string, number> {
  const versions = { ...existingVersions };
  for (const item of items) {
    if (item.id) {
      versions[item.id] = getItemLastModified(item as Record<string, unknown>);
    }
  }
  return versions;
}

export interface CompactionMigrationResult {
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  questionHistoryCount: number;
  mcHistoryCount: number;
  savedSetsCount: number;
}

function getUserSettingsRef(userId: string) {
  return doc(db, "users", userId, "settings", "main");
}

function getHistoryCollectionRef(userId: string, type: "questionHistory" | "mcHistory") {
  return collection(db, "users", userId, type);
}

function getSavedSetsCollectionRef(userId: string) {
  return collection(db, "users", userId, "savedSets");
}

function removeUndefined(obj: unknown): unknown {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleanedValue = removeUndefined(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }
  return obj;
}

const FIRESTORE_OP_TIMEOUT_MS = 60000;
const FIRESTORE_DOC_SAFE_BYTES = 950_000; // Safe limit below Firestore's 1MB max
const CLOUD_COMPACTION_VERSION = 1;

async function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = FIRESTORE_OP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`Timed out while ${label} after ${timeoutMs}ms`));
    }, timeoutMs);

    operation
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

const FIRESTORE_RETRY_MAX_ATTEMPTS = 5;
const FIRESTORE_RETRY_BASE_DELAY_MS = 1000;
const FIRESTORE_RETRY_MAX_DELAY_MS = 30000;

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    "network",
    "timeout",
    "timed out",
    "unavailable",
    "deadline exceeded",
    "internal error",
    "aborted",
    "failed to fetch",
    "fetch failed",
  ];
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxAttempts = FIRESTORE_RETRY_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        break;
      }
      const jitter = Math.random() * 500;
      const exponentialDelay = Math.min(
        FIRESTORE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter,
        FIRESTORE_RETRY_MAX_DELAY_MS,
      );
      console.warn(
        `[Firebase] ${label} failed on attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(exponentialDelay)}ms`,
        error instanceof Error ? error.message : error,
      );
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, exponentialDelay);
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export interface DeltaSyncResult {
  changedItems: string[];
  totalChecked: number;
}

export async function getDeltaSyncData(
  userId: string,
  localData: SyncableData,
): Promise<DeltaSyncResult> {
  const changedItems: string[] = [];
  let totalChecked = 0;

  const checkCollection = async (
    type: "questionHistory" | "mcHistory" | "savedSets",
  ) => {
    const localItems = localData[type] as Record<string, unknown>[];
    if (!localItems?.length) return;

    const collectionRef = type === "savedSets"
      ? getSavedSetsCollectionRef(userId)
      : getHistoryCollectionRef(userId, type);

    const localIdToModified = new Map<string, number>();
    for (const item of localItems) {
      if (typeof item.id === "string") {
        const lastMod = typeof item.lastModified === "number" ? item.lastModified
          : typeof item.updatedAt === "string" ? Date.parse(item.updatedAt)
          : typeof item.createdAt === "string" ? Date.parse(item.createdAt)
          : 0;
        localIdToModified.set(item.id, lastMod);
      }
    }

    const remoteIds = new Set<string>();
    try {
      const snapshot = await withTimeout(
        getDocs(query(collectionRef, limit(500))),
        `checking delta for ${type}`,
        30000,
      );
      snapshot.forEach((doc) => {
        const data = doc.data();
        const remoteId = doc.id;
        remoteIds.add(remoteId);
        totalChecked++;

        const remoteLastMod = typeof data._lastModified === "object" && data._lastModified?.toMillis
          ? data._lastModified.toMillis()
          : typeof data.lastModified === "number" ? data.lastModified
          : 0;

        const localLastMod = localIdToModified.get(remoteId) ?? 0;
        if (remoteLastMod > localLastMod) {
          changedItems.push(`${type}/${remoteId}`);
        }
      });

      for (const [localId] of localIdToModified) {
        if (!remoteIds.has(localId)) {
          changedItems.push(`${type}/${localId}`);
        }
      }
    } catch (error) {
      console.warn(`[Firebase] Delta sync check for ${type} failed:`, error);
    }
  };

  await Promise.all([
    checkCollection("questionHistory"),
    checkCollection("mcHistory"),
    checkCollection("savedSets"),
  ]);

  return { changedItems, totalChecked };
}

function estimateDocSizeBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function clipString(value: unknown, max = 20_000): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.length > max ? value.slice(0, max) : value;
}

function compactSubtopicInstructions(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) continue;
    if (SUBTOPIC_INSTRUCTIONS[trimmedKey] === trimmedValue) continue;
    next[trimmedKey] = trimmedValue;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function expandSubtopicInstructions(raw: unknown): Record<string, string> {
  const merged: Record<string, string> = { ...SUBTOPIC_INSTRUCTIONS };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return merged;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) continue;
    merged[trimmedKey] = trimmedValue;
  }
  return merged;
}

function compactQuestionHistoryEntry(rawItem: Record<string, unknown>): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const markResponse = typeof compacted.markResponse === "object" && compacted.markResponse !== null
    ? (compacted.markResponse as Record<string, unknown>)
    : {};

  return {
    id: compacted.id,
    createdAt: compacted.createdAt,
    lastModified: compacted.lastModified,
    question: compacted.question,
    uploadedAnswer: clipString(compacted.uploadedAnswer, 20_000),
    workedSolutionMarkdown: clipString(compacted.workedSolutionMarkdown, 20_000),
    markResponse: {
      verdict: markResponse.verdict,
      achievedMarks: markResponse.achievedMarks,
      maxMarks: markResponse.maxMarks,
      scoreOutOf10: markResponse.scoreOutOf10,
      vcaaMarkingScheme: markResponse.vcaaMarkingScheme,
      comparisonToSolutionMarkdown: clipString(markResponse.comparisonToSolutionMarkdown, 20_000),
      feedbackMarkdown: clipString(markResponse.feedbackMarkdown, 20_000),
      workedSolutionMarkdown: clipString(markResponse.workedSolutionMarkdown, 20_000),
    },
    generationTelemetry: compacted.generationTelemetry,
    analytics: compacted.analytics,
  };
}

function compactMcHistoryEntry(rawItem: Record<string, unknown>): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const question = typeof compacted.question === "object" && compacted.question !== null
    ? (compacted.question as Record<string, unknown>)
    : null;

  return {
    type: compacted.type,
    id: compacted.id,
    createdAt: compacted.createdAt,
    lastModified: compacted.lastModified,
    question: question
      ? {
          ...question,
          promptMarkdown: clipString(question.promptMarkdown, 20_000),
          explanationMarkdown: clipString(question.explanationMarkdown, 20_000),
        }
      : undefined,
    selectedAnswer: compacted.selectedAnswer,
    correct: compacted.correct,
    awardedMarks: compacted.awardedMarks,
    maxMarks: compacted.maxMarks,
    generationTelemetry: compacted.generationTelemetry,
    analytics: compacted.analytics,
  };
}

function compactSavedSet(rawItem: Record<string, unknown>): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const preferences =
    typeof compacted.preferences === "object" && compacted.preferences !== null
      ? { ...(compacted.preferences as Record<string, unknown>) }
      : undefined;

  if (preferences) {
    const compactInstructions = compactSubtopicInstructions(preferences.subtopicInstructions);
    if (compactInstructions) {
      preferences.subtopicInstructions = compactInstructions;
    } else {
      delete preferences.subtopicInstructions;
    }
  }

  const writtenSession =
    typeof compacted.writtenSession === "object" && compacted.writtenSession !== null
      ? {
          ...(compacted.writtenSession as Record<string, unknown>),
          rawModelOutput: "",
          imagesByQuestionId: {},
          feedbackByQuestionId: {},
        }
      : undefined;

  const mcSession =
    typeof compacted.mcSession === "object" && compacted.mcSession !== null
      ? {
          ...(compacted.mcSession as Record<string, unknown>),
          rawModelOutput: "",
        }
      : undefined;

  return {
    id: compacted.id,
    title: compacted.title,
    questionMode: compacted.questionMode,
    createdAt: compacted.createdAt,
    updatedAt: compacted.updatedAt,
    lastModified: compacted.lastModified,
    preferences,
    writtenSession,
    mcSession,
  };
}

function inflateSavedSet(rawItem: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...rawItem };
  if (typeof copy.preferences === "object" && copy.preferences !== null) {
    const preferences = { ...(copy.preferences as Record<string, unknown>) };
    preferences.subtopicInstructions = expandSubtopicInstructions(preferences.subtopicInstructions);
    copy.preferences = preferences;
  }
  return copy;
}

function prepareSavedSetForFirestore(rawItem: Record<string, unknown>): Record<string, unknown> | null {
  const cleaned = removeUndefined(rawItem) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  const removeRawOutputs = { ...cleaned };
  if (typeof removeRawOutputs.writtenSession === "object" && removeRawOutputs.writtenSession !== null) {
    removeRawOutputs.writtenSession = {
      ...(removeRawOutputs.writtenSession as Record<string, unknown>),
      rawModelOutput: "",
    };
  }
  if (typeof removeRawOutputs.mcSession === "object" && removeRawOutputs.mcSession !== null) {
    removeRawOutputs.mcSession = {
      ...(removeRawOutputs.mcSession as Record<string, unknown>),
      rawModelOutput: "",
    };
  }
  if (estimateDocSizeBytes(removeRawOutputs) <= FIRESTORE_DOC_SAFE_BYTES) {
    return removeRawOutputs;
  }

  const removeImages = { ...removeRawOutputs };
  if (typeof removeImages.writtenSession === "object" && removeImages.writtenSession !== null) {
    removeImages.writtenSession = {
      ...(removeImages.writtenSession as Record<string, unknown>),
      imagesByQuestionId: {},
    };
  }
  if (estimateDocSizeBytes(removeImages) <= FIRESTORE_DOC_SAFE_BYTES) {
    return removeImages;
  }

  const removeFeedback = { ...removeImages };
  if (typeof removeFeedback.writtenSession === "object" && removeFeedback.writtenSession !== null) {
    removeFeedback.writtenSession = {
      ...(removeFeedback.writtenSession as Record<string, unknown>),
      feedbackByQuestionId: {},
    };
  }
  if (estimateDocSizeBytes(removeFeedback) <= FIRESTORE_DOC_SAFE_BYTES) {
    return removeFeedback;
  }

  const metadataOnly = {
    id: removeFeedback.id,
    title: removeFeedback.title,
    questionMode: removeFeedback.questionMode,
    createdAt: removeFeedback.createdAt,
    updatedAt: removeFeedback.updatedAt,
    lastModified: removeFeedback.lastModified,
    preferences: removeFeedback.preferences,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES) {
    return metadataOnly;
  }

  return null;
}

function prepareQuestionHistoryEntryForFirestore(rawItem: Record<string, unknown>): Record<string, unknown> | null {
  const cleaned = removeUndefined(rawItem) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  const withoutImage = { ...cleaned };
  delete withoutImage.uploadedAnswerImage;
  if (estimateDocSizeBytes(withoutImage) <= FIRESTORE_DOC_SAFE_BYTES) {
    return withoutImage;
  }

  const trimmedMarking = { ...withoutImage };
  if (typeof trimmedMarking.markResponse === "object" && trimmedMarking.markResponse !== null) {
    const mr = trimmedMarking.markResponse as Record<string, unknown>;
    trimmedMarking.markResponse = {
      verdict: mr.verdict,
      achievedMarks: mr.achievedMarks,
      maxMarks: mr.maxMarks,
      scoreOutOf10: mr.scoreOutOf10,
      vcaaMarkingScheme: mr.vcaaMarkingScheme,
      comparisonToSolutionMarkdown: "",
      feedbackMarkdown: "",
      workedSolutionMarkdown: "",
    };
  }
  trimmedMarking.workedSolutionMarkdown = "";
  if (typeof trimmedMarking.uploadedAnswer === "string" && trimmedMarking.uploadedAnswer.length > 20_000) {
    trimmedMarking.uploadedAnswer = trimmedMarking.uploadedAnswer.slice(0, 20_000);
  }
  if (estimateDocSizeBytes(trimmedMarking) <= FIRESTORE_DOC_SAFE_BYTES) {
    return trimmedMarking;
  }

  const metadataOnly = {
    id: trimmedMarking.id,
    createdAt: trimmedMarking.createdAt,
    lastModified: trimmedMarking.lastModified,
    question: (() => {
      if (typeof trimmedMarking.question !== "object" || trimmedMarking.question === null) return undefined;
      const q = trimmedMarking.question as Record<string, unknown>;
      return {
        id: q.id,
        topic: q.topic,
        subtopic: q.subtopic,
        maxMarks: q.maxMarks,
        promptMarkdown: typeof q.promptMarkdown === "string" ? q.promptMarkdown.slice(0, 20_000) : "",
      };
    })(),
    uploadedAnswer: typeof trimmedMarking.uploadedAnswer === "string" ? trimmedMarking.uploadedAnswer.slice(0, 20_000) : "",
    markResponse: trimmedMarking.markResponse,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES) {
    return metadataOnly;
  }

  return null;
}

function prepareMcHistoryEntryForFirestore(rawItem: Record<string, unknown>): Record<string, unknown> | null {
  const cleaned = removeUndefined(rawItem) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  const trimmed = { ...cleaned };
  if (typeof trimmed.question === "object" && trimmed.question !== null) {
    const q = trimmed.question as Record<string, unknown>;
    trimmed.question = {
      ...q,
      promptMarkdown: typeof q.promptMarkdown === "string" ? q.promptMarkdown.slice(0, 20_000) : "",
      explanationMarkdown: "",
    };
  }
  if (estimateDocSizeBytes(trimmed) <= FIRESTORE_DOC_SAFE_BYTES) {
    return trimmed;
  }

  const metadataOnly = {
    id: trimmed.id,
    createdAt: trimmed.createdAt,
    lastModified: trimmed.lastModified,
    type: trimmed.type,
    selectedAnswer: trimmed.selectedAnswer,
    correct: trimmed.correct,
    awardedMarks: trimmed.awardedMarks,
    maxMarks: trimmed.maxMarks,
    question: (() => {
      if (typeof trimmed.question !== "object" || trimmed.question === null) return undefined;
      const q = trimmed.question as Record<string, unknown>;
      return {
        id: q.id,
        topic: q.topic,
        subtopic: q.subtopic,
        promptMarkdown: typeof q.promptMarkdown === "string" ? q.promptMarkdown.slice(0, 20_000) : "",
      };
    })(),
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES) {
    return metadataOnly;
  }

  return null;
}

// Optimized batch sizes for better throughput
const BATCH_SIZE_QH = 50;  // Increased from 40
const BATCH_SIZE_MC = 50;   // Increased from 40
const CONCURRENT_SAVESETS_WRITES = 10;  // Increased from 8
const PARALLEL_COLLECTION_SAVES = true; // Save collections in parallel

export interface SaveOptions {
  /** Only save items that have changed since lastSyncVersions */
  deltaSyncVersions?: {
    questionHistory: Record<string, number>;
    mcHistory: Record<string, number>;
    savedSets: Record<string, number>;
  };
  /** Save all data (full sync), ignoring delta check */
  fullSync?: boolean;
}

export async function saveUserData(
  userId: string, 
  data: SyncableData, 
  options: SaveOptions = {}
): Promise<{ totalWrites: number; skippedUnchanged: number; deltaSavings: number }> {
  const { deltaSyncVersions, fullSync = false } = options;
  const startTime = Date.now();
  let totalWrites = 0;
  let skippedUnchanged = 0;
  let deltaSavings = 0;

  // Determine which items need saving based on delta sync
  let questionHistoryToSave = data.questionHistory || [];
  let mcHistoryToSave = data.mcHistory || [];
  let savedSetsToSave = data.savedSets || [];

  if (!fullSync && deltaSyncVersions) {
    const qhChanged = getChangedItems(questionHistoryToSave, deltaSyncVersions.questionHistory);
    const mcChanged = getChangedItems(mcHistoryToSave, deltaSyncVersions.mcHistory);
    const ssChanged = getChangedItems(savedSetsToSave, deltaSyncVersions.savedSets);
    
    skippedUnchanged = (
      (questionHistoryToSave.length - qhChanged.length) +
      (mcHistoryToSave.length - mcChanged.length) +
      (savedSetsToSave.length - ssChanged.length)
    );
    deltaSavings = skippedUnchanged;
    
    questionHistoryToSave = qhChanged;
    mcHistoryToSave = mcChanged;
    savedSetsToSave = ssChanged;
  }

  console.log("[Firebase] saveUserData started", {
    userId,
    fullSync,
    questionHistory: questionHistoryToSave.length,
    mcHistory: mcHistoryToSave.length,
    savedSets: savedSetsToSave.length,
    deltaSavings,
    skippedUnchanged,
  });

  try {
    // Save settings (with retry) — skip when settings are empty to avoid
    // triggering the onSnapshot listener and causing unnecessary reloads.
    const cleanedSettings = removeUndefined(data.settings) as Record<string, unknown>;
    if (Object.keys(cleanedSettings).length > 0) {
      console.log("[Firebase] Saving settings...");
      await withRetry(
        () => withTimeout(
          setDoc(getUserSettingsRef(userId), {
            settings: cleanedSettings,
            _lastModified: serverTimestamp(),
          }, { merge: true }),
          "saving settings"
        ),
        "saving settings"
      );
      totalWrites++;
      console.log("[Firebase] Settings saved");
    }

    // Save goals & streak data
    if (data.studyGoals || data.streakData) {
      console.log("[Firebase] Saving goals data...");
      await saveGoalsData(userId, data.studyGoals ?? {}, data.streakData ?? {});
      totalWrites++;
      console.log("[Firebase] Goals data saved");
    }

    // Save all collections in parallel for better performance
    const savePromises: Promise<void>[] = [];

    // Save question history
    if (questionHistoryToSave.length > 0) {
      const saveQhPromise = (async () => {
        console.log("[Firebase] Saving questionHistory:", questionHistoryToSave.length, "items");
        const historyRef = getHistoryCollectionRef(userId, "questionHistory");
        let skippedQuestionHistory = 0;
        
        // Process in batches with parallel execution
        const batches: Array<Promise<void>> = [];
        for (let i = 0; i < questionHistoryToSave.length; i += BATCH_SIZE_QH) {
          const batchItems = questionHistoryToSave.slice(i, i + BATCH_SIZE_QH);
          const batchNum = Math.floor(i / BATCH_SIZE_QH) + 1;
          
          batches.push(
            (async () => {
              const batch = writeBatch(db);
              let batchWrites = 0;
              
              for (const item of batchItems) {
                if (!item.id) continue;
                const docRef = doc(historyRef, item.id as string);
                const compacted = compactQuestionHistoryEntry(item);
                const prepared = prepareQuestionHistoryEntryForFirestore(compacted);
                if (!prepared) {
                  skippedQuestionHistory++;
                  console.warn(`[Firebase] Skipping oversize questionHistory entry ${String(item.id)}`);
                  continue;
                }
                batch.set(docRef, { ...prepared, _lastModified: serverTimestamp() });
                batchWrites++;
              }
              
              if (batchWrites > 0) {
                await withRetry(
                  () => withTimeout(batch.commit(), `committing questionHistory batch ${batchNum}`),
                  `questionHistory batch ${batchNum}`
                );
                totalWrites += batchWrites;
              }
              console.log(`[Firebase] questionHistory batch ${batchNum} committed (${Math.min(i + BATCH_SIZE_QH, questionHistoryToSave.length)}/${questionHistoryToSave.length})`);
            })()
          );
        }
        
        await Promise.all(batches);
        console.log("[Firebase] questionHistory saved", { skippedQuestionHistory, batchCount: batches.length });
      })();
      savePromises.push(saveQhPromise);
    }

    // Save mc history
    if (mcHistoryToSave.length > 0) {
      const saveMcPromise = (async () => {
        console.log("[Firebase] Saving mcHistory:", mcHistoryToSave.length, "items");
        const historyRef = getHistoryCollectionRef(userId, "mcHistory");
        let skippedMcHistory = 0;
        
        const batches: Array<Promise<void>> = [];
        for (let i = 0; i < mcHistoryToSave.length; i += BATCH_SIZE_MC) {
          const batchItems = mcHistoryToSave.slice(i, i + BATCH_SIZE_MC);
          const batchNum = Math.floor(i / BATCH_SIZE_MC) + 1;
          
          batches.push(
            (async () => {
              const batch = writeBatch(db);
              let batchWrites = 0;
              
              for (const item of batchItems) {
                if (!item.id) continue;
                const docRef = doc(historyRef, item.id as string);
                const compacted = compactMcHistoryEntry(item);
                const prepared = prepareMcHistoryEntryForFirestore(compacted);
                if (!prepared) {
                  skippedMcHistory++;
                  console.warn(`[Firebase] Skipping oversize mcHistory entry ${String(item.id)}`);
                  continue;
                }
                batch.set(docRef, { ...prepared, _lastModified: serverTimestamp() });
                batchWrites++;
              }
              
              if (batchWrites > 0) {
                await withRetry(
                  () => withTimeout(batch.commit(), `committing mcHistory batch ${batchNum}`),
                  `mcHistory batch ${batchNum}`
                );
                totalWrites += batchWrites;
              }
              console.log(`[Firebase] mcHistory batch ${batchNum} committed (${Math.min(i + BATCH_SIZE_MC, mcHistoryToSave.length)}/${mcHistoryToSave.length})`);
            })()
          );
        }
        
        await Promise.all(batches);
        console.log("[Firebase] mcHistory saved", { skippedMcHistory, batchCount: batches.length });
      })();
      savePromises.push(saveMcPromise);
    }

    // Save saved sets with parallel writes
    if (savedSetsToSave.length > 0) {
      const saveSsPromise = (async () => {
        console.log("[Firebase] Saving savedSets:", savedSetsToSave.length, "items");
        const savedSetsRef = getSavedSetsCollectionRef(userId);
        let skippedSavedSets = 0;

        const pendingWrites: Array<{ id: string; payload: Record<string, unknown> }> = [];
        for (const item of savedSetsToSave) {
          if (!item.id) continue;
          const compacted = compactSavedSet(item);
          const prepared = prepareSavedSetForFirestore(compacted);
          if (!prepared) {
            skippedSavedSets++;
            console.warn(`[Firebase] Skipping oversize savedSet ${String(item.id)}`);
            continue;
          }
          pendingWrites.push({ id: String(item.id), payload: prepared });
        }

        // Process in parallel chunks
        const chunks: Array<Promise<void>> = [];
        for (let i = 0; i < pendingWrites.length; i += CONCURRENT_SAVESETS_WRITES) {
          const chunk = pendingWrites.slice(i, i + CONCURRENT_SAVESETS_WRITES);
          chunks.push(
            Promise.all(
              chunk.map(async ({ id, payload }) => {
                const docRef = doc(savedSetsRef, id);
                await withRetry(
                  () =>
                    withTimeout(
                      setDoc(docRef, { ...payload, _lastModified: serverTimestamp() }),
                      `saving savedSet ${id}`,
                      FIRESTORE_OP_TIMEOUT_MS
                    ),
                  `saving savedSet ${id}`
                );
                totalWrites++;
              })
            ).then(() => {
              console.log(`[Firebase] savedSets chunk completed (${Math.min(i + CONCURRENT_SAVESETS_WRITES, pendingWrites.length)}/${pendingWrites.length})`);
            })
          );
        }
        
        await Promise.all(chunks);
        console.log("[Firebase] savedSets saved", { skippedSavedSets, chunkCount: chunks.length });
      })();
      savePromises.push(saveSsPromise);
    }

    // Execute all saves in parallel
    if (PARALLEL_COLLECTION_SAVES && savePromises.length > 0) {
      await Promise.all(savePromises);
    }

    const elapsed = Date.now() - startTime;
    console.log("[Firebase] saveUserData completed", {
      userId,
      totalWrites,
      deltaSavings,
      skippedUnchanged,
      elapsedMs: elapsed,
      elapsedSec: (elapsed / 1000).toFixed(2),
    });

    return { totalWrites, skippedUnchanged, deltaSavings };
  } catch (error) {
    console.error("[Firebase] saveUserData error:", error);
    throw error;
  }
}

export async function loadUserData(userId: string): Promise<SyncableData | null> {
  console.log("[Firebase] loadUserData started for:", userId);
  const startTime = Date.now();

  const settingsRef = getUserSettingsRef(userId);
  const settingsSnapshot = await withTimeout(getDoc(settingsRef), "loading settings");
  
  const result: SyncableData = {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  };
  
  if (settingsSnapshot.exists()) {
    const data = settingsSnapshot.data();
    result.settings = data.settings || {};
    console.log("[Firebase] Settings loaded");
  }
  
  // Load all collections in parallel for better performance
  const [qhSnapshot, mchSnapshot, ssSnapshot, goalsResult] = await Promise.all([
    withTimeout(
      getDocs(query(getHistoryCollectionRef(userId, "questionHistory"), orderBy("createdAt", "desc"), limit(500))),
      "loading questionHistory"
    ),
    withTimeout(
      getDocs(query(getHistoryCollectionRef(userId, "mcHistory"), orderBy("createdAt", "desc"), limit(500))),
      "loading mcHistory"
    ),
    withTimeout(
      getDocs(query(getSavedSetsCollectionRef(userId), orderBy("updatedAt", "desc"), limit(100))),
      "loading savedSets"
    ),
    loadGoalsData(userId).catch(() => ({ studyGoals: null, streakData: null })),
  ]);
  
  qhSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.questionHistory.push(data);
  });
  console.log("[Firebase] questionHistory loaded:", result.questionHistory.length);
  
  mchSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.mcHistory.push(data);
  });
  console.log("[Firebase] mcHistory loaded:", result.mcHistory.length);
  
  ssSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.savedSets.push(inflateSavedSet(data));
  });
  console.log("[Firebase] savedSets loaded:", result.savedSets.length);

  if (goalsResult.studyGoals) result.studyGoals = goalsResult.studyGoals;
  if (goalsResult.streakData) result.streakData = goalsResult.streakData;
  console.log("[Firebase] goals data loaded:", { hasStudyGoals: !!goalsResult.studyGoals, hasStreakData: !!goalsResult.streakData });

  const elapsed = Date.now() - startTime;
  console.log("[Firebase] loadUserData completed", {
    userId,
    elapsedMs: elapsed,
    elapsedSec: (elapsed / 1000).toFixed(2),
    totalDocs: result.questionHistory.length + result.mcHistory.length + result.savedSets.length
  });
  
  return result;
}

// Load specific changed items by IDs (for delta sync)
export async function loadChangedItems(
  userId: string,
  changedItemIds: { questionHistory?: string[]; mcHistory?: string[]; savedSets?: string[] }
): Promise<{
  questionHistory: Record<string, unknown>[];
  mcHistory: Record<string, unknown>[];
  savedSets: Record<string, unknown>[];
}> {
  const result = {
    questionHistory: [] as Record<string, unknown>[],
    mcHistory: [] as Record<string, unknown>[],
    savedSets: [] as Record<string, unknown>[],
  };

  const loadPromises: Promise<void>[] = [];

  if (changedItemIds.questionHistory?.length) {
    loadPromises.push(
      (async () => {
        const qhRef = getHistoryCollectionRef(userId, "questionHistory");
        const loadPromises = changedItemIds.questionHistory!.map(async (id) => {
          const docRef = doc(qhRef, id);
          const docSnap = await withTimeout(getDoc(docRef), `loading questionHistory ${id}`);
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.questionHistory.push(data);
          }
        });
        await Promise.all(loadPromises);
        console.log(`[Firebase] Loaded ${result.questionHistory.length} changed questionHistory items`);
      })()
    );
  }

  if (changedItemIds.mcHistory?.length) {
    loadPromises.push(
      (async () => {
        const mchRef = getHistoryCollectionRef(userId, "mcHistory");
        const loadPromises = changedItemIds.mcHistory!.map(async (id) => {
          const docRef = doc(mchRef, id);
          const docSnap = await withTimeout(getDoc(docRef), `loading mcHistory ${id}`);
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.mcHistory.push(data);
          }
        });
        await Promise.all(loadPromises);
        console.log(`[Firebase] Loaded ${result.mcHistory.length} changed mcHistory items`);
      })()
    );
  }

  if (changedItemIds.savedSets?.length) {
    loadPromises.push(
      (async () => {
        const ssRef = getSavedSetsCollectionRef(userId);
        const loadPromises = changedItemIds.savedSets!.map(async (id) => {
          const docRef = doc(ssRef, id);
          const docSnap = await withTimeout(getDoc(docRef), `loading savedSet ${id}`);
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.savedSets.push(inflateSavedSet(data));
          }
        });
        await Promise.all(loadPromises);
        console.log(`[Firebase] Loaded ${result.savedSets.length} changed savedSets items`);
      })()
    );
  }

  await Promise.all(loadPromises);
  return result;
}

export async function migrateUserDataForCompaction(
  userId: string,
  preloadedRemoteData?: SyncableData | null,
): Promise<CompactionMigrationResult> {
  const settingsRef = getUserSettingsRef(userId);
  const settingsSnapshot = await withTimeout(
    getDoc(settingsRef),
    "loading settings for compaction migration",
  );

  const rawVersion = settingsSnapshot.exists() ? settingsSnapshot.data()?._syncCompactionVersion : undefined;
  const fromVersion = typeof rawVersion === "number" && Number.isFinite(rawVersion) ? rawVersion : 0;
  if (fromVersion >= CLOUD_COMPACTION_VERSION) {
    return {
      migrated: false,
      fromVersion,
      toVersion: fromVersion,
      questionHistoryCount: 0,
      mcHistoryCount: 0,
      savedSetsCount: 0,
    };
  }

  console.log("[Firebase] Running one-time cloud compaction migration", {
    userId,
    fromVersion,
    toVersion: CLOUD_COMPACTION_VERSION,
  });

  const remoteData = preloadedRemoteData ?? await loadUserData(userId);
  const rewritePayload: SyncableData = remoteData ?? {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  };

  await saveUserData(userId, rewritePayload);
  await withTimeout(
    setDoc(
      settingsRef,
      {
        _syncCompactionVersion: CLOUD_COMPACTION_VERSION,
        _lastModified: serverTimestamp(),
      },
      { merge: true },
    ),
    "saving compaction migration marker",
  );

  console.log("[Firebase] Cloud compaction migration complete", {
    userId,
    fromVersion,
    toVersion: CLOUD_COMPACTION_VERSION,
    questionHistory: rewritePayload.questionHistory.length,
    mcHistory: rewritePayload.mcHistory.length,
    savedSets: rewritePayload.savedSets.length,
  });

  return {
    migrated: true,
    fromVersion,
    toVersion: CLOUD_COMPACTION_VERSION,
    questionHistoryCount: rewritePayload.questionHistory.length,
    mcHistoryCount: rewritePayload.mcHistory.length,
    savedSetsCount: rewritePayload.savedSets.length,
  };
}

export async function deleteArchivedItems(
  userId: string,
  type: "questionHistory" | "mcHistory",
  keepIds: Set<string>,
): Promise<number> {
  const collectionRef = getHistoryCollectionRef(userId, type);
  let deleted = 0;
  try {
    const snapshot = await withTimeout(
      getDocs(query(collectionRef, limit(500))),
      `loading ${type} for archiving`,
    );
    const batch = writeBatch(db);
    let batchSize = 0;
    for (const docSnap of snapshot.docs) {
      if (!keepIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
        batchSize++;
        deleted++;
        if (batchSize >= 400) {
          await withRetry(
            () => withTimeout(batch.commit(), `archiving ${type} batch`),
            `archiving ${type}`,
          );
          break;
        }
      }
    }
    if (batchSize > 0 && batchSize < 400) {
      await withRetry(
        () => withTimeout(batch.commit(), `archiving ${type} batch`),
        `archiving ${type}`,
      );
    }
  } catch (error) {
    console.warn(`[Firebase] Failed to archive old ${type} items:`, error);
  }
  return deleted;
}

export function subscribeToUserData(
  userId: string,
  callback: (data: SyncableData | null) => void,
  getLocalData?: () => SyncableData | null
): () => void {
  let isRefreshing = false;
  let refreshQueued = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refresh = async (reason: string) => {
    if (isRefreshing) {
      refreshQueued = true;
      return;
    }
    isRefreshing = true;
    try {
      console.log(`[Firebase] Remote refresh triggered by ${reason}`);

      if (getLocalData) {
        const localData = getLocalData();
        if (localData) {
          console.log("[Firebase] Running delta sync check...");
          const deltaResult = await getDeltaSyncData(userId, localData);
          console.log("[Firebase] Delta sync result:", {
            changedItems: deltaResult.changedItems.length,
            totalChecked: deltaResult.totalChecked,
          });

          if (deltaResult.changedItems.length === 0) {
            console.log("[Firebase] No changes detected, skipping full load");
            isRefreshing = false;
            if (refreshQueued) {
              refreshQueued = false;
              void refresh("queued");
            }
            return;
          }
          console.log("[Firebase] Changes detected, loading full data");
        }
      }

      const data = await loadUserData(userId);
      callback(data);
    } catch (error) {
      console.error("[Firebase] subscribeToUserData refresh failed:", error);
    } finally {
      isRefreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refresh("queued");
      }
    }
  };

  void refresh("initial");

  const POLL_INTERVAL_MS = 300_000; // 5 minutes instead of 30s
  const pollTimer = setInterval(() => {
    void refresh("poll");
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(pollTimer);
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}
