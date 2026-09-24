import { useEffect, useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import type { CollectionResult } from './data.js';

/**
 * A session already running, for the screens that log a span of time rather
 * than a single moment. Sleep and shifts already store an open span as a
 * record with a start and no end — this just watches for one of those and
 * gives the "Start" button on those screens a live count to show while it
 * waits, instead of asking the whole thing to be filled in after the fact.
 */
export function useLiveSession(
  collection: CollectionResult,
  startField: string,
  endField: string,
): {
  active: StoredRecord | null;
  elapsedMinutes: number;
  start: (extra?: Record<string, unknown>) => Promise<StoredRecord>;
  stop: (extra?: Record<string, unknown>) => Promise<StoredRecord | null>;
} {
  const active = useMemo(
    () => collection.all.find((record) => Boolean(record[startField]) && !record[endField]) ?? null,
    [collection.all, startField, endField],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedMinutes = active
    ? Math.max(0, Math.round((now - Date.parse(String(active[startField]))) / 60000))
    : 0;

  return {
    active,
    elapsedMinutes,
    start: (extra) => collection.create({ [startField]: new Date().toISOString(), ...extra }),
    stop: (extra) => {
      if (!active) return Promise.resolve(null);
      return collection.update(active.id, { [endField]: new Date().toISOString(), ...extra });
    },
  };
}
