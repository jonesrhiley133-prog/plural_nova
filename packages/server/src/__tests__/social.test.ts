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

  it('bookmarks a post, then un-bookmarks it on a second toggle', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Worth saving', visibility: 'friends' },
    });
    const id = post.body.data.id;

    const saved = await client.request('POST', `/api/social/flux/${id}/bookmark`, { token: bob.token });
    expect(saved.body.data.bookmarked).toBe(true);
    const reloaded = await client.request('GET', `/api/social/flux/${id}`, { token: bob.token });
    expect(reloaded.body.data.bookmarked).toBe(true);

    const removed = await client.request('POST', `/api/social/flux/${id}/bookmark`, { token: bob.token });
    expect(removed.body.data.bookmarked).toBe(false);
    const reloadedAgain = await client.request('GET', `/api/social/flux/${id}`, { token: bob.token });
    expect(reloadedAgain.body.data.bookmarked).toBe(false);
  });

  it('lists bookmarked posts newest-saved first, and does not bookmark them for anyone else', async () => {
    const first = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Saved first', visibility: 'friends' },
    });
    const second = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Saved second', visibility: 'friends' },
    });
    await client.request('POST', `/api/social/flux/${first.body.data.id}/bookmark`, { token: bob.token });
    await client.request('POST', `/api/social/flux/${second.body.data.id}/bookmark`, { token: bob.token });

    const bobList = await client.request('GET', '/api/social/flux/bookmarks', { token: bob.token });
    expect(bobList.body.data.posts.map((p: any) => p.body)).toEqual(['Saved second', 'Saved first']);

    const aliceList = await client.request('GET', '/api/social/flux/bookmarks', { token: alice.token });
    expect(aliceList.body.data.posts).toHaveLength(0);
  });

  it('reposts with no text and counts it on the original', async () => {
    const original = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Reposted later', visibility: 'friends' },
    });
    const repost = await client.request('POST', '/api/social/flux', {
      token: bob.token,
      body: { repostOfId: original.body.data.id, visibility: 'friends' },
    });
    expect(repost.status).toBe(201);
    expect(repost.body.data.body).toBe('');
    expect(repost.body.data.repostOf.body).toBe('Reposted later');
    expect(repost.body.data.repostOf.author.displayName).toBe('alice-system');

    const reloadedOriginal = await client.request('GET', `/api/social/flux/${original.body.data.id}`, { token: alice.token });
    expect(reloadedOriginal.body.data.repostCount).toBe(1);
  });

  it('quote-reposts by sending both a body and repostOfId together', async () => {
    const original = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'The original take', visibility: 'friends' },
    });
    const quoted = await client.request('POST', '/api/social/flux', {
      token: bob.token,
      body: { body: 'Strongly agree', repostOfId: original.body.data.id, visibility: 'friends' },
    });
    expect(quoted.body.data.body).toBe('Strongly agree');
    expect(quoted.body.data.repostOf.body).toBe('The original take');
  });

  it('hides the quoted post once it is no longer visible, without breaking the repost itself', async () => {
    const original = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Private after all', visibility: 'friends' },
    });
    const quoted = await client.request('POST', '/api/social/flux', {
      token: bob.token,
      body: { body: 'Quoting this', repostOfId: original.body.data.id, visibility: 'friends' },
    });
    await client.request('DELETE', `/api/social/flux/${original.body.data.id}`, { token: alice.token });

    const reloaded = await client.request('GET', `/api/social/flux/${quoted.body.data.id}`, { token: bob.token });
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.data.body).toBe('Quoting this');
    expect(reloaded.body.data.repostOf).toBeNull();
  });

  it('threads a comment reply and refuses one pointing at a comment from another post', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'Reply to me', visibility: 'friends' },
    });
    const otherPost = await client.request('POST', '/api/social/flux', {
      token: alice.token,
      body: { body: 'A different post', visibility: 'friends' },
    });
    const root = await client.request('POST', `/api/social/flux/${post.body.data.id}/comments`, {
      token: bob.token,
      body: { body: 'First comment' },
    });
    const reply = await client.request('POST', `/api/social/flux/${post.body.data.id}/comments`, {
      token: alice.token,
      body: { body: 'Replying to you', replyToId: root.body.data.id },
    });
    expect(reply.status).toBe(201);

    const comments = await client.request('GET', `/api/social/flux/${post.body.data.id}/comments`, { token: alice.token });
    const stored = comments.body.data.comments.find((c: any) => c.id === reply.body.data.id);
    expect(stored.replyToId).toBe(root.body.data.id);

    const otherRoot = await client.request('POST', `/api/social/flux/${otherPost.body.data.id}/comments`, {
      token: bob.token,
      body: { body: 'On the other post' },
    });
    const crossed = await client.request('POST', `/api/social/flux/${post.body.data.id}/comments`, {
      token: alice.token,
      body: { body: 'Pointing at the wrong post', replyToId: otherRoot.body.data.id },
    });
    expect(crossed.status).toBe(400);
  });

  it('scopes the feed to one author, still gated by whether the viewer can see each post', async () => {
    await client.request('POST', '/api/social/flux', {
      token: bob.token,
      body: { body: 'Bob, public', visibility: 'public' },
    });
    await client.request('POST', '/api/social/flux', {
      token: bob.token,
      body: { body: 'Bob, friends only', visibility: 'friends' },
    });

    const aliceView = await client.request('GET', `/api/social/flux?authorUserId=${bob.userId}`, { token: alice.token });
    const aliceBodies = aliceView.body.data.posts.map((p: any) => p.body);
    expect(aliceBodies).toContain('Bob, public');
    expect(aliceBodies).toContain('Bob, friends only');

    const carolView = await client.request('GET', `/api/social/flux?authorUserId=${bob.userId}`, { token: carol.token });
    const carolBodies = carolView.body.data.posts.map((p: any) => p.body);
    expect(carolBodies).toContain('Bob, public');
    expect(carolBodies).not.toContain('Bob, friends only');
  });

  it('pages the feed with a cursor instead of handing back everything at once', async () => {
    for (let i = 0; i < 7; i += 1) {
      await client.request('POST', '/api/social/flux', {
        token: bob.token,
        body: { body: `Paging post ${i}`, visibility: 'public' },
      });
    }

    const firstPage = await client.request('GET', '/api/social/flux?scope=public&limit=3', { token: alice.token });
    expect(firstPage.body.data.posts).toHaveLength(3);
    expect(firstPage.body.data.nextCursor).toEqual(expect.any(String));

    const secondPage = await client.request(
      'GET',
      `/api/social/flux?scope=public&limit=3&before=${encodeURIComponent(firstPage.body.data.nextCursor)}`,
      { token: alice.token },
    );
    expect(secondPage.body.data.posts).toHaveLength(3);

    const firstIds = new Set(firstPage.body.data.posts.map((p: any) => p.id));
    for (const post of secondPage.body.data.posts) expect(firstIds.has(post.id)).toBe(false);

    // Walk the rest of the way to the end: the cursor eventually runs dry.
    let cursor = secondPage.body.data.nextCursor;
    let guard = 0;
    while (cursor && guard < 10) {
      const page = await client.request(
        'GET',
        `/api/social/flux?scope=public&limit=3&before=${encodeURIComponent(cursor)}`,
        { token: alice.token },
      );
      cursor = page.body.data.nextCursor;
      guard += 1;
    }
    expect(cursor).toBeNull();
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

  it('ignores a client-claimed encrypted flag — nothing seals a new message anymore', async () => {
    const created = await client.request('POST', '/api/messages/conversations', {
      token: alice.token,
      body: { handle: 'bob-system' },
    });
    const threadId = created.body.data.conversation.threadId;

    // A stale client (or one lying about it) cannot make the server store or
    // announce a message as encrypted — that is the server's call now, not
    // whatever the request claims.
    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: alice.token,
      body: { body: 'hello bob', encrypted: true, encryptionKeyId: 'mky_test' },
    });

    const result = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: bob.token,
    });
    const last = result.body.data.messages.at(-1);
    expect(last.encrypted).toBe(false);
    expect(last.body).toBe('hello bob');

    const conversations = await client.request('GET', '/api/messages/conversations', {
      token: bob.token,
    });
    expect(conversations.body.data.conversations[0].lastMessagePreview).toBe('hello bob');
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

  it('never attributes a post or a "sent as" message to a member unless the account shows its member list', async () => {
    const dana = await registerUser(client, { email: 'dana@example.com', displayName: 'Dana' });
    await client.request('POST', '/api/social/friends/requests', { token: dana.token, body: { handle: 'alice-system' } });
    const incoming = await client.request('GET', '/api/social/friends/requests', { token: alice.token });
    await client.request('POST', `/api/social/friends/requests/${incoming.body.data.incoming[0].id}/accept`, {
      token: alice.token,
    });

    const member = await client.request('POST', '/api/records/members', {
      token: dana.token,
      body: { name: 'Dana-Alt' },
    });
    expect(member.status).toBe(201);
    const memberId = member.body.data.id;

    // No `showMemberList` has been set for Dana at all — the default a brand
    // new profile starts at, same as a system that never opted in.
    const post = await client.request('POST', '/api/social/flux', {
      token: dana.token,
      body: { body: 'Posted as my alter', visibility: 'friends', authorKind: 'member', memberId },
    });
    // The creator sees their own alter's name immediately, same as the
    // account's own view of its own profile always shows everything.
    expect(post.body.data.asMember).not.toBeNull();

    const strangerFeed = await client.request('GET', '/api/social/flux', { token: alice.token });
    const seenByFriend = strangerFeed.body.data.posts.find((p: any) => p.id === post.body.data.id);
    expect(seenByFriend.asMember).toBeNull();
    // The raw fields must agree with `asMember`, not just the computed view —
    // `shareableView('posts', ...)` strips nothing (no `posts` field is
    // marked sensitive), so these are the actual gate, not a cosmetic extra.
    expect(seenByFriend.memberId).toBeNull();
    expect(seenByFriend.authorKind).toBe('system');

    const ownFeed = await client.request('GET', '/api/social/flux', { token: dana.token });
    const seenByAuthor = ownFeed.body.data.posts.find((p: any) => p.id === post.body.data.id);
    expect(seenByAuthor.asMember).not.toBeNull();

    // Turning the member list on surfaces it to others too — until the one
    // alter opts out specifically, which still wins over the account-wide switch.
    await client.request('PUT', '/api/social/profile', {
      token: dana.token,
      body: { handle: 'dana-system', displayName: 'dana-system', isPublic: true, showMemberList: true },
    });
    const afterOptIn = await client.request('GET', '/api/social/flux', { token: alice.token });
    expect(afterOptIn.body.data.posts.find((p: any) => p.id === post.body.data.id).asMember).not.toBeNull();

    await client.request('PATCH', `/api/records/members/${memberId}`, {
      token: dana.token,
      body: { privacy: { showOnProfile: false } },
    });
    const afterMemberOptOut = await client.request('GET', '/api/social/flux', { token: alice.token });
    expect(afterMemberOptOut.body.data.posts.find((p: any) => p.id === post.body.data.id).asMember).toBeNull();
  });
});
