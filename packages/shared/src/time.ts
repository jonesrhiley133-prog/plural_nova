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

export function weekKey(value: Date | string): string {
  const d = new Date(value);
  const day = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - day);
  return dayKey(d);
}

export function monthKey(value: Date | string): string {
  return dayKey(value).slice(0, 7);
}
