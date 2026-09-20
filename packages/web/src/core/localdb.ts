import type { OutboxOperation, StoredRecord } from '@pluralnova/shared';

/**
 * The local database.
 *
 * IndexedDB holds a copy of everything the account has pulled, plus an outbox
 * of changes made while offline. Reads come from here first, so a screen opens
 * instantly and still works with no connection; the sync engine reconciles in
 * the background.
 *
 * Every call degrades rather than throwing: if IndexedDB is unavailable — a
 * private window, a locked-down browser — the app falls back to network-only
 * and says so, instead of failing to start.
 */

const DB_NAME = 'pluralnova';
const DB_VERSION = 1;

const STORE_RECORDS = 'records';
const STORE_OUTBOX = 'outbox';
const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase | null> | null = null;
let unavailableReason: string | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      unavailableReason = 'This browser does not provide offline storage.';
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      unavailableReason = 'Offline storage is blocked in this browser.';
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        // Keyed by `collection:id` so one store serves every collection while
        // still allowing a whole collection to be read as a contiguous range.
        const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'key' });
        store.createIndex('collection', 'collection', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      unavailableReason = 'Offline storage could not be opened.';
      resolve(null);
    };
    request.onblocked = () => {
      unavailableReason = 'Another PluralNova tab is upgrading the local database.';
      resolve(null);
    };
  });

  return dbPromise;
}

export function offlineStorageProblem(): string | null {
  return unavailableReason;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(storeName, mode);
          const request = work(transaction.objectStore(storeName));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

interface StoredRow {
  key: string;
  collection: string;
  id: string;
  updatedAt: string;
  record: StoredRecord;
}

const keyOf = (collection: string, id: string): string => `${collection}:${id}`;

export async function putRecords(collection: string, records: StoredRecord[]): Promise<void> {
  const db = await openDatabase();
  if (!db || records.length === 0) return;

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_RECORDS, 'readwrite');
      const store = transaction.objectStore(STORE_RECORDS);
      for (const record of records) {
        store.put({
          key: keyOf(collection, record.id),
          collection,
          id: record.id,
          updatedAt: record.updatedAt,
          record,
        } satisfies StoredRow);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function readCollection(collection: string): Promise<StoredRecord[]> {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_RECORDS, 'readonly');
      const index = transaction.objectStore(STORE_RECORDS).index('collection');
      const request = index.getAll(IDBKeyRange.only(collection));
      request.onsuccess = () => {
        const rows = (request.result ?? []) as StoredRow[];
        resolve(rows.map((row) => row.record).filter((record) => !record.deletedAt));
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function readRecord(collection: string, id: string): Promise<StoredRecord | null> {
  const row = await run<StoredRow>(STORE_RECORDS, 'readonly', (store) =>
    store.get(keyOf(collection, id)) as IDBRequest<StoredRow>,
  );
  return row?.record ?? null;
}

export async function removeRecord(collection: string, id: string): Promise<void> {
  await run(STORE_RECORDS, 'readwrite', (store) => store.delete(keyOf(collection, id)));
}

export async function clearAll(): Promise<void> {
  for (const storeName of [STORE_RECORDS, STORE_OUTBOX, STORE_META]) {
    await run(storeName, 'readwrite', (store) => store.clear());
  }
}

/** Removes cached rows for one collection, used after a restore rewrites it. */
export async function clearCollection(collection: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_RECORDS, 'readwrite');
      const index = transaction.objectStore(STORE_RECORDS).index('collection');
      const request = index.openCursor(IDBKeyRange.only(collection));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ── Outbox ─────────────────────────────────────────────────────────────────

export async function queueOperation(operation: OutboxOperation): Promise<void> {
  await run(STORE_OUTBOX, 'readwrite', (store) => store.put(operation));
}

export async function readOutbox(): Promise<OutboxOperation[]> {
  const rows = await run<OutboxOperation[]>(STORE_OUTBOX, 'readonly', (store) => store.getAll());
  return (rows ?? []).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeOperations(ids: string[]): Promise<void> {
  const db = await openDatabase();
  if (!db || ids.length === 0) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = transaction.objectStore(STORE_OUTBOX);
      for (const id of ids) store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function markOperationFailed(id: string, message: string): Promise<void> {
  const existing = await run<OutboxOperation>(STORE_OUTBOX, 'readonly', (store) => store.get(id));
  if (!existing) return;
  await queueOperation({ ...existing, attempts: existing.attempts + 1, lastError: message });
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await run<{ key: string; value: T }>(STORE_META, 'readonly', (store) => store.get(key));
  return row?.value ?? null;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await run(STORE_META, 'readwrite', (store) => store.put({ key, value }));
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}
