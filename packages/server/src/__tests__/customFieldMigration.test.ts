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
    expect(result.body.data).toEqual({ migrated: true, definitions: 3, values: 5 });

    const definitions = await client.request('GET', '/api/records/customFieldDefinitions', { token });
    const byLabel = new Map<string, any>(definitions.body.data.items.map((d: any) => [d.label, d]));
    expect([...byLabel.keys()].sort()).toEqual(['Notes', 'Species', 'Tags']);

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
