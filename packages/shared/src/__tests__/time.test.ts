import { describe, expect, it } from 'vitest';
import { isBirthdayToday, nextBirthdayOccurrence, parseDateOnly, toDateOnlyString } from '../time.js';

/**
 * A calendar day stored as `YYYY-MM-DD` is not an instant, and reading it
 * with a plain `new Date(string)` treats it as UTC midnight — which drifts
 * onto the previous local day west of Greenwich. These two functions are the
 * one place that distinction has to be made correctly; every screen that
 * shows or edits a date-only field goes through them.
 */
describe('date-only parsing stays on the calendar day it names', () => {
  it('parses a bare YYYY-MM-DD as local midnight, not UTC midnight', () => {
    const date = parseDateOnly('2026-09-30');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8); // September, zero-indexed
    expect(date.getDate()).toBe(30);
    expect(date.getHours()).toBe(0);
  });

  it('round-trips through toDateOnlyString unchanged', () => {
    expect(toDateOnlyString(parseDateOnly('2026-01-05'))).toBe('2026-01-05');
    expect(toDateOnlyString(parseDateOnly('2026-12-31'))).toBe('2026-12-31');
  });

  it('falls back to a normal parse for anything that is not a bare date', () => {
    const instant = parseDateOnly('2026-09-30T14:30:00.000Z');
    expect(instant.toISOString()).toBe('2026-09-30T14:30:00.000Z');
  });

  it('pads single-digit months and days back out', () => {
    const date = new Date(2026, 0, 5); // Jan 5, local
    expect(toDateOnlyString(date)).toBe('2026-01-05');
  });
});

/**
 * These compute against the real clock rather than a mocked one, matching
 * how the server's own birthday-check tests build their fixtures — each one
 * derives its birthday from today's actual date so it holds on whatever day
 * it happens to run.
 */
describe('birthday occurrences', () => {
  function asBirthday(date: Date, birthYear: number): string {
    return `${birthYear}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  it("is true for a birthday on today's month and day, any birth year", () => {
    expect(isBirthdayToday(asBirthday(new Date(), 1990))).toBe(true);
  });

  it('is false for a birthday a few days away', () => {
    const future = new Date();
    future.setDate(future.getDate() + 4);
    expect(isBirthdayToday(asBirthday(future, 1990))).toBe(false);
  });

  it('reports the age turned today when the birthday is today', () => {
    const today = new Date();
    const occurrence = nextBirthdayOccurrence(asBirthday(today, today.getFullYear() - 21));
    expect(occurrence?.age).toBe(21);
    expect(occurrence?.date.getDate()).toBe(today.getDate());
  });

  it('never returns an occurrence earlier than today, even for a birthday just passed', () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    const occurrence = nextBirthdayOccurrence(asBirthday(past, 2000));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    expect(occurrence).not.toBeNull();
    expect(occurrence!.date.getTime()).toBeGreaterThanOrEqual(today.getTime());
    expect(occurrence!.date.getMonth()).toBe(past.getMonth());
    expect(occurrence!.date.getDate()).toBe(past.getDate());
  });

  it('returns null, not a throw, for an unparseable birthday', () => {
    expect(nextBirthdayOccurrence('not-a-date')).toBeNull();
    expect(isBirthdayToday('not-a-date')).toBe(false);
  });
});
