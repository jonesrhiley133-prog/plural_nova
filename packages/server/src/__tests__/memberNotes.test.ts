import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * The one real new access-control path in the cozy-features work: a note
 * aimed at specific alters, or timed to reveal later, must not show up for
 * every alter sharing the login the way every other collection's records do.
 */

describe('memberNotes visibility', () => {
  let client: TestClient;
  let user: { token: string; userId: string };
  let ashId: string;
  let birchId: string;
  let cedarId: string;

  async function setActive(memberId: string): Promise<void> {
    await client.request('POST', '/api/system/active-member', { token: user.token, body: { memberId } });
  }

  async function visibleBodies(): Promise<string[]> {
    const list = await client.request('GET', '/api/records/memberNotes', { token: user.token });
    return list.body.data.items.map((item: { body: string }) => item.body);
  }

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'notes@example.com', displayName: 'Notes' });

    const ash = await client.request('POST', '/api/records/members', { token: user.token, body: { name: 'Ash' } });
    const birch = await client.request('POST', '/api/records/members', { token: user.token, body: { name: 'Birch' } });
    const cedar = await client.request('POST', '/api/records/members', { token: user.token, body: { name: 'Cedar' } });
    ashId = ash.body.data.id;
    birchId = birch.body.data.id;
    cedarId = cedar.body.data.id;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('shows a system-wide note to everyone, and a targeted one only to its recipient and its sender', async () => {
    await setActive(ashId);
    await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { fromMemberId: ashId, toMemberIds: [], body: 'for everyone' },
    });
    await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { fromMemberId: ashId, toMemberIds: [birchId], body: 'just for birch' },
    });
    await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { fromMemberId: ashId, toMemberIds: [cedarId], body: 'just for cedar' },
    });

    // The sender sees their own system-wide and targeted notes.
    const asAsh = await visibleBodies();
    expect(asAsh).toContain('for everyone');
    expect(asAsh).toContain('just for birch');
    expect(asAsh).toContain('just for cedar');

    await setActive(birchId);
    const asBirch = await visibleBodies();
    expect(asBirch).toContain('for everyone');
    expect(asBirch).toContain('just for birch');
    expect(asBirch).not.toContain('just for cedar');

    await setActive(cedarId);
    const asCedar = await visibleBodies();
    expect(asCedar).toContain('for everyone');
    expect(asCedar).toContain('just for cedar');
    expect(asCedar).not.toContain('just for birch');
  });

  it('keeps a scheduled note hidden from everyone, including its own sender, until its reveal time', async () => {
    await setActive(ashId);
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    const created = await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { fromMemberId: ashId, toMemberIds: [], body: 'a surprise for later', remindAt: future },
    });
    const noteId = created.body.data.id;

    const asSender = await visibleBodies();
    expect(asSender).not.toContain('a surprise for later');

    const direct = await client.request('GET', `/api/records/memberNotes/${noteId}`, { token: user.token });
    expect(direct.status).toBe(404);
  });
});
