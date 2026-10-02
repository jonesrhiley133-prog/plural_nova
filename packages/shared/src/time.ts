/** Timestamps are ISO-8601 UTC strings everywhere: comparable as text, readable in backups. */
export type Timestamp = string;

export function now(): Timestamp {
  return new Date().toISOString();
}

export function toTimestamp(value: Date | number | string): Timestamp {
  return new Date(value).toISOString();
}

export function startOfDay(value: Date | string, offsetMinutes = 0): Date {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - offsetMinutes);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** `YYYY-MM-DD` in the viewer's local calendar, which is what day-grouped views mean by "a day". */
export function dayKey(value: Date | string | number): string {
  const d = new Date(value);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bare `YYYY-MM-DD` means a calendar day, not an instant. Parsed the plain
 * way (`new Date(string)`), JS reads it as UTC midnight — which lands on the
 * *previous* local day in every timezone behind UTC. This reads it as local
 * midnight instead, so the day is the same on every clock that opens it.
 */
export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

/** The next time a `YYYY-MM-DD` birthday comes around, and the age turned that day. */
export function nextBirthdayOccurrence(birthday: string): { date: Date; age: number } | null {
  const born = parseDateOnly(birthday);
  if (Number.isNaN(born.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let year = today.getFullYear();
  let next = new Date(year, born.getMonth(), born.getDate());
  if (next < today) {
    year += 1;
    next = new Date(year, born.getMonth(), born.getDate());
  }
  return { date: next, age: year - born.getFullYear() };
}

/** Whether a `YYYY-MM-DD` birthday's month and day fall on today, regardless of year. */
export function isBirthdayToday(birthday: string): boolean {
  const occurrence = nextBirthdayOccurrence(birthday);
  if (!occurrence) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return occurrence.date.getTime() === today.getTime();
}

/** The inverse of `parseDateOnly` — local calendar fields, never a UTC-shifted `toISOString` slice. */
export function toDateOnlyString(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(value: Date | string, days: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

export function diffMinutes(from: Date | string, to: Date | string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

/** "2h 14m", "45m", "3d 2h" — duration phrasing used across fronting, sleep and work. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * "2h 14m 07s", "45m 02s", "9s" — for a session actively ticking right now.
 * Historical durations stay in `formatDuration`'s minute phrasing; this is
 * only for the live count while something is still running, so the seconds
 * PluralNova now tracks internally are visible somewhere, not just stored.
 */
export function formatDurationPrecise(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => `${n}`.padStart(2, '0');
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

export interface RecurrenceRule {
  recurrenceType: 'daily' | 'weekly' | 'monthly' | 'yearly' | string;
  recurrenceInterval?: number | null;
  /** 0 (Sunday) through 6. Only consulted for a weekly rule with no interval set beyond 1 — see below. */
  recurrenceWeekdays?: number[] | null;
}

/**
 * The next occurrence of a recurring `anchor` date on or after `from`.
 *
 * Nothing in this codebase expanded `calendarEvents`' recurrence fields into
 * actual occurrences before this — they were stored and shown back as text,
 * never projected forward — so this is a first implementation against that
 * shape, not an extraction of existing math. Traditions is its first caller.
 *
 * A weekday set is only honoured at the default interval of one: combining
 * "every 2 weeks" with "on Tuesdays and Fridays" needs week-counting from the
 * anchor that a "surfaced, not nagged" feature doesn't need precisely right —
 * at any other interval the weekday set is ignored and the anchor's own
 * weekday is kept instead.
 */
export function nextRecurrence(anchor: Date, rule: RecurrenceRule, from: Date = new Date()): Date {
  const interval = Math.max(1, Math.floor(rule.recurrenceInterval ?? 1));
  const weekdays = rule.recurrenceType === 'weekly' && interval === 1 ? rule.recurrenceWeekdays : null;

  const start = startOfDay(from);
  let next = new Date(anchor);
  next.setHours(0, 0, 0, 0);

  const step = (): void => {
    switch (rule.recurrenceType) {
      case 'daily':
        next.setDate(next.getDate() + interval);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + interval);
        break;
      case 'weekly':
      default:
        next.setDate(next.getDate() + 7 * interval);
        break;
    }
  };

  if (weekdays && weekdays.length > 0) {
    // Day by day rather than week by week, so landing exactly on `from` still counts.
    while (next < start || !weekdays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  while (next < start) step();
  return next;
}

export interface TraditionDueInfo {
  /** `null` for a one-time tradition that's already been celebrated — there is nothing left to be due. */
  dueDate: Date | null;
  isDueNow: boolean;
}

/**
 * When a tradition is next due. A one-time tradition is due once, from its
 * anchor date, until celebrated. A recurring one is always due again,
 * computed from whichever is the more recent reference point: the anchor, or
 * the last time it was actually celebrated — so marking one done visibly
 * pushes it out by a full interval rather than it reappearing immediately.
 */
export function traditionDue(input: {
  anchorDate: string;
  isRecurring: boolean;
  recurrenceType?: string | null;
  recurrenceInterval?: number | null;
  recurrenceWeekdays?: number[] | null;
  lastCelebratedAt?: string | null;
}): TraditionDueInfo {
  const anchor = parseDateOnly(input.anchorDate);
  if (Number.isNaN(anchor.getTime())) return { dueDate: null, isDueNow: false };
  const today = startOfDay(new Date());

  if (!input.isRecurring) {
    if (input.lastCelebratedAt) return { dueDate: null, isDueNow: false };
    return { dueDate: anchor, isDueNow: anchor.getTime() <= today.getTime() };
  }

  const rule: RecurrenceRule = {
    recurrenceType: input.recurrenceType ?? 'weekly',
    recurrenceInterval: input.recurrenceInterval,
    recurrenceWeekdays: input.recurrenceWeekdays,
  };

  // The anchor always defines the pattern's phase (which weekday, which day
  // of the month) — a celebration never shifts that. What a celebration does
  // move is the earliest day a next one can land: strictly after it, so
  // marking one done the same day it was due doesn't leave it due again
  // immediately.
  if (!input.lastCelebratedAt) {
    const dueDate = nextRecurrence(anchor, rule);
    return { dueDate, isDueNow: dueDate.getTime() <= today.getTime() };
  }
  const dayAfterLast = addDays(startOfDay(input.lastCelebratedAt), 1);
  const from = dayAfterLast.getTime() > today.getTime() ? dayAfterLast : today;
  const dueDate = nextRecurrence(anchor, rule, from);
  return { dueDate, isDueNow: dueDate.getTime() <= today.getTime() };
}

export function weekKey(value: Date | string): string {
  const d = new Date(value);
  const day = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - day);
  return dayKey(d);
}

export function monthKey(value: Date | string): string {
  return dayKey(value).slice(0, 7);
}
