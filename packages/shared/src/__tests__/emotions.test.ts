import { describe, expect, it } from 'vitest';
import { categoriesOf, emotionIdsOf, emotionIntensityOf } from '../emotions.js';

/**
 * Both helpers exist for one reason: an `emotionEntries` row logged with more
 * than one emotion at once still has a single, required `emotionId` (the
 * first one, for anything that only ever reads one) alongside the full
 * `emotionIds` list — and a row from before that list existed has no
 * `emotionIds` at all. Every reader of this collection relies on these two
 * functions treating both shapes the same way.
 */
describe('emotionIdsOf', () => {
  it('returns the full list when an entry recorded more than one emotion', () => {
    expect(emotionIdsOf({ emotionId: 'joy.happy', emotionIds: ['joy.happy', 'fear.nervous'] })).toEqual([
      'joy.happy',
      'fear.nervous',
    ]);
  });

  it('falls back to the single emotionId for a row with no emotionIds', () => {
    expect(emotionIdsOf({ emotionId: 'joy.happy' })).toEqual(['joy.happy']);
    expect(emotionIdsOf({ emotionId: 'joy.happy', emotionIds: [] })).toEqual(['joy.happy']);
    expect(emotionIdsOf({ emotionId: 'joy.happy', emotionIds: null })).toEqual(['joy.happy']);
  });

  it('returns nothing for an entry with neither', () => {
    expect(emotionIdsOf({})).toEqual([]);
  });
});

describe('categoriesOf', () => {
  it('returns the full list when an entry recorded more than one family', () => {
    expect(categoriesOf({ category: 'joy', categories: ['joy', 'fear'] })).toEqual(['joy', 'fear']);
  });

  it('falls back to the single category for a row with no categories', () => {
    expect(categoriesOf({ category: 'joy' })).toEqual(['joy']);
    expect(categoriesOf({ category: 'joy', categories: [] })).toEqual(['joy']);
  });

  it('returns nothing for an entry with neither', () => {
    expect(categoriesOf({})).toEqual([]);
  });
});

describe('emotionIntensityOf', () => {
  it('reads a feelingEntries-style per-emotion map first', () => {
    const entry = { emotionIntensities: { 'joy.happy': 5, 'fear.nervous': 2 }, intensity: 3 };
    expect(emotionIntensityOf(entry, 'joy.happy')).toBe(5);
    expect(emotionIntensityOf(entry, 'fear.nervous')).toBe(2);
  });

  it('falls back to the whole-entry intensity when the map has nothing for that emotion', () => {
    const entry = { emotionIntensities: { 'joy.happy': 5 }, intensity: 4 };
    expect(emotionIntensityOf(entry, 'fear.nervous')).toBe(4);
  });

  it('falls back to the whole-entry intensity for a plain emotionEntries row with no map at all', () => {
    expect(emotionIntensityOf({ intensity: 4 }, 'joy.happy')).toBe(4);
  });

  it('falls back to the given default when neither is present', () => {
    expect(emotionIntensityOf({}, 'joy.happy')).toBe(3);
    expect(emotionIntensityOf({}, 'joy.happy', 1)).toBe(1);
  });

  it('clamps whatever it reads to the 1-5 range', () => {
    expect(emotionIntensityOf({ emotionIntensities: { 'joy.happy': 9 } }, 'joy.happy')).toBe(5);
    expect(emotionIntensityOf({ emotionIntensities: { 'joy.happy': 0 } }, 'joy.happy')).toBe(1);
  });
});
