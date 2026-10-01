import { describe, expect, it } from 'vitest';
import { categoriesOf, emotionIdsOf } from '../emotions.js';

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
