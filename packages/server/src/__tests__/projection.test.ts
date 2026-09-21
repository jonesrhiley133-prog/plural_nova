import { describe, expect, it } from 'vitest';
import { COLLECTIONS, getCollection } from '@pluralnova/shared';
import { shareableView, sensitiveFields } from '../services/projection.js';

/**
 * What another account is allowed to see.
 *
 * The `sensitive` flag described itself as excluding a field from shared
 * projections and nothing enforced it. Nothing was leaking — the profile view
 * is an allowlist that names every field it emits — but the protection came
 * from one function being written carefully rather than from the flag, and the
 * flag is what the collection definitions are written against.
 */
describe('sharing a record with another account', () => {
  it('removes every field the collection marked sensitive', () => {
    const record = {
      id: 'mbr_1',
      userId: 'usr_1',
      name: 'Vega',
      pronouns: 'she/her',
      triggers: 'Never leaves this account.',
      privateName: 'Not this either.',
      notes: 'Nor this.',
    } as never;

    const view = shareableView('members', record) as Record<string, unknown>;

    expect(view['name']).toBe('Vega');
    expect(view['pronouns']).toBe('she/her');
    for (const field of sensitiveFields('members')) {
      expect(view, `${field} survived the projection`).not.toHaveProperty(field);
    }
  });

  it('leaves a record alone when the collection marks nothing sensitive', () => {
    const record = { id: 'pst_1', userId: 'usr_1', body: 'Hello.' } as never;
    expect(shareableView('posts', record)).toEqual(record);
  });

  it('does not mind a collection it has never heard of', () => {
    const record = { id: 'x', body: 'y' } as never;
    expect(shareableView('somethingElse', record)).toEqual(record);
  });

  /*
   * The guard that matters, and the reason this file exists: the specific
   * fields are named here so that marking a new field sensitive without
   * teaching the projection about it fails loudly, and so that quietly
   * un-marking one of these does too.
   */
  it('keeps the fields that must never reach another account sensitive', () => {
    const mustStaySensitive: Record<string, string[]> = {
      members: ['privateName', 'triggers', 'notes'],
      contacts: ['phone', 'email', 'notes'],
      contactInteractions: ['notes'],
      locationEntries: ['latitude', 'longitude', 'address'],
    };

    for (const [collection, fields] of Object.entries(mustStaySensitive)) {
      const marked = sensitiveFields(collection);
      for (const field of fields) {
        // Present at all — a rename that loses the flag should fail here too.
        expect(
          getCollection(collection)?.fields.some((f) => f.name === field),
          `${collection}.${field} no longer exists`,
        ).toBe(true);
        expect(marked.has(field), `${collection}.${field} is no longer sensitive`).toBe(true);
      }
    }
  });

  it('marks something sensitive in every collection that holds a private record', () => {
    // A collection flagged neverPublic holds things not meant to be shared at
    // all; one that holds notes or medical detail should be saying so about at
    // least one field. This catches a new collection added without thinking
    // about it, which is when the question is easiest to forget.
    const shouldHaveSome = COLLECTIONS.filter(
      (collection) =>
        collection.neverPublic &&
        collection.fields.some((field) => /notes?$|address|phone|email|latitude/i.test(field.name)),
    );

    const missing = shouldHaveSome
      .filter((collection) => sensitiveFields(collection.name).size === 0)
      .map((collection) => collection.name);

    expect(missing).toEqual([]);
  });
});
