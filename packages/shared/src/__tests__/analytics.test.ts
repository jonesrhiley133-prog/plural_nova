import { describe, expect, it } from 'vitest';
import {
  averageBy,
  coOccurringPairs,
  correlation,
  insightConfidence,
  pairByDayOffset,
  rollingAverage,
  stdev,
  toPercent,
  variance,
} from '../analytics.js';

describe('variance/stdev', () => {
  it('is zero for a constant series', () => {
    expect(variance([5, 5, 5])).toBe(0);
    expect(stdev([5, 5, 5])).toBe(0);
  });

  it('is zero for an empty series rather than throwing', () => {
    expect(variance([])).toBe(0);
    expect(stdev([])).toBe(0);
  });

  it('matches a hand-worked example', () => {
    // mean 4, deviations -2,-1,0,1,2 -> squared 4,1,0,1,4 -> mean 2
    expect(variance([2, 3, 4, 5, 6])).toBe(2);
    expect(stdev([2, 3, 4, 5, 6])).toBeCloseTo(Math.sqrt(2));
  });
});

describe('rollingAverage', () => {
  it('averages each point with the window before it', () => {
    expect(rollingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });

  it('returns the series unchanged for a window under 1', () => {
    expect(rollingAverage([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

describe('averageBy', () => {
  it('groups and averages in one pass', () => {
    const items = [
      { phase: 'luteal', mood: 40 },
      { phase: 'luteal', mood: 60 },
      { phase: 'follicular', mood: 80 },
    ];
    const byPhase = averageBy(items, (i) => i.phase, (i) => i.mood);
    expect(byPhase.get('luteal')).toEqual({ average: 50, count: 2 });
    expect(byPhase.get('follicular')).toEqual({ average: 80, count: 1 });
  });

  it('skips items with no key', () => {
    const items = [{ k: null, v: 1 }, { k: 'a', v: 2 }];
    const grouped = averageBy(items, (i) => i.k, (i) => i.v);
    expect(grouped.size).toBe(1);
  });
});

describe('correlation', () => {
  it('is null under three pairs', () => {
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });

  it('is null when one series never varies', () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
  });

  it('is 1 for a perfect positive line', () => {
    expect(correlation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
  });

  it('is -1 for a perfect inverse line', () => {
    expect(correlation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });
});

describe('pairByDayOffset', () => {
  it('pairs a value against the next day\'s value', () => {
    const sleep = [
      { at: '2026-01-01T22:00:00.000Z', value: 3 },
      { at: '2026-01-02T22:00:00.000Z', value: 5 },
    ];
    const mood = [
      { at: '2026-01-02T09:00:00.000Z', value: 60 },
      { at: '2026-01-03T09:00:00.000Z', value: 90 },
    ];
    expect(pairByDayOffset(sleep, mood, 1)).toEqual([
      { x: 3, y: 60 },
      { x: 5, y: 90 },
    ]);
  });

  it('drops a day with nothing on the target day, and averages multiple matches', () => {
    const before = [
      { at: '2026-01-01T00:00:00.000Z', value: 1 },
      { at: '2026-01-05T00:00:00.000Z', value: 9 },
    ];
    const after = [
      { at: '2026-01-02T01:00:00.000Z', value: 10 },
      { at: '2026-01-02T20:00:00.000Z', value: 20 },
    ];
    expect(pairByDayOffset(before, after, 1)).toEqual([{ x: 1, y: 15 }]);
  });
});

describe('coOccurringPairs', () => {
  it('counts every unordered pair within each group', () => {
    const pairs = coOccurringPairs([
      ['joy.happy', 'calm.settled'],
      ['joy.happy', 'calm.settled'],
      ['joy.happy', 'fear.nervous'],
    ]);
    expect(pairs[0]).toEqual({ a: 'calm.settled', b: 'joy.happy', count: 2 });
    expect(pairs).toContainEqual({ a: 'fear.nervous', b: 'joy.happy', count: 1 });
  });

  it('ignores a group with only one item', () => {
    expect(coOccurringPairs([['joy.happy']])).toEqual([]);
  });
});

describe('toPercent', () => {
  it('rescales onto 0-100 and clamps both ends', () => {
    expect(toPercent(5, 1, 10)).toBe(44);
    expect(toPercent(0, 1, 10)).toBe(0);
    expect(toPercent(20, 1, 10)).toBe(100);
  });

  it('returns 0 for a degenerate range rather than dividing by zero', () => {
    expect(toPercent(5, 10, 10)).toBe(0);
  });
});

describe('insightConfidence', () => {
  it('steps through the fixed thresholds', () => {
    expect(insightConfidence(1)).toBe('low');
    expect(insightConfidence(5)).toBe('moderate');
    expect(insightConfidence(15)).toBe('high');
  });
});
