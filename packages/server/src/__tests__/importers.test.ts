import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * Import adapters — the richer half.
 *
 * data.test.ts covers the basic "a name and a colour come through" case for
 * every source. These exercise the fields added on top of that: groups,
 * custom fields and journal entries, plus the fronting-history shapes each
 * source turned out to actually use once their real export formats were
 * checked against PluralPort's own research notes rather than guessed at.
 */

describe('import adapters: groups, custom fields and journals', () => {
  let client: TestClient;
  let token: string;

  beforeAll(async () => {
    client = await createTestApp();
    token = (await registerUser(client, { email: 'importer@example.com' })).token;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  async function importAndFetch(source: string, payload: unknown) {
    const result = await client.request('POST', '/api/data/import', { token, body: { source, payload } });
    expect(result.status).toBe(200);
    return result.body.data;
  }

  it('imports PluralKit groups from a file export and links members to them', async () => {
    const data = await importAndFetch('pluralkit', {
      members: [{ id: 'pk-a', name: 'Group Member' }],
      groups: [{ id: 'pk-g1', name: 'PK Group', description: 'A group.', members: ['pk-a'] }],
    });
    expect(data.problems).toHaveLength(0);

    const groups = await client.request('GET', '/api/records/memberGroups?search=PK%20Group', { token });
    expect(groups.body.data.items).toHaveLength(1);
    const members = await client.request('GET', '/api/records/members?search=Group%20Member', { token });
    expect(members.body.data.items[0].groupId).toBe(groups.body.data.items[0].id);
  });

  it('imports Simply Plural groups, custom fields and notes as a journal', async () => {
    const data = await importAndFetch('simply-plural', {
      members: [
        {
          id: 'sp-1',
          content: { name: 'Plural One', info: { 'field-1': 'Dragon' } },
        },
      ],
      groups: [{ id: 'grp-1', content: { name: 'SP Group', members: ['sp-1'] } }],
      customFields: [{ _id: 'field-1', content: { name: 'Species', type: 0, order: 0 } }],
      notes: [{ content: { member: 'sp-1', title: 'First entry', note: 'Written in Simply Plural.', date: 1700000000000 } }],
    });
    expect(data.report.imported).toBe(4); // member + group + custom field definition + journal entry

    const members = await client.request('GET', '/api/records/members?search=Plural%20One', { token });
    const member = members.body.data.items[0];
    expect(member.customFieldValues).toEqual([{ definitionId: expect.any(String), value: 'Dragon' }]);

    const groups = await client.request('GET', '/api/records/memberGroups?search=SP%20Group', { token });
    expect(member.groupId).toBe(groups.body.data.items[0].id);

    const journal = await client.request('GET', '/api/records/journalEntries?search=First%20entry', { token });
    expect(journal.body.data.items[0].body).toBe('Written in Simply Plural.');
    expect(journal.body.data.items[0].memberId).toBe(member.id);
  });

  it('imports a Sheaf export with co-fronting, groups, tags, custom fields and journals', async () => {
    const data = await importAndFetch('sheaf', {
      version: '2',
      members: [
        { id: 'sh-a', name: 'Sheaf A' },
        { id: 'sh-b', name: 'Sheaf B' },
      ],
      // A single front entry naming two members at once — the shape Sheaf
      // actually uses for co-fronting, rather than one row per co-fronter.
      fronts: [{ member_ids: ['sh-a', 'sh-b'], started_at: '2026-03-01T00:00:00Z', ended_at: '2026-03-01T01:00:00Z' }],
      groups: [{ id: 'sh-g1', name: 'Sheaf Group', member_ids: ['sh-a'] }],
      tags: [{ id: 'sh-t1', name: 'fixture-tag', member_ids: ['sh-b'] }],
      custom_fields: [
        {
          id: 'sh-f1',
          name: 'Favourite colour',
          field_type: 'text',
          order: 0,
          values: [{ member_id: 'sh-a', value: { v: 'Teal' } }],
        },
      ],
      journals: [
        {
          id: 'sh-j1',
          member_id: 'sh-a',
          title: 'Sheaf journal',
          body: 'Co-authored with Sheaf B.',
          author_member_ids: ['sh-a', 'sh-b'],
          created_at: '2026-03-02T00:00:00Z',
          visibility: 'private',
        },
      ],
    });
    expect(data.problems).toHaveLength(0);

    const fronts = await client.request('GET', '/api/records/frontEvents', { token });
    const memberA = (await client.request('GET', '/api/records/members?search=Sheaf%20A', { token })).body.data
      .items[0];
    const memberB = (await client.request('GET', '/api/records/members?search=Sheaf%20B', { token })).body.data
      .items[0];
    const front = fronts.body.data.items.find((row: any) => row.memberId === memberA.id);
    expect(front.coFronterIds).toEqual([memberB.id]);
    expect(front.durationMinutes).toBe(60);

    expect(memberA.tags).not.toContain('fixture-tag');
    expect(memberB.tags).toContain('fixture-tag');
    expect(memberA.customFieldValues).toEqual([{ definitionId: expect.any(String), value: 'Teal' }]);

    const groups = await client.request('GET', '/api/records/memberGroups?search=Sheaf%20Group', { token });
    expect(memberA.groupId).toBe(groups.body.data.items[0].id);

    const journal = await client.request('GET', '/api/records/journalEntries?search=Sheaf%20journal', { token });
    expect(journal.body.data.items[0].authorIds).toEqual(expect.arrayContaining([memberA.id, memberB.id]));
  });

  it('imports Octocon fronting history, tags and custom fields', async () => {
    const data = await importAndFetch('octocon', {
      user: { fields: [{ id: 'oc-f1', name: 'Role', type: 'text' }] },
      alters: [
        {
          id: 10,
          name: 'Octo Front',
          fields: [{ id: 'oc-f1', value: 'Protector' }],
        },
      ],
      fronts: [{ alter_id: 10, comment: 'octocon-fixture-front', time_start: '2026-04-01T00:00:00Z', time_end: '2026-04-01T00:30:00Z' }],
      tags: [{ id: 'oc-t1', name: 'octocon-fixture-tag', alters: [10] }],
    });
    expect(data.problems).toHaveLength(0);

    const member = (await client.request('GET', '/api/records/members?search=Octo%20Front', { token })).body.data
      .items[0];
    expect(member.tags).toContain('octocon-fixture-tag');
    expect(member.customFieldValues).toEqual([{ definitionId: expect.any(String), value: 'Protector' }]);

    const fronts = await client.request('GET', '/api/records/frontEvents?search=octocon-fixture-front', { token });
    expect(fronts.body.data.items).toHaveLength(1);
    expect(fronts.body.data.items[0].durationMinutes).toBe(30);
  });

  it('imports Plural Star front history, journal, groups and custom fields', async () => {
    const data = await importAndFetch('plural-star', {
      _meta: { version: '1.2', app: 'Plural Star' },
      members: [
        { id: 'star-a', name: 'Star A' },
        { id: 'star-b', name: 'Star B', groupIds: ['star-g1'] },
      ],
      groups: [{ id: 'star-g1', name: 'Star Group' }],
      customFieldDefs: [{ id: 'star-f1', name: 'Age', type: 'text' }],
      frontHistory: [
        {
          memberIds: ['star-a'],
          coFrontIds: ['star-b'],
          startTime: 1_700_000_000_000,
          endTime: 1_700_003_600_000,
          mood: 'content',
          location: 'home',
        },
      ],
      journal: [
        { id: 'star-j1', title: 'Star journal', body: 'Star Star entry.', authorIds: ['star-a'], hashtags: ['fixture'], timestamp: 1_700_000_000_000 },
      ],
    });
    expect(data.problems).toHaveLength(0);

    const memberA = (await client.request('GET', '/api/records/members?search=Star%20A', { token })).body.data
      .items[0];
    const memberB = (await client.request('GET', '/api/records/members?search=Star%20B', { token })).body.data
      .items[0];
    const groups = await client.request('GET', '/api/records/memberGroups?search=Star%20Group', { token });
    expect(memberB.groupId).toBe(groups.body.data.items[0].id);

    const fronts = await client.request('GET', '/api/records/frontEvents', { token });
    const front = fronts.body.data.items.find((row: any) => row.memberId === memberA.id && row.mood === 'content');
    expect(front.coFronterIds).toEqual([memberB.id]);
    // frontEvents has no plain-text location field — the location a source
    // gave as free text is folded into the note instead of being dropped.
    expect(front.note).toContain('Location: home');

    const journal = await client.request('GET', '/api/records/journalEntries?search=Star%20journal', { token });
    expect(journal.body.data.items[0].tags).toEqual(['fixture']);
  });

  it('imports PluralSpace fronting history, journal entries, groups and custom fields', async () => {
    const data = await importAndFetch('pluralspace', {
      members: [
        {
          id: 501,
          name: 'Space Front',
          groups: ['Space Group'],
          custom_field_values: { 'field-1': 'Answer' },
        },
      ],
      member_groups: [{ name: 'Space Group', description: 'A PluralSpace group.' }],
      custom_fields: [{ id: 'field-1', name: 'Note', field_type: 'text' }],
      fronts: [{ member_id: 501, started_at: '2026-05-01T00:00:00Z', ended_at: '2026-05-01T02:00:00Z', comment: 'pluralspace-fixture' }],
      journal_entries: [
        { title: 'Space journal', content: 'A PluralSpace journal entry.', members: [{ id: 501, name: 'Space Front' }], date: '2026-05-02T00:00:00Z' },
      ],
    });
    expect(data.problems).toHaveLength(0);

    const member = (await client.request('GET', '/api/records/members?search=Space%20Front', { token })).body.data
      .items[0];
    expect(member.customFieldValues).toEqual([{ definitionId: expect.any(String), value: 'Answer' }]);

    const groups = await client.request('GET', '/api/records/memberGroups?search=Space%20Group', { token });
    expect(member.groupId).toBe(groups.body.data.items[0].id);

    const fronts = await client.request('GET', '/api/records/frontEvents?search=pluralspace-fixture', { token });
    expect(fronts.body.data.items[0].durationMinutes).toBe(120);

    const journal = await client.request('GET', '/api/records/journalEntries?search=Space%20journal', { token });
    expect(journal.body.data.items[0].memberId).toBe(member.id);
  });

  it('imports Open Plural groups, taxonomy, custom fields, notes and per-member fronting detail', async () => {
    const data = await importAndFetch('openplural', {
      openplural_version: '0.1',
      members: [
        { id: 'op-a', name: 'Open A' },
        { id: 'op-b', name: 'Open B' },
      ],
      groups: [{ id: 'op-g1', name: 'Open Group' }],
      group_memberships: [{ group_id: 'op-g1', member_id: 'op-a' }],
      taxonomy_terms: [
        { id: 'term-role', kind: 'role', name: 'Host' },
        { id: 'term-tag', kind: 'tag', name: 'fixture' },
      ],
      taxonomy_assignments: [
        { subject_type: 'member', subject_id: 'op-a', term_id: 'term-role' },
        { subject_type: 'member', subject_id: 'op-a', term_id: 'term-tag' },
      ],
      custom_fields: [{ id: 'field-op1', name: 'Origin', field_type: 'text' }],
      custom_field_values: [{ subject_type: 'member', subject_id: 'op-a', field_id: 'field-op1', value: 'Fiction' }],
      notes: [
        {
          member_id: 'op-a',
          title: 'Open note',
          body: 'A note carried through OpenPlural.',
          author_member_ids: ['op-a', 'op-b'],
          entry_date: '2026-06-01T00:00:00Z',
          pinned: true,
          visibility: 'system',
        },
      ],
      front_periods: [
        {
          started_at: '2026-06-02T00:00:00Z',
          ended_at: '2026-06-02T01:00:00Z',
          assignments: [
            { member_id: 'op-a', front_role: 'primary', mood: 'calm', location: 'kitchen' },
            { member_id: 'op-b', front_role: 'co-front' },
          ],
        },
      ],
    });
    expect(data.problems).toHaveLength(0);

    const memberA = (await client.request('GET', '/api/records/members?search=Open%20A', { token })).body.data
      .items[0];
    const memberB = (await client.request('GET', '/api/records/members?search=Open%20B', { token })).body.data
      .items[0];
    expect(memberA.roles).toEqual(['Host']);
    expect(memberA.tags).toEqual(['fixture']);
    expect(memberA.customFieldValues).toEqual([{ definitionId: expect.any(String), value: 'Fiction' }]);

    const groups = await client.request('GET', '/api/records/memberGroups?search=Open%20Group', { token });
    expect(memberA.groupId).toBe(groups.body.data.items[0].id);

    const journal = await client.request('GET', '/api/records/journalEntries?search=Open%20note', { token });
    expect(journal.body.data.items[0].pinned).toBe(true);
    expect(journal.body.data.items[0].privacy).toBe('system');
    expect(journal.body.data.items[0].authorIds).toEqual(expect.arrayContaining([memberA.id, memberB.id]));

    const fronts = await client.request('GET', '/api/records/frontEvents', { token });
    const front = fronts.body.data.items.find((row: any) => row.memberId === memberA.id && row.mood === 'calm');
    expect(front.note).toContain('Location: kitchen');
    expect(front.coFronterIds).toEqual([memberB.id]);
  });

  it('resolves an Open Plural asset given as inline base64 data', async () => {
    const data = await importAndFetch('openplural', {
      openplural_version: '0.1',
      members: [{ id: 'op-c', name: 'Open C', avatar_asset_id: 'asset-c' }],
      assets: [{ id: 'asset-c', mime_type: 'image/png', data_base64: 'aGVsbG8=' }],
    });
    expect(data.problems).toHaveLength(0);

    const member = (await client.request('GET', '/api/records/members?search=Open%20C', { token })).body.data
      .items[0];
    expect(member.avatarUrl).toBe('data:image/png;base64,aGVsbG8=');
  });
});
