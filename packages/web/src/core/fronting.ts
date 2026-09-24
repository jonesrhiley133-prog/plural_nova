import { useCallback, useEffect, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { NetworkError, api, isOffline, messageFor } from './api.js';
import { getMeta, setMeta } from './localdb.js';
import { realtime } from './realtime.js';
import { recordStore } from './data.js';

/**
 * The current front.
 *
 * Fronting is the one thing in the app that several screens need to agree on at
 * once, so it is fetched from the server rather than derived on each screen, and
 * every device is told when it changes. The state survives a reload because it
 * lives in the database, not in the page.
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

/**
 * Starting, switching, ending and clearing a front all run business rules that
 * only the server can enforce — duplicate detection, member status, totals,
 * history, achievements — so unlike a plain record they are never queued for
 * later. `NetworkError`'s own default text says a change is "saved on this
 * device," which is true of a queued write and false of these; offline, this
 * replaces it with a message that does not promise something that did not
 * happen.
 */
function rethrowForDisplay(cause: unknown): never {
  throw isOffline(cause)
    ? new NetworkError('This needs a connection — nothing was recorded. Try again once you are back online.')
    : cause;
}

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
} {
  const [state, setState] = useState<FrontState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api.get<FrontState>('/api/fronting/current');
      setState(result);
      setError(null);
      void setMeta(CACHE_KEY, result);
    } catch (cause) {
      // The default cache-miss state is "nobody's fronting," which is a real
      // answer everywhere else in the app — here specifically it would be a
      // false one, so a device that has already seen who's out keeps showing
      // that instead of quietly reverting to empty the moment it goes offline.
      if (isOffline(cause)) {
        const cached = await getMeta<FrontState>(CACHE_KEY);
        if (cached) {
          setState(cached);
          setError('Shown from this device. Reconnect for the latest.');
          return;
        }
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Another device changing the front updates this one without a refresh.
    const stopRealtime = realtime.on((event) => {
      if (event.type === 'front.changed') void reload();
    });
    // Reconnecting is exactly when a cached answer is most likely to be stale.
    const onOnline = (): void => void reload();
    window.addEventListener('online', onOnline);
    return () => {
      stopRealtime();
      window.removeEventListener('online', onOnline);
    };
  }, [reload]);

  const after = useCallback(async () => {
    // Members and events both moved, so their caches are re-read rather than
    // patched — the server already recalculated the totals.
    recordStore.invalidate('members');
    recordStore.invalidate('frontEvents');
    await Promise.all([
      recordStore.load('members', { force: true }),
      recordStore.load('frontEvents', { force: true }),
      reload(),
    ]);
  }, [reload]);

  return {
    state,
    loading,
    error,
    reload,
    start: async (input) => {
      try {
        await api.post('/api/fronting/start', input);
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
    switchTo: async (input) => {
      try {
        await api.post('/api/fronting/switch', input);
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
    end: async (eventId) => {
      try {
        await api.post('/api/fronting/end', eventId ? { eventId } : {});
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
    clear: async () => {
      try {
        await api.post('/api/fronting/clear', {});
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
    addCoFronter: async (eventId, memberId) => {
      try {
        await api.post(`/api/fronting/${eventId}/co-fronters`, { memberId });
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
    removeCoFronter: async (eventId, memberId) => {
      try {
        await api.delete(`/api/fronting/${eventId}/co-fronters/${memberId}`);
      } catch (cause) {
        rethrowForDisplay(cause);
      }
      await after();
    },
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
