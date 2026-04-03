import {
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  setDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import { db } from './firebase-init';
import { type Preset } from '@/types';
import { getDayKey } from '@/lib/utils';

export interface SyncableData {
  settings: Record<string, unknown>;
  questionHistory: Record<string, unknown>[];
  mcHistory: Record<string, unknown>[];
  savedSets: Record<string, unknown>[];
  presets?: Preset[];
  studyGoals?: Record<string, unknown>;
  streakData?: Record<string, unknown>;
}

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
  return {
    ...DEFAULT_SYNC_METADATA,
    lastSyncVersions: { questionHistory: {}, mcHistory: {}, savedSets: {} },
  };
}

function getItemLastModified(item: Record<string, unknown>): number {
  if (
    typeof item.lastModified === 'number' &&
    Number.isFinite(item.lastModified)
  ) {
    return item.lastModified;
  }
  if (typeof item.updatedAt === 'string') {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof item.createdAt === 'string') {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function getChangedItems<
  T extends {
    id?: string;
    lastModified?: number;
    updatedAt?: string;
    createdAt?: string;
  },
>(items: T[], lastSyncVersions: Record<string, number>): T[] {
  return items.filter((item) => {
    if (!item.id) return false;
    const itemModified = getItemLastModified(item as Record<string, unknown>);
    const lastKnownVersion = lastSyncVersions[item.id] ?? 0;
    return itemModified > lastKnownVersion;
  });
}

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
    if (!(item.id in lastSyncVersions)) {
      changed.push(item);
    } else {
      unchanged.push(item);
    }
  }

  return { changed, unchanged };
}

export function buildVersionMap<
  T extends {
    id?: string;
    lastModified?: number;
    updatedAt?: string;
    createdAt?: string;
  },
>(
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
  return doc(db, 'users', userId, 'settings', 'main');
}

function getUserPresetsRef(userId: string) {
  return doc(db, 'users', userId, 'settings', 'presets');
}

function getHistoryCollectionRef(
  userId: string,
  type: 'questionHistory' | 'mcHistory'
) {
  return collection(db, 'users', userId, type);
}

function getSavedSetsCollectionRef(userId: string) {
  return collection(db, 'users', userId, 'savedSets');
}

function removeUndefined(obj: unknown): unknown {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (typeof obj === 'object') {
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
const FIRESTORE_DOC_SAFE_BYTES = 950_000;
const CLOUD_COMPACTION_VERSION = 1;

async function withTimeout<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = FIRESTORE_OP_TIMEOUT_MS
): Promise<T> {
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
    'network',
    'timeout',
    'timed out',
    'unavailable',
    'deadline exceeded',
    'internal error',
    'aborted',
    'failed to fetch',
    'fetch failed',
  ];
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxAttempts = FIRESTORE_RETRY_MAX_ATTEMPTS
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
        FIRESTORE_RETRY_MAX_DELAY_MS
      );
      console.warn(
        `[Firebase] ${label} failed on attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(exponentialDelay)}ms`,
        error instanceof Error ? error.message : error
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
  hasSettingsChanges: boolean;
}

export interface RemoteHistoryCounts {
  questionHistory: number;
  mcHistory: number;
}

function normalizePresetsForCompare(presets: Preset[]): Preset[] {
  return [...presets]
    .filter((preset) => typeof preset?.id === 'string' && preset.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function stripMetaFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripMetaFields);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    // Meta fields to skip: Firestore server timestamps, preset timestamps
    const metaFieldsToSkip = new Set([
      '_lastModified',
      'lastModified',
      'createdAt',
      'updatedAt',
    ]);
    for (const key of Object.keys(record)) {
      if (metaFieldsToSkip.has(key)) continue;
      const next = stripMetaFields(record[key]);
      if (next !== undefined) cleaned[key] = next;
    }
    return cleaned;
  }
  return value;
}

function toCanonicalJson(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(canonicalize);
    }
    if (input && typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      const sorted = Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = canonicalize(obj[key]);
          return acc;
        }, {});
      return sorted;
    }
    return input;
  };
  return JSON.stringify(canonicalize(value));
}

export async function isRemotePresetsArrayDifferent(
  userId: string,
  localPresets: Preset[]
): Promise<boolean> {
  const snap = await withTimeout(
    getDoc(getUserPresetsRef(userId)),
    'loading settings/presets',
    15000
  );
  const remotePresets = snap.exists()
    ? ((snap.data().presets as Preset[] | undefined) ?? [])
    : [];
  const localComparable = stripMetaFields(
    removeUndefined(normalizePresetsForCompare(localPresets))
  );
  const remoteComparable = stripMetaFields(
    removeUndefined(normalizePresetsForCompare(remotePresets))
  );
  const localJson = toCanonicalJson(localComparable);
  const remoteJson = toCanonicalJson(remoteComparable);
  if (localJson !== remoteJson) {
    console.log('[Presets diff] Mismatch detected');
    console.log('[Presets diff] local:', localJson.slice(0, 1000));
    console.log('[Presets diff] remote:', remoteJson.slice(0, 1000));
  }
  return localJson !== remoteJson;
}

export async function getRemoteHistoryCounts(
  userId: string
): Promise<RemoteHistoryCounts> {
  const [qhCountSnap, mcCountSnap] = await Promise.all([
    withTimeout(
      getCountFromServer(getHistoryCollectionRef(userId, 'questionHistory')),
      'counting remote questionHistory',
      15000
    ),
    withTimeout(
      getCountFromServer(getHistoryCollectionRef(userId, 'mcHistory')),
      'counting remote mcHistory',
      15000
    ),
  ]);

  return {
    questionHistory: qhCountSnap.data().count,
    mcHistory: mcCountSnap.data().count,
  };
}

export async function getDeltaSyncData(
  userId: string,
  localData: SyncableData
): Promise<DeltaSyncResult> {
  const changedItems: string[] = [];
  let totalChecked = 0;
  let hasSettingsChanges = false;

  const checkCollection = async (
    type: 'questionHistory' | 'mcHistory' | 'savedSets'
  ) => {
    const localItems = localData[type] as Record<string, unknown>[];

    const collectionRef =
      type === 'savedSets'
        ? getSavedSetsCollectionRef(userId)
        : getHistoryCollectionRef(userId, type);

    const localIdToModified = new Map<string, number>();
    for (const item of localItems ?? []) {
      if (typeof item.id === 'string') {
        const lastMod =
          typeof item.lastModified === 'number'
            ? item.lastModified
            : typeof item.updatedAt === 'string'
              ? Date.parse(item.updatedAt)
              : typeof item.createdAt === 'string'
                ? Date.parse(item.createdAt)
                : 0;
        localIdToModified.set(item.id, lastMod);
      }
    }

    const remoteIds = new Set<string>();
    try {
      const snapshot = await withTimeout(
        getDocs(query(collectionRef, limit(500))),
        `checking delta for ${type}`,
        30000
      );
      snapshot.forEach((doc) => {
        const data = doc.data();
        const remoteId = doc.id;
        remoteIds.add(remoteId);
        totalChecked++;

        const remoteLastMod =
          typeof data._lastModified === 'object' && data._lastModified?.toMillis
            ? data._lastModified.toMillis()
            : typeof data.lastModified === 'number'
              ? data.lastModified
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
    checkCollection('questionHistory'),
    checkCollection('mcHistory'),
    checkCollection('savedSets'),
  ]);

  // Settings docs are stored in users/{uid}/settings/* (main, goals), and
  // presets are stored in users/{uid}/presets/*.
  try {
    const [mainSnap, goalsDoc, presetsDoc] = await Promise.all([
      withTimeout(
        getDoc(getUserSettingsRef(userId)),
        'checking settings/main',
        15000
      ),
      withTimeout(
        getDoc(doc(db, 'users', userId, 'settings', 'goals')),
        'checking settings/goals',
        15000
      ),
      withTimeout(
        getDoc(getUserPresetsRef(userId)),
        'checking settings/presets',
        15000
      ),
    ]);

    totalChecked += 2;
    if (mainSnap.exists()) {
      const remoteMain = mainSnap.data();
      const remoteSettings = toCanonicalJson(
        stripMetaFields(removeUndefined(remoteMain.settings ?? {}))
      );
      const localSettings = toCanonicalJson(
        stripMetaFields(removeUndefined(localData.settings ?? {}))
      );
      if (remoteSettings !== localSettings) {
        changedItems.push('settings/main');
        hasSettingsChanges = true;
      }
    } else if (Object.keys(localData.settings ?? {}).length > 0) {
      changedItems.push('settings/main');
      hasSettingsChanges = true;
    }

    if (goalsDoc.exists()) {
      const data = goalsDoc.data();
      const remoteGoals = toCanonicalJson(
        stripMetaFields(removeUndefined(data.studyGoals ?? {}))
      );
      const remoteStreak = toCanonicalJson(
        stripMetaFields(removeUndefined(data.streakData ?? {}))
      );
      const localGoals = toCanonicalJson(
        stripMetaFields(removeUndefined(localData.studyGoals ?? {}))
      );
      const localStreak = toCanonicalJson(
        stripMetaFields(removeUndefined(localData.streakData ?? {}))
      );
      if (remoteGoals !== localGoals || remoteStreak !== localStreak) {
        changedItems.push('settings/goals');
        hasSettingsChanges = true;
      }
    } else if (localData.studyGoals || localData.streakData) {
      changedItems.push('settings/goals');
      hasSettingsChanges = true;
    }

    totalChecked += 1;
    const localPresetsComparable = toCanonicalJson(
      stripMetaFields(
        removeUndefined(normalizePresetsForCompare(localData.presets ?? []))
      )
    );
    const remotePresetsComparable = toCanonicalJson(
      stripMetaFields(
        removeUndefined(
          normalizePresetsForCompare(
            presetsDoc.exists()
              ? ((presetsDoc.data().presets as Preset[] | undefined) ?? [])
              : []
          )
        )
      )
    );
    const hasPresetChanges = localPresetsComparable !== remotePresetsComparable;
    if (hasPresetChanges) {
      console.log('[Presets diff] getDeltaSyncData mismatch detected');
      console.log(
        '[Presets diff] local:',
        localPresetsComparable.slice(0, 1000)
      );
      console.log(
        '[Presets diff] remote:',
        remotePresetsComparable.slice(0, 1000)
      );
      hasSettingsChanges = true;
      changedItems.push('settings/presets');
    }
  } catch (error) {
    console.warn(
      '[Firebase] Delta sync check for settings/presets failed:',
      error
    );
  }

  return { changedItems, totalChecked, hasSettingsChanges };
}

function estimateDocSizeBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function clipString(value: unknown, max = 20_000): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > max ? value.slice(0, max) : value;
}

function compactQuestionHistoryEntry(
  rawItem: Record<string, unknown>
): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const markResponse =
    typeof compacted.markResponse === 'object' &&
    compacted.markResponse !== null
      ? (compacted.markResponse as Record<string, unknown>)
      : {};

  return {
    id: compacted.id,
    createdAt: compacted.createdAt,
    lastModified: compacted.lastModified,
    question: compacted.question,
    uploadedAnswer: clipString(compacted.uploadedAnswer, 20_000),
    workedSolutionMarkdown: clipString(
      compacted.workedSolutionMarkdown,
      20_000
    ),
    markResponse: {
      verdict: markResponse.verdict,
      achievedMarks: markResponse.achievedMarks,
      maxMarks: markResponse.maxMarks,
      scoreOutOf10: markResponse.scoreOutOf10,
      vcaaMarkingScheme: markResponse.vcaaMarkingScheme,
      comparisonToSolutionMarkdown: clipString(
        markResponse.comparisonToSolutionMarkdown,
        20_000
      ),
      feedbackMarkdown: clipString(markResponse.feedbackMarkdown, 20_000),
      workedSolutionMarkdown: clipString(
        markResponse.workedSolutionMarkdown,
        20_000
      ),
    },
    generationTelemetry: compacted.generationTelemetry,
    analytics: compacted.analytics,
  };
}

function compactMcHistoryEntry(
  rawItem: Record<string, unknown>
): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const question =
    typeof compacted.question === 'object' && compacted.question !== null
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

function compactSavedSet(
  rawItem: Record<string, unknown>
): Record<string, unknown> {
  const compacted = removeUndefined(rawItem) as Record<string, unknown>;
  const preferences =
    typeof compacted.preferences === 'object' && compacted.preferences !== null
      ? { ...(compacted.preferences as Record<string, unknown>) }
      : undefined;

  if (preferences) {
    delete preferences.subtopicInstructions;
  }

  const writtenSession =
    typeof compacted.writtenSession === 'object' &&
    compacted.writtenSession !== null
      ? {
          ...(compacted.writtenSession as Record<string, unknown>),
          rawModelOutput: '',
          imagesByQuestionId: {},
          feedbackByQuestionId: {},
        }
      : undefined;

  const mcSession =
    typeof compacted.mcSession === 'object' && compacted.mcSession !== null
      ? {
          ...(compacted.mcSession as Record<string, unknown>),
          rawModelOutput: '',
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

function inflateSavedSet(
  rawItem: Record<string, unknown>
): Record<string, unknown> {
  const copy = { ...rawItem };
  if (typeof copy.preferences === 'object' && copy.preferences !== null) {
    const preferences = { ...(copy.preferences as Record<string, unknown>) };
    delete preferences.subtopicInstructions;
    copy.preferences = preferences;
  }
  return copy;
}

function prepareSavedSetForFirestore(
  rawItem: Record<string, unknown>
): Record<string, unknown> | null {
  const cleaned = removeUndefined(rawItem) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  const removeRawOutputs = { ...cleaned };
  if (
    typeof removeRawOutputs.writtenSession === 'object' &&
    removeRawOutputs.writtenSession !== null
  ) {
    removeRawOutputs.writtenSession = {
      ...(removeRawOutputs.writtenSession as Record<string, unknown>),
      rawModelOutput: '',
    };
  }
  if (
    typeof removeRawOutputs.mcSession === 'object' &&
    removeRawOutputs.mcSession !== null
  ) {
    removeRawOutputs.mcSession = {
      ...(removeRawOutputs.mcSession as Record<string, unknown>),
      rawModelOutput: '',
    };
  }
  if (estimateDocSizeBytes(removeRawOutputs) <= FIRESTORE_DOC_SAFE_BYTES) {
    return removeRawOutputs;
  }

  const removeImages = { ...removeRawOutputs };
  if (
    typeof removeImages.writtenSession === 'object' &&
    removeImages.writtenSession !== null
  ) {
    removeImages.writtenSession = {
      ...(removeImages.writtenSession as Record<string, unknown>),
      imagesByQuestionId: {},
    };
  }
  if (estimateDocSizeBytes(removeImages) <= FIRESTORE_DOC_SAFE_BYTES) {
    return removeImages;
  }

  const removeFeedback = { ...removeImages };
  if (
    typeof removeFeedback.writtenSession === 'object' &&
    removeFeedback.writtenSession !== null
  ) {
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

function prepareQuestionHistoryEntryForFirestore(
  rawItem: Record<string, unknown>
): Record<string, unknown> | null {
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
  if (
    typeof trimmedMarking.markResponse === 'object' &&
    trimmedMarking.markResponse !== null
  ) {
    const mr = trimmedMarking.markResponse as Record<string, unknown>;
    trimmedMarking.markResponse = {
      verdict: mr.verdict,
      achievedMarks: mr.achievedMarks,
      maxMarks: mr.maxMarks,
      scoreOutOf10: mr.scoreOutOf10,
      vcaaMarkingScheme: mr.vcaaMarkingScheme,
      comparisonToSolutionMarkdown: '',
      feedbackMarkdown: '',
      workedSolutionMarkdown: '',
    };
  }
  trimmedMarking.workedSolutionMarkdown = '';
  if (
    typeof trimmedMarking.uploadedAnswer === 'string' &&
    trimmedMarking.uploadedAnswer.length > 20_000
  ) {
    trimmedMarking.uploadedAnswer = trimmedMarking.uploadedAnswer.slice(
      0,
      20_000
    );
  }
  if (estimateDocSizeBytes(trimmedMarking) <= FIRESTORE_DOC_SAFE_BYTES) {
    return trimmedMarking;
  }

  const metadataOnly = {
    id: trimmedMarking.id,
    createdAt: trimmedMarking.createdAt,
    lastModified: trimmedMarking.lastModified,
    question: (() => {
      if (
        typeof trimmedMarking.question !== 'object' ||
        trimmedMarking.question === null
      )
        return undefined;
      const q = trimmedMarking.question as Record<string, unknown>;
      return {
        id: q.id,
        topic: q.topic,
        subtopic: q.subtopic,
        maxMarks: q.maxMarks,
        promptMarkdown:
          typeof q.promptMarkdown === 'string'
            ? q.promptMarkdown.slice(0, 20_000)
            : '',
      };
    })(),
    uploadedAnswer:
      typeof trimmedMarking.uploadedAnswer === 'string'
        ? trimmedMarking.uploadedAnswer.slice(0, 20_000)
        : '',
    markResponse: trimmedMarking.markResponse,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES) {
    return metadataOnly;
  }

  return null;
}

function prepareMcHistoryEntryForFirestore(
  rawItem: Record<string, unknown>
): Record<string, unknown> | null {
  const cleaned = removeUndefined(rawItem) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  const trimmed = { ...cleaned };
  if (typeof trimmed.question === 'object' && trimmed.question !== null) {
    const q = trimmed.question as Record<string, unknown>;
    trimmed.question = {
      ...q,
      promptMarkdown:
        typeof q.promptMarkdown === 'string'
          ? q.promptMarkdown.slice(0, 20_000)
          : '',
      explanationMarkdown: '',
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
      if (typeof trimmed.question !== 'object' || trimmed.question === null)
        return undefined;
      const q = trimmed.question as Record<string, unknown>;
      return {
        id: q.id,
        topic: q.topic,
        subtopic: q.subtopic,
        promptMarkdown:
          typeof q.promptMarkdown === 'string'
            ? q.promptMarkdown.slice(0, 20_000)
            : '',
      };
    })(),
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES) {
    return metadataOnly;
  }

  return null;
}

const BATCH_SIZE_QH = 50;
const BATCH_SIZE_MC = 50;
const CONCURRENT_SAVESETS_WRITES = 10;
const PARALLEL_COLLECTION_SAVES = true;

export interface SaveOptions {
  deltaSyncVersions?: {
    questionHistory: Record<string, number>;
    mcHistory: Record<string, number>;
    savedSets: Record<string, number>;
  };
  fullSync?: boolean;
  deletedIds?: {
    questionHistory: string[];
    mcHistory: string[];
    savedSets: string[];
    presets?: string[];
  };
}

export async function upsertQuestionHistoryItems(
  userId: string,
  items: Record<string, unknown>[]
): Promise<number> {
  if (items.length === 0) return 0;
  const historyRef = getHistoryCollectionRef(userId, 'questionHistory');
  let writes = 0;
  const batches: Array<Promise<void>> = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE_QH) {
    const batchItems = items.slice(i, i + BATCH_SIZE_QH);
    const batchNum = Math.floor(i / BATCH_SIZE_QH) + 1;
    batches.push(
      (async () => {
        const batch = writeBatch(db);
        let batchWrites = 0;
        for (const item of batchItems) {
          if (!item.id) continue;
          const compacted = compactQuestionHistoryEntry(item);
          const prepared = prepareQuestionHistoryEntryForFirestore(compacted);
          if (!prepared) continue;
          batch.set(doc(historyRef, String(item.id)), {
            ...prepared,
            _lastModified: serverTimestamp(),
          });
          batchWrites++;
        }
        if (batchWrites > 0) {
          await withRetry(
            () =>
              withTimeout(
                batch.commit(),
                `committing questionHistory upsert batch ${batchNum}`
              ),
            `questionHistory upsert batch ${batchNum}`
          );
          writes += batchWrites;
        }
      })()
    );
  }
  await Promise.all(batches);
  return writes;
}

export async function deleteQuestionHistoryItems(
  userId: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const historyRef = getHistoryCollectionRef(userId, 'questionHistory');
  await Promise.all(
    ids.map((id) =>
      withRetry(
        () =>
          withTimeout(
            deleteDoc(doc(historyRef, id)),
            `deleting questionHistory ${id}`
          ),
        `deleting questionHistory ${id}`
      )
    )
  );
  return ids.length;
}

export async function upsertMcHistoryItems(
  userId: string,
  items: Record<string, unknown>[]
): Promise<number> {
  if (items.length === 0) return 0;
  const historyRef = getHistoryCollectionRef(userId, 'mcHistory');
  let writes = 0;
  const batches: Array<Promise<void>> = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE_MC) {
    const batchItems = items.slice(i, i + BATCH_SIZE_MC);
    const batchNum = Math.floor(i / BATCH_SIZE_MC) + 1;
    batches.push(
      (async () => {
        const batch = writeBatch(db);
        let batchWrites = 0;
        for (const item of batchItems) {
          if (!item.id) continue;
          const compacted = compactMcHistoryEntry(item);
          const prepared = prepareMcHistoryEntryForFirestore(compacted);
          if (!prepared) continue;
          batch.set(doc(historyRef, String(item.id)), {
            ...prepared,
            _lastModified: serverTimestamp(),
          });
          batchWrites++;
        }
        if (batchWrites > 0) {
          await withRetry(
            () =>
              withTimeout(
                batch.commit(),
                `committing mcHistory upsert batch ${batchNum}`
              ),
            `mcHistory upsert batch ${batchNum}`
          );
          writes += batchWrites;
        }
      })()
    );
  }
  await Promise.all(batches);
  return writes;
}

export async function deleteMcHistoryItems(
  userId: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const historyRef = getHistoryCollectionRef(userId, 'mcHistory');
  await Promise.all(
    ids.map((id) =>
      withRetry(
        () =>
          withTimeout(
            deleteDoc(doc(historyRef, id)),
            `deleting mcHistory ${id}`
          ),
        `deleting mcHistory ${id}`
      )
    )
  );
  return ids.length;
}

export async function upsertSavedSets(
  userId: string,
  items: Record<string, unknown>[]
): Promise<number> {
  if (items.length === 0) return 0;
  const savedSetsRef = getSavedSetsCollectionRef(userId);
  const pendingWrites: Array<{
    id: string;
    payload: Record<string, unknown>;
  }> = [];
  for (const item of items) {
    if (!item.id) continue;
    const compacted = compactSavedSet(item);
    const prepared = prepareSavedSetForFirestore(compacted);
    if (!prepared) continue;
    pendingWrites.push({ id: String(item.id), payload: prepared });
  }
  for (let i = 0; i < pendingWrites.length; i += CONCURRENT_SAVESETS_WRITES) {
    const chunk = pendingWrites.slice(i, i + CONCURRENT_SAVESETS_WRITES);
    await Promise.all(
      chunk.map(async ({ id, payload }) => {
        await withRetry(
          () =>
            withTimeout(
              setDoc(doc(savedSetsRef, id), {
                ...payload,
                _lastModified: serverTimestamp(),
              }),
              `saving savedSet ${id}`
            ),
          `saving savedSet ${id}`
        );
      })
    );
  }
  return pendingWrites.length;
}

export async function deleteSavedSets(
  userId: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const savedSetsRef = getSavedSetsCollectionRef(userId);
  await Promise.all(
    ids.map((id) =>
      withRetry(
        () =>
          withTimeout(
            deleteDoc(doc(savedSetsRef, id)),
            `deleting savedSet ${id}`
          ),
        `deleting savedSet ${id}`
      )
    )
  );
  return ids.length;
}

export async function replacePresets(
  userId: string,
  presets: Preset[]
): Promise<void> {
  const presetsRef = getUserPresetsRef(userId);
  await withRetry(
    () =>
      withTimeout(
        setDoc(
          presetsRef,
          {
            presets: removeUndefined(presets),
            _lastModified: serverTimestamp(),
          },
          { merge: true }
        ),
        'saving presets document'
      ),
    'saving presets document'
  );
}

export async function upsertPresets(
  userId: string,
  presets: Preset[]
): Promise<number> {
  if (presets.length === 0) return 0;
  const presetsRef = getUserPresetsRef(userId);
  const snapshot = await withRetry(
    () => withTimeout(getDoc(presetsRef), 'loading presets document'),
    'loading presets document'
  );
  const existing = snapshot.exists()
    ? ((snapshot.data().presets as Preset[] | undefined) ?? []).filter(
        (p) => p?.id
      )
    : [];
  const byId = new Map(existing.map((preset) => [preset.id, preset]));
  for (const preset of presets) {
    byId.set(preset.id, preset);
  }
  await withRetry(
    () =>
      withTimeout(
        setDoc(
          presetsRef,
          {
            presets: removeUndefined(Array.from(byId.values())),
            _lastModified: serverTimestamp(),
          },
          { merge: true }
        ),
        'saving presets document'
      ),
    'saving presets document'
  );
  return presets.length;
}

export async function deletePresets(
  userId: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const presetsRef = getUserPresetsRef(userId);
  const snapshot = await withRetry(
    () => withTimeout(getDoc(presetsRef), 'loading presets document'),
    'loading presets document'
  );
  if (!snapshot.exists()) return 0;
  const existing = (
    (snapshot.data().presets as Preset[] | undefined) ?? []
  ).filter((preset) => preset?.id && !ids.includes(preset.id));
  await withRetry(
    () =>
      withTimeout(
        setDoc(
          presetsRef,
          {
            presets: removeUndefined(existing),
            _lastModified: serverTimestamp(),
          },
          { merge: true }
        ),
        'saving presets document'
      ),
    'saving presets document'
  );
  return ids.length;
}

export async function upsertGoals(
  userId: string,
  studyGoals?: Record<string, unknown>,
  streakData?: Record<string, unknown>
): Promise<void> {
  const goalsRef = doc(db, 'users', userId, 'settings', 'goals');
  await withRetry(
    () =>
      withTimeout(
        setDoc(
          goalsRef,
          {
            studyGoals: removeUndefined(studyGoals ?? {}),
            streakData: removeUndefined(streakData ?? {}),
            _lastModified: serverTimestamp(),
          },
          { merge: true }
        ),
        'saving goals data'
      ),
    'saving goals data'
  );
}

export async function saveUserData(
  userId: string,
  data: SyncableData,
  options: SaveOptions = {}
): Promise<{
  totalWrites: number;
  skippedUnchanged: number;
  deltaSavings: number;
}> {
  const { deltaSyncVersions, fullSync = false, deletedIds } = options;
  const startTime = Date.now();
  let totalWrites = 0;
  let skippedUnchanged = 0;
  let deltaSavings = 0;

  // Delete removed items from Firestore first
  if (deletedIds) {
    const deletePromises: Promise<void>[] = [];

    if (deletedIds.questionHistory.length > 0) {
      const historyRef = getHistoryCollectionRef(userId, 'questionHistory');
      for (const id of deletedIds.questionHistory) {
        deletePromises.push(
          withRetry(
            () =>
              withTimeout(
                deleteDoc(doc(historyRef, id)),
                `deleting questionHistory ${id}`
              ),
            `deleting questionHistory ${id}`
          )
        );
      }
    }

    if (deletedIds.mcHistory.length > 0) {
      const historyRef = getHistoryCollectionRef(userId, 'mcHistory');
      for (const id of deletedIds.mcHistory) {
        deletePromises.push(
          withRetry(
            () =>
              withTimeout(
                deleteDoc(doc(historyRef, id)),
                `deleting mcHistory ${id}`
              ),
            `deleting mcHistory ${id}`
          )
        );
      }
    }

    if (deletedIds.savedSets.length > 0) {
      const savedSetsRef = getSavedSetsCollectionRef(userId);
      for (const id of deletedIds.savedSets) {
        deletePromises.push(
          withRetry(
            () =>
              withTimeout(
                deleteDoc(doc(savedSetsRef, id)),
                `deleting savedSet ${id}`
              ),
            `deleting savedSet ${id}`
          )
        );
      }
    }

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(
        `[Firebase] Deleted ${deletePromises.length} documents from Firestore`
      );
    }
  }

  let questionHistoryToSave = data.questionHistory || [];
  let mcHistoryToSave = data.mcHistory || [];
  let savedSetsToSave = data.savedSets || [];

  // Filter unchanged items even during full sync to avoid wasting writes
  if (deltaSyncVersions) {
    const qhChanged = getChangedItems(
      questionHistoryToSave,
      deltaSyncVersions.questionHistory
    );
    const mcChanged = getChangedItems(
      mcHistoryToSave,
      deltaSyncVersions.mcHistory
    );
    const ssChanged = getChangedItems(
      savedSetsToSave,
      deltaSyncVersions.savedSets
    );

    skippedUnchanged =
      questionHistoryToSave.length -
      qhChanged.length +
      (mcHistoryToSave.length - mcChanged.length) +
      (savedSetsToSave.length - ssChanged.length);
    deltaSavings = skippedUnchanged;

    questionHistoryToSave = qhChanged;
    mcHistoryToSave = mcChanged;
    savedSetsToSave = ssChanged;
  }

  console.log('[Firebase] saveUserData started', {
    userId,
    fullSync,
    questionHistory: questionHistoryToSave.length,
    mcHistory: mcHistoryToSave.length,
    savedSets: savedSetsToSave.length,
    deltaSavings,
    skippedUnchanged,
  });

  try {
    const cleanedSettings = removeUndefined(data.settings) as Record<
      string,
      unknown
    >;
    if (Object.keys(cleanedSettings).length > 0) {
      await withRetry(
        () =>
          withTimeout(
            setDoc(
              getUserSettingsRef(userId),
              {
                settings: cleanedSettings,
                _lastModified: serverTimestamp(),
              },
              { merge: true }
            ),
            'saving settings'
          ),
        'saving settings'
      );
      totalWrites++;
    }

    if (data.studyGoals || data.streakData) {
      const goalsRef = doc(db, 'users', userId, 'settings', 'goals');
      await withRetry(
        () =>
          withTimeout(
            setDoc(
              goalsRef,
              {
                studyGoals: removeUndefined(data.studyGoals ?? {}),
                streakData: removeUndefined(data.streakData ?? {}),
                _lastModified: serverTimestamp(),
              },
              { merge: true }
            ),
            'saving goals data'
          ),
        'saving goals data'
      );
      totalWrites++;
    }

    if (data.presets) {
      await replacePresets(userId, data.presets);
      totalWrites++;
    }

    const savePromises: Promise<void>[] = [];

    if (questionHistoryToSave.length > 0) {
      const saveQhPromise = (async () => {
        const historyRef = getHistoryCollectionRef(userId, 'questionHistory');
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
                const prepared =
                  prepareQuestionHistoryEntryForFirestore(compacted);
                if (!prepared) {
                  console.warn(
                    `[Firebase] Skipping oversize questionHistory entry ${String(item.id)}`
                  );
                  continue;
                }
                batch.set(docRef, {
                  ...prepared,
                  _lastModified: serverTimestamp(),
                });
                batchWrites++;
              }

              if (batchWrites > 0) {
                await withRetry(
                  () =>
                    withTimeout(
                      batch.commit(),
                      `committing questionHistory batch ${batchNum}`
                    ),
                  `questionHistory batch ${batchNum}`
                );
                totalWrites += batchWrites;
              }
            })()
          );
        }

        await Promise.all(batches);
      })();
      savePromises.push(saveQhPromise);
    }

    if (mcHistoryToSave.length > 0) {
      const saveMcPromise = (async () => {
        const historyRef = getHistoryCollectionRef(userId, 'mcHistory');
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
                  console.warn(
                    `[Firebase] Skipping oversize mcHistory entry ${String(item.id)}`
                  );
                  continue;
                }
                batch.set(docRef, {
                  ...prepared,
                  _lastModified: serverTimestamp(),
                });
                batchWrites++;
              }

              if (batchWrites > 0) {
                await withRetry(
                  () =>
                    withTimeout(
                      batch.commit(),
                      `committing mcHistory batch ${batchNum}`
                    ),
                  `mcHistory batch ${batchNum}`
                );
                totalWrites += batchWrites;
              }
            })()
          );
        }

        await Promise.all(batches);
      })();
      savePromises.push(saveMcPromise);
    }

    if (savedSetsToSave.length > 0) {
      const saveSsPromise = (async () => {
        const savedSetsRef = getSavedSetsCollectionRef(userId);

        const pendingWrites: Array<{
          id: string;
          payload: Record<string, unknown>;
        }> = [];
        for (const item of savedSetsToSave) {
          if (!item.id) continue;
          const compacted = compactSavedSet(item);
          const prepared = prepareSavedSetForFirestore(compacted);
          if (!prepared) {
            console.warn(
              `[Firebase] Skipping oversize savedSet ${String(item.id)}`
            );
            continue;
          }
          pendingWrites.push({ id: String(item.id), payload: prepared });
        }

        const chunks: Array<Promise<void>> = [];
        for (
          let i = 0;
          i < pendingWrites.length;
          i += CONCURRENT_SAVESETS_WRITES
        ) {
          const chunk = pendingWrites.slice(i, i + CONCURRENT_SAVESETS_WRITES);
          chunks.push(
            Promise.all(
              chunk.map(async ({ id, payload }) => {
                const docRef = doc(savedSetsRef, id);
                await withRetry(
                  () =>
                    withTimeout(
                      setDoc(docRef, {
                        ...payload,
                        _lastModified: serverTimestamp(),
                      }),
                      `saving savedSet ${id}`,
                      FIRESTORE_OP_TIMEOUT_MS
                    ),
                  `saving savedSet ${id}`
                );
                totalWrites++;
              })
            ).then(() => void 0)
          );
        }

        await Promise.all(chunks);
      })();
      savePromises.push(saveSsPromise);
    }

    if (PARALLEL_COLLECTION_SAVES && savePromises.length > 0) {
      await Promise.all(savePromises);
    }

    const elapsed = Date.now() - startTime;
    console.log('[Firebase] saveUserData completed', {
      userId,
      totalWrites,
      deltaSavings,
      skippedUnchanged,
      elapsedMs: elapsed,
    });

    return { totalWrites, skippedUnchanged, deltaSavings };
  } catch (error) {
    console.error('[Firebase] saveUserData error:', error);
    throw error;
  }
}

export async function loadUserData(
  userId: string
): Promise<SyncableData | null> {
  console.log('[Firebase] loadUserData started for:', userId);
  const startTime = Date.now();

  const settingsRef = getUserSettingsRef(userId);
  const settingsSnapshot = await withTimeout(
    getDoc(settingsRef),
    'loading settings'
  );

  const result: SyncableData = {
    settings: {},
    questionHistory: [],
    mcHistory: [],
    savedSets: [],
  };

  if (settingsSnapshot.exists()) {
    const data = settingsSnapshot.data();
    result.settings = data.settings || {};
  }

  const goalsRef = doc(db, 'users', userId, 'settings', 'goals');
  const presetsRef = getUserPresetsRef(userId);
  const [qhSnapshot, mchSnapshot, ssSnapshot, goalsResult, presetsSnap] =
    await Promise.all([
      withTimeout(
        getDocs(
          query(
            getHistoryCollectionRef(userId, 'questionHistory'),
            orderBy('createdAt', 'desc'),
            limit(1000)
          )
        ),
        'loading questionHistory'
      ),
      withTimeout(
        getDocs(
          query(
            getHistoryCollectionRef(userId, 'mcHistory'),
            orderBy('createdAt', 'desc'),
            limit(1000)
          )
        ),
        'loading mcHistory'
      ),
      withTimeout(
        getDocs(
          query(
            getSavedSetsCollectionRef(userId),
            orderBy('updatedAt', 'desc'),
            limit(100)
          )
        ),
        'loading savedSets'
      ),
      withTimeout(getDoc(goalsRef), 'loading goals data')
        .then((snap) => {
          if (!snap.exists()) return { studyGoals: null, streakData: null };
          const data = snap.data();
          return {
            studyGoals:
              typeof data.studyGoals === 'object' &&
              data.studyGoals !== null &&
              !Array.isArray(data.studyGoals)
                ? data.studyGoals
                : null,
            streakData:
              typeof data.streakData === 'object' &&
              data.streakData !== null &&
              !Array.isArray(data.streakData)
                ? data.streakData
                : null,
          };
        })
        .catch(() => ({ studyGoals: null, streakData: null })),
      withTimeout(getDoc(presetsRef), 'loading preset settings data')
        .then((snap) => {
          if (!snap.exists()) return [];
          const data = snap.data();
          return Array.isArray(data.presets) ? data.presets : [];
        })
        .catch(() => []),
    ]);

  qhSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.questionHistory.push(data);
  });

  mchSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.mcHistory.push(data);
  });

  ssSnapshot.forEach((doc) => {
    const data = doc.data();
    delete data._lastModified;
    result.savedSets.push(inflateSavedSet(data));
  });

  if (goalsResult.studyGoals) result.studyGoals = goalsResult.studyGoals;
  if (goalsResult.streakData) result.streakData = goalsResult.streakData;
  if (presetsSnap.length > 0) result.presets = presetsSnap;

  const elapsed = Date.now() - startTime;
  console.log('[Firebase] loadUserData completed', {
    userId,
    elapsedMs: elapsed,
    totalDocs:
      result.questionHistory.length +
      result.mcHistory.length +
      result.savedSets.length,
  });

  return result;
}

export async function loadChangedItems(
  userId: string,
  changedItemIds: {
    questionHistory?: string[];
    mcHistory?: string[];
    savedSets?: string[];
  }
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
        const qhRef = getHistoryCollectionRef(userId, 'questionHistory');
        const promises = changedItemIds.questionHistory!.map(async (id) => {
          const docRef = doc(qhRef, id);
          const docSnap = await withTimeout(
            getDoc(docRef),
            `loading questionHistory ${id}`
          );
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.questionHistory.push(data);
          }
        });
        await Promise.all(promises);
      })()
    );
  }

  if (changedItemIds.mcHistory?.length) {
    loadPromises.push(
      (async () => {
        const mchRef = getHistoryCollectionRef(userId, 'mcHistory');
        const promises = changedItemIds.mcHistory!.map(async (id) => {
          const docRef = doc(mchRef, id);
          const docSnap = await withTimeout(
            getDoc(docRef),
            `loading mcHistory ${id}`
          );
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.mcHistory.push(data);
          }
        });
        await Promise.all(promises);
      })()
    );
  }

  if (changedItemIds.savedSets?.length) {
    loadPromises.push(
      (async () => {
        const ssRef = getSavedSetsCollectionRef(userId);
        const promises = changedItemIds.savedSets!.map(async (id) => {
          const docRef = doc(ssRef, id);
          const docSnap = await withTimeout(
            getDoc(docRef),
            `loading savedSet ${id}`
          );
          if (docSnap.exists()) {
            const data = docSnap.data();
            delete data._lastModified;
            result.savedSets.push(inflateSavedSet(data));
          }
        });
        await Promise.all(promises);
      })()
    );
  }

  await Promise.all(loadPromises);
  return result;
}

export async function migrateUserDataForCompaction(
  userId: string,
  preloadedRemoteData?: SyncableData | null
): Promise<CompactionMigrationResult> {
  const settingsRef = getUserSettingsRef(userId);
  const settingsSnapshot = await withTimeout(
    getDoc(settingsRef),
    'loading settings for compaction migration'
  );

  const rawVersion = settingsSnapshot.exists()
    ? settingsSnapshot.data()?._syncCompactionVersion
    : undefined;
  const fromVersion =
    typeof rawVersion === 'number' && Number.isFinite(rawVersion)
      ? rawVersion
      : 0;
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

  console.log('[Firebase] Running one-time cloud compaction migration', {
    userId,
    fromVersion,
    toVersion: CLOUD_COMPACTION_VERSION,
  });

  const remoteData = preloadedRemoteData ?? (await loadUserData(userId));
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
      { merge: true }
    ),
    'saving compaction migration marker'
  );

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
  type: 'questionHistory' | 'mcHistory',
  keepIds: Set<string>
): Promise<number> {
  const collectionRef = getHistoryCollectionRef(userId, type);
  let deleted = 0;
  try {
    const snapshot = await withTimeout(
      getDocs(query(collectionRef, limit(1000))),
      `loading ${type} for archiving`
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
            `archiving ${type}`
          );
          break;
        }
      }
    }
    if (batchSize > 0 && batchSize < 400) {
      await withRetry(
        () => withTimeout(batch.commit(), `archiving ${type} batch`),
        `archiving ${type}`
      );
    }
  } catch (error) {
    console.warn(`[Firebase] Failed to archive old ${type} items:`, error);
  }
  return deleted;
}

// subscribeToUserData removed — sync is now manual-only (no polling)

// ─── Daily usage tracking ────────────────────────────────────────────────────

export interface DailyUsageRecord {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  generationCount: number;
  questionCount: number;
}

export async function saveDailyUsage(
  userId: string,
  generationHistory: Array<{
    timestamp: string;
    outputs?: {
      totalTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
      estimatedCostUsd?: number;
    };
  }>,
  questionHistory: Array<{ createdAt: string }>,
  mcHistory: Array<{ createdAt: string }>
): Promise<void> {
  const byDay = new Map<string, DailyUsageRecord>();

  for (const record of generationHistory) {
    const day = getDayKey(record.timestamp);
    const bucket = byDay.get(day) ?? {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      generationCount: 0,
      questionCount: 0,
    };
    bucket.totalTokens += record.outputs?.totalTokens ?? 0;
    bucket.promptTokens += record.outputs?.promptTokens ?? 0;
    bucket.completionTokens += record.outputs?.completionTokens ?? 0;
    bucket.estimatedCostUsd += record.outputs?.estimatedCostUsd ?? 0;
    bucket.generationCount += 1;
    byDay.set(day, bucket);
  }

  for (const e of questionHistory) {
    const day = getDayKey(e.createdAt);
    const bucket = byDay.get(day) ?? {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      generationCount: 0,
      questionCount: 0,
    };
    bucket.questionCount += 1;
    byDay.set(day, bucket);
  }

  for (const e of mcHistory) {
    const day = getDayKey(e.createdAt);
    const bucket = byDay.get(day) ?? {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      generationCount: 0,
      questionCount: 0,
    };
    bucket.questionCount += 1;
    byDay.set(day, bucket);
  }

  const usageCollection = collection(db, 'users', userId, 'usage');
  const batch = writeBatch(db);
  let writes = 0;

  for (const [date, record] of byDay) {
    const docRef = doc(usageCollection, date);
    batch.set(
      docRef,
      {
        ...record,
        totalTokens: increment(record.totalTokens),
        promptTokens: increment(record.promptTokens),
        completionTokens: increment(record.completionTokens),
        estimatedCostUsd: increment(record.estimatedCostUsd),
        generationCount: increment(record.generationCount),
        questionCount: increment(record.questionCount),
        _lastModified: serverTimestamp(),
      },
      { merge: true }
    );
    writes++;
  }

  if (writes > 0) {
    await batch.commit();
  }
}
