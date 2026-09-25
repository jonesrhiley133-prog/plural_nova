import { DEFAULT_THEME } from '@pluralnova/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('records, settings, backup and sync', () => {
  let client: TestClient;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    client = await createTestApp();
    token = (await registerUser(client, { email: 'owner@example.com' })).token;
    otherToken = (await registerUser(client, { email: 'stranger@example.com' })).token;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('creates, reads, updates and soft-deletes a record', async () => {
    const created = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'House rules', body: 'No big decisions after 10pm.' },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const read = await client.request('GET', `/api/records/notes/${id}`, { token });
    expect(read.body.data.title).toBe('House rules');
    expect(read.body.data.version).toBe(1);

    const updated = await client.request('PATCH', `/api/records/notes/${id}`, {
      token,
      body: { title: 'House rules (agreed)' },
    });
    expect(updated.body.data.title).toBe('House rules (agreed)');
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.body).toBe('No big decisions after 10pm.');

    const deleted = await client.request('DELETE', `/api/records/notes/${id}`, { token });
    expect(deleted.body.data.restorableUntil).toBeTruthy();

    const gone = await client.request('GET', `/api/records/notes/${id}`, { token });
    expect(gone.status).toBe(404);

    const restored = await client.request('POST', `/api/records/notes/${id}/restore`, { token });
    expect(restored.status).toBe(200);
    expect(restored.body.data.deletedAt).toBeNull();
  });

  it('never returns another account’s records', async () => {
    const mine = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'Private note' },
    });

    const list = await client.request('GET', '/api/records/notes', { token: otherToken });
    expect(list.body.data.items.some((n: any) => n.id === mine.body.data.id)).toBe(false);

    const direct = await client.request('GET', `/api/records/notes/${mine.body.data.id}`, {
      token: otherToken,
    });
    expect(direct.status).toBe(404);

    const write = await client.request('PATCH', `/api/records/notes/${mine.body.data.id}`, {
      token: otherToken,
      body: { title: 'Taken over' },
    });
    expect(write.status).toBe(404);
  });

  it('reports field errors rather than storing bad data', async () => {
    const result = await client.request('POST', '/api/records/members', { token, body: {} });
    expect(result.status).toBe(422);
    expect(result.body.error.details.name).toContain('required');
  });

  it('round-trips structured fields without mangling them', async () => {
    const created = await client.request('POST', '/api/records/tasks', {
      token,
      body: {
        title: 'Plan the week',
        tags: ['home', 'weekly'],
        subtasks: [{ id: 'a', label: 'Shopping list', done: true }],
        priority: 'high',
        completed: false,
      },
    });
    const read = await client.request('GET', `/api/records/tasks/${created.body.data.id}`, { token });
    expect(read.body.data.tags).toEqual(['home', 'weekly']);
    expect(read.body.data.subtasks[0].label).toBe('Shopping list');
    expect(read.body.data.priority).toBe('high');
    expect(read.body.data.completed).toBe(false);
  });

  it('rejects a stale write instead of overwriting a newer version', async () => {
    const created = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'Contested' },
    });
    const id = created.body.data.id;
    await client.request('PATCH', `/api/records/notes/${id}`, { token, body: { title: 'First edit' } });

    const stale = await client.request('PATCH', `/api/records/notes/${id}`, {
      token,
      body: { title: 'Second edit', expectedVersion: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toContain('changed somewhere else');
  });

  it('keeps the rest of a batch when one row is invalid', async () => {
    const result = await client.request('POST', '/api/records/members/batch', {
      token,
      body: { records: [{ name: 'Valid one' }, { pronouns: 'they/them' }, { name: 'Also valid' }] },
    });
    expect(result.status).toBe(207);
    expect(result.body.data.created).toBe(2);
    expect(result.body.data.failed).toHaveLength(1);
  });

  it('saves every notification setting and returns it after a reload', async () => {
    const saved = await client.request('PUT', '/api/auth/settings', {
      token,
      body: {
        notifications: {
          messages: { inApp: true, foreground: false, push: false, badge: true },
          fronting: { inApp: false, foreground: false, push: false, badge: false },
        },
        quietHours: { enabled: true, from: '23:00', to: '08:00' },
        notificationsEnabled: true,
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.settings.notifications.messages.push).toBe(false);

    const reloaded = await client.request('GET', '/api/auth/me', { token });
    expect(reloaded.body.data.settings.notifications.messages.push).toBe(false);
    expect(reloaded.body.data.settings.notifications.fronting.inApp).toBe(false);
    expect(reloaded.body.data.settings.quietHours.from).toBe('23:00');
    // A category the request did not mention keeps its default.
    expect(reloaded.body.data.settings.notifications.tasks.inApp).toBe(true);
  });

  it('saves terminology globally and keeps it after a reload', async () => {
    await client.request('PUT', '/api/auth/settings', {
      token,
      body: { terminology: { member: { one: 'starling', other: 'starlings' } } },
    });
    const reloaded = await client.request('GET', '/api/auth/me', { token });
    expect(reloaded.body.data.settings.terminology.member.one).toBe('starling');
  });

  it('keeps the chosen mode after a reload rather than reverting', async () => {
    await client.request('PUT', '/api/auth/settings', { token, body: { mode: 'singlet' } });
    let reloaded = await client.request('GET', '/api/auth/me', { token });
    expect(reloaded.body.data.settings.mode).toBe('singlet');
    expect(reloaded.body.data.user.mode).toBe('singlet');

    await client.request('PUT', '/api/auth/settings', { token, body: { mode: 'system' } });
    reloaded = await client.request('GET', '/api/auth/me', { token });
    expect(reloaded.body.data.settings.mode).toBe('system');
  });

  it('keeps the theme after a reload', async () => {
    await client.request('PUT', '/api/auth/settings', {
      token,
      body: { theme: { base: 'amoled', accent: '#5ec6a8', effects: 'performance' } },
    });
    const reloaded = await client.request('GET', '/api/auth/me', { token });
    expect(reloaded.body.data.settings.theme.base).toBe('amoled');
    expect(reloaded.body.data.settings.theme.accent).toBe('#5ec6a8');
    expect(reloaded.body.data.settings.theme.effects).toBe('performance');
    /*
     * The point of this line is that a partial update leaves the rest of the
     * theme alone, not that any particular style is the default. It used to
     * assert 'glass' literally and so failed the day the default changed,
     * which told nobody anything about whether the merge still worked.
     */
    expect(reloaded.body.data.settings.theme.surfaceStyle).toBe(DEFAULT_THEME.surfaceStyle);
  });

  it('exports a backup that validates and restores', async () => {
    await client.request('POST', '/api/records/members', { token, body: { name: 'Backup subject' } });

    const exported = await client.request('GET', '/api/data/backup', { token });
    expect(exported.status).toBe(200);
    expect(exported.body.format).toBe('pluralnova.backup');
    expect(exported.body.collections.members.length).toBeGreaterThan(0);

    const preview = await client.request('POST', '/api/data/restore/preview', {
      token,
      body: { backup: exported.body },
    });
    expect(preview.body.data.valid).toBe(true);
    expect(preview.body.data.checksumOk).toBe(true);
    expect(preview.body.data.totalRecords).toBeGreaterThan(0);

    // Restoring the same file again is a no-op rather than a duplication.
    const before = await client.request('GET', '/api/records/members', { token });
    const restored = await client.request('POST', '/api/data/restore', {
      token,
      body: { backup: exported.body, strategy: 'merge' },
    });
    expect(restored.status).toBe(200);
    const after = await client.request('GET', '/api/records/members', { token });
    expect(after.body.data.total).toBe(before.body.data.total);
  });

  it('refuses a corrupted backup with an explanation', async () => {
    const preview = await client.request('POST', '/api/data/restore/preview', {
      token,
      body: { backup: { format: 'something-else', version: 3 } },
    });
    expect(preview.body.data.valid).toBe(false);
    expect(preview.body.data.errors[0]).toContain('not a PluralNova backup');
  });

  it('restores an older backup format by migrating it forward', async () => {
    const legacy = {
      format: 'pluralnova.backup',
      version: 1,
      createdAt: new Date().toISOString(),
      app: { name: 'PluralNova', version: '0.9.0' },
      account: { displayName: 'Old', email: null, mode: 'system', activeSystemId: null },
      settings: {},
      counts: {},
      checksum: 'ignored',
      collections: {
        fronts: [
          {
            id: 'fev_legacy_row_000000001',
            userId: 'other',
            systemId: 'other',
            startedAt: new Date().toISOString(),
            endedAt: null,
            private: false,
          },
        ],
      },
    };

    const restored = await client.request('POST', '/api/data/restore', {
      token,
      body: { backup: legacy, strategy: 'merge' },
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.report.imported).toBe(1);

    const fronts = await client.request('GET', '/api/records/frontEvents?includeDeleted=true', { token });
    const migrated = fronts.body.data.items.find((f: any) => f.id === 'fev_legacy_row_000000001');
    expect(migrated).toBeTruthy();
    // Ownership is rewritten to the restoring account, never carried over.
    expect(migrated.userId).not.toBe('other');
    expect(migrated.coFronterIds).toEqual([]);
    expect(migrated.visibility).toBe('system');
  });

  it('imports a PluralKit export and reports what it could not read', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'pluralkit',
        payload: {
          members: [
            { name: 'Imported One', pronouns: 'she/her', color: '7aa2f7', description: 'A member.' },
            { pronouns: 'they/them' },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(1);
    expect(result.body.data.problems).toHaveLength(1);
    expect(result.body.data.problems[0].reason).toContain('No name');

    const members = await client.request('GET', '/api/records/members?search=Imported', { token });
    expect(members.body.data.items[0].color).toBe('#7aa2f7');
  });

  it('handles an unreadable import file without destroying anything', async () => {
    const before = await client.request('GET', '/api/records/members', { token });
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: { source: 'pluralkit', payload: 'not an object at all' },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(0);

    const after = await client.request('GET', '/api/records/members', { token });
    expect(after.body.data.total).toBe(before.body.data.total);
  });

  it('imports PluralKit switches as front history from a file export', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'pluralkit',
        payload: {
          members: [
            { id: 'aaaaa', name: 'Switch One' },
            { id: 'bbbbb', name: 'Switch Two' },
          ],
          switches: [
            { timestamp: '2026-01-01T00:00:00.000Z', members: ['aaaaa'] },
            { timestamp: '2026-01-01T01:30:00.000Z', members: ['bbbbb'] },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(4); // 2 members + 2 front periods (the last stays open)

    const members = await client.request('GET', '/api/records/members?search=Switch%20', { token });
    const memberIds = members.body.data.items.map((row: any) => row.id);
    expect(memberIds).toHaveLength(2);

    const fronts = await client.request('GET', '/api/records/frontEvents', { token });
    const created = fronts.body.data.items.filter((row: any) => memberIds.includes(row.memberId));
    expect(created).toHaveLength(2);
    expect(created.find((row: any) => row.durationMinutes === 90)).toBeTruthy();
    expect(created.find((row: any) => row.endedAt === null)).toBeTruthy();
  });

  describe('PluralKit token import', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('pulls members, switches and groups from PluralKit using a token', async () => {
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0]);
        if (!url.includes('api.pluralkit.me')) return realFetch(...args);
        if (url.includes('/switches')) {
          return new Response(
            JSON.stringify([
              { timestamp: '2026-02-01T00:00:00.000Z', members: ['ccccc'] },
              { timestamp: '2026-02-01T02:00:00.000Z', members: ['ddddd'] },
            ]),
            { status: 200 },
          );
        }
        if (url.includes('/groups')) {
          return new Response(
            JSON.stringify([{ id: 'grp-1', name: 'Token Group', members: ['ccccc'] }]),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify([
            { id: 'ccccc', name: 'Token One', pronouns: 'she/her', color: '5ec6a8' },
            { id: 'ddddd', pronouns: 'they/them' },
          ]),
          { status: 200 },
        );
      }) as typeof fetch;

      const result = await client.request('POST', '/api/data/import', {
        token,
        body: { source: 'pluralkit-token', payload: { token: 'pk_test_token' } },
      });
      expect(result.status).toBe(200);
      expect(result.body.data.report.imported).toBe(3); // 1 named member + 1 front period + 1 group
      expect(result.body.data.problems).toHaveLength(1);

      const members = await client.request('GET', '/api/records/members?search=Token%20One', { token });
      expect(members.body.data.items[0].color).toBe('#5ec6a8');

      const groups = await client.request('GET', '/api/records/memberGroups?search=Token%20Group', { token });
      expect(groups.body.data.items).toHaveLength(1);
      expect(members.body.data.items[0].groupId).toBe(groups.body.data.items[0].id);
    });

    it('reports a token PluralKit does not accept', async () => {
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const url = String(args[0]);
        if (!url.includes('api.pluralkit.me')) return realFetch(...args);
        return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
      }) as typeof fetch;

      const result = await client.request('POST', '/api/data/import', {
        token,
        body: { source: 'pluralkit-token', payload: { token: 'not-a-real-token' } },
      });
      expect(result.status).toBe(200);
      expect(result.body.data.report.imported).toBe(0);
      expect(result.body.data.problems[0].reason).toContain('not accepted');
    });
  });

  it('imports an Octocon export', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'octocon',
        payload: {
          alters: [
            {
              id: 1,
              name: 'Octo One',
              pronouns: 'it/its',
              description: 'From Octocon.',
              color: '#818cf8',
              avatar_url: 'https://example.com/octo.png',
            },
            { id: 2, pronouns: 'she/her' },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(1);
    expect(result.body.data.problems).toHaveLength(1);

    const members = await client.request('GET', '/api/records/members?search=Octo%20One', { token });
    expect(members.body.data.items[0].pronouns).toBe('it/its');
    expect(members.body.data.items[0].avatarUrl).toBe('https://example.com/octo.png');
  });

  it('imports a Sheaf export including fronting history', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'sheaf',
        payload: {
          version: '2',
          members: [
            { id: 'sh-1', name: 'Sheaf One', pronouns: 'she/her', description: 'Note here.', color: '#5ec6a8' },
          ],
          fronts: [
            {
              member_id: 'sh-1',
              started_at: '2026-01-01T00:00:00Z',
              ended_at: '2026-01-01T02:00:00Z',
              note: 'sheaf-fixture-marker',
            },
            { member_id: 'unknown-id', started_at: '2026-01-02T00:00:00Z' },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(2);
    expect(result.body.data.problems).toHaveLength(1);
    expect(result.body.data.problems[0].reason).toContain('did not match a member');

    const fronts = await client.request('GET', '/api/records/frontEvents?search=sheaf-fixture-marker', { token });
    expect(fronts.body.data.items).toHaveLength(1);
    expect(fronts.body.data.items[0].durationMinutes).toBe(120);
  });

  it('imports a Plural Star export', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'plural-star',
        payload: {
          _meta: { version: '1.2', app: 'Plural Star' },
          members: [
            { id: 'ps-1', name: 'Star One', pronouns: 'they/them', role: ['Host'], color: 'f0a05a', tags: ['fixture'] },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(1);

    const members = await client.request('GET', '/api/records/members?search=Star%20One', { token });
    expect(members.body.data.items[0].roles).toEqual(['Host']);
    expect(members.body.data.items[0].color).toBe('#f0a05a');
  });

  it('imports a PluralSpace export', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'pluralspace',
        payload: {
          members: [
            {
              id: 1523074,
              name: 'Space One',
              pronouns: 'xe/xem',
              description: 'From PluralSpace.',
              color: '#818cf8',
              role: ['Host', 'Core'],
              is_archived: false,
            },
          ],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(1);

    const members = await client.request('GET', '/api/records/members?search=Space%20One', { token });
    expect(members.body.data.items[0].roles).toEqual(['Host', 'Core']);
  });

  it('imports an Open Plural export and resolves asset references', async () => {
    const result = await client.request('POST', '/api/data/import', {
      token,
      body: {
        source: 'openplural',
        payload: {
          openplural_version: '0.1',
          members: [
            {
              id: 'op-1',
              name: 'Plural One',
              pronouns: 'she/they',
              description: 'Ported.',
              color: '#a78bfa',
              avatar_asset_id: 'asset-1',
            },
          ],
          assets: [{ id: 'asset-1', url: 'https://example.com/op-1.png' }],
          front_periods: [],
        },
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.report.imported).toBe(1);

    const members = await client.request('GET', '/api/records/members?search=Plural%20One', { token });
    expect(members.body.data.items[0].avatarUrl).toBe('https://example.com/op-1.png');
  });

  it('explains why Ampersand and Prism Plural exports cannot be read', async () => {
    const ampersandResult = await client.request('POST', '/api/data/import', {
      token,
      body: { source: 'ampersand', payload: {} },
    });
    expect(ampersandResult.body.data.report.imported).toBe(0);
    expect(ampersandResult.body.data.problems[0].reason).toContain('Ampersand');

    const prismResult = await client.request('POST', '/api/data/import', {
      token,
      body: { source: 'prism-plural', payload: {} },
    });
    expect(prismResult.body.data.report.imported).toBe(0);
    expect(prismResult.body.data.problems[0].reason).toContain('encrypted');
  });

  it('round-trips a member through the Open Plural export and import', async () => {
    const created = await client.request('POST', '/api/records/members', {
      token,
      body: { name: 'Round Trip', pronouns: 'ey/em', bio: 'Round-trip fixture.', color: '#e06c93' },
    });
    expect(created.status).toBe(201);

    const exported = await client.request('GET', '/api/data/export/openplural', { token });
    expect(exported.status).toBe(200);
    const file = exported.body;
    expect(file.openplural_version).toBe('0.1');
    expect(file.members.some((row: any) => row.name === 'Round Trip')).toBe(true);

    const second = await registerUser(client, { email: `roundtrip-${Date.now()}@example.com` });
    const imported = await client.request('POST', '/api/data/import', {
      token: second.token,
      body: { source: 'openplural', payload: file },
    });
    expect(imported.status).toBe(200);
    // The account this file came from has accumulated members from every test
    // above, so the whole file comes across — the point here is that this one
    // member's fields survived the round trip intact, not the total count.
    expect(imported.body.data.report.imported).toBeGreaterThanOrEqual(1);

    const reimported = await client.request('GET', '/api/records/members?search=Round%20Trip', {
      token: second.token,
    });
    expect(reimported.body.data.items).toHaveLength(1);
    expect(reimported.body.data.items[0].pronouns).toBe('ey/em');
    expect(reimported.body.data.items[0].bio).toBe('Round-trip fixture.');
    expect(reimported.body.data.items[0].color).toBe('#e06c93');
  });

  it('pulls only what changed since a cursor', async () => {
    const first = await client.request('GET', '/api/sync/pull', { token });
    expect(first.status).toBe(200);
    const cursor = first.body.data.cursor;

    const quiet = await client.request(`GET`, `/api/sync/pull?since=${encodeURIComponent(cursor)}`, {
      token,
    });
    expect(Object.keys(quiet.body.data.changes)).toHaveLength(0);

    await client.request('POST', '/api/records/notes', { token, body: { title: 'After the cursor' } });
    const second = await client.request(`GET`, `/api/sync/pull?since=${encodeURIComponent(cursor)}`, {
      token,
    });
    expect(second.body.data.changes.notes).toHaveLength(1);
    expect(second.body.data.changes.notes[0].title).toBe('After the cursor');
  });

  it('replays offline operations and surfaces a conflict instead of overwriting', async () => {
    const created = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'Synced note' },
    });
    const id = created.body.data.id;
    await client.request('PATCH', `/api/records/notes/${id}`, { token, body: { title: 'Server edit' } });

    const pushed = await client.request('POST', '/api/sync/push', {
      token,
      body: {
        operations: [
          {
            id: 'op-new',
            collection: 'notes',
            recordId: 'not_offline_created_00001',
            op: 'upsert',
            payload: { title: 'Made offline' },
            baseVersion: 0,
          },
          {
            id: 'op-stale',
            collection: 'notes',
            recordId: id,
            op: 'upsert',
            payload: { title: 'Offline edit' },
            baseVersion: 1,
          },
        ],
      },
    });

    expect(pushed.body.data.applied).toEqual(['op-new']);
    expect(pushed.body.data.conflicts).toHaveLength(1);
    expect(pushed.body.data.conflicts[0].server.title).toBe('Server edit');

    const unchanged = await client.request('GET', `/api/records/notes/${id}`, { token });
    expect(unchanged.body.data.title).toBe('Server edit');
  });

  it('sends deletions through sync so another device does not resurrect them', async () => {
    const created = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'To be deleted' },
    });
    const cursor = (await client.request('GET', '/api/sync/pull', { token })).body.data.cursor;
    await client.request('DELETE', `/api/records/notes/${created.body.data.id}`, { token });

    const pull = await client.request(`GET`, `/api/sync/pull?since=${encodeURIComponent(cursor)}`, {
      token,
    });
    const row = pull.body.data.changes.notes.find((n: any) => n.id === created.body.data.id);
    expect(row.deletedAt).toBeTruthy();
  });

  it('keeps the vault closed until it is unlocked', async () => {
    const locked = await client.request('GET', '/api/records/vaultItems', { token });
    expect(locked.status).toBe(403);

    await client.request('POST', '/api/vault/setup', { token, body: { pin: '4821' } });
    const unlockedRead = await client.request('GET', '/api/records/vaultItems', { token });
    expect(unlockedRead.status).toBe(200);

    await client.request('POST', '/api/vault/lock', { token });
    const relocked = await client.request('GET', '/api/records/vaultItems', { token });
    expect(relocked.status).toBe(403);

    const wrongPin = await client.request('POST', '/api/vault/unlock', { token, body: { pin: '0000' } });
    expect(wrongPin.status).toBe(401);

    const rightPin = await client.request('POST', '/api/vault/unlock', { token, body: { pin: '4821' } });
    expect(rightPin.body.data.unlocked).toBe(true);
  });

  it('leaves vault rows out of sync and search while locked', async () => {
    await client.request('POST', '/api/vault/unlock', { token, body: { pin: '4821' } });
    await client.request('POST', '/api/records/vaultItems', {
      token,
      body: { title: 'Sensitive document', body: 'secret contents' },
    });
    await client.request('POST', '/api/vault/lock', { token });

    const pull = await client.request('GET', '/api/sync/pull', { token });
    expect(pull.body.data.changes.vaultItems).toBeUndefined();

    const search = await client.request('GET', '/api/search?q=Sensitive', { token });
    expect(search.body.data.hits.some((h: any) => h.collection === 'vaultItems')).toBe(false);
  });

  it('searches across collections and returns a snippet', async () => {
    await client.request('POST', '/api/records/journalEntries', {
      token,
      body: {
        title: 'A quiet Tuesday',
        body: 'Nothing much happened, which was the good part of the Tuesday.',
        entryDate: new Date().toISOString(),
      },
    });
    const result = await client.request('GET', '/api/search?q=Tuesday', { token });
    expect(result.body.data.total).toBeGreaterThan(0);
    const hit = result.body.data.hits.find((h: any) => h.collection === 'journalEntries');
    expect(hit.title).toBe('A quiet Tuesday');
    expect(hit.snippet.toLowerCase()).toContain('tuesday');
  });

  it('unlocks achievements from what is actually stored', async () => {
    const achievements = await client.request('GET', '/api/records/achievements', { token });
    const keys = achievements.body.data.items.map((a: any) => a.achievementKey);
    expect(keys).toContain('first-member');
    expect(keys).toContain('first-note');
  });

  /*
   * Onboarding offers example data to every new account, and on a registered
   * one that offer could only ever fail: the endpoint refused anything that
   * was not a guest. The refusal was protecting something real — it seeds with
   * 'replace', which on an account with records in it would delete them — so
   * the fix is the strategy, not the guard.
   */
  it('adds example data to a registered account without deleting what is there', async () => {
    const before = await client.request('POST', '/api/records/notes', {
      token,
      body: { title: 'Mine', body: 'Written before the example data arrived.' },
    });
    expect(before.status).toBe(201);

    const seeded = await client.request('POST', '/api/data/demo/reset', { token, body: { days: 30 } });
    expect(seeded.status).toBe(200);
    expect(seeded.body.data.strategy).toBe('merge');
    expect(seeded.body.data.report.imported).toBeGreaterThan(0);

    const notes = await client.request('GET', '/api/records/notes', { token });
    const titles = notes.body.data.items.map((row: any) => row.title);
    expect(titles).toContain('Mine');
  });

  it('answers an unknown API route with a message, not a blank page', async () => {
    const result = await client.request('GET', '/api/nope', { token });
    expect(result.status).toBe(404);
    expect(result.body.error.message).toContain('No API route matches');
  });
});
