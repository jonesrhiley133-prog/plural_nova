import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/** Opens a realtime connection as the given account and resolves once the server's own `ready` frame confirms it is live. */
function connectRealtime(client: TestClient, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${client.port}/realtime?token=${encodeURIComponent(token)}`);
    socket.once('error', reject);
    socket.once('message', (raw) => {
      const parsed = JSON.parse(String(raw)) as { type?: string };
      if (parsed.type === 'ready') resolve(socket);
      else reject(new Error(`Expected a ready frame, got ${String(raw)}`));
    });
  });
}

/** Resolves with the next parsed JSON frame this socket receives, within a short deadline. */
function nextMessage(socket: WebSocket, timeoutMs = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for a realtime message.')), timeoutMs);
    socket.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(raw)) as Record<string, unknown>);
    });
  });
}

describe('direct messages: replies, reactions, forwarding', () => {
  let client: TestClient;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let threadId: string;

  beforeAll(async () => {
    client = await createTestApp();
    alice = await registerUser(client, { email: 'reply-alice@example.com', displayName: 'Alice' });
    bob = await registerUser(client, { email: 'reply-bob@example.com', displayName: 'Bob' });

    for (const [account, handle] of [
      [alice, 'reply-alice'],
      [bob, 'reply-bob'],
    ] as const) {
      await client.request('PUT', '/api/social/profile', {
        token: account.token,
        body: { handle, displayName: handle, isPublic: true },
      });
    }
    const request = await client.request('POST', '/api/social/friends/requests', {
      token: alice.token,
      body: { handle: 'reply-bob' },
    });
    await client.request('POST', `/api/social/friends/requests/${request.body.data.id}/accept`, {
      token: bob.token,
    });

    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'reply-bob' },
    });
    threadId = created.body.data.conversation.threadId;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('carries a replyToId through to the stored message', async () => {
    const first = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'original' },
    });
    const reply = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: bob.token,
      body: { body: 'a reply', replyToId: first.body.data.message.id },
    });
    expect(reply.status).toBe(201);
    expect(reply.body.data.message.replyToId).toBe(first.body.data.message.id);
  });

  it('toggles a reaction and tells both sides about it', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'react to me' },
    });
    const messageId = sent.body.data.message.id;

    const reacted = await client.request('POST', `/api/messages/messages/${messageId}/reactions`, {
      token: bob.token,
      body: { emoji: '❤️' },
    });
    expect(reacted.status).toBe(200);
    expect(reacted.body.data.reactions['❤️']).toEqual([bob.userId]);

    const fetched = await client.request('GET', `/api/messages/threads/${threadId}`, { token: alice.token });
    const stored = fetched.body.data.messages.find((m: any) => m.id === messageId);
    expect(stored.reactions['❤️']).toEqual([bob.userId]);

    const toggledOff = await client.request('POST', `/api/messages/messages/${messageId}/reactions`, {
      token: bob.token,
      body: { emoji: '❤️' },
    });
    expect(toggledOff.body.data.reactions['❤️']).toBeUndefined();
  });

  it('refuses a reaction from someone who is not in the conversation', async () => {
    const carol = await registerUser(client, { email: 'reply-carol@example.com' });
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'private to us two' },
    });
    const result = await client.request('POST', `/api/messages/messages/${sent.body.data.message.id}/reactions`, {
      token: carol.token,
      body: { emoji: '★' },
    });
    expect(result.status).toBe(404);
  });

  it('stores forwardedFrom metadata sent alongside a message', async () => {
    const original = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'forward me' },
    });
    const forwarded = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: bob.token,
      body: {
        body: 'forward me',
        forwardedFrom: { kind: 'dm', threadId, messageId: original.body.data.message.id, senderLabel: 'Alice' },
      },
    });
    expect(forwarded.body.data.message.forwardedFrom).toEqual({
      kind: 'dm',
      threadId,
      messageId: original.body.data.message.id,
      senderLabel: 'Alice',
    });
  });

  it('lets the sender delete their own message, and no one else', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'delete me' },
    });
    const messageId = sent.body.data.message.id;

    const refused = await client.request('DELETE', `/api/messages/messages/${messageId}`, { token: bob.token });
    expect(refused.status).toBe(404);

    const deleted = await client.request('DELETE', `/api/messages/messages/${messageId}`, { token: alice.token });
    expect(deleted.status).toBe(200);

    const fetched = await client.request('GET', `/api/messages/threads/${threadId}`, { token: alice.token });
    expect(fetched.body.data.messages.some((m: any) => m.id === messageId)).toBe(false);
  });

  it('removes a deleted conversation from the list, and brings it back when the conversation continues', async () => {
    const before = await client.request('GET', '/api/messages/conversations', { token: alice.token });
    const conversationId = before.body.data.conversations.find((c: any) => c.threadId === threadId).id;

    const deleted = await client.request('DELETE', `/api/messages/conversations/${conversationId}`, { token: alice.token });
    expect(deleted.status).toBe(200);

    const afterDelete = await client.request('GET', '/api/messages/conversations', { token: alice.token });
    expect(afterDelete.body.data.conversations.some((c: any) => c.threadId === threadId)).toBe(false);

    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: bob.token,
      body: { body: 'still here?' },
    });

    const afterReply = await client.request('GET', '/api/messages/conversations', { token: alice.token });
    const revived = afterReply.body.data.conversations.find((c: any) => c.threadId === threadId);
    expect(revived).toBeDefined();
    expect(revived.lastMessagePreview).toBe('still here?');
  });

  it('lets the sender edit their own message, and no one else', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'this has a typo' },
    });
    const messageId = sent.body.data.message.id;

    const refused = await client.request('PATCH', `/api/messages/messages/${messageId}`, {
      token: bob.token,
      body: { body: 'bob tries to rewrite alice' },
    });
    expect(refused.status).toBe(404);

    const edited = await client.request('PATCH', `/api/messages/messages/${messageId}`, {
      token: alice.token,
      body: { body: 'this has no typo' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.message.body).toBe('this has no typo');
    expect(edited.body.data.message.edited).toBe(true);

    const fetched = await client.request('GET', `/api/messages/threads/${threadId}`, { token: bob.token });
    const stored = fetched.body.data.messages.find((m: any) => m.id === messageId);
    expect(stored.body).toBe('this has no typo');
    expect(stored.edited).toBe(true);
  });

  it('only refreshes the conversation preview when the edited message is still the latest one', async () => {
    const older = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'older message' },
    });
    const newer = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: bob.token,
      body: { body: 'newer message' },
    });

    await client.request('PATCH', `/api/messages/messages/${older.body.data.message.id}`, {
      token: alice.token,
      body: { body: 'older message, fixed' },
    });
    const afterOlderEdit = await client.request('GET', '/api/messages/conversations', { token: alice.token });
    expect(
      afterOlderEdit.body.data.conversations.find((c: any) => c.threadId === threadId).lastMessagePreview,
    ).toBe('newer message');

    await client.request('PATCH', `/api/messages/messages/${newer.body.data.message.id}`, {
      token: bob.token,
      body: { body: 'newer message, fixed' },
    });
    const afterNewerEdit = await client.request('GET', '/api/messages/conversations', { token: alice.token });
    expect(
      afterNewerEdit.body.data.conversations.find((c: any) => c.threadId === threadId).lastMessagePreview,
    ).toBe('newer message, fixed');
  });

  it('rejects an edit that would leave the message empty', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'keep me' },
    });
    const blanked = await client.request('PATCH', `/api/messages/messages/${sent.body.data.message.id}`, {
      token: alice.token,
      body: { body: '   ' },
    });
    expect(blanked.status).toBe(400);
  });
});

describe('system chat threads', () => {
  let client: TestClient;
  let token: string;
  let ashId: string;
  let birchId: string;

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'threads@example.com' });
    token = account.token;

    ashId = (
      await client.request('POST', '/api/records/members', { token, body: { name: 'Ash', color: '#9d8cf0' } })
    ).body.data.id;
    birchId = (
      await client.request('POST', '/api/records/members', { token, body: { name: 'Birch', color: '#5ec6a8' } })
    ).body.data.id;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('auto-creates exactly one default whole-system thread', async () => {
    const first = await client.request('GET', '/api/system/chat/threads', { token });
    expect(first.status).toBe(200);
    expect(first.body.data.threads).toHaveLength(1);
    expect(first.body.data.threads[0].kind).toBe('system');

    // Calling it again must not create a second one.
    const second = await client.request('GET', '/api/system/chat/threads', { token });
    expect(second.body.data.threads).toHaveLength(1);
    expect(second.body.data.threads[0].id).toBe(first.body.data.threads[0].id);
  });

  it('sends to, reads, and marks a thread read', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;

    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'hello from Ash', memberId: ashId },
    });
    expect(sent.status).toBe(201);

    const afterSend = await client.request('GET', '/api/system/chat/threads', { token });
    const thread = afterSend.body.data.threads.find((t: any) => t.id === threadId);
    expect(thread.unread).toBe(true);
    expect(thread.lastMessagePreview).toBe('hello from Ash');

    await client.request('POST', `/api/system/chat/threads/${threadId}/read`, { token });
    const afterRead = await client.request('GET', '/api/system/chat/threads', { token });
    expect(afterRead.body.data.threads.find((t: any) => t.id === threadId).unread).toBe(false);

    const messages = await client.request('GET', `/api/system/chat/threads/${threadId}/messages`, { token });
    expect(messages.body.data.messages).toHaveLength(1);
    expect(messages.body.data.messages[0].body).toBe('hello from Ash');
  });

  it('hydrates attachmentIds into full objects a bubble can render without a second fetch', async () => {
    const media = await client.request('POST', '/api/records/mediaItems', {
      token,
      body: { title: 'sunset.jpg', mediaType: 'image', url: '/uploads/sunset.jpg', mimeType: 'image/jpeg', sizeBytes: 4096 },
    });
    expect(media.status).toBe(201);
    const mediaId = media.body.data.id;

    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;

    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: '', memberId: ashId, attachmentIds: [mediaId] },
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data.attachments).toEqual([
      { id: mediaId, url: '/uploads/sunset.jpg', mediaType: 'image', mimeType: 'image/jpeg', sizeBytes: 4096, title: 'sunset.jpg', durationSeconds: null, width: null, height: null },
    ]);

    const messages = await client.request('GET', `/api/system/chat/threads/${threadId}/messages`, { token });
    const stored = messages.body.data.messages.find((m: any) => m.id === sent.body.data.id);
    expect(stored.attachments[0].url).toBe('/uploads/sunset.jpg');
    expect(stored.attachments[0].mediaType).toBe('image');
  });

  it('deletes a system chat message through the generic records route', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;

    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'delete this one', memberId: ashId },
    });
    const messageId = sent.body.data.id;

    const deleted = await client.request('DELETE', `/api/records/systemChatMessages/${messageId}`, { token });
    expect(deleted.status).toBe(200);

    const messages = await client.request('GET', `/api/system/chat/threads/${threadId}/messages`, { token });
    expect(messages.body.data.messages.some((m: any) => m.id === messageId)).toBe(false);
  });

  it('creates a group thread with named participants and resolves them', async () => {
    const created = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', name: 'Just us two', participantMemberIds: [ashId, birchId] },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.thread.kind).toBe('group');
    expect(created.body.data.thread.participants.map((p: any) => p.name).sort()).toEqual(['Ash', 'Birch']);
  });

  it('reuses an existing thread for the same set of participants instead of duplicating it', async () => {
    const first = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', name: 'Reused', participantMemberIds: [ashId, birchId] },
    });
    const second = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', participantMemberIds: [birchId, ashId] },
    });
    expect(second.body.data.thread.id).toBe(first.body.data.thread.id);
  });

  it('requires exactly one participant for a direct thread', async () => {
    const tooMany = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [ashId, birchId] },
    });
    expect(tooMany.status).toBe(400);

    const direct = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [ashId] },
    });
    expect(direct.status).toBe(201);
    expect(direct.body.data.thread.name).toBe('Ash');
  });

  it('toggles a reaction on a system chat message', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;
    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'react to this one' },
    });

    const reacted = await client.request('POST', `/api/system/chat/messages/${sent.body.data.id}/reactions`, {
      token,
      body: { emoji: '★', memberId: ashId },
    });
    expect(reacted.body.data.reactions['★']).toEqual([ashId]);

    const toggledOff = await client.request('POST', `/api/system/chat/messages/${sent.body.data.id}/reactions`, {
      token,
      body: { emoji: '★', memberId: ashId },
    });
    expect(toggledOff.body.data.reactions['★']).toBeUndefined();
  });

  it('forwards a message into another thread with provenance attached', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const defaultThreadId = threads.body.data.threads[0].id;
    const group = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', name: 'Forward target', participantMemberIds: [ashId, birchId] },
    });

    const original = await client.request('POST', `/api/system/chat/threads/${defaultThreadId}/messages`, {
      token,
      body: { body: 'forward this along', memberId: ashId },
    });

    const forwarded = await client.request('POST', `/api/system/chat/messages/${original.body.data.id}/forward`, {
      token,
      body: { threadIds: [group.body.data.thread.id] },
    });
    expect(forwarded.status).toBe(201);
    expect(forwarded.body.data.forwarded).toHaveLength(1);
    expect(forwarded.body.data.forwarded[0].body).toBe('forward this along');
    expect(forwarded.body.data.forwarded[0].forwardedFrom).toMatchObject({
      kind: 'system',
      messageId: original.body.data.id,
      senderLabel: 'Ash',
    });

    const groupMessages = await client.request('GET', `/api/system/chat/threads/${group.body.data.thread.id}/messages`, {
      token,
    });
    expect(groupMessages.body.data.messages).toHaveLength(1);
  });

  it('does not resurrect an archived thread in the default list', async () => {
    const created = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', name: 'Soon archived', participantMemberIds: [ashId] },
    });
    await client.request('PATCH', `/api/records/systemChatThreads/${created.body.data.thread.id}`, {
      token,
      body: { archived: true },
    });
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    expect(threads.body.data.threads.some((t: any) => t.id === created.body.data.thread.id)).toBe(false);
  });

  it('lets any alter on the account edit a system chat message, not just whoever sent it', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;
    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'sent by ash', memberId: ashId },
    });
    const messageId = sent.body.data.id;

    // Switching the active member to Birch must not block editing a message Ash
    // sent — system chat has no second account to protect this from, so edit
    // access is account-scoped, not tied to whichever alter originally sent it.
    await client.request('POST', '/api/system/active-member', { token, body: { memberId: birchId } });

    const edited = await client.request('PATCH', `/api/system/chat/messages/${messageId}`, {
      token,
      body: { body: 'edited while birch is active' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.body).toBe('edited while birch is active');
    expect(edited.body.data.edited).toBe(true);

    const messages = await client.request('GET', `/api/system/chat/threads/${threadId}/messages`, { token });
    const stored = messages.body.data.messages.find((m: any) => m.id === messageId);
    expect(stored.body).toBe('edited while birch is active');
    expect(stored.edited).toBe(true);
  });

  it('only refreshes the thread preview when the edited message is still the latest one', async () => {
    const created = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'group', name: 'Edit preview check', participantMemberIds: [ashId, birchId] },
    });
    const threadId = created.body.data.thread.id;

    const older = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'older one', memberId: ashId },
    });
    const newer = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'newer one', memberId: birchId },
    });

    await client.request('PATCH', `/api/system/chat/messages/${older.body.data.id}`, {
      token,
      body: { body: 'older one, fixed' },
    });
    const afterOlderEdit = await client.request('GET', '/api/system/chat/threads', { token });
    expect(afterOlderEdit.body.data.threads.find((t: any) => t.id === threadId).lastMessagePreview).toBe(
      'newer one',
    );

    await client.request('PATCH', `/api/system/chat/messages/${newer.body.data.id}`, {
      token,
      body: { body: 'newer one, fixed' },
    });
    const afterNewerEdit = await client.request('GET', '/api/system/chat/threads', { token });
    expect(afterNewerEdit.body.data.threads.find((t: any) => t.id === threadId).lastMessagePreview).toBe(
      'newer one, fixed',
    );
  });

  it('rejects an edit that would leave the message empty', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    const threadId = threads.body.data.threads[0].id;
    const sent = await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token,
      body: { body: 'keep me', memberId: ashId },
    });
    const blanked = await client.request('PATCH', `/api/system/chat/messages/${sent.body.data.id}`, {
      token,
      body: { body: '' },
    });
    expect(blanked.status).toBe(400);
  });
});

describe('active-chatter thread visibility', () => {
  let client: TestClient;
  let token: string;
  let ashId: string;
  let corvidId: string;
  let juniperId: string;

  const setActive = (memberId: string | null) =>
    client.request('POST', '/api/system/active-member', { token, body: { memberId } });

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'active-chatter@example.com' });
    token = account.token;

    ashId = (await client.request('POST', '/api/records/members', { token, body: { name: 'Ash' } })).body.data.id;
    corvidId = (await client.request('POST', '/api/records/members', { token, body: { name: 'Corvid' } })).body.data
      .id;
    juniperId = (await client.request('POST', '/api/records/members', { token, body: { name: 'Juniper' } })).body
      .data.id;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('shows a direct thread only to its own participants, whoever is active', async () => {
    await setActive(ashId);
    const created = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [corvidId] },
    });
    const threadId = created.body.data.thread.id;

    const asAsh = await client.request('GET', '/api/system/chat/threads', { token });
    expect(asAsh.body.data.threads.some((t: any) => t.id === threadId)).toBe(true);

    await setActive(juniperId);
    const asJuniper = await client.request('GET', '/api/system/chat/threads', { token });
    expect(asJuniper.body.data.threads.some((t: any) => t.id === threadId)).toBe(false);

    await setActive(corvidId);
    const asCorvid = await client.request('GET', '/api/system/chat/threads', { token });
    expect(asCorvid.body.data.threads.some((t: any) => t.id === threadId)).toBe(true);

    // Switching back to the creator must still show it — the bug this guards
    // against hid a thread from its own creator once someone else had been
    // active and come back.
    await setActive(ashId);
    const backToAsh = await client.request('GET', '/api/system/chat/threads', { token });
    expect(backToAsh.body.data.threads.some((t: any) => t.id === threadId)).toBe(true);
  });

  it('shows only the whole-system thread when no one is the active chatter', async () => {
    await setActive(ashId);
    await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [corvidId] },
    });

    await setActive(null);
    const threads = await client.request('GET', '/api/system/chat/threads', { token });
    expect(threads.body.data.threads).toHaveLength(1);
    expect(threads.body.data.threads[0].kind).toBe('system');
  });

  it('reuses the same direct thread regardless of who starts it', async () => {
    await setActive(ashId);
    const fromAsh = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [juniperId] },
    });
    expect(fromAsh.status).toBe(201);

    await setActive(juniperId);
    const fromJuniper = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [ashId] },
    });
    expect(fromJuniper.status).toBe(200);
    expect(fromJuniper.body.data.thread.id).toBe(fromAsh.body.data.thread.id);
  });

  it("never lists the viewer as their own conversation's participant", async () => {
    await setActive(ashId);
    const created = await client.request('POST', '/api/system/chat/threads', {
      token,
      body: { kind: 'direct', participantMemberIds: [corvidId] },
    });
    expect(created.body.data.thread.participants.map((p: any) => p.name)).toEqual(['Corvid']);

    await setActive(corvidId);
    const asCorvid = await client.request(
      'GET',
      `/api/system/chat/threads/${created.body.data.thread.id}/messages`,
      { token },
    );
    expect(asCorvid.body.data.thread.participants.map((p: any) => p.name)).toEqual(['Ash']);
  });
});

/**
 * The bug this replaces: every browser published its key under the same
 * hardcoded label, so the server retired whichever key was already active —
 * meaning a second device signing in permanently locked the first device out
 * of anything encrypted afterwards. `deviceLabel` is now expected to be a
 * stable per-device id, and a key is kept active per device instead.
 */
describe('message encryption keys: one active key per device, not per account', () => {
  let client: TestClient;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'multi-device@example.com' });
    token = account.token;
    userId = account.userId;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('keeps a second device’s key active alongside the first, rather than retiring it', async () => {
    const laptop = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'laptop-key-v1', deviceLabel: 'dev_laptop' },
    });
    expect(laptop.status).toBe(201);

    const phone = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'phone-key-v1', deviceLabel: 'dev_phone' },
    });
    expect(phone.status).toBe(201);

    const keys = await client.request('GET', `/api/messages/keys/${userId}`, { token });
    const byKey = new Set(keys.body.data.keys.map((k: any) => k.publicKey));
    expect(byKey).toEqual(new Set(['laptop-key-v1', 'phone-key-v1']));
  });

  it('republishing the same key for the same device is a no-op, not a new row', async () => {
    const first = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'tablet-key-v1', deviceLabel: 'dev_tablet' },
    });
    const second = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'tablet-key-v1', deviceLabel: 'dev_tablet' },
    });
    expect(second.status).toBe(200);
    expect(second.body.data.keyId).toBe(first.body.data.keyId);
  });

  it('a real key rotation on one device retires only that device’s own previous key', async () => {
    const before = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'watch-key-v1', deviceLabel: 'dev_watch' },
    });
    const rotated = await client.request('POST', '/api/messages/keys', {
      token,
      body: { publicKey: 'watch-key-v2', deviceLabel: 'dev_watch' },
    });
    expect(rotated.status).toBe(201);
    expect(rotated.body.data.keyId).not.toBe(before.body.data.keyId);

    const keys = await client.request('GET', `/api/messages/keys/${userId}`, { token });
    const watchKeys = keys.body.data.keys.filter((k: any) => k.publicKey.startsWith('watch-key'));
    expect(watchKeys.map((k: any) => k.publicKey)).toEqual(['watch-key-v2']);
    // The other devices from the earlier tests are untouched by this rotation.
    const byKey = new Set(keys.body.data.keys.map((k: any) => k.publicKey));
    expect(byKey.has('laptop-key-v1')).toBe(true);
    expect(byKey.has('phone-key-v1')).toBe(true);
  });
});

describe('device registration: a stable id for a caller with no push credentials', () => {
  let client: TestClient;
  let token: string;

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'device-identity@example.com' });
    token = account.token;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('reuses the same device row when a client-remembered id is sent back', async () => {
    const first = await client.request('POST', '/api/devices', { token, body: { label: 'Browser' } });
    expect(first.status).toBe(201);

    const second = await client.request('POST', '/api/devices', {
      token,
      body: { id: first.body.data.id, label: 'Browser' },
    });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);

    const list = await client.request('GET', '/api/devices', { token });
    expect(list.body.data.devices.filter((d: any) => d.id === first.body.data.id)).toHaveLength(1);
  });

  it('does not clear an existing push subscription when later checked in without one', async () => {
    const created = await client.request('POST', '/api/devices', {
      token,
      body: { label: 'Phone', subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } } },
    });

    await client.request('POST', '/api/devices', {
      token,
      body: { id: created.body.data.id, label: 'Phone' },
    });

    const list = await client.request('GET', '/api/devices', { token });
    const device = list.body.data.devices.find((d: any) => d.id === created.body.data.id);
    expect(device.hasPush).toBe(true);
  });
});

describe('message encryption keys: publishing one notifies who needs to know', () => {
  let client: TestClient;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let stranger: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    alice = await registerUser(client, { email: 'keynotify-alice@example.com', displayName: 'Alice' });
    bob = await registerUser(client, { email: 'keynotify-bob@example.com', displayName: 'Bob' });
    stranger = await registerUser(client, { email: 'keynotify-stranger@example.com', displayName: 'Stranger' });

    // A conversation row for both sides, same as any real DM — this is what
    // tells the server whom to notify. The stranger is never part of one.
    const started = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { userId: bob.userId },
    });
    expect(started.status).toBe(201);
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it("tells an existing conversation partner so a tab left open there picks up the new key", async () => {
    const bobSocket = await connectRealtime(client, bob.token);
    try {
      const published = nextMessage(bobSocket);
      await client.request('POST', '/api/messages/keys', {
        token: alice.token,
        body: { publicKey: 'alice-laptop-key', deviceLabel: 'dev_alice_laptop' },
      });
      await expect(published).resolves.toMatchObject({ type: 'messageKey.new', userId: alice.userId });
    } finally {
      bobSocket.close();
    }
  });

  it("does not tell an account with no conversation with the publisher", async () => {
    const strangerSocket = await connectRealtime(client, stranger.token);
    try {
      const premature = nextMessage(strangerSocket, 500);
      await client.request('POST', '/api/messages/keys', {
        token: alice.token,
        body: { publicKey: 'alice-phone-key', deviceLabel: 'dev_alice_phone' },
      });
      await expect(premature).rejects.toThrow();
    } finally {
      strangerSocket.close();
    }
  });

  it("tells this same account's own other open connections too", async () => {
    const aliceOtherTab = await connectRealtime(client, alice.token);
    try {
      const published = nextMessage(aliceOtherTab);
      await client.request('POST', '/api/messages/keys', {
        token: alice.token,
        body: { publicKey: 'alice-tablet-key', deviceLabel: 'dev_alice_tablet' },
      });
      await expect(published).resolves.toMatchObject({ type: 'messageKey.new', userId: alice.userId });
    } finally {
      aliceOtherTab.close();
    }
  });

  it('says nothing when republishing an unchanged key', async () => {
    await client.request('POST', '/api/messages/keys', {
      token: alice.token,
      body: { publicKey: 'alice-unchanged-key', deviceLabel: 'dev_alice_unchanged' },
    });

    const bobSocket = await connectRealtime(client, bob.token);
    try {
      const premature = nextMessage(bobSocket, 500);
      const repeat = await client.request('POST', '/api/messages/keys', {
        token: alice.token,
        body: { publicKey: 'alice-unchanged-key', deviceLabel: 'dev_alice_unchanged' },
      });
      expect(repeat.status).toBe(200);
      await expect(premature).rejects.toThrow();
    } finally {
      bobSocket.close();
    }
  });
});

describe('DM read receipts and typing: realtime signals, not just stored state', () => {
  let client: TestClient;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let threadId: string;
  let aliceConversationId: string;

  beforeAll(async () => {
    client = await createTestApp();
    alice = await registerUser(client, { email: 'presence-alice@example.com', displayName: 'Alice' });
    bob = await registerUser(client, { email: 'presence-bob@example.com', displayName: 'Bob' });
    const started = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { userId: bob.userId },
    });
    threadId = started.body.data.conversation.threadId;
    aliceConversationId = started.body.data.conversation.id;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('marks a message read and tells its sender in real time', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'hello', clientId: 'read-test-1' },
    });
    expect(sent.status).toBe(201);

    const aliceSocket = await connectRealtime(client, alice.token);
    try {
      const read = nextMessage(aliceSocket);
      const marked = await client.request('POST', `/api/messages/threads/${threadId}/read`, { token: bob.token });
      expect(marked.status).toBe(200);
      await expect(read).resolves.toMatchObject({ type: 'message.read', threadId, byUserId: bob.userId });

      const history = await client.request('GET', `/api/messages/threads/${threadId}`, { token: alice.token });
      const message = history.body.data.messages.find((m: any) => m.clientId === 'read-test-1');
      expect(message.readBy).toContain(bob.userId);
    } finally {
      aliceSocket.close();
    }
  });

  it('publishes a typing signal to the other side without storing anything', async () => {
    const bobSocket = await connectRealtime(client, bob.token);
    try {
      const typing = nextMessage(bobSocket);
      const result = await client.request('POST', `/api/messages/threads/${threadId}/typing`, {
        token: alice.token,
        body: { isTyping: true },
      });
      expect(result.status).toBe(200);
      await expect(typing).resolves.toMatchObject({ type: 'typing', threadId, fromUserId: alice.userId, isTyping: true });
    } finally {
      bobSocket.close();
    }
  });

  it('publishes "stopped typing" the same way', async () => {
    const bobSocket = await connectRealtime(client, bob.token);
    try {
      const stopped = nextMessage(bobSocket);
      await client.request('POST', `/api/messages/threads/${threadId}/typing`, {
        token: alice.token,
        body: { isTyping: false },
      });
      await expect(stopped).resolves.toMatchObject({ type: 'typing', isTyping: false });
    } finally {
      bobSocket.close();
    }
  });

  it('tells nobody once the sender has turned off read receipts for this conversation — the same switch covers typing', async () => {
    await client.request('PATCH', `/api/messages/conversations/${aliceConversationId}`, {
      token: alice.token,
      body: { settings: { readReceipts: false } },
    });
    try {
      const bobSocket = await connectRealtime(client, bob.token);
      try {
        const premature = nextMessage(bobSocket, 500);
        await client.request('POST', `/api/messages/threads/${threadId}/typing`, {
          token: alice.token,
          body: { isTyping: true },
        });
        await expect(premature).rejects.toThrow();
      } finally {
        bobSocket.close();
      }
    } finally {
      await client.request('PATCH', `/api/messages/conversations/${aliceConversationId}`, {
        token: alice.token,
        body: { settings: { readReceipts: true } },
      });
    }
  });
});

describe('"send as a member" never attributes a DM to an alter unless the sender shows their member list', () => {
  let client: TestClient;
  let dana: { token: string; userId: string };
  let eve: { token: string; userId: string };
  let threadId: string;
  let danaConversationId: string;
  let memberId: string;

  beforeAll(async () => {
    client = await createTestApp();
    dana = await registerUser(client, { email: 'sendas-dana@example.com', displayName: 'Dana' });
    eve = await registerUser(client, { email: 'sendas-eve@example.com', displayName: 'Eve' });

    for (const [account, handle] of [
      [dana, 'sendas-dana'],
      [eve, 'sendas-eve'],
    ] as const) {
      await client.request('PUT', '/api/social/profile', { token: account.token, body: { handle, displayName: handle, isPublic: true } });
    }
    const request = await client.request('POST', '/api/social/friends/requests', { token: dana.token, body: { handle: 'sendas-eve' } });
    await client.request('POST', `/api/social/friends/requests/${request.body.data.id}/accept`, { token: eve.token });

    const created = await client.request('POST', '/api/messages/conversations', { token: dana.token, body: { handle: 'sendas-eve' } });
    threadId = created.body.data.conversation.threadId;
    danaConversationId = created.body.data.conversation.id;

    const member = await client.request('POST', '/api/records/members', { token: dana.token, body: { name: 'Dana-Alt' } });
    memberId = member.body.data.id;
    await client.request('PATCH', `/api/messages/conversations/${danaConversationId}`, {
      token: dana.token,
      body: { asMemberId: memberId },
    });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('hides the alter from the other side until the sender opts in, and always shows it to the sender themselves', async () => {
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: dana.token,
      body: { body: 'hello from my alter' },
    });
    expect(sent.body.data.message.asMember).not.toBeNull();

    const asRecipient = await client.request('GET', `/api/messages/threads/${threadId}`, { token: eve.token });
    const received = asRecipient.body.data.messages.find((m: any) => m.id === sent.body.data.message.id);
    expect(received.asMember).toBeNull();

    const asSender = await client.request('GET', `/api/messages/threads/${threadId}`, { token: dana.token });
    expect(asSender.body.data.messages.find((m: any) => m.id === sent.body.data.message.id).asMember).not.toBeNull();

    await client.request('PUT', '/api/social/profile', {
      token: dana.token,
      body: { handle: 'sendas-dana', displayName: 'sendas-dana', isPublic: true, showMemberList: true },
    });
    const afterOptIn = await client.request('GET', `/api/messages/threads/${threadId}`, { token: eve.token });
    expect(afterOptIn.body.data.messages.find((m: any) => m.id === sent.body.data.message.id).asMember).not.toBeNull();

    await client.request('PATCH', `/api/records/members/${memberId}`, {
      token: dana.token,
      body: { privacy: { showOnProfile: false } },
    });
    const afterMemberOptOut = await client.request('GET', `/api/messages/threads/${threadId}`, { token: eve.token });
    expect(afterMemberOptOut.body.data.messages.find((m: any) => m.id === sent.body.data.message.id).asMember).toBeNull();
  });

  it('carries the alter\'s avatar in asMember, withheld by their own showAvatar switch independently of the rest', async () => {
    await client.request('PATCH', `/api/records/members/${memberId}`, {
      token: dana.token,
      body: { avatarUrl: 'https://example.invalid/dana-alt.png', privacy: { showOnProfile: true } },
    });
    const sent = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: dana.token,
      body: { body: 'does my avatar show?' },
    });
    expect(sent.body.data.message.asMember.avatarUrl).toBe('https://example.invalid/dana-alt.png');

    await client.request('PATCH', `/api/records/members/${memberId}`, {
      token: dana.token,
      body: { privacy: { showOnProfile: true, showAvatar: false } },
    });
    const sentWithAvatarHidden = await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: dana.token,
      body: { body: 'now it should not show' },
    });
    expect(sentWithAvatarHidden.body.data.message.asMember.avatarUrl).toBeNull();
    // The rest of the identity is unaffected — showAvatar only withholds the picture.
    expect(sentWithAvatarHidden.body.data.message.asMember.name).toBe('Dana-Alt');
  });
});
