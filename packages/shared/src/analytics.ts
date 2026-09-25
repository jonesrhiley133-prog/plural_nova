import { dayKey, diffMinutes, monthKey, weekKey } from './time.js';

/**
 * Descriptive statistics.
 *
 * Every function here counts what was recorded and nothing more. None of it
 * infers a cause, scores a system, or draws a conclusion — the UI presents these
 * as "what you logged", and the wording around them is written to match.
 */

export interface FrontEventLike {
  id: string;
  memberId: string | null;
  coFronterIds: string[];
  startedAt: string;
  endedAt: string | null;
  durationMinutes?: number | null;
  durationSeconds?: number | null;
}

export interface FrontingTotals {
  totalMinutes: number;
  eventCount: number;
  averageMinutes: number;
  longestMinutes: number;
  shortestMinutes: number;
  activeCount: number;
}

/**
 * Minutes for one event, preferring the exact stored second count so a sum
 * across many events rounds once at the end instead of compounding a
 * per-event rounding error. Older rows only ever got the rounded minute
 * figure, so that stays as the fallback rather than a schema migration.
 */
export function eventMinutes(event: FrontEventLike, now: Date = new Date()): number {
  if (typeof event.durationSeconds === 'number' && event.durationSeconds > 0) {
    return event.durationSeconds / 60;
  }
  if (typeof event.durationMinutes === 'number' && event.durationMinutes > 0) {
    return event.durationMinutes;
  }
  const end = event.endedAt ? new Date(event.endedAt) : now;
  return Math.max(0, diffMinutes(event.startedAt, end));
}

export function frontingTotals(events: FrontEventLike[], now: Date = new Date()): FrontingTotals {
  if (events.length === 0) {
    return {
      totalMinutes: 0,
      eventCount: 0,
      averageMinutes: 0,
      longestMinutes: 0,
      shortestMinutes: 0,
      activeCount: 0,
    };
  }
  const durations = events.map((e) => eventMinutes(e, now));
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    totalMinutes: total,
    eventCount: events.length,
    averageMinutes: Math.round(total / events.length),
    longestMinutes: Math.max(...durations),
    shortestMinutes: Math.min(...durations),
    activeCount: events.filter((e) => !e.endedAt).length,
  };
}

export interface MemberFrontingStat {
  memberId: string;
  minutes: number;
  events: number;
  coFrontEvents: number;
  lastFrontedAt: string | null;
  share: number;
}

/**
 * Per-member totals. A co-fronter is credited with the event's full duration,
 * because they were there for all of it — which means the shares can add up to
 * more than 100%, and the UI says so rather than silently normalising.
 */
export function memberFrontingStats(
  events: FrontEventLike[],
  now: Date = new Date(),
): MemberFrontingStat[] {
  const byMember = new Map<string, MemberFrontingStat>();
  const ensure = (id: string): MemberFrontingStat => {
    let stat = byMember.get(id);
    if (!stat) {
      stat = { memberId: id, minutes: 0, events: 0, coFrontEvents: 0, lastFrontedAt: null, share: 0 };
      byMember.set(id, stat);
    }
    return stat;
  };

  let totalMinutes = 0;
  for (const event of events) {
    const minutes = eventMinutes(event, now);
    totalMinutes += minutes;
    if (event.memberId) {
      const stat = ensure(event.memberId);
      stat.minutes += minutes;
      stat.events += 1;
      if (!stat.lastFrontedAt || event.startedAt > stat.lastFrontedAt) {
        stat.lastFrontedAt = event.startedAt;
      }
    }
    for (const coId of event.coFronterIds ?? []) {
      const stat = ensure(coId);
      stat.minutes += minutes;
      stat.coFrontEvents += 1;
      if (!stat.lastFrontedAt || event.startedAt > stat.lastFrontedAt) {
        stat.lastFrontedAt = event.startedAt;
      }
    }
  }

  const stats = [...byMember.values()];
  for (const stat of stats) {
    stat.share = totalMinutes > 0 ? stat.minutes / totalMinutes : 0;
  }
  return stats.sort((a, b) => b.minutes - a.minutes);
}

export interface CoFrontPair {
  a: string;
  b: string;
  events: number;
  minutes: number;
}

export function coFrontingPairs(events: FrontEventLike[], now: Date = new Date()): CoFrontPair[] {
  const pairs = new Map<string, CoFrontPair>();
  for (const event of events) {
    const present = [event.memberId, ...(event.coFronterIds ?? [])].filter(
      (id): id is string => Boolean(id),
    );
    const unique = [...new Set(present)].sort();
    const minutes = eventMinutes(event, now);
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const a = unique[i]!;
        const b = unique[j]!;
        const key = `${a}|${b}`;
        const existing = pairs.get(key) ?? { a, b, events: 0, minutes: 0 };
        existing.events += 1;
        existing.minutes += minutes;
        pairs.set(key, existing);
      }
    }
  }
  return [...pairs.values()].sort((x, y) => y.minutes - x.minutes);
}

export interface Bucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

export function bucketByDay(
  items: { at: string; value?: number }[],
  days: number,
  endDate: Date = new Date(),
): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    buckets.set(key, {
      key,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: 0,
      count: 0,
    });
  }
  for (const item of items) {
    const bucket = buckets.get(dayKey(item.at));
    if (!bucket) continue;
    bucket.value += item.value ?? 1;
    bucket.count += 1;
  }
  return [...buckets.values()];
}

export function bucketByHour(items: { at: string; value?: number }[]): Bucket[] {
  const buckets: Bucket[] = Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour),
    label: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
    count: 0,
  }));
  for (const item of items) {
    const hour = new Date(item.at).getHours();
    const bucket = buckets[hour];
    if (!bucket) continue;
    bucket.value += item.value ?? 1;
    bucket.count += 1;
  }
  return buckets;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function bucketByWeekday(items: { at: string; value?: number }[]): Bucket[] {
  const buckets: Bucket[] = WEEKDAY_LABELS.map((label, index) => ({
    key: String(index),
    label,
    value: 0,
    count: 0,
  }));
  for (const item of items) {
    const index = (new Date(item.at).getDay() + 6) % 7;
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.value += item.value ?? 1;
    bucket.count += 1;
  }
  return buckets;
}

export function bucketByWeek(items: { at: string; value?: number }[], weeks: number): Bucket[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    keys.push(weekKey(date));
  }
  const buckets = new Map<string, Bucket>(
    [...new Set(keys)].map((key) => [
      key,
      { key, label: new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: 0, count: 0 },
    ]),
  );
  for (const item of items) {
    const bucket = buckets.get(weekKey(item.at));
    if (!bucket) continue;
    bucket.value += item.value ?? 1;
    bucket.count += 1;
  }
  return [...buckets.values()];
}

export function bucketByMonth(items: { at: string; value?: number }[], months: number): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(date);
    buckets.set(key, {
      key,
      label: date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      value: 0,
      count: 0,
    });
  }
  for (const item of items) {
    const bucket = buckets.get(monthKey(item.at));
    if (!bucket) continue;
    bucket.value += item.value ?? 1;
    bucket.count += 1;
  }
  return [...buckets.values()];
}

/** Longest run of consecutive days that appear in `dates`. */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map((d) => dayKey(d)))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const time = new Date(`${day}T00:00:00`).getTime();
    if (previous !== null && time - previous === 86_400_000) run += 1;
    else run = 1;
    best = Math.max(best, run);
    previous = time;
  }
  return best;
}

/** Streak counting back from today; 0 once a day is missed. */
export function currentStreak(dates: string[], today: Date = new Date()): number {
  const days = new Set(dates.map((d) => dayKey(d)));
  let streak = 0;
  const cursor = new Date(today);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface Transition {
  from: string | null;
  to: string | null;
  count: number;
}

/** How often one fronter followed another, ordered by frequency. */
export function frontTransitions(events: FrontEventLike[]): Transition[] {
  const ordered = [...events].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const counts = new Map<string, Transition>();
  for (let i = 1; i < ordered.length; i += 1) {
    const from = ordered[i - 1]?.memberId ?? null;
    const to = ordered[i]?.memberId ?? null;
    if (from === to) continue;
    const key = `${from ?? '∅'}→${to ?? '∅'}`;
    const existing = counts.get(key) ?? { from, to, count: 0 };
    existing.count += 1;
    counts.set(key, existing);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : sorted[mid] ?? 0;
}

/**
 * Direction of travel between the first and second half of a series.
 * Returned as a plain label because a slope means very little to a reader.
 */
export function trendOf(values: number[]): 'rising' | 'falling' | 'steady' | 'unknown' {
  if (values.length < 4) return 'unknown';
  const half = Math.floor(values.length / 2);
  const first = average(values.slice(0, half));
  const second = average(values.slice(half));
  if (first === 0 && second === 0) return 'steady';
  const change = (second - first) / Math.max(1, Math.abs(first));
  if (change > 0.15) return 'rising';
  if (change < -0.15) return 'falling';
  return 'steady';
}

export function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function topEntries(counts: Map<string, number>, limit = 5): { key: string; count: number }[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
