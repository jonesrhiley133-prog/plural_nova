import { describe, expect, it } from 'vitest';
import { parseDateOnly, toDateOnlyString } from '../time.js';

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
