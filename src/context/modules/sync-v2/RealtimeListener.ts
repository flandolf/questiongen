/**
 * Firestore realtime listeners for all collections.
 *
 * Features:
 * - onSnapshot subscriptions for collections (including sharded subcollections)
 * - Change event propagation (added, modified, removed)
 * - Automatic reconnection on network changes
 * - Throttled rapid-fire updates
 * - Lifecycle management (start, stop, restart)
 */

import {
  collection,
  type DocumentData,
  type Firestore,
  onSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../firebase-init';
import { LISTENER_THROTTLE_MS } from './config';
import type { ShardKey, SyncCollection } from './types';

export type ChangeType = 'added' | 'modified' | 'removed';

export interface ChangeEvent {
  collection: SyncCollection;
  docId: string;
  data: Record<string, unknown> | null;
  type: ChangeType;
  shardKey?: ShardKey;
  lastModified?: number;
}

type ChangeCallback = (events: ChangeEvent[]) => void;
type ListenerErrorCallback = () => void;

function toMillisValue(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis === 'function') {
    return maybeTimestamp.toMillis();
  }
  return 0;
}

function extractLastModified(raw: Record<string, unknown>): number {
  const fromTimestamp = toMillisValue(raw._lastModified);
  if (fromTimestamp > 0) return fromTimestamp;
  return typeof raw.lastModified === 'number' ? raw.lastModified : 0;
}

// ─── Listener Manager ─────────────────────────────────────────────────────────

export class RealtimeListener {
  private userId: string;
  private firestore: Firestore;
  private unsubscribes: Map<string, Unsubscribe> = new Map();
  private callback: ChangeCallback;
  private onListenerError: ListenerErrorCallback;
  private isRunning = false;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEvents: ChangeEvent[] = [];
  private collections: SyncCollection[] = [
    'questionHistory',
    'mcHistory',
    'savedSets',
  ];
  private settingsDocs = ['main', 'goals', 'presets'];

  constructor(
    userId: string,
    onChange: ChangeCallback,
    firestoreInstance?: Firestore,
    onError?: ListenerErrorCallback
  ) {
    this.userId = userId;
    this.firestore = firestoreInstance ?? db;
    this.callback = onChange;
    this.onListenerError = onError ?? (() => undefined);
  }

  updateUserId(newUserId: string): void {
    const wasRunning = this.isRunning;
    this.stop();
    this.userId = newUserId;
    if (wasRunning) this.start();
  }

  setCollections(collections: SyncCollection[]): void {
    this.collections = collections;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startAllListeners();
  }

  stop(): void {
    this.isRunning = false;
    this.stopAllListeners();
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingEvents = [];
  }

  restart(): void {
    this.stop();
    this.start();
  }

  isListening(): boolean {
    return this.isRunning;
  }

  private startAllListeners(): void {
    // Collection listeners
    for (const coll of this.collections) {
      this.startCollectionListener(coll);
    }
    // Settings document listeners
    for (const docId of this.settingsDocs) {
      this.startSettingsListener(docId);
    }
  }

  private stopAllListeners(): void {
    for (const [key, unsub] of this.unsubscribes.entries()) {
      unsub();
      this.unsubscribes.delete(key);
    }
  }

  private startCollectionListener(collectionName: SyncCollection): void {
    const key = `collection:${collectionName}`;
    if (this.unsubscribes.has(key)) return;

    const collRef = collection(
      this.firestore,
      `users/${this.userId}/${collectionName}`
    );
    const unsub = onSnapshot(
      collRef,
      (snapshot) => this.handleSnapshot(collectionName, snapshot),
      (error) => this.handleError(collectionName, error)
    );
    this.unsubscribes.set(key, unsub);
  }

  private startSettingsListener(docId: string): void {
    const key = `settings:${docId}`;
    if (this.unsubscribes.has(key)) return;

    const docRef = collection(this.firestore, `users/${this.userId}/settings`);
    // For settings, we listen to the whole settings collection to catch all doc changes
    const unsub = onSnapshot(
      docRef, // onSnapshot works on collections; settings docs are in this collection
      (snapshot: QuerySnapshot<DocumentData>) => {
        const events: ChangeEvent[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.doc.id === docId) {
            const raw = change.doc.data();
            const lm = (() => {
              try {
                return extractLastModified(raw as Record<string, unknown>);
              } catch {
                return 0;
              }
            })();
            const data = { ...(raw as Record<string, unknown>) } as Record<
              string,
              unknown
            >;
            delete data._lastModified;
            events.push({
              collection: 'settings',
              docId: change.doc.id,
              data: change.type === 'removed' ? null : data,
              type: change.type as ChangeType,
              lastModified: lm,
            });
          }
        });
        if (events.length > 0) this.enqueueEvents(events);
      },
      (error) => {
        this.handleSettingsError(error);
      }
    );
    this.unsubscribes.set(key, unsub);
  }

  private handleSnapshot(
    collectionName: SyncCollection,
    snapshot: QuerySnapshot<DocumentData>
  ): void {
    const events: ChangeEvent[] = [];
    snapshot.docChanges().forEach((change) => {
      const raw = change.doc.data();
      // extract numeric lastModified where possible
      const lm = (() => {
        try {
          return extractLastModified(raw as Record<string, unknown>);
        } catch {
          return 0;
        }
      })();
      const data = { ...(raw as Record<string, unknown>) } as Record<
        string,
        unknown
      >;
      delete data._lastModified;
      events.push({
        collection: collectionName,
        docId: change.doc.id,
        data: change.type === 'removed' ? null : data,
        type: change.type as ChangeType,
        lastModified: lm,
      });
    });
    if (events.length > 0) this.enqueueEvents(events);
  }

  private handleError(collectionName: SyncCollection, error: unknown): void {
    console.warn(
      `[SyncV2] Realtime listener error for ${collectionName}:`,
      error
    );
    this.onListenerError();
  }

  private handleSettingsError(error: unknown): void {
    console.warn('[SyncV2] Realtime listener error for settings:', error);
    this.onListenerError();
  }

  private enqueueEvents(events: ChangeEvent[]): void {
    // Skip empty batches to reduce unnecessary pull cycles
    if (events.length === 0) return;

    this.pendingEvents.push(...events);
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      const eventsToEmit = [...this.pendingEvents];
      this.pendingEvents = [];
      if (eventsToEmit.length > 0) {
        this.callback(eventsToEmit);
      }
    }, LISTENER_THROTTLE_MS);
  }

  destroy(): void {
    this.stop();
  }
}
