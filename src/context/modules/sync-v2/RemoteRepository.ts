/**
 * Firestore CRUD operations with date-based sharding.
 *
 * Sharding strategy:
 *   users/{uid}/questionHistory/{YYYY-MM}/{docId}
 *   users/{uid}/mcHistory/{YYYY-MM}/{docId}
 *   users/{uid}/savedSets/{docId}
 *   users/{uid}/settings/{main, goals, presets}
 */

import type { DocumentData, Firestore } from 'firebase/firestore';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase-init';
import {
  FIRESTORE_BATCH_MAX_OPS,
  FIRESTORE_DOC_SAFE_BYTES,
  FIRESTORE_OP_TIMEOUT_MS,
  FIRESTORE_RETRY_BASE_DELAY_MS,
  FIRESTORE_RETRY_MAX_ATTEMPTS,
  FIRESTORE_RETRY_MAX_DELAY_MS,
} from './config';
import type {
  RemoteDocument,
  ShardKey,
  SyncCollection,
  SyncableData,
  SyncOperation,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getShardKey(date: Date | number | string): ShardKey {
  const d =
    typeof date === 'string'
      ? new Date(date)
      : typeof date === 'number'
        ? new Date(date)
        : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCollectionPath(
  userId: string,
  collectionName: SyncCollection,
  shardKey?: ShardKey
): string {
  const base = `users/${userId}`;
  // Keep history collections flat to match existing cloud schema and realtime
  // listeners. The shard key is currently ignored for compatibility.
  void shardKey;
  return `${base}/${collectionName}`;
}

function getCollectionRef(
  userId: string,
  collectionName: SyncCollection,
  shardKey?: ShardKey
) {
  const path = getCollectionPath(userId, collectionName, shardKey);
  return collection(db, path);
}

function removeUndefined(obj: unknown): unknown {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cv = removeUndefined(value);
      if (cv !== undefined) cleaned[key] = cv;
    }
    return cleaned;
  }
  return obj;
}

function estimateDocSizeBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function clipString(value: unknown, max = 20_000): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

interface QuestionMetadata {
  id?: string;
  topic?: string;
  subtopic?: string;
  maxMarks?: unknown;
  promptMarkdown?: string;
}

function extractQuestionMetadata(
  question: unknown
): QuestionMetadata | undefined {
  if (typeof question !== 'object' || question === null) return undefined;
  const q = question as Record<string, unknown>;
  return {
    id: typeof q.id === 'string' ? q.id : undefined,
    topic: typeof q.topic === 'string' ? q.topic : undefined,
    subtopic: typeof q.subtopic === 'string' ? q.subtopic : undefined,
    maxMarks: q.maxMarks,
    promptMarkdown:
      typeof q.promptMarkdown === 'string' ? q.promptMarkdown : undefined,
  };
}

// ─── Retry ────────────────────────────────────────────────────────────────────

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  const patterns = [
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
  return patterns.some((p) => msg.includes(p));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxAttempts = FIRESTORE_RETRY_MAX_ATTEMPTS
): Promise<T> {
  let lastError: Error = new Error(`${label} failed`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`${label} failed`);
      if (attempt >= maxAttempts || !isRetryableError(error)) break;
      const jitter = Math.random() * 500;
      const delay = Math.min(
        FIRESTORE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter,
        FIRESTORE_RETRY_MAX_DELAY_MS
      );
      console.warn(
        `[SyncV2] ${label} attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(delay)}ms`,
        lastError.message
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function withTimeout<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = FIRESTORE_OP_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout((): void => {
      reject(new Error(`Timed out while ${label} after ${timeoutMs}ms`));
    }, timeoutMs);
    operation
      .then((v) => {
        clearTimeout(timeout);
        resolve(v);
      })
      .catch((e: unknown) => {
        clearTimeout(timeout);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
  });
}

// ─── Document Preparation ─────────────────────────────────────────────────────

function prepareForFirestore(
  data: Record<string, unknown>,
  collection: SyncCollection
): Record<string, unknown> | null {
  const cleaned = removeUndefined(data) as Record<string, unknown>;
  if (estimateDocSizeBytes(cleaned) <= FIRESTORE_DOC_SAFE_BYTES) {
    return cleaned;
  }

  // Progressive compaction based on collection type
  if (collection === 'questionHistory') {
    return compactQuestionHistory(cleaned);
  }
  if (collection === 'mcHistory') {
    return compactMcHistory(cleaned);
  }
  if (collection === 'savedSets') {
    return compactSavedSet(cleaned);
  }
  return null; // Cannot compact settings
}

function compactQuestionHistory(
  item: Record<string, unknown>
): Record<string, unknown> | null {
  const withoutImage = { ...item };
  delete withoutImage.uploadedAnswerImage;
  if (estimateDocSizeBytes(withoutImage) <= FIRESTORE_DOC_SAFE_BYTES)
    return withoutImage;

  const trimmed = { ...withoutImage };
  if (
    typeof trimmed.markResponse === 'object' &&
    trimmed.markResponse !== null
  ) {
    const mr = trimmed.markResponse as Record<string, unknown>;
    trimmed.markResponse = {
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
  trimmed.workedSolutionMarkdown = '';
  if (
    typeof trimmed.uploadedAnswer === 'string' &&
    trimmed.uploadedAnswer.length > 20_000
  ) {
    trimmed.uploadedAnswer = trimmed.uploadedAnswer.slice(0, 20_000);
  }
  if (estimateDocSizeBytes(trimmed) <= FIRESTORE_DOC_SAFE_BYTES) return trimmed;

  const qMeta = extractQuestionMetadata(trimmed.question);
  const metadataOnly = {
    id: trimmed.id,
    createdAt: trimmed.createdAt,
    lastModified: trimmed.lastModified,
    question: qMeta
      ? {
        id: qMeta.id,
        topic: qMeta.topic,
        subtopic: qMeta.subtopic,
        maxMarks: qMeta.maxMarks,
        promptMarkdown: clipString(qMeta.promptMarkdown, 20_000),
      }
      : undefined,
    uploadedAnswer: clipString(trimmed.uploadedAnswer, 20_000),
    markResponse: trimmed.markResponse,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES)
    return metadataOnly;
  return null;
}

function compactMcHistory(
  item: Record<string, unknown>
): Record<string, unknown> | null {
  const trimmed = { ...item };
  if (typeof trimmed.question === 'object' && trimmed.question !== null) {
    const q = trimmed.question as Record<string, unknown>;
    trimmed.question = {
      ...q,
      promptMarkdown: clipString(q.promptMarkdown, 20_000),
      explanationMarkdown: '',
    };
  }
  if (estimateDocSizeBytes(trimmed) <= FIRESTORE_DOC_SAFE_BYTES) return trimmed;

  const qMeta = extractQuestionMetadata(trimmed.question);
  const metadataOnly = {
    id: trimmed.id,
    createdAt: trimmed.createdAt,
    lastModified: trimmed.lastModified,
    type: trimmed.type,
    selectedAnswer: trimmed.selectedAnswer,
    correct: trimmed.correct,
    awardedMarks: trimmed.awardedMarks,
    maxMarks: trimmed.maxMarks,
    question: qMeta
      ? {
        id: qMeta.id,
        topic: qMeta.topic,
        subtopic: qMeta.subtopic,
        promptMarkdown: clipString(qMeta.promptMarkdown, 20_000),
      }
      : undefined,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES)
    return metadataOnly;
  return null;
}

function compactSavedSet(
  item: Record<string, unknown>
): Record<string, unknown> | null {
  const compacted = { ...item };
  if (
    typeof compacted.preferences === 'object' &&
    compacted.preferences !== null
  ) {
    const prefs = { ...(compacted.preferences as Record<string, unknown>) };
    delete prefs.subtopicInstructions;
    compacted.preferences = prefs;
  }
  if (estimateDocSizeBytes(compacted) <= FIRESTORE_DOC_SAFE_BYTES)
    return compacted;

  const noRaw = { ...compacted };
  if (
    typeof noRaw.writtenSession === 'object' &&
    noRaw.writtenSession !== null
  ) {
    noRaw.writtenSession = {
      ...(noRaw.writtenSession as Record<string, unknown>),
      rawModelOutput: '',
    };
  }
  if (typeof noRaw.mcSession === 'object' && noRaw.mcSession !== null) {
    noRaw.mcSession = {
      ...(noRaw.mcSession as Record<string, unknown>),
      rawModelOutput: '',
    };
  }
  if (estimateDocSizeBytes(noRaw) <= FIRESTORE_DOC_SAFE_BYTES) return noRaw;

  const noImages = { ...noRaw };
  if (
    typeof noImages.writtenSession === 'object' &&
    noImages.writtenSession !== null
  ) {
    noImages.writtenSession = {
      ...(noImages.writtenSession as Record<string, unknown>),
      imagesByQuestionId: {},
    };
  }
  if (estimateDocSizeBytes(noImages) <= FIRESTORE_DOC_SAFE_BYTES)
    return noImages;

  const noFeedback = { ...noImages };
  if (
    typeof noFeedback.writtenSession === 'object' &&
    noFeedback.writtenSession !== null
  ) {
    noFeedback.writtenSession = {
      ...(noFeedback.writtenSession as Record<string, unknown>),
      feedbackByQuestionId: {},
    };
  }
  if (estimateDocSizeBytes(noFeedback) <= FIRESTORE_DOC_SAFE_BYTES)
    return noFeedback;

  const metadataOnly = {
    id: noFeedback.id,
    title: noFeedback.title,
    questionMode: noFeedback.questionMode,
    createdAt: noFeedback.createdAt,
    updatedAt: noFeedback.updatedAt,
    lastModified: noFeedback.lastModified,
    preferences: noFeedback.preferences,
  };
  if (estimateDocSizeBytes(metadataOnly) <= FIRESTORE_DOC_SAFE_BYTES)
    return metadataOnly;
  return null;
}

function extractLastModified(data: DocumentData): number {
  const lm = data._lastModified as { toMillis?: () => number } | undefined;
  if (lm && typeof lm === 'object' && typeof lm.toMillis === 'function') {
    return lm.toMillis();
  }
  if (
    typeof data.lastModified === 'number' &&
    Number.isFinite(data.lastModified)
  ) {
    return data.lastModified;
  }
  if (typeof data.updatedAt === 'string') {
    const parsed = Date.parse(data.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof data.createdAt === 'string') {
    const parsed = Date.parse(data.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForComparison(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      if (key === '_lastModified' || key === 'lastModified') continue;
      normalized[key] = normalizeForComparison(source[key]);
    }
    return normalized;
  }
  return value;
}

function areEquivalentForSync(
  localPrepared: Record<string, unknown>,
  remoteData: DocumentData
): boolean {
  const normalizedLocal = normalizeForComparison(localPrepared);
  const normalizedRemote = normalizeForComparison(remoteData);
  return JSON.stringify(normalizedLocal) === JSON.stringify(normalizedRemote);
}

function chunkIds(ids: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

// ─── RemoteRepository ─────────────────────────────────────────────────────────

export class RemoteRepository {
  private userId: string;
  private firestore: Firestore;
  private static readonly QUERY_IN_MAX = 10;

  constructor(userId: string, firestoreInstance?: Firestore) {
    this.userId = userId;
    this.firestore = firestoreInstance ?? db;
  }

  updateUserId(newUserId: string): void {
    this.userId = newUserId;
  }

  // ─── Single Document Operations ─────────────────────────────────────────────

  async upsertDocument(
    collection: SyncCollection,
    docId: string,
    data: Record<string, unknown>,
    shardKey?: ShardKey
  ): Promise<void> {
    const prepared = prepareForFirestore(data, collection);
    if (!prepared) {
      throw new Error(
        `[SyncV2] Cannot sync oversized document ${collection}/${docId}. ` +
        `This document exceeds the 1MB limit after compression. ` +
        `Try removing large attachments, images, or markdown content.`
      );
    }

    const effectiveShard = shardKey ?? this.computeShardKey(data);
    const docRef = doc(
      this.firestore,
      getCollectionPath(this.userId, collection, effectiveShard),
      docId
    );

    const localLm = extractLastModified(prepared as DocumentData);

    await withRetry(
      () =>
        withTimeout(
          runTransaction(this.firestore, async (transaction) => {
            const snap = await transaction.get(docRef);
            const remote = snap.exists() ? snap.data() : undefined;
            if (!this.shouldWriteDocument(prepared, localLm, remote)) return;

            transaction.set(
              docRef,
              { ...prepared, _lastModified: serverTimestamp() },
              { merge: true }
            );
          }),
          `upsert ${collection}/${docId}`
        ),
      `upsert ${collection}/${docId}`
    );
  }

  async deleteDocument(
    collection: SyncCollection,
    docId: string,
    shardKey?: ShardKey
  ): Promise<void> {
    const docRef = doc(
      this.firestore,
      getCollectionPath(this.userId, collection, shardKey),
      docId
    );
    await withRetry(
      () => withTimeout(deleteDoc(docRef), `delete ${collection}/${docId}`),
      `delete ${collection}/${docId}`
    );
  }

  async getDocument(
    collection: SyncCollection,
    docId: string,
    shardKey?: ShardKey
  ): Promise<RemoteDocument | null> {
    const docRef = doc(
      this.firestore,
      getCollectionPath(this.userId, collection, shardKey),
      docId
    );
    const snap = await withTimeout(
      getDoc(docRef),
      `get ${collection}/${docId}`
    );
    if (!snap.exists()) return null;
    const data = snap.data();
    delete data._lastModified;
    return {
      id: snap.id,
      data,
      lastModified: extractLastModified(snap.data()),
      shardKey,
    };
  }

  async getCollection(
    collection: SyncCollection,
    shardKey?: ShardKey
  ): Promise<RemoteDocument[]> {
    const collRef = getCollectionRef(this.userId, collection, shardKey);
    const snap = await withTimeout(
      getDocs(collRef),
      `getCollection ${collection}${shardKey ? `/${shardKey}` : ''}`
    );
    const results: RemoteDocument[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      delete data._lastModified;
      results.push({
        id: docSnap.id,
        data,
        lastModified: extractLastModified(docSnap.data()),
        shardKey,
      });
    });
    return results;
  }

  // ─── Batch Operations ───────────────────────────────────────────────────────

  async upsertBatch(
    collection: SyncCollection,
    items: Array<{ id: string; data: Record<string, unknown> }>,
    shardKey?: ShardKey
  ): Promise<number> {
    if (items.length === 0) return 0;

    type PreparedCandidate = {
      id: string;
      prepared: Record<string, unknown>;
      path: string;
      localLastModified: number;
    };

    const candidates: PreparedCandidate[] = [];
    const byPath = new Map<string, PreparedCandidate[]>();
    const oversizedDocs: string[] = [];

    for (const item of items) {
      const prepared = prepareForFirestore(item.data, collection);
      if (!prepared) {
        oversizedDocs.push(item.id);
        continue;
      }
      const effectiveShard = shardKey ?? this.computeShardKey(item.data);
      const path = getCollectionPath(this.userId, collection, effectiveShard);
      const candidate: PreparedCandidate = {
        id: item.id,
        prepared,
        path,
        localLastModified: extractLastModified(prepared as DocumentData),
      };
      candidates.push(candidate);

      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path)!.push(candidate);
    }

    if (oversizedDocs.length > 0) {
      throw new Error(
        `[SyncV2] Cannot sync ${oversizedDocs.length} oversized document(s) in collection "${collection}": ${oversizedDocs.join(', ')}. ` +
        `These documents exceed the 1MB limit after compression. ` +
        `Try removing large attachments, images, or markdown content from these attempts.`
      );
    }

    if (candidates.length === 0) return 0;

    const candidatesToWrite: PreparedCandidate[] = [];
    for (const [path, pathCandidates] of byPath.entries()) {
      const remoteById = await this.getRemoteDocsById(path, pathCandidates);
      for (const candidate of pathCandidates) {
        const remote = remoteById.get(candidate.id);
        if (
          this.shouldWriteDocument(
            candidate.prepared,
            candidate.localLastModified,
            remote
          )
        ) {
          candidatesToWrite.push(candidate);
        }
      }
    }

    if (candidatesToWrite.length === 0) return 0;

    let writes = 0;

    for (
      let i = 0;
      i < candidatesToWrite.length;
      i += FIRESTORE_BATCH_MAX_OPS
    ) {
      const chunk = candidatesToWrite.slice(i, i + FIRESTORE_BATCH_MAX_OPS);
      const batch = writeBatch(this.firestore);
      let batchWrites = 0;

      for (const candidate of chunk) {
        const docRef = doc(this.firestore, candidate.path, candidate.id);
        batch.set(
          docRef,
          { ...candidate.prepared, _lastModified: serverTimestamp() },
          { merge: true }
        );
        batchWrites++;
      }

      if (batchWrites > 0) {
        await withRetry(
          () =>
            withTimeout(
              batch.commit(),
              `batch upsert ${collection} chunk ${i / FIRESTORE_BATCH_MAX_OPS + 1}`
            ),
          `batch upsert ${collection} chunk ${i / FIRESTORE_BATCH_MAX_OPS + 1}`
        );
        writes += batchWrites;
      }
    }

    return writes;
  }

  async deleteBatch(
    collection: SyncCollection,
    ids: string[],
    shardKey?: ShardKey
  ): Promise<number> {
    if (ids.length === 0) return 0;

    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_MAX_OPS) {
      const chunk = ids.slice(i, i + FIRESTORE_BATCH_MAX_OPS);
      const batch = writeBatch(this.firestore);
      for (const id of chunk) {
        const docRef = doc(
          this.firestore,
          getCollectionPath(this.userId, collection, shardKey),
          id
        );
        batch.delete(docRef);
      }
      await withRetry(
        () =>
          withTimeout(
            batch.commit(),
            `batch delete ${collection} chunk ${i / FIRESTORE_BATCH_MAX_OPS + 1}`
          ),
        `batch delete ${collection} chunk ${i / FIRESTORE_BATCH_MAX_OPS + 1}`
      );
    }

    return ids.length;
  }

  // ─── Delta Sync ─────────────────────────────────────────────────────────────

  async getDeltaChanges(
    collection: SyncCollection,
    lastSyncVersions: Record<string, number>,
    shardKey?: ShardKey
  ): Promise<RemoteDocument[]> {
    // Use a single flat-collection delta query so all devices observe the same
    // paths as realtime listeners.
    return this.getDeltaChangesOptimized(
      collection,
      lastSyncVersions,
      shardKey
    );
  }

  private async getDeltaChangesOptimized(
    collection: SyncCollection,
    lastSyncVersions: Record<string, number>,
    shardKey?: ShardKey
  ): Promise<RemoteDocument[]> {
    const collRef = getCollectionRef(this.userId, collection, shardKey);

    // For items we haven't seen, fetch everything > 0
    // For items we have seen, we need to fetch everything and filter client-side
    // because we need the exact id -> lastModified mapping
    const snap = await withTimeout(
      getDocs(collRef),
      `getDeltaChanges ${collection}${shardKey ? `/${shardKey}` : ''}`
    );

    const results: RemoteDocument[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const lm = extractLastModified(data);
      const lastKnown = lastSyncVersions[docSnap.id] ?? 0;

      // Include if: never seen before OR modified since last sync
      if (lm > lastKnown) {
        delete data._lastModified;
        results.push({
          id: docSnap.id,
          data,
          lastModified: lm,
          shardKey,
        });
      }
    });

    return results;
  }

  async getRemoteCounts(
    collections: SyncCollection[]
  ): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const promises = collections.map(async (coll) => {
      const collRef = getCollectionRef(this.userId, coll);
      const snap = await withTimeout(getDocs(collRef), `count ${coll}`);
      results[coll] = snap.size;
    });
    await Promise.all(promises);
    return results;
  }

  // ─── Settings Operations ────────────────────────────────────────────────────

  async getSettingsDoc(docId: string): Promise<RemoteDocument | null> {
    const docRef = doc(this.firestore, `users/${this.userId}/settings`, docId);
    const snap = await withTimeout(getDoc(docRef), `get settings/${docId}`);
    if (!snap.exists()) return null;
    const data = snap.data();
    delete data._lastModified;
    return {
      id: snap.id,
      data,
      lastModified: extractLastModified(snap.data()),
    };
  }

  async upsertSettingsDoc(
    docId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const cleaned = removeUndefined(data);
    if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
      throw new Error(`Invalid settings payload for ${docId}`);
    }
    const docRef = doc(this.firestore, `users/${this.userId}/settings`, docId);
    const localLm = extractLastModified(cleaned as DocumentData);
    await withRetry(
      () =>
        withTimeout(
          runTransaction(this.firestore, async (transaction) => {
            const snap = await transaction.get(docRef);
            const remote = snap.exists() ? snap.data() : undefined;
            if (
              !this.shouldWriteDocument(
                cleaned as Record<string, unknown>,
                localLm,
                remote
              )
            ) {
              return;
            }

            transaction.set(
              docRef,
              {
                ...(cleaned as Record<string, unknown>),
                _lastModified: serverTimestamp(),
              },
              { merge: true }
            );
          }),
          `upsert settings/${docId}`
        ),
      `upsert settings/${docId}`
    );
  }

  private shouldWriteDocument(
    localPrepared: Record<string, unknown>,
    localLastModified: number,
    remoteData?: DocumentData
  ): boolean {
    if (!remoteData) return true;
    const remoteLastModified = extractLastModified(remoteData);

    // If remote is newer than a timestamped local update, keep remote.
    if (localLastModified > 0 && remoteLastModified > localLastModified) {
      return false;
    }

    // Even when timestamps allow a write, skip if payload is unchanged.
    return !areEquivalentForSync(localPrepared, remoteData);
  }

  private async getRemoteDocsById(
    path: string,
    candidates: Array<{ id: string }>
  ): Promise<Map<string, DocumentData>> {
    const uniqueIds = Array.from(
      new Set(
        candidates
          .map((candidate) => candidate.id)
          .filter((id) => typeof id === 'string' && id.length > 0)
      )
    );

    const result = new Map<string, DocumentData>();
    if (uniqueIds.length === 0) return result;

    for (const idChunk of chunkIds(uniqueIds, RemoteRepository.QUERY_IN_MAX)) {
      const collRef = collection(this.firestore, path);
      const q = query(collRef, where(documentId(), 'in', idChunk));
      const snap = await withRetry(
        () => withTimeout(getDocs(q), `lookup docs ${path}`),
        `lookup docs ${path}`
      );
      snap.forEach((docSnap) => {
        result.set(docSnap.id, docSnap.data());
      });
    }

    return result;
  }

  // ─── Shard Helpers ──────────────────────────────────────────────────────────

  computeShardKey(data: Record<string, unknown>): ShardKey | undefined {
    const ts = data.createdAt ?? data.lastModified;
    if (!ts) return undefined;
    if (typeof ts === 'string') return getShardKey(new Date(ts));
    if (typeof ts === 'number') return getShardKey(ts);
    return undefined;
  }

  getShardKey(date: Date | number | string): ShardKey {
    return getShardKey(date);
  }

  // ─── Flush Queue Operations ─────────────────────────────────────────────────

  async flushOperations(
    ops: SyncOperation[],
    getState: () => SyncableData
  ): Promise<void> {
    const state = getState();
    const historyItems: Record<string, unknown>[] = [
      ...state.questionHistory,
      ...state.mcHistory,
      ...state.savedSets,
    ];
    const stateById = new Map<string, Record<string, unknown>>();
    for (const item of historyItems) {
      if (item.id && typeof item.id === 'string') {
        stateById.set(item.id, item);
      }
    }

    const upsertsByCollection = new Map<
      string,
      Array<{ id: string; data: Record<string, unknown> }>
    >();
    const deletesByCollection = new Map<string, string[]>();
    const settingsOps: Array<{ docId: string; data: Record<string, unknown> }> =
      [];

    for (const op of ops) {
      if (op.collection === 'settings') {
        if (op.entityId === 'main') {
          settingsOps.push({
            docId: 'main',
            data: { settings: state.settings ?? {} },
          });
        } else if (op.entityId === 'goals') {
          settingsOps.push({
            docId: 'goals',
            data: {
              studyGoals: state.studyGoals ?? {},
              streakData: state.streakData ?? {},
            },
          });
        } else if (op.entityId === 'presets') {
          settingsOps.push({
            docId: 'presets',
            data: { presets: state.presets ?? [] },
          });
        }
        continue;
      }

      const key = op.collection;
      if (op.opType === 'delete') {
        if (!deletesByCollection.has(key)) deletesByCollection.set(key, []);
        if (op.entityId) deletesByCollection.get(key)!.push(op.entityId);
      } else {
        if (op.entityId) {
          const data = stateById.get(op.entityId);
          if (data) {
            if (!upsertsByCollection.has(key)) upsertsByCollection.set(key, []);
            upsertsByCollection.get(key)!.push({ id: op.entityId, data });
          }
        }
      }
    }

    const promises: Promise<unknown>[] = [];

    for (const [coll, items] of upsertsByCollection.entries()) {
      promises.push(this.upsertBatch(coll as SyncCollection, items));
    }
    for (const [coll, ids] of deletesByCollection.entries()) {
      promises.push(this.deleteBatch(coll as SyncCollection, ids));
    }
    for (const { docId, data } of settingsOps) {
      promises.push(this.upsertSettingsDoc(docId, data));
    }

    await Promise.all(promises);
  }
}
