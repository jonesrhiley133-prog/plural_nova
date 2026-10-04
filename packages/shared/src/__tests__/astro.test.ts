import { describe, expect, it } from 'vitest';
import { Astro } from '../index.js';

describe('astro engine', () => {
  it('derives a sun sign from a birthday alone and refuses to guess the rest', () => {
    const p = Astro.buildProfile({ birthday: '1990-06-15' });
    expect(p.level).toBe('basic');
    expect(p.sun).toBe('Gemini');
    expect(p.rising).toBeNull();
    expect(p.aspects).toHaveLength(0);
    expect(p.unlockPrompt).toBe(Astro.RISING_PROMPT);
  });

  it('calculates a rising sign only with time, offset and place', () => {
    const p = Astro.buildProfile({ birthday: '1990-06-15', birthTime: '14:30', latitude: 40.71, longitude: -74.01, utcOffset: -4 });
    expect(p.level).toBe('full');
    expect(p.rising).toBe('Libra');
    expect(p.houseCusps).toHaveLength(12);
    expect(Astro.buildProfile({ birthday: '1990-06-15', birthTime: '14:30', utcOffset: -4 }).level).toBe('planets');
  });

  it('finds the October 2026 new moon', () => {
    const [event] = Astro.moonEventsBetween(new Date('2026-10-08'), new Date('2026-10-12')).filter((e) => e.phase === 'new');
    expect(event?.date.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('keeps birth data private by default', () => {
    expect(Astro.canViewAstro(undefined, 'a', 'b')).toBe(false);
    expect(Astro.canViewAstro('private', 'a', 'a')).toBe(true);
    expect(Astro.canViewAstro('system', 'a', 'b')).toBe(true);
    expect(Astro.canViewAstro('hidden', 'a', 'a')).toBe(false);
  });

  it('reads the same for the same alter and day, and never gives a percentage compatibility', () => {
    const p = Astro.buildProfile({ birthday: '1990-06-15' });
    const day = new Date('2026-10-04T12:00:00Z');
    expect(Astro.dailyReading(p, { id: 'x' }, day)).toEqual(Astro.dailyReading(p, { id: 'x' }, day));
    const result = Astro.compare(p, Astro.buildProfile({ birthday: '1988-11-03' }), { me: 'A', other: 'B' })!;
    expect(JSON.stringify(result)).not.toMatch(/\d+%/);
  });
});
