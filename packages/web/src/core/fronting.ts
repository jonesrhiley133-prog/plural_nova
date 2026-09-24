import { useCallback, useEffect, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from './api.js';
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
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Another device changing the front updates this one without a refresh.
    return realtime.on((event) => {
      if (event.type === 'front.changed') void reload();
    });
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
      await api.post('/api/fronting/start', input);
      await after();
    },
    switchTo: async (input) => {
      await api.post('/api/fronting/switch', input);
      await after();
    },
    end: async (eventId) => {
      await api.post('/api/fronting/end', eventId ? { eventId } : {});
      await after();
    },
    clear: async () => {
      await api.post('/api/fronting/clear', {});
      await after();
    },
    addCoFronter: async (eventId, memberId) => {
      await api.post(`/api/fronting/${eventId}/co-fronters`, { memberId });
      await after();
    },
    removeCoFronter: async (eventId, memberId) => {
      await api.delete(`/api/fronting/${eventId}/co-fronters/${memberId}`);
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
