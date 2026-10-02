import { describe, expect, it } from 'vitest';
import {
  isBirthdayToday,
  nextBirthdayOccurrence,
  nextRecurrence,
  parseDateOnly,
  toDateOnlyString,
  traditionDue,
} from '../time.js';

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

describe('nextRecurrence', () => {
  it('steps a daily rule forward to exactly "from"', () => {
    const from = new Date(2026, 5, 15);
    const longAgo = new Date(2026, 0, 1);
    const next = nextRecurrence(longAgo, { recurrenceType: 'daily', recurrenceInterval: 1 }, from);
    expect(next.getTime()).toBe(from.getTime());
  });

  it('steps a monthly rule to the first monthly anniversary on or after "from"', () => {
    const from = new Date(2026, 5, 15); // the 15th
    const anchor = new Date(2026, 0, 1); // the 1st of the month, months earlier
    const next = nextRecurrence(anchor, { recurrenceType: 'monthly', recurrenceInterval: 1 }, from);
    // The 1st of June has already passed by the 15th, so the next anniversary is the 1st of July.
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6);
    expect(next.getDate()).toBe(1);
  });

  it('steps a yearly rule forward a full year once this year\'s date has passed', () => {
    const from = new Date(2026, 5, 15);
    const anchor = new Date(2026, 0, 1);
    const next = nextRecurrence(anchor, { recurrenceType: 'yearly', recurrenceInterval: 1 }, from);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(1);
  });

  it('never returns a date earlier than "from"', () => {
    const anchor = new Date(2026, 2, 3);
    const from = new Date(2026, 8, 20);
    const next = nextRecurrence(anchor, { recurrenceType: 'weekly', recurrenceInterval: 2 }, from);
    expect(next.getTime()).toBeGreaterThanOrEqual(startOfDayMs(from));
  });

  it('honours a specific weekday set at the default interval, skipping a today that does not match', () => {
    const from = new Date(2026, 5, 14);
    const tomorrowWeekday = (from.getDay() + 1) % 7;
    const next = nextRecurrence(from, { recurrenceType: 'weekly', recurrenceWeekdays: [tomorrowWeekday] }, from);
    const expected = new Date(from);
    expected.setDate(expected.getDate() + 1);
    expect(next.getDay()).toBe(tomorrowWeekday);
    expect(next.getTime()).toBe(startOfDayMs(expected));
  });

  it('counts "today" as due when it already matches a weekday rule', () => {
    const today = new Date(2026, 5, 16);
    const next = nextRecurrence(today, { recurrenceType: 'weekly', recurrenceWeekdays: [today.getDay()] }, today);
    expect(next.getTime()).toBe(startOfDayMs(today));
  });

  it('ignores the weekday set once the interval is more than one, keeping the anchor weekday instead', () => {
    const anchor = new Date(2026, 5, 16);
    const differentWeekday = (anchor.getDay() + 3) % 7;
    const from = new Date(2026, 5, 18);
    const next = nextRecurrence(
      anchor,
      { recurrenceType: 'weekly', recurrenceInterval: 2, recurrenceWeekdays: [differentWeekday] },
      from,
    );
    const expected = new Date(anchor);
    expected.setDate(expected.getDate() + 14);
    expect(next.getDay()).toBe(anchor.getDay());
    expect(next.getTime()).toBe(startOfDayMs(expected));
  });
});

function startOfDayMs(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function asDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('traditionDue', () => {
  it('is due once its anchor date arrives, for a one-time tradition', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const info = traditionDue({ anchorDate: asDateOnly(yesterday), isRecurring: false });
    expect(info.isDueNow).toBe(true);
  });

  it('is not due yet, for a one-time tradition whose anchor is in the future', () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const info = traditionDue({ anchorDate: asDateOnly(nextWeek), isRecurring: false });
    expect(info.isDueNow).toBe(false);
  });

  it('has nothing left due, for a one-time tradition already celebrated', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const info = traditionDue({
      anchorDate: asDateOnly(yesterday),
      isRecurring: false,
      lastCelebratedAt: new Date().toISOString(),
    });
    expect(info.isDueNow).toBe(false);
    expect(info.dueDate).toBeNull();
  });

  it('is due today, for a never-celebrated daily tradition', () => {
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 30);
    const info = traditionDue({
      anchorDate: asDateOnly(longAgo),
      isRecurring: true,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
    });
    expect(info.isDueNow).toBe(true);
  });

  it('is not due again today after being celebrated today, for a daily tradition', () => {
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 30);
    const info = traditionDue({
      anchorDate: asDateOnly(longAgo),
      isRecurring: true,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      lastCelebratedAt: new Date().toISOString(),
    });
    expect(info.isDueNow).toBe(false);
    expect(info.dueDate?.getTime()).toBeGreaterThan(startOfDayMs(new Date()));
  });

  it('pushes a weekly tradition a full week out after celebrating it, keeping the anchor weekday', () => {
    const anchor = new Date();
    anchor.setDate(anchor.getDate() - 14); // same weekday as today, two weeks back
    const info = traditionDue({
      anchorDate: asDateOnly(anchor),
      isRecurring: true,
      recurrenceType: 'weekly',
      recurrenceInterval: 1,
      lastCelebratedAt: new Date().toISOString(),
    });
    expect(info.isDueNow).toBe(false);
    expect(info.dueDate?.getDay()).toBe(new Date().getDay());
    const sevenDaysOut = new Date();
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    expect(info.dueDate?.getTime()).toBe(startOfDayMs(sevenDaysOut));
  });
});
