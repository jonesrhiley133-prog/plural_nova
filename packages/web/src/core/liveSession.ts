import { useEffect, useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import type { CollectionResult } from './data.js';

/**
 * A session already running, for the screens that log a span of time rather
 * than a single moment. Sleep and shifts already store an open span as a
 * record with a start and no end — this just watches for one of those and
 * gives the "Start" button on those screens a live count to show while it
 * waits, instead of asking the whole thing to be filled in after the fact.
 *
 * The tick is per second and `elapsedSeconds` is exact — every timed session
 * in the app is meant to track by the second rather than round down to
 * whichever minute it last happened to re-render on. `stop()` computes the
 * exact span from the real start/end timestamps and writes it as
 * `durationSeconds`, so that field is always populated without every caller
 * re-deriving the same subtraction.
 */
export function useLiveSession(
  collection: CollectionResult,
  startField: string,
  endField: string,
): {
  active: StoredRecord | null;
  elapsedSeconds: number;
  elapsedMinutes: number;
  start: (extra?: Record<string, unknown>) => Promise<StoredRecord>;
  stop: (
    extra?: Record<string, unknown> | ((durationSeconds: number) => Record<string, unknown>),
  ) => Promise<StoredRecord | null>;
} {
  const active = useMemo(
    () => collection.all.find((record) => Boolean(record[startField]) && !record[endField]) ?? null,
    [collection.all, startField, endField],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedSeconds = active
    ? Math.max(0, Math.floor((now - Date.parse(String(active[startField]))) / 1000))
    : 0;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  return {
    active,
    elapsedSeconds,
    elapsedMinutes,
    start: (extra) => collection.create({ [startField]: new Date().toISOString(), ...extra }),
    stop: (extra) => {
      if (!active) return Promise.resolve(null);
      const endedAt = new Date();
      const durationSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - Date.parse(String(active[startField]))) / 1000),
      );
      const resolvedExtra = typeof extra === 'function' ? extra(durationSeconds) : extra;
      return collection.update(active.id, {
        [endField]: endedAt.toISOString(),
        durationSeconds,
        ...resolvedExtra,
      });
    },
  };
}
