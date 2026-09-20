import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    expect(reloaded.body.data.settings.theme.surfaceStyle).toBe('glass');
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

  it('answers an unknown API route with a message, not a blank page', async () => {
    const result = await client.request('GET', '/api/nope', { token });
    expect(result.status).toBe(404);
    expect(result.body.error.message).toContain('No API route matches');
  });
});
