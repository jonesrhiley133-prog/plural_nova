import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

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
});
