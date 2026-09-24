import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { newId, now, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { ApiRequestError, api, isOffline, messageFor } from './api.js';
import { clearCollection, getMeta, putRecords, readCollection, removeRecord, setMeta } from './localdb.js';
import { syncEngine } from './sync.js';

/**
 * The data layer every module reads through.
 *
 * Reads resolve from the local cache immediately and refresh from the server
 * behind them, so a screen never opens on a spinner when it already has the
 * answer. Writes apply to the cache first and queue for sync, so the interface
 * responds at the speed of the device rather than the connection.
 */

interface CacheEntry {
  records: StoredRecord[];
  loadedAt: number;
  loading: boolean;
  error: string | null;
}

type Subscriber = () => void;

class RecordStore {
  private cache = new Map<string, CacheEntry>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private inFlight = new Map<string, Promise<void>>();

  snapshot(collection: string): CacheEntry {
    return (
      this.cache.get(collection) ?? { records: [], loadedAt: 0, loading: false, error: null }
    );
  }

  subscribe(collection: string, subscriber: Subscriber): () => void {
    let set = this.subscribers.get(collection);
    if (!set) {
      set = new Set();
      this.subscribers.set(collection, set);
    }
    set.add(subscriber);
    return () => set.delete(subscriber);
  }

  private emit(collection: string): void {
    for (const subscriber of this.subscribers.get(collection) ?? []) subscriber();
  }

  private set(collection: string, patch: Partial<CacheEntry>): void {
    this.cache.set(collection, { ...this.snapshot(collection), ...patch });
    this.emit(collection);
  }

  /** Loads a collection: cache first, then the network, then the cache again. */
  async load(collection: string, options: { force?: boolean } = {}): Promise<void> {
    const existing = this.cache.get(collection);
    const fresh = existing && Date.now() - existing.loadedAt < 30_000;
    if (fresh && !options.force) return;

    const pending = this.inFlight.get(collection);
    if (pending) return pending;

    const work = (async () => {
      if (!existing) {
        const cached = await readCollection(collection);
        if (cached.length > 0) {
          this.set(collection, { records: sortFor(collection, cached), loadedAt: Date.now() });
        } else {
          this.set(collection, { loading: true });
        }
      }

      try {
        const result = await api.get<{ items: StoredRecord[] }>(
          `/api/records/${collection}`,
          { limit: 500 },
        );
        await putRecords(collection, result.items);
        this.set(collection, {
          records: sortFor(collection, result.items),
          loadedAt: Date.now(),
          loading: false,
          error: null,
        });
      } catch (error) {
        const cached = await readCollection(collection);
        this.set(collection, {
          records: sortFor(collection, cached),
          loading: false,
          // Offline is a state, not a failure: the cached copy is still shown.
          error: isOffline(error) ? null : messageFor(error),
          loadedAt: Date.now(),
        });
      } finally {
        this.inFlight.delete(collection);
      }
    })();

    this.inFlight.set(collection, work);
    return work;
  }

  /** Re-reads a collection from the local database after a sync pull. */
  async refreshFromCache(collection: string): Promise<void> {
    if (!this.cache.has(collection)) return;
    const cached = await readCollection(collection);
    this.set(collection, { records: sortFor(collection, cached) });
  }

  async create(
    collection: string,
    input: Record<string, unknown>,
  ): Promise<StoredRecord> {
    const definition = requireCollection(collection);
    const id = (input['id'] as string) ?? newId(collection.slice(0, 3).toLowerCase());
    const timestamp = now();

    const optimistic: StoredRecord = {
      id,
      userId: '',
      systemId: null,
      memberId: (input['memberId'] as string) ?? null,
      visibility: (input['visibility'] as StoredRecord['visibility']) ?? 'private',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      version: 1,
      ...defaultsFor(collection),
      ...input,
    } as StoredRecord;

    this.set(collection, {
      records: sortFor(collection, [optimistic, ...this.snapshot(collection).records]),
    });
    await putRecords(collection, [optimistic]);

    try {
      const saved = await api.post<StoredRecord>(`/api/records/${collection}`, { ...input, id });
      await putRecords(collection, [saved]);
      this.replace(collection, saved);
      return saved;
    } catch (error) {
      if (isOffline(error)) {
        // Kept locally and queued; the row is already on screen.
        await syncEngine.enqueue(collection, id, 'upsert', { ...input, id }, 0);
        return optimistic;
      }
      this.remove(collection, id);
      await removeRecord(collection, id);
      void definition;
      throw error;
    }
  }

  async update(
    collection: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<StoredRecord> {
    const current = this.snapshot(collection).records.find((record) => record.id === id);
    const optimistic = current
      ? ({ ...current, ...patch, updatedAt: now() } as StoredRecord)
      : null;
    if (optimistic) {
      this.replace(collection, optimistic);
      await putRecords(collection, [optimistic]);
    }

    try {
      const saved = await api.patch<StoredRecord>(`/api/records/${collection}/${id}`, patch);
      await putRecords(collection, [saved]);
      this.replace(collection, saved);
      return saved;
    } catch (error) {
      if (isOffline(error)) {
        await syncEngine.enqueue(collection, id, 'upsert', patch, current?.version ?? 0);
        return optimistic ?? ({ id } as StoredRecord);
      }
      // The write failed for a real reason, so the optimistic edit is rolled back.
      if (current) {
        this.replace(collection, current);
        await putRecords(collection, [current]);
      }
      throw error;
    }
  }

  async remove(collection: string, id: string): Promise<void> {
    const current = this.snapshot(collection).records.find((record) => record.id === id);
    this.set(collection, {
      records: this.snapshot(collection).records.filter((record) => record.id !== id),
    });

    try {
      await api.delete(`/api/records/${collection}/${id}`);
      await removeRecord(collection, id);
    } catch (error) {
      if (isOffline(error)) {
        await syncEngine.enqueue(collection, id, 'delete', null, current?.version ?? 0);
        await removeRecord(collection, id);
        return;
      }
      if (current) {
        this.set(collection, {
          records: sortFor(collection, [current, ...this.snapshot(collection).records]),
        });
      }
      throw error;
    }
  }

  async restore(collection: string, id: string): Promise<StoredRecord> {
    const restored = await api.post<StoredRecord>(`/api/records/${collection}/${id}/restore`);
    await putRecords(collection, [restored]);
    this.set(collection, {
      records: sortFor(collection, [restored, ...this.snapshot(collection).records]),
    });
    return restored;
  }

  private replace(collection: string, record: StoredRecord): void {
    const records = this.snapshot(collection).records;
    const index = records.findIndex((candidate) => candidate.id === record.id);
    const next = index >= 0 ? records.with(index, record) : [record, ...records];
    this.set(collection, { records: sortFor(collection, next) });
  }

  /** Drops everything, for sign-out and account switching. */
  async clear(): Promise<void> {
    for (const collection of this.cache.keys()) await clearCollection(collection);
    this.cache.clear();
    for (const collection of this.subscribers.keys()) this.emit(collection);
  }

  invalidate(collection: string): void {
    const existing = this.cache.get(collection);
    if (existing) this.cache.set(collection, { ...existing, loadedAt: 0 });
  }
}

function defaultsFor(collection: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of requireCollection(collection).fields) {
    out[field.name] =
      field.defaultValue ?? (field.kind === 'tags' || field.kind === 'refs' ? [] : null);
  }
  return out;
}

function sortFor(collection: string, records: StoredRecord[]): StoredRecord[] {
  const definition = requireCollection(collection);
  const field = definition.sortField ?? 'updatedAt';
  const direction = definition.sortDir === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === right) return a.id.localeCompare(b.id);
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right)) * direction;
  });
}

export const recordStore = new RecordStore();

const StoreContext = createContext(recordStore);

export function DataProvider({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    // A sync pull refreshes whatever it touched straight from the cache, so an
    // open list updates without the screen asking for it.
    return syncEngine.onCollectionsChanged((collections) => {
      for (const collection of collections) void recordStore.refreshFromCache(collection);
    });
  }, []);

  return <StoreContext.Provider value={recordStore}>{children}</StoreContext.Provider>;
}

export interface CollectionQuery {
  /** Client-side filter applied to the cached rows. */
  filter?: (record: StoredRecord) => boolean;
  sort?: (a: StoredRecord, b: StoredRecord) => number;
  search?: string;
  limit?: number;
  /** Skips loading until true — used by tabs that are not open yet. */
  enabled?: boolean;
}

export interface CollectionResult {
  items: StoredRecord[];
  all: StoredRecord[];
  loading: boolean;
  /** 0 until the store has a real answer (cache or network); never goes back to 0 after. */
  loadedAt: number;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: Record<string, unknown>) => Promise<StoredRecord>;
  update: (id: string, patch: Record<string, unknown>) => Promise<StoredRecord>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<StoredRecord>;
}

export function useCollection(collection: string, query: CollectionQuery = {}): CollectionResult {
  const store = useContext(StoreContext);
  const enabled = query.enabled !== false;
  const [entry, setEntry] = useState(() => store.snapshot(collection));

  useEffect(() => {
    const unsubscribe = store.subscribe(collection, () => setEntry(store.snapshot(collection)));
    setEntry(store.snapshot(collection));
    if (enabled) void store.load(collection);
    return unsubscribe;
  }, [collection, enabled, store]);

  const searchable = useMemo(
    () => requireCollection(collection).fields.filter((field) => field.searchable),
    [collection],
  );

  const items = useMemo(() => {
    let result = entry.records;
    if (query.filter) result = result.filter(query.filter);

    const term = query.search?.trim().toLowerCase();
    if (term) {
      result = result.filter((record) =>
        searchable.some((field) => {
          const value = record[field.name];
          if (typeof value === 'string') return value.toLowerCase().includes(term);
          if (Array.isArray(value)) return value.some((item) => String(item).toLowerCase().includes(term));
          return false;
        }),
      );
    }

    if (query.sort) result = [...result].sort(query.sort);
    if (query.limit) result = result.slice(0, query.limit);
    return result;
  }, [entry.records, query.filter, query.limit, query.search, query.sort, searchable]);

  const reload = useCallback(() => store.load(collection, { force: true }), [collection, store]);
  const create = useCallback(
    (input: Record<string, unknown>) => store.create(collection, input),
    [collection, store],
  );
  const update = useCallback(
    (id: string, patch: Record<string, unknown>) => store.update(collection, id, patch),
    [collection, store],
  );
  const remove = useCallback((id: string) => store.remove(collection, id), [collection, store]);
  const restore = useCallback((id: string) => store.restore(collection, id), [collection, store]);

  return {
    items,
    all: entry.records,
    loading: entry.loading && entry.records.length === 0,
    loadedAt: entry.loadedAt,
    error: entry.error,
    reload,
    create,
    update,
    remove,
    restore,
  };
}

export function useRecord(collection: string, id: string | undefined): StoredRecord | null {
  const { all } = useCollection(collection, { enabled: Boolean(id) });
  return useMemo(() => all.find((record) => record.id === id) ?? null, [all, id]);
}

/** A map from id to record, for the many screens that resolve member references. */
export function useRecordMap(collection: string): Map<string, StoredRecord> {
  const { all } = useCollection(collection);
  return useMemo(() => new Map(all.map((record) => [record.id, record])), [all]);
}

/**
 * A one-off server request with loading and error state, for endpoints that are
 * computed rather than stored — statistics, the daily summary, search.
 *
 * The last answer for a given path and query is kept locally, the same way a
 * collection's records are: read first so a repeat visit never opens blank,
 * then replaced by whatever the network returns. Offline, that cached answer
 * is what stays on screen instead of an error where a chart used to be.
 */
export function useQuery<T>(
  path: string | null,
  query?: Record<string, string | number | undefined>,
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const serialised = JSON.stringify(query ?? {});
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (!path) {
      setLoading(false);
      return;
    }
    const cacheKey = `query:${path}?${serialised}`;
    setError(null);

    let hadCache = false;
    void (async () => {
      const cached = await getMeta<T>(cacheKey);
      if (!active.current) return;
      if (cached !== null) {
        hadCache = true;
        setData(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const result = await api.get<T>(path, JSON.parse(serialised) as Record<string, string>);
        if (!active.current) return;
        setData(result);
        setError(null);
        void setMeta(cacheKey, result);
      } catch (cause) {
        if (!active.current) return;
        setError(
          cause instanceof ApiRequestError && isOffline(cause)
            ? hadCache
              ? 'Shown from this device. Reconnect for the latest.'
              : 'Not on this device yet — open this once while connected.'
            : messageFor(cause),
        );
      } finally {
        if (active.current) setLoading(false);
      }
    })();

    return () => {
      active.current = false;
    };
  }, [path, serialised, nonce]);

  return { data, loading, error, reload: () => setNonce((value) => value + 1) };
}
