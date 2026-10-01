import { useEffect, useState } from 'react';
import { randomToken, now, type StoredRecord } from '@pluralnova/shared';
import { api, isOffline, messageFor } from './api.js';
import { getMeta, setMeta } from './localdb.js';
import { realtime } from './realtime.js';
import { recordStore } from './data.js';

/**
 * The current front.
 *
 * Fronting is the one thing in the app that several screens need to agree on at
 * once, so this is a single store shared by the whole app rather than one fetch
 * per screen — a front started from a member's card and a front shown on the
 * dashboard are the same fact, seen through the same subscription, not two
 * independent reads that happen to usually agree. The state survives a reload
 * because it lives in the database, not in the page.
 */

export interface ActiveFront extends StoredRecord {
  minutes: number;
  duration: string;
  member: StoredRecord | null;
  coFronters: StoredRecord[];
}

export interface FrontState {
  active: ActiveFront[];
  fronting: StoredRecord[];
  recent: (StoredRecord & { member: StoredRecord | null })[];
  isEmpty: boolean;
  memberCount: number;
}

const EMPTY: FrontState = {
  active: [],
  fronting: [],
  recent: [],
  isEmpty: true,
  memberCount: 0,
};

const CACHE_KEY = 'fronting.current';
const PENDING_KEY = 'fronting.pendingQuickFronts';
const PENDING_ACTIONS_KEY = 'fronting.pendingActions';

interface PendingQuickFront {
  memberId: string;
  queuedAt: string;
}

/**
 * Every fronting mutation applies to this store immediately and is queued for
 * the server if there is nowhere to send it yet — fronting is a local fact
 * first, the way it is in a paper system, and a phone with no signal is not a
 * reason a switch failed to happen. `start` and `switchTo` carry a
 * client-chosen record id the server is told to reuse, so the request that
 * eventually lands reconciles the same record instead of creating a second
 * one, online or replayed later.
 */
type PendingAction =
  | { kind: 'start'; clientId: string; input: StartFrontInput }
  | { kind: 'switchTo'; clientId: string; input: StartFrontInput }
  | { kind: 'end'; eventId?: string }
  | { kind: 'clear' }
  | { kind: 'addCoFronter'; eventId: string; memberId: string }
  | { kind: 'removeCoFronter'; eventId: string; memberId: string };

export interface StartFrontInput {
  memberId?: string | null;
  coFronterIds?: string[];
  startedAt?: string;
  note?: string;
  mood?: string;
  locationIds?: string[];
  activity?: string;
  tags?: string[];
  endOthers?: boolean;
  unknownFronter?: boolean;
}

type Listener = () => void;

class FrontingStore {
  state: FrontState = EMPTY;
  loading = true;
  error: string | null = null;
  private listeners = new Set<Listener>();
  private started = false;
  private teardown: (() => void) | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Runs once for the app's lifetime — later calls (every screen that reads fronting) are no-ops. */
  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    void this.reload();
    // Another device — or another tab's optimistic Quick Front — changing the
    // front updates this one without a manual refresh.
    const stopRealtime = realtime.on((event) => {
      if (event.type === 'front.changed') void this.reload();
    });
    // Reconnecting is exactly when a cached or optimistic answer is most
    // likely to need reconciling against the server, and when anything Quick
    // Front queued while offline can finally be sent.
    const onOnline = (): void => void this.reload();
    window.addEventListener('online', onOnline);
    this.teardown = () => {
      stopRealtime();
      window.removeEventListener('online', onOnline);
    };
  }

  /** Signing out or switching the active system means this state belongs to nobody any more. */
  reset(): void {
    this.teardown?.();
    this.teardown = null;
    this.started = false;
    this.state = EMPTY;
    this.loading = true;
    this.error = null;
    this.emit();
  }

  isFrontingAlready(memberId: string): boolean {
    return this.state.active.some(
      (event) => event.memberId === memberId || event.coFronters.some((co) => co.id === memberId),
    );
  }

  async reload(): Promise<void> {
    if (navigator.onLine) {
      await this.drainPending();
      await this.drainPendingActions();
    }

    try {
      const result = await api.get<FrontState>('/api/fronting/current');
      this.state = result;
      this.error = null;
      void setMeta(CACHE_KEY, result);
    } catch (cause) {
      // The default cache-miss state is "nobody's fronting," which is a real
      // answer everywhere else in the app — here specifically it would be a
      // false one, so a device that has already seen who's out keeps showing
      // that instead of quietly reverting to empty the moment it goes offline.
      if (isOffline(cause)) {
        const cached = await getMeta<FrontState>(CACHE_KEY);
        if (cached) {
          this.state = cached;
          this.error = 'Shown from this device. Reconnect for the latest.';
          this.loading = false;
          this.emit();
          return;
        }
      }
      this.error = messageFor(cause);
    }
    this.loading = false;
    this.emit();
  }

  private async after(): Promise<void> {
    // Members and events both moved, so their caches are re-read rather than
    // patched — the server already recalculated the totals.
    recordStore.invalidate('members');
    recordStore.invalidate('frontEvents');
    await Promise.all([
      recordStore.load('members', { force: true }),
      recordStore.load('frontEvents', { force: true }),
      this.reload(),
    ]);
  }

  private resolveMember(memberId: string): StoredRecord | null {
    return recordStore.snapshot('members').records.find((record) => record.id === memberId) ?? null;
  }

  private buildSyntheticEvent(
    memberId: string | null,
    coFronterIds: string[],
    clientId: string,
    unknownFronter = false,
  ): { record: StoredRecord; active: ActiveFront } {
    const timestamp = now();
    const record: StoredRecord = {
      id: `fev_${clientId}`,
      userId: '',
      systemId: null,
      memberId,
      visibility: 'system',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      version: 1,
      coFronterIds,
      startedAt: timestamp,
      endedAt: null,
      durationMinutes: null,
      durationSeconds: null,
      activity: '',
      locationIds: [],
      mood: '',
      note: '',
      tags: [],
      statusType: coFronterIds.length > 0 ? 'cofronting' : 'fronting',
      unknownFronter,
    };
    const active: ActiveFront = {
      ...record,
      minutes: 0,
      duration: '0m',
      member: memberId ? this.resolveMember(memberId) : null,
      coFronters: coFronterIds
        .map((id) => this.resolveMember(id))
        .filter((value): value is StoredRecord => value !== null),
    };
    return { record, active };
  }

  /**
   * Applies `nextState` before the network call `send` even starts, and
   * reconciles or rolls back once it settles. Offline, `action` is kept and
   * replayed the next time this store reloads with a connection — the
   * optimistic guess stays on screen in the meantime rather than reverting to
   * whatever was true before the tap, because it is what the user just did,
   * not a request still in flight.
   */
  private async runOptimistic(
    nextState: FrontState,
    action: PendingAction,
    send: () => Promise<unknown>,
    onRollback?: () => void,
  ): Promise<void> {
    const previousState = this.state;
    this.state = nextState;
    this.emit();
    void setMeta(CACHE_KEY, this.state);

    try {
      await send();
      await this.after();
    } catch (cause) {
      if (isOffline(cause)) {
        await this.enqueueAction(action);
        return;
      }
      this.state = previousState;
      this.emit();
      onRollback?.();
      throw cause;
    }
  }

  async start(input: StartFrontInput): Promise<void> {
    const clientId = randomToken();
    const { record, active } = this.buildSyntheticEvent(
      input.memberId ?? null,
      input.coFronterIds ?? [],
      clientId,
      input.unknownFronter ?? false,
    );
    recordStore.upsertLocal('frontEvents', record);
    const nextActive = input.endOthers ? [active] : [...this.state.active, active];

    await this.runOptimistic(
      { ...this.state, active: nextActive, isEmpty: false },
      { kind: 'start', clientId, input },
      () => api.post('/api/fronting/start', { ...input, clientId }),
      () => recordStore.removeLocal('frontEvents', record.id),
    );
  }

  async switchTo(input: StartFrontInput): Promise<void> {
    const clientId = randomToken();
    const { record, active } = this.buildSyntheticEvent(
      input.memberId ?? null,
      input.coFronterIds ?? [],
      clientId,
    );
    recordStore.upsertLocal('frontEvents', record);

    await this.runOptimistic(
      { ...this.state, active: [active], isEmpty: false },
      { kind: 'switchTo', clientId, input },
      () => api.post('/api/fronting/switch', { ...input, clientId }),
      () => recordStore.removeLocal('frontEvents', record.id),
    );
  }

  async end(eventId?: string): Promise<void> {
    const nextActive = eventId ? this.state.active.filter((event) => event.id !== eventId) : [];
    await this.runOptimistic(
      { ...this.state, active: nextActive, isEmpty: nextActive.length === 0 },
      { kind: 'end', eventId },
      () => api.post('/api/fronting/end', eventId ? { eventId } : {}),
    );
  }

  async clear(): Promise<void> {
    await this.runOptimistic(
      { ...this.state, active: [], isEmpty: true },
      { kind: 'clear' },
      () => api.post('/api/fronting/clear', {}),
    );
  }

  async addCoFronter(eventId: string, memberId: string): Promise<void> {
    const member = this.resolveMember(memberId);
    const nextActive = this.state.active.map((event) =>
      event.id === eventId && !event.coFronters.some((co) => co.id === memberId)
        ? {
            ...event,
            coFronterIds: [...(event['coFronterIds'] as string[]), memberId],
            coFronters: member ? [...event.coFronters, member] : event.coFronters,
            statusType: 'cofronting',
          }
        : event,
    );

    await this.runOptimistic(
      { ...this.state, active: nextActive },
      { kind: 'addCoFronter', eventId, memberId },
      () => api.post(`/api/fronting/${eventId}/co-fronters`, { memberId }),
    );
  }

  async removeCoFronter(eventId: string, memberId: string): Promise<void> {
    const nextActive = this.state.active.map((event) =>
      event.id === eventId
        ? {
            ...event,
            coFronterIds: (event['coFronterIds'] as string[]).filter((id) => id !== memberId),
            coFronters: event.coFronters.filter((co) => co.id !== memberId),
          }
        : event,
    );

    await this.runOptimistic(
      { ...this.state, active: nextActive },
      { kind: 'removeCoFronter', eventId, memberId },
      () => api.delete(`/api/fronting/${eventId}/co-fronters/${memberId}`),
    );
  }

  /** Sends whatever start/switch/end/clear/co-fronter calls could not reach the server while offline, oldest first. */
  private async enqueueAction(action: PendingAction): Promise<void> {
    const pending = (await getMeta<PendingAction[]>(PENDING_ACTIONS_KEY)) ?? [];
    await setMeta(PENDING_ACTIONS_KEY, [...pending, action]);
  }

  private async drainPendingActions(): Promise<void> {
    const pending = (await getMeta<PendingAction[]>(PENDING_ACTIONS_KEY)) ?? [];
    if (pending.length === 0) return;
    await setMeta(PENDING_ACTIONS_KEY, []);
    for (const action of pending) {
      try {
        switch (action.kind) {
          case 'start':
            await api.post('/api/fronting/start', { ...action.input, clientId: action.clientId });
            break;
          case 'switchTo':
            await api.post('/api/fronting/switch', { ...action.input, clientId: action.clientId });
            break;
          case 'end':
            await api.post('/api/fronting/end', action.eventId ? { eventId: action.eventId } : {});
            break;
          case 'clear':
            await api.post('/api/fronting/clear', {});
            break;
          case 'addCoFronter':
            await api.post(`/api/fronting/${action.eventId}/co-fronters`, { memberId: action.memberId });
            break;
          case 'removeCoFronter':
            await api.delete(`/api/fronting/${action.eventId}/co-fronters/${action.memberId}`);
            break;
        }
      } catch {
        // Dropped rather than requeued — the fetch this drain runs ahead of
        // shows whatever is actually true now, optimistic guess or not.
      }
    }
  }

  /**
   * One tap, from wherever a member's own card or profile shows it: front them
   * alongside whoever is already out, without a form and without waiting for
   * the server. A second tap on someone already out is the other half of the
   * same toggle — it removes just them, not whoever else is fronting, using
   * whichever of `end`/`removeCoFronter` actually fits how they are fronting
   * right now (the event's own primary fronter, or a co-fronter on someone
   * else's). Fronting is primarily a local fact — the tap applies it to this
   * store immediately, using a client-chosen id the server is told to reuse,
   * so the request that follows reconciles the same record instead of
   * creating a second one. Offline, the request cannot be sent yet, so it is
   * kept and replayed the next time this store reloads with a connection.
   */
  async quickFront(memberId: string): Promise<void> {
    const activeEvent = this.state.active.find(
      (event) => event.memberId === memberId || event.coFronters.some((co) => co.id === memberId),
    );
    if (activeEvent) {
      if (activeEvent.memberId === memberId) await this.end(activeEvent.id);
      else await this.removeCoFronter(activeEvent.id, memberId);
      return;
    }

    const previousState = this.state;
    const previousMember =
      recordStore.snapshot('members').records.find((record) => record.id === memberId) ?? null;

    const clientId = randomToken();
    const id = `fev_${clientId}`;
    const timestamp = now();

    const record: StoredRecord = {
      id,
      userId: '',
      systemId: null,
      memberId,
      visibility: 'system',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      version: 1,
      coFronterIds: [],
      startedAt: timestamp,
      endedAt: null,
      durationMinutes: null,
      durationSeconds: null,
      activity: '',
      locationIds: [],
      mood: '',
      note: '',
      tags: [],
      statusType: 'fronting',
      unknownFronter: false,
    };

    const optimistic: ActiveFront = {
      ...record,
      minutes: 0,
      duration: '0m',
      member: previousMember,
      coFronters: [],
    };

    this.state = { ...this.state, active: [...this.state.active, optimistic], isEmpty: false };
    this.emit();
    recordStore.upsertLocal('frontEvents', record);
    if (previousMember) recordStore.upsertLocal('members', { ...previousMember, frontStatus: 'fronting' });
    void setMeta(CACHE_KEY, this.state);

    try {
      await api.post('/api/fronting/start', { memberId, endOthers: false, clientId });
      await this.after();
    } catch (cause) {
      if (isOffline(cause)) {
        const pending = (await getMeta<PendingQuickFront[]>(PENDING_KEY)) ?? [];
        if (!pending.some((entry) => entry.memberId === memberId)) {
          await setMeta(PENDING_KEY, [...pending, { memberId, queuedAt: timestamp }]);
        }
        return;
      }
      // A real rejection (not a connection problem) means this never actually
      // happened, so the optimistic copy is undone rather than left behind.
      this.state = previousState;
      this.emit();
      recordStore.removeLocal('frontEvents', id);
      if (previousMember) recordStore.upsertLocal('members', previousMember);
      throw cause;
    }
  }

  /** Sends whatever Quick Front could not reach the server while offline, oldest first. */
  private async drainPending(): Promise<void> {
    const pending = (await getMeta<PendingQuickFront[]>(PENDING_KEY)) ?? [];
    if (pending.length === 0) return;
    await setMeta(PENDING_KEY, []);
    for (const { memberId } of pending) {
      try {
        await api.post('/api/fronting/start', { memberId, endOthers: false });
      } catch {
        // Dropped rather than requeued — the fetch this drain runs ahead of
        // shows whatever is actually true now, optimistic guess or not.
      }
    }
  }
}

const store = new FrontingStore();

/** Only for the sign-out and switch-account paths in core/auth.tsx. */
export function resetFrontingStore(): void {
  store.reset();
}

export function useFronting(): {
  state: FrontState;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  start: (input: StartFrontInput) => Promise<void>;
  switchTo: (input: StartFrontInput) => Promise<void>;
  end: (eventId?: string) => Promise<void>;
  clear: () => Promise<void>;
  addCoFronter: (eventId: string, memberId: string) => Promise<void>;
  removeCoFronter: (eventId: string, memberId: string) => Promise<void>;
  /** Instant, no dialog: fronts `memberId` alongside anyone already out. */
  quickFront: (memberId: string) => Promise<void>;
  isFrontingAlready: (memberId: string) => boolean;
} {
  const [, setTick] = useState(0);

  useEffect(() => {
    store.ensureStarted();
    return store.subscribe(() => setTick((value) => value + 1));
  }, []);

  return {
    state: store.state,
    loading: store.loading,
    error: store.error,
    reload: () => store.reload(),
    start: (input) => store.start(input),
    switchTo: (input) => store.switchTo(input),
    end: (eventId) => store.end(eventId),
    clear: () => store.clear(),
    addCoFronter: (eventId, memberId) => store.addCoFronter(eventId, memberId),
    removeCoFronter: (eventId, memberId) => store.removeCoFronter(eventId, memberId),
    quickFront: (memberId) => store.quickFront(memberId),
    isFrontingAlready: (memberId) => store.isFrontingAlready(memberId),
  };
}

export const FRONT_STATUS_META: Record<string, { label: string; glyph: string; color: string }> = {
  fronting: { label: 'Fronting', glyph: '●', color: 'var(--accent)' },
  cofronting: { label: 'Co-fronting', glyph: '◐', color: 'var(--info)' },
  nearby: { label: 'Nearby', glyph: '◌', color: 'var(--text-muted)' },
  resting: { label: 'Resting', glyph: '◦', color: 'var(--text-faint)' },
  dormant: { label: 'Dormant', glyph: '·', color: 'var(--text-faint)' },
  unknown: { label: 'Unknown', glyph: '?', color: 'var(--text-faint)' },
};
