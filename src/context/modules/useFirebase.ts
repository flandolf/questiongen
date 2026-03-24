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
  onSnapshot, 
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../../firebaseConfig";
import { SUBTOPIC_INSTRUCTIONS } from "../../types";

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
const FIRESTORE_DOC_MAX_BYTES = 1_048_576;
const FIRESTORE_DOC_SAFE_BYTES = 950_000;
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

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      console.warn(`[Firebase] ${label} failed on attempt ${attempt}, retrying...`, error);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, attempt * 750);
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
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

export async function saveUserData(userId: string, data: SyncableData): Promise<void> {
  console.log("[Firebase] saveUserData started", {
    userId,
    settings: !!data.settings,
    questionHistory: data.questionHistory?.length,
    mcHistory: data.mcHistory?.length,
    savedSets: data.savedSets?.length,
  });

  const startTime = Date.now();
  let totalWrites = 0;

  try {
    // Save settings
    console.log("[Firebase] Saving settings...");
    const cleanedSettings = removeUndefined(data.settings) as Record<string, unknown>;
    await withTimeout(
      setDoc(getUserSettingsRef(userId), {
      settings: cleanedSettings,
      _lastModified: serverTimestamp(),
      }, { merge: true }),
      "saving settings"
    );
    totalWrites++;
    console.log("[Firebase] Settings saved");

    // Save question history - use parallel writes instead of batch
    if (data.questionHistory && data.questionHistory.length > 0) {
      console.log("[Firebase] Saving questionHistory:", data.questionHistory.length, "items");
      const historyRef = getHistoryCollectionRef(userId, "questionHistory");
      let skippedQuestionHistory = 0;
      
      const batchSize = 20;
      for (let i = 0; i < data.questionHistory.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchItems = data.questionHistory.slice(i, i + batchSize);
        
        for (const item of batchItems) {
          if (!item.id) continue;
          const docRef = doc(historyRef, item.id as string);
          const compacted = compactQuestionHistoryEntry(item);
          const prepared = prepareQuestionHistoryEntryForFirestore(compacted);
          if (!prepared) {
            skippedQuestionHistory += 1;
            console.warn(`[Firebase] Skipping oversize questionHistory entry ${String(item.id)} (cannot fit under ${FIRESTORE_DOC_MAX_BYTES} bytes even after pruning)`);
            continue;
          }
          batch.set(docRef, { ...prepared, _lastModified: serverTimestamp() });
          totalWrites++;
        }
        
        await withTimeout(batch.commit(), `committing questionHistory batch ${Math.floor(i / batchSize) + 1}`);
        console.log(`[Firebase] questionHistory batch ${Math.floor(i/batchSize) + 1} committed (${Math.min(i+batchSize, data.questionHistory.length)}/${data.questionHistory.length})`);
      }
      console.log("[Firebase] questionHistory saved", { skippedQuestionHistory });
    }

    // Save mc history
    if (data.mcHistory && data.mcHistory.length > 0) {
      console.log("[Firebase] Saving mcHistory:", data.mcHistory.length, "items");
      const historyRef = getHistoryCollectionRef(userId, "mcHistory");
      let skippedMcHistory = 0;
      
      const batchSize = 20;
      for (let i = 0; i < data.mcHistory.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchItems = data.mcHistory.slice(i, i + batchSize);
        
        for (const item of batchItems) {
          if (!item.id) continue;
          const docRef = doc(historyRef, item.id as string);
          const compacted = compactMcHistoryEntry(item);
          const prepared = prepareMcHistoryEntryForFirestore(compacted);
          if (!prepared) {
            skippedMcHistory += 1;
            console.warn(`[Firebase] Skipping oversize mcHistory entry ${String(item.id)} (cannot fit under ${FIRESTORE_DOC_MAX_BYTES} bytes even after pruning)`);
            continue;
          }
          batch.set(docRef, { ...prepared, _lastModified: serverTimestamp() });
          totalWrites++;
        }
        
        await withTimeout(batch.commit(), `committing mcHistory batch ${Math.floor(i / batchSize) + 1}`);
        console.log(`[Firebase] mcHistory batch ${Math.floor(i/batchSize) + 1} committed (${Math.min(i+batchSize, data.mcHistory.length)}/${data.mcHistory.length})`);
      }
      console.log("[Firebase] mcHistory saved", { skippedMcHistory });
    }

    // Save saved sets
    if (data.savedSets && data.savedSets.length > 0) {
      console.log("[Firebase] Saving savedSets:", data.savedSets.length, "items");
      const savedSetsRef = getSavedSetsCollectionRef(userId);
      let skippedSavedSets = 0;

      const pendingWrites: Array<{ id: string; payload: Record<string, unknown> }> = [];
      for (const item of data.savedSets) {
        if (!item.id) continue;
        const compacted = compactSavedSet(item);
        const prepared = prepareSavedSetForFirestore(compacted);
        if (!prepared) {
          skippedSavedSets += 1;
          console.warn(`[Firebase] Skipping oversize savedSet ${String(item.id)} (cannot fit under ${FIRESTORE_DOC_MAX_BYTES} bytes even after pruning)`);
          continue;
        }
        pendingWrites.push({ id: String(item.id), payload: prepared });
      }

      const writeConcurrency = 4;
      for (let i = 0; i < pendingWrites.length; i += writeConcurrency) {
        const chunk = pendingWrites.slice(i, i + writeConcurrency);
        await Promise.all(
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
        );
        console.log(`[Firebase] savedSets writes completed (${Math.min(i + writeConcurrency, pendingWrites.length)}/${pendingWrites.length})`);
      }
      console.log("[Firebase] savedSets saved", { skippedSavedSets });
    }

    const elapsed = Date.now() - startTime;
    console.log("[Firebase] saveUserData completed", {
      userId,
      totalWrites,
      elapsedMs: elapsed,
      elapsedSec: (elapsed / 1000).toFixed(2)
    });
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
  
  // Load question history
  const qhRef = getHistoryCollectionRef(userId, "questionHistory");
  const qhQ = query(qhRef, orderBy("createdAt", "desc"), limit(500));
  const qhSnapshot = await withTimeout(getDocs(qhQ), "loading questionHistory");
  qhSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.questionHistory.push(data);
  });
  console.log("[Firebase] questionHistory loaded:", result.questionHistory.length);
  
  // Load mc history
  const mchRef = getHistoryCollectionRef(userId, "mcHistory");
  const mchQ = query(mchRef, orderBy("createdAt", "desc"), limit(500));
  const mchSnapshot = await withTimeout(getDocs(mchQ), "loading mcHistory");
  mchSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.mcHistory.push(data);
  });
  console.log("[Firebase] mcHistory loaded:", result.mcHistory.length);
  
  // Load saved sets
  const ssRef = getSavedSetsCollectionRef(userId);
  const ssQ = query(ssRef, orderBy("updatedAt", "desc"), limit(100));
  const ssSnapshot = await withTimeout(getDocs(ssQ), "loading savedSets");
  ssSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.savedSets.push(inflateSavedSet(data));
  });
  console.log("[Firebase] savedSets loaded:", result.savedSets.length);
  
  const elapsed = Date.now() - startTime;
  console.log("[Firebase] loadUserData completed", {
    userId,
    elapsedMs: elapsed,
    elapsedSec: (elapsed / 1000).toFixed(2),
    totalDocs: result.questionHistory.length + result.mcHistory.length + result.savedSets.length
  });
  
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

export function subscribeToUserData(
  userId: string,
  callback: (data: SyncableData | null) => void
): () => void {
  const settingsRef = getUserSettingsRef(userId);

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

  const scheduleRefresh = (reason: string) => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh(reason);
    }, 350);
  };

  const unsubscribeSettings = onSnapshot(settingsRef, () => {
    scheduleRefresh("settings");
  });

  return () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    unsubscribeSettings();
  };
}
