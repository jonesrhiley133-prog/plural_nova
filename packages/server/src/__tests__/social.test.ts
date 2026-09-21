import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('friends, flux and messaging', () => {
  let client: TestClient;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let carol: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    alice = await registerUser(client, { email: 'alice@example.com', displayName: 'Alice' });
    bob = await registerUser(client, { email: 'bob@example.com', displayName: 'Bob' });
    carol = await registerUser(client, { email: 'carol@example.com', displayName: 'Carol' });

    for (const [account, handle] of [
      [alice, 'alice-system'],
      [bob, 'bob-system'],
      [carol, 'carol-system'],
    ] as const) {
      await client.request('PUT', '/api/social/profile', {
        token: account.token,
        body: { handle, displayName: handle, isPublic: true, showMemberCount: true },
      });
    }
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('sends, receives and accepts a friend request', async () => {
    const sent = await client.request('POST', '/api/social/friends/requests', {
      token: alice.token,
      body: { handle: 'bob-system', message: 'hello' },
    });
    expect(sent.status).toBe(201);

    const incoming = await client.request('GET', '/api/social/friends/requests', { token: bob.token });
    expect(incoming.body.data.incoming).toHaveLength(1);
    expect(incoming.body.data.incoming[0].displayName).toBe('alice-system');

    const accepted = await client.request(
      'POST',
      `/api/social/friends/requests/${incoming.body.data.incoming[0].id}/accept`,
      { token: bob.token },
    );
    expect(accepted.status).toBe(200);

    const aliceFriends = await client.request('GET', '/api/social/friends', { token: alice.token });
    const bobFriends = await client.request('GET', '/api/social/friends', { token: bob.token });
    expect(aliceFriends.body.data.friends).toHaveLength(1);
    expect(bobFriends.body.data.friends).toHaveLength(1);
    expect(aliceFriends.body.data.friends[0].mutual).toBe(true);
  });

  it('notifies the recipient of a friend request', async () => {
    const notifications = await client.request('GET', '/api/notifications', { token: bob.token });
    const kinds = notifications.body.data.notifications.map((n: any) => n.kind);
    expect(kinds).toContain('friend.request');
  });

  it('refuses a duplicate friend request', async () => {
    await client.request('POST', '/api/social/friends/requests', {
      token: alice.token,
      body: { handle: 'carol-system' },
    });
    const again = await client.request('POST', '/api/social/friends/requests', {
      token: alice.token,
      body: { handle: 'carol-system' },
    });
    expect(again.status).toBe(409);
  });

  it('keeps a friends-only post out of a stranger’s feed', async () => {
    await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Only for friends', visibility: 'friends' },
    });

    const bobFeed = await client.request('GET', '/api/social/flux', { token: bob.token });
    expect(bobFeed.body.data.posts.some((p: any) => p.body === 'Only for friends')).toBe(true);

    const carolFeed = await client.request('GET', '/api/social/flux', { token: carol.token });
    expect(carolFeed.body.data.posts.some((p: any) => p.body === 'Only for friends')).toBe(false);
  });

  it('refuses to load another account’s private post by id', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Just for me', visibility: 'private' },
    });
    const attempt = await client.request(`GET`, `/api/social/flux/${post.body.data.id}`, {
      token: bob.token,
    });
    expect(attempt.status).toBe(404);
  });

  it('records reactions and comments and counts them', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'A post to react to', visibility: 'friends' },
    });
    const id = post.body.data.id;

    await client.request('POST', `/api/social/flux/${id}/reactions`, {
      token: bob.token,
      body: { emoji: '★' },
    });
    await client.request('POST', `/api/social/flux/${id}/comments`, {
      token: bob.token,
      body: { body: 'Nice one' },
    });

    const reloaded = await client.request('GET', `/api/social/flux/${id}`, { token: alice.token });
    expect(reloaded.body.data.reactionCount).toBe(1);
    expect(reloaded.body.data.commentCount).toBe(1);

    const comments = await client.request('GET', `/api/social/flux/${id}/comments`, {
      token: alice.token,
    });
    expect(comments.body.data.comments[0].body).toBe('Nice one');
  });

  it('toggles a reaction off when the same emoji is sent twice', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Toggle me', visibility: 'friends' },
    });
    const id = post.body.data.id;
    await client.request('POST', `/api/social/flux/${id}/reactions`, {
      token: bob.token,
      body: { emoji: '★' },
    });
    const off = await client.request('POST', `/api/social/flux/${id}/reactions`, {
      token: bob.token,
      body: { emoji: '★' },
    });
    expect(off.body.data.emoji).toBeNull();
  });

  it('delivers a message from one account to the other', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;

    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'first message' },
    });

    const bobThreads = await client.request('GET', '/api/messages/conversations', { token: bob.token });
    expect(bobThreads.body.data.conversations).toHaveLength(1);
    expect(bobThreads.body.data.unreadTotal).toBe(1);

    const bobMessages = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: bob.token,
    });
    expect(bobMessages.body.data.messages).toHaveLength(1);
    expect(bobMessages.body.data.messages[0].body).toBe('first message');
    expect(bobMessages.body.data.messages[0].isMine).toBe(false);
  });

  it('returns messages oldest first, with the newest last', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;

    for (const text of ['second', 'third', 'fourth']) {
      await client.request('POST', `/api/messages/threads/${threadId}`, {
        token: alice.token,
        body: { body: text },
      });
    }

    const result = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: bob.token,
    });
    const bodies = result.body.data.messages.map((m: any) => m.body);
    expect(bodies).toEqual(['first message', 'second', 'third', 'fourth']);

    const sequences = result.body.data.messages.map((m: any) => m.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });

  it('keeps ordering correct when a message is sent with an older timestamp', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: bob.token,
      body: { handle: 'alice-system' },
    });
    const threadId = created.body.data.conversation.threadId;

    // An offline client replaying a queued send: its own clock is behind, but
    // the server's sequence still places it after everything already stored.
    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: bob.token,
      body: { body: 'queued while offline', sentAt: '2020-01-01T00:00:00.000Z' },
    });

    const result = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: alice.token,
    });
    const bodies = result.body.data.messages.map((m: any) => m.body);
    expect(bodies[bodies.length - 1]).toBe('queued while offline');
  });

  it('does not duplicate a re-sent message that carries the same client id', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;
    const before = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: alice.token,
    });

    const payload = { body: 'sent once', clientId: 'retry-abc' };
    await client.request('POST', `/api/messages/threads/${threadId}`, { token: alice.token, body: payload });
    await client.request('POST', `/api/messages/threads/${threadId}`, { token: alice.token, body: payload });

    const after = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: alice.token,
    });
    expect(after.body.data.messages.length).toBe(before.body.data.messages.length + 1);
  });

  it('clears the unread count when a thread is read', async () => {
    const threads = await client.request('GET', '/api/messages/conversations', { token: bob.token });
    const threadId = threads.body.data.conversations[0].threadId;
    await client.request('POST', `/api/messages/threads/${threadId}/read`, { token: bob.token });

    const after = await client.request('GET', '/api/messages/conversations', { token: bob.token });
    expect(after.body.data.conversations[0].unreadCount).toBe(0);
  });

  it('stores an encrypted body without a preview and marks it encrypted', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;

    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'BASE64CIPHERTEXT', encrypted: true, encryptionKeyId: 'mky_test' },
    });

    const result = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: bob.token,
    });
    const last = result.body.data.messages.at(-1);
    expect(last.encrypted).toBe(true);
    expect(last.body).toBe('BASE64CIPHERTEXT');

    const conversations = await client.request('GET', '/api/messages/conversations', {
      token: bob.token,
    });
    expect(conversations.body.data.conversations[0].lastMessagePreview).toBe('');
  });

  it('publishes and fetches public keys so encryption is real, not decorative', async () => {
    const published = await client.request('POST', '/api/messages/keys', {
      token: bob.token,
      body: { publicKey: 'a-public-key-jwk', deviceLabel: 'phone' },
    });
    expect(published.status).toBe(201);

    const fetched = await client.request(`GET`, `/api/messages/keys/${bob.userId}`, {
      token: alice.token,
    });
    expect(fetched.body.data.keys[0].publicKey).toBe('a-public-key-jwk');
  });

  it('treats a message from a non-friend as a request', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: carol.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;
    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: carol.token,
      body: { body: 'hello, stranger' },
    });

    const bobView = await client.request('GET', '/api/messages/conversations', { token: bob.token });
    expect(bobView.body.data.requests.some((c: any) => c.threadId === threadId)).toBe(true);
  });

  it('hides both accounts from each other after a block', async () => {
    await client.request('POST', `/api/social/friends/${carol.userId}/state`, {
      token: alice.token,
      body: { state: 'blocked' },
    });

    const discover = await client.request('GET', '/api/social/discover', { token: carol.token });
    expect(discover.body.data.profiles.some((p: any) => p.handle === 'alice-system')).toBe(false);

    const profile = await client.request('GET', '/api/social/profiles/alice-system', {
      token: carol.token,
    });
    expect(profile.status).toBe(404);
  });

  it('shows only what a profile chose to publish', async () => {
    await client.request('PUT', '/api/social/profile', {
      token: bob.token,
      body: { handle: 'bob-system', displayName: 'Bob', isPublic: true, showMemberList: false },
    });
    const viewed = await client.request('GET', '/api/social/profiles/bob-system', {
      token: alice.token,
    });
    expect(viewed.body.data.profile.members).toBeUndefined();
    expect(viewed.body.data.profile.displayName).toBe('Bob');
  });
});
