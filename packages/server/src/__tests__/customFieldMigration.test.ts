import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * Ash and Birch each arrive with their own legacy `customFields`, built the
 * old way: a per-member Species picker, and (Ash only) a Notes field. Birch's
 * Species field lists "Host" as a choice they never actually picked — a stand
 * in for "an option someone declared but didn't answer with" — and Cove has
 * no legacy fields at all.
 */
describe('legacy custom field migration', () => {
  let client: TestClient;
  let token: string;
  let ashId: string;
  let birchId: string;
  let coveId: string;

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'legacy-fields@example.com' });
    token = account.token;

    const ash = await client.request('POST', '/api/records/members', {
      token,
      body: {
        name: 'Ash',
        color: '#9d8cf0',
        customFields: [
          { id: 'cf_a1', label: 'Species', type: 'choice', value: 'Human', options: ['Human', 'Fictive'] },
          { id: 'cf_a2', label: 'Notes', type: 'longText', value: 'Likes tea, dislikes loud rooms.' },
          {
            id: 'cf_a3',
            label: 'Tags',
            type: 'multiSelect',
            value: JSON.stringify(['Introvert', 'Night owl']),
            options: ['Introvert', 'Night owl'],
          },
        ],
      },
    });
    ashId = ash.body.data.id;

    const birch = await client.request('POST', '/api/records/members', {
      token,
      body: {
        name: 'Birch',
        color: '#e0705f',
        customFields: [
          { id: 'cf_b1', label: 'Species', type: 'choice', value: 'Fictive', options: ['Human', 'Fictive', 'Host'] },
          {
            id: 'cf_b2',
            label: 'Tags',
            type: 'multiSelect',
            value: JSON.stringify(['Night owl', 'Early riser']),
            options: ['Night owl', 'Early riser'],
          },
        ],
      },
    });
    birchId = birch.body.data.id;

    const cove = await client.request('POST', '/api/records/members', {
      token,
      body: { name: 'Cove', color: '#5ec6a8' },
    });
    coveId = cove.body.data.id;
  });
  afterAll(() => client.close());

  it('folds same label-and-type fields into one shared definition, combining every option on offer', async () => {
    const result = await client.request('POST', '/api/system/custom-fields/migrate', { token, body: {} });
    expect(result.status).toBe(200);
    // This endpoint also runs the member-field migration (see the describe
    // block below), which now always creates its full standard set of 24
    // definitions regardless of legacy data — but 3 of those 24 share a
    // label with what this test's own legacy fields already created
    // (Species, Notes, Tags), so the member-field pass reuses those 3
    // instead of duplicating them: 3 legacy + (24 - 3) reused = 24 total.
    expect(result.body.data).toEqual({ migrated: true, definitions: 24, values: 5 });

    const definitions = await client.request('GET', '/api/records/customFieldDefinitions', { token });
    const byLabel = new Map<string, any>(definitions.body.data.items.map((d: any) => [d.label, d]));
    expect([...byLabel.keys()]).toEqual(expect.arrayContaining(['Notes', 'Species', 'Tags']));

    const species = byLabel.get('Species');
    expect(species.type).toBe('choice');
    // "Host" was only ever a choice Birch declared, never one either member
    // actually picked — it still has to survive the migration.
    expect(species.options.map((o: any) => o.label).sort()).toEqual(['Fictive', 'Host', 'Human']);

    const tags = byLabel.get('Tags');
    expect(tags.options.map((o: any) => o.label).sort()).toEqual(['Early riser', 'Introvert', 'Night owl']);
  });

  it('remaps each member’s own answer onto the shared option ids, keeping members independent', async () => {
    const definitions = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data
      .items;
    const species = definitions.find((d: any) => d.label === 'Species');
    const notes = definitions.find((d: any) => d.label === 'Notes');
    const tags = definitions.find((d: any) => d.label === 'Tags');
    const optionId = (def: any, label: string): string => def.options.find((o: any) => o.label === label).id;

    const ash = (await client.request('GET', `/api/records/members/${ashId}`, { token })).body.data;
    const birch = (await client.request('GET', `/api/records/members/${birchId}`, { token })).body.data;
    const cove = (await client.request('GET', `/api/records/members/${coveId}`, { token })).body.data;

    const valueFor = (member: any, definitionId: string): string | undefined =>
      (member.customFieldValues ?? []).find((v: any) => v.definitionId === definitionId)?.value;

    expect(valueFor(ash, species.id)).toBe(optionId(species, 'Human'));
    expect(valueFor(ash, notes.id)).toBe('Likes tea, dislikes loud rooms.');
    expect(JSON.parse(valueFor(ash, tags.id)!)).toEqual([optionId(tags, 'Introvert'), optionId(tags, 'Night owl')]);

    expect(valueFor(birch, species.id)).toBe(optionId(species, 'Fictive'));
    expect(valueFor(birch, notes.id)).toBeUndefined();
    expect(JSON.parse(valueFor(birch, tags.id)!)).toEqual([optionId(tags, 'Night owl'), optionId(tags, 'Early riser')]);

    // Both used the label "Night owl" on their own separate, formerly-independent
    // field — after migration that has to be the exact same option id.
    expect(valueFor(ash, tags.id)).toContain(optionId(tags, 'Night owl'));

    // Cove never had legacy fields, so nothing was invented on their behalf.
    expect(Array.isArray(cove.customFieldValues) ? cove.customFieldValues.length : 0).toBe(0);
  });

  it('is a no-op once definitions exist, and never rewrites the legacy column', async () => {
    const before = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data.items;
    const result = await client.request('POST', '/api/system/custom-fields/migrate', { token, body: {} });
    expect(result.body.data).toEqual({ migrated: false, definitions: 0, values: 0 });

    const after = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data.items;
    expect(after).toHaveLength(before.length);

    const ash = (await client.request('GET', `/api/records/members/${ashId}`, { token })).body.data;
    expect(ash.customFields).toEqual([
      { id: 'cf_a1', label: 'Species', type: 'choice', value: 'Human', options: ['Human', 'Fictive'] },
      { id: 'cf_a2', label: 'Notes', type: 'longText', value: 'Likes tea, dislikes loud rooms.' },
      {
        id: 'cf_a3',
        label: 'Tags',
        type: 'multiSelect',
        value: JSON.stringify(['Introvert', 'Night owl']),
        options: ['Introvert', 'Night owl'],
      },
    ]);
  });

  it('is off-limits in Singlet Mode', async () => {
    client.resetLimits();
    const singlet = await registerUser(client, { email: 'legacy-singlet@example.com', mode: 'singlet' });
    const result = await client.request('POST', '/api/system/custom-fields/migrate', {
      token: singlet.token,
      body: {},
    });
    expect(result.status).toBe(403);
    expect(result.body.error.message).toContain('System Mode');
  });
});

/**
 * The alter editor's own simplification: everything beyond name, pronouns,
 * roles, source ("origin") and age moves into the same shared custom-fields
 * system, pre-filled from whatever was already on the member record.
 */
describe('member field migration (editor simplification)', () => {
  let client: TestClient;
  let token: string;
  let denId: string;
  let finchId: string;
  let ivyId: string;

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'member-fields@example.com' });
    token = account.token;

    const den = await client.request('POST', '/api/records/members', {
      token,
      body: {
        name: 'Den',
        species: 'Fictive',
        bio: 'Keeps everyone else on schedule.',
        hobbies: ['Chess', 'Baking'],
      },
    });
    denId = den.body.data.id;

    const finch = await client.request('POST', '/api/records/members', {
      token,
      body: { name: 'Finch', species: 'Human', notes: 'Quiet most days.' },
    });
    finchId = finch.body.data.id;

    // No migratable fields at all — a control for "nothing invented for them".
    const ivy = await client.request('POST', '/api/records/members', { token, body: { name: 'Ivy' } });
    ivyId = ivy.body.data.id;
  });
  afterAll(() => client.close());

  it('creates a definition for every standard field, and copies each member’s own value where one exists', async () => {
    const result = await client.request('POST', '/api/system/custom-fields/migrate', { token, body: {} });
    expect(result.status).toBe(200);
    expect(result.body.data.migrated).toBe(true);
    // Every field in MEMBER_FIELD_MIGRATIONS gets a definition, whether or
    // not any member has a legacy value for it — these are the standing
    // fields every profile can answer, not just a vehicle for moving data
    // that happens to exist. Only 5 member-field values actually get copied:
    // Den has species, bio and hobbies; Finch has species and notes.
    expect(result.body.data.definitions).toBe(24);
    expect(result.body.data.values).toBe(5);

    const definitions = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data
      .items;
    const byLabel = new Map<string, any>(definitions.map((d: any) => [d.label, d]));
    expect(byLabel.get('Species').type).toBe('text');
    expect(byLabel.get('Species').group).toBe('Identity');
    expect(byLabel.get('Biography').type).toBe('longText');
    expect(byLabel.get('Hobbies').type).toBe('tags');
    expect(byLabel.get('Notes').type).toBe('longText');
    // Nobody set a chat prefix, but the definition still exists — a field
    // left blank by every member is available to answer, not absent.
    expect(byLabel.has('Chat prefix')).toBe(true);

    const den = (await client.request('GET', `/api/records/members/${denId}`, { token })).body.data;
    const valueFor = (member: any, label: string): string | undefined =>
      (member.customFieldValues ?? []).find((v: any) => v.definitionId === byLabel.get(label).id)?.value;
    expect(valueFor(den, 'Species')).toBe('Fictive');
    expect(valueFor(den, 'Biography')).toBe('Keeps everyone else on schedule.');
    expect(JSON.parse(valueFor(den, 'Hobbies')!)).toEqual(['Chess', 'Baking']);

    // Den's own species column is untouched — nothing is cleared, only copied.
    expect(den.species).toBe('Fictive');
  });

  it('reuses the same definition across members instead of creating a duplicate', async () => {
    const definitions = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data
      .items;
    const speciesDefs = definitions.filter((d: any) => d.label === 'Species');
    expect(speciesDefs).toHaveLength(1);

    const finch = (await client.request('GET', `/api/records/members/${finchId}`, { token })).body.data;
    const value = (finch.customFieldValues ?? []).find((v: any) => v.definitionId === speciesDefs[0].id)?.value;
    expect(value).toBe('Human');
  });

  it('copies no values for a member with no migratable fields, even though the definitions exist', async () => {
    const ivy = (await client.request('GET', `/api/records/members/${ivyId}`, { token })).body.data;
    expect(Array.isArray(ivy.customFieldValues) ? ivy.customFieldValues.length : 0).toBe(0);
  });

  it('never overwrites a value already answered, on a second run', async () => {
    const definitions = (await client.request('GET', '/api/records/customFieldDefinitions', { token })).body.data
      .items;
    const speciesDef = definitions.find((d: any) => d.label === 'Species');

    // Answered directly through the normal custom-fields editor, not through
    // the migration — this has to survive a second migration run untouched.
    // Preserve Finch's other already-migrated values (Notes) instead of
    // replacing the whole array, since a PATCH here sets the field as a
    // whole rather than merging one entry into it.
    const finchBefore = (await client.request('GET', `/api/records/members/${finchId}`, { token })).body.data;
    const otherValues = (finchBefore.customFieldValues ?? []).filter((v: any) => v.definitionId !== speciesDef.id);
    await client.request('PATCH', `/api/records/members/${finchId}`, {
      token,
      body: { customFieldValues: [...otherValues, { definitionId: speciesDef.id, value: 'Human (edited)' }] },
    });

    const result = await client.request('POST', '/api/system/custom-fields/migrate', { token, body: {} });
    expect(result.body.data).toEqual({ migrated: false, definitions: 0, values: 0 });

    const finch = (await client.request('GET', `/api/records/members/${finchId}`, { token })).body.data;
    const value = (finch.customFieldValues ?? []).find((v: any) => v.definitionId === speciesDef.id)?.value;
    expect(value).toBe('Human (edited)');
  });
});
