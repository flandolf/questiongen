/// <reference types="bun-types" />

import type { Database } from 'bun:sqlite';
import type { KeyValueStore } from '@opencoredev/loginwithchatgpt-server';

interface StoredRow {
  value: string;
  expiresAt: number | null;
}

export class SqliteKeyValueStore<T> implements KeyValueStore<T> {
  constructor(
    private readonly database: Database,
    private readonly namespace: string,
  ) {
    database.run(`
      CREATE TABLE IF NOT EXISTS questiongen_chatgpt_kv (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (namespace, key)
      )
    `);
  }

  get(key: string): T | undefined {
    const row = this.database
      .query(
        'SELECT value, expires_at AS expiresAt FROM questiongen_chatgpt_kv WHERE namespace = ? AND key = ?',
      )
      .get(this.namespace, key) as StoredRow | null;
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: T, options: { ttlMs?: number } = {}): void {
    const expiresAt =
      options.ttlMs === undefined ? null : Date.now() + options.ttlMs;
    this.database
      .query(`
        INSERT INTO questiongen_chatgpt_kv (namespace, key, value, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
          value = excluded.value,
          expires_at = excluded.expires_at
      `)
      .run(this.namespace, key, JSON.stringify(value), expiresAt);
  }

  delete(key: string): void {
    this.database
      .query(
        'DELETE FROM questiongen_chatgpt_kv WHERE namespace = ? AND key = ?',
      )
      .run(this.namespace, key);
  }
}
