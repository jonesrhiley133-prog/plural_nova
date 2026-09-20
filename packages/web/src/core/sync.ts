import {
  newId,
  now,
  type OutboxOperation,
  type StoredRecord,
  type SyncConflict,
} from '@pluralnova/shared';
import { ApiRequestError, api, isOffline } from './api.js';
import {
  getMeta,
  putRecords,
  queueOperation,
  readOutbox,
  removeOperations,
  setMeta,
  markOperationFailed,
} from './localdb.js';

/**
 * The sync engine.
 *
 * Writes go to the local database first and to an outbox, so the interface
 * never waits on the network. The engine drains the outbox when it can, then
 * pulls whatever changed elsewhere. Conflicts are handed back rather than
 * resolved quietly — the caller decides what to show.
 */

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pendingCount: number;
  lastError: string | null;
  conflicts: SyncConflict[];
}

type Listener = (status: SyncStatus) => void;

const CURSOR_KEY = 'sync.cursor';

class SyncEngine {
  private status: SyncStatus = {
    state: navigator.onLine ? 'idle' : 'offline',
    lastSyncedAt: null,
    pendingCount: 0,
    lastError: null,
    conflicts: [],
  };

  private listeners = new Set<Listener>();
  private changeListeners = new Set<(collections: string[]) => void>();
  private running = false;
  private queued = false;
  private timer: number | null = null;

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Fires when a pull brought in rows, so views can refresh from the cache. */
  onCollectionsChanged(listener: (collections: string[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  /** Records a change locally and schedules it for the server. */
  async enqueue(
    collection: string,
    recordId: string,
    op: 'upsert' | 'delete',
    payload: Record<string, unknown> | null,
    baseVersion: number,
  ): Promise<void> {
    const operation: OutboxOperation = {
      id: newId('op'),
      collection,
      recordId,
      op,
      payload,
      baseVersion,
      queuedAt: now(),
      attempts: 0,
    };
    await queueOperation(operation);
    this.update({ pendingCount: this.status.pendingCount + 1 });
    this.schedule(400);
  }

  /** Coalesces rapid calls into one run rather than syncing per keystroke. */
  schedule(delayMs = 1500): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  async run(): Promise<SyncStatus> {
    if (this.running) {
      this.queued = true;
      return this.status;
    }
    if (!navigator.onLine) {
      this.update({ state: 'offline' });
      return this.status;
    }

    this.running = true;
    this.update({ state: 'syncing', lastError: null });

    try {
      await this.push();
      const changed = await this.pull();
      this.update({
        state: 'idle',
        lastSyncedAt: now(),
        pendingCount: (await readOutbox()).length,
      });
      if (changed.length > 0) {
        for (const listener of this.changeListeners) listener(changed);
      }
    } catch (error) {
      if (isOffline(error)) {
        this.update({ state: 'offline' });
      } else {
        this.update({
          state: 'error',
          lastError: error instanceof ApiRequestError ? error.message : 'Sync could not finish.',
        });
      }
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.schedule(600);
      }
    }

    return this.status;
  }

  private async push(): Promise<void> {
    const operations = await readOutbox();
    if (operations.length === 0) return;

    // Sent in batches so a long offline stretch does not produce one enormous
    // request that times out and never drains.
    for (let index = 0; index < operations.length; index += 100) {
      const batch = operations.slice(index, index + 100);
      const result = await api.post<{
        applied: string[];
        conflicts: SyncConflict[];
        rejected: { operationId: string; error: { message: string } }[];
      }>('/api/sync/push', {
        operations: batch.map((operation) => ({
          id: operation.id,
          collection: operation.collection,
          recordId: operation.recordId,
          op: operation.op,
          payload: operation.payload,
          baseVersion: operation.baseVersion,
        })),
      });

      await removeOperations(result.applied);

      for (const conflict of result.conflicts) {
        // The server's copy replaces the cached one so the user sees the truth,
        // and the operation is dropped rather than retried into the same clash.
        await putRecords(conflict.collection, [conflict.server]);
        await removeOperations([conflict.operationId]);
      }
      if (result.conflicts.length > 0) {
        this.update({ conflicts: [...this.status.conflicts, ...result.conflicts].slice(-20) });
      }

      for (const rejection of result.rejected) {
        const operation = batch.find((candidate) => candidate.id === rejection.operationId);
        if (!operation) continue;
        if (operation.attempts >= 4) {
          // Five failures means this will not succeed; drop it rather than
          // blocking every later change behind it.
          await removeOperations([operation.id]);
        } else {
          await markOperationFailed(operation.id, rejection.error.message);
        }
      }
    }
  }

  private async pull(): Promise<string[]> {
    const cursor = (await getMeta<string>(CURSOR_KEY)) ?? '';
    const result = await api.get<{
      changes: Record<string, StoredRecord[]>;
      cursor: string;
      hasMore: boolean;
    }>('/api/sync/pull', cursor ? { since: cursor } : {});

    const collections = Object.keys(result.changes);
    for (const [collection, records] of Object.entries(result.changes)) {
      await putRecords(collection, records);
    }
    await setMeta(CURSOR_KEY, result.cursor);

    // A capped page means more is waiting; keep going rather than leaving the
    // device a page behind until the next scheduled run.
    if (result.hasMore) {
      const more = await this.pull();
      return [...new Set([...collections, ...more])];
    }
    return collections;
  }

  async reset(): Promise<void> {
    await setMeta(CURSOR_KEY, '');
    this.update({ lastSyncedAt: null, conflicts: [], pendingCount: 0 });
  }

  dismissConflict(operationId: string): void {
    this.update({
      conflicts: this.status.conflicts.filter((conflict) => conflict.operationId !== operationId),
    });
  }
}

export const syncEngine = new SyncEngine();

/** Wires the engine to connectivity and visibility changes. */
export function startSyncWatchers(): () => void {
  const online = (): void => {
    syncEngine.schedule(200);
  };
  const offline = (): void => {
    syncEngine.schedule(0);
  };
  const visibility = (): void => {
    if (document.visibilityState === 'visible') syncEngine.schedule(500);
  };

  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visibility);

  // A slow heartbeat catches anything the realtime channel missed while the
  // socket was down, without polling hard enough to matter.
  const heartbeat = window.setInterval(() => syncEngine.schedule(0), 5 * 60_000);

  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visibility);
    window.clearInterval(heartbeat);
  };
}
