import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * Privacy regression suite, built around one "canary" alter.
 *
 * The canary is hidden (`showOnProfile: false`) but otherwise set up to be as
 * visible as possible by every *other* toggle — the owning account's profile
 * is public with the member list, member count and current fronter all
 * switched on, and the canary is actually fronting. If the canary's name,
 * avatar, flags, or fronting status ever appears to another account, or a
 * count ever reflects their existence, one opt-out has been bypassed
 * somewhere. Every later phase that adds a new cross-account surface
 * (Constellation flags, mentions, …) should extend this same canary scenario
 * rather than writing a new one, so this file grows into a standing
 * regression guard for the whole redesign, not just Phase 1's four fixes.
 */

describe('privacy: the canary alter never leaks', () => {
  let client: TestClient;
  let owner: { token: string; userId: string };
  let friend: { token: string; userId: string };
  let stranger: { token: string; userId: string };
  let canaryId: string;

  beforeAll(async () => {
    client = await createTestApp();
    owner = await registerUser(client, { email: 'owner@example.com', displayName: 'Owner' });
    friend = await registerUser(client, { email: 'friend@example.com', displayName: 'Friend' });
    stranger = await registerUser(client, { email: 'stranger@example.com', displayName: 'Stranger' });

    // The owning profile is as open as it can be — public, member list on,
    // member count on, current fronter on — so every assertion below is
    // about the *alter's own* opt-out winning, not the profile being closed.
    await client.request('PUT', '/api/social/profile', {
      token: owner.token,
      body: {
        handle: 'owner-system',
        displayName: 'owner-system',
        isPublic: true,
        showMemberList: true,
        showMemberCount: true,
        showCurrentFronter: true,
      },
    });

    // Befriend `friend`, leave `stranger` unrelated.
    const sent = await client.request('POST', '/api/social/friends/requests', {
      token: friend.token,
      body: { handle: 'owner-system' },
    });
    const incoming = await client.request('GET', '/api/social/friends/requests', { token: owner.token });
    await client.request('POST', `/api/social/friends/requests/${incoming.body.data.incoming[0].id}/accept`, {
      token: owner.token,
    });
    expect(sent.status).toBe(201);

    const member = await client.request('POST', '/api/records/members', {
      token: owner.token,
      body: { name: 'Canary' },
    });
    canaryId = member.body.data.id;
    // Opted out of the profile entirely. `showFronting` is deliberately left
    // unset (defaults to visible) — Fix 2 is specifically that `showOnProfile`
    // alone must be enough, with no separate `showFronting: false` needed.
    await client.request('PATCH', `/api/records/members/${canaryId}`, {
      token: owner.token,
      body: { privacy: { showOnProfile: false } },
    });
    await client.request('POST', '/api/fronting/start', {
      token: owner.token,
      body: { memberId: canaryId },
    });
  });
  afterAll(() => client.close());

  it('never counts or lists the hidden alter in the public profile', async () => {
    const viewedByStranger = await client.request('GET', '/api/social/profiles/owner-system', {
      token: stranger.token,
    });
    const profile = viewedByStranger.body.data.profile;
    // Exactly one member exists (the canary) and it is hidden — the count
    // must agree with the (empty) list, not report it anyway.
    expect(profile.memberCount).toBe(0);
    expect((profile.members ?? []).some((m: any) => m.id === canaryId)).toBe(false);
  });

  it('never lists the hidden-but-fronting alter as currently fronting', async () => {
    const viewedByStranger = await client.request('GET', '/api/social/profiles/owner-system', {
      token: stranger.token,
    });
    const fronting = viewedByStranger.body.data.profile.currentlyFronting ?? [];
    expect(fronting.some((m: any) => m.id === canaryId)).toBe(false);

    // A friend is not a special case here — `showOnProfile` is an opt-out
    // from the whole profile, not just from strangers.
    const viewedByFriend = await client.request('GET', '/api/social/profiles/owner-system', {
      token: friend.token,
    });
    const frontingForFriend = viewedByFriend.body.data.profile.currentlyFronting ?? [];
    expect(frontingForFriend.some((m: any) => m.id === canaryId)).toBe(false);

    // The owner's own view is unaffected — opting out hides you from others,
    // not from yourself.
    const viewedByOwner = await client.request('GET', '/api/social/profiles/owner-system', {
      token: owner.token,
    });
    const frontingForOwner = viewedByOwner.body.data.profile.currentlyFronting ?? [];
    expect(frontingForOwner.some((m: any) => m.id === canaryId)).toBe(true);
  });

  it('respects canSee(), not a weaker check, for the pinned gallery', async () => {
    const systemOnly = await client.request('POST', '/api/records/mediaItems', {
      token: owner.token,
      body: { url: 'https://example.invalid/system-only.png', mediaType: 'image', visibility: 'system' },
    });
    const friendsOnly = await client.request('POST', '/api/records/mediaItems', {
      token: owner.token,
      body: { url: 'https://example.invalid/friends-only.png', mediaType: 'image', visibility: 'friends' },
    });
    await client.request('PUT', '/api/social/profile', {
      token: owner.token,
      body: {
        handle: 'owner-system',
        displayName: 'owner-system',
        isPublic: true,
        pinnedMediaIds: [systemOnly.body.data.id, friendsOnly.body.data.id],
      },
    });

    const viewedByStranger = await client.request('GET', '/api/social/profiles/owner-system', {
      token: stranger.token,
    });
    const strangerGallery = (viewedByStranger.body.data.profile.pinnedGallery ?? []).map((i: any) => i.url);
    expect(strangerGallery).not.toContain('https://example.invalid/system-only.png');
    expect(strangerGallery).not.toContain('https://example.invalid/friends-only.png');

    const viewedByFriend = await client.request('GET', '/api/social/profiles/owner-system', {
      token: friend.token,
    });
    const friendGallery = (viewedByFriend.body.data.profile.pinnedGallery ?? []).map((i: any) => i.url);
    expect(friendGallery).not.toContain('https://example.invalid/system-only.png');
    expect(friendGallery).toContain('https://example.invalid/friends-only.png');
  });

  it('never attributes a post to the hidden alter, even though the post itself is visible', async () => {
    const post = await client.request('POST', '/api/social/flux', {
      token: owner.token,
      body: { body: 'From the canary', visibility: 'friends', authorKind: 'member', memberId: canaryId },
    });
    expect(post.status).toBe(201);

    const friendFeed = await client.request('GET', '/api/social/flux', { token: friend.token });
    const seenByFriend = friendFeed.body.data.posts.find((p: any) => p.id === post.body.data.id);
    // The post content is visible (friends-visibility, and they are friends)
    // but the alter behind it is not — two separate gates, both enforced.
    expect(seenByFriend).toBeTruthy();
    expect(seenByFriend.body).toBe('From the canary');
    expect(seenByFriend.asMember).toBeNull();
    expect(seenByFriend.memberId).toBeNull();
    expect(seenByFriend.authorKind).toBe('system');
  });

  it('never attributes a comment to the hidden alter', async () => {
    const strangerPost = await client.request('POST', '/api/social/flux', {
      token: stranger.token,
      body: { body: 'A public post to comment on', visibility: 'public' },
    });
    await client.request('POST', `/api/social/flux/${strangerPost.body.data.id}/comments`, {
      token: owner.token,
      body: { body: 'Commenting as the canary', authorKind: 'member', memberId: canaryId },
    });

    const comments = await client.request('GET', `/api/social/flux/${strangerPost.body.data.id}/comments`, {
      token: stranger.token,
    });
    const seen = comments.body.data.comments.find((c: any) => c.body === 'Commenting as the canary');
    expect(seen.memberId).toBeNull();
    expect(seen.authorKind).toBe('system');
  });

  it('never attributes a DM to the hidden alter', async () => {
    await client.request('PUT', '/api/social/profile', {
      token: stranger.token,
      body: { handle: 'stranger-system', displayName: 'stranger-system', isPublic: true },
    });
    const created = await client.request('POST', '/api/messages/conversations', {
      token: owner.token,
      body: { handle: 'stranger-system' },
    });
    const threadId = created.body.data.conversation.threadId;
    await client.request('POST', `/api/messages/threads/${threadId}`, {
      token: owner.token,
      body: { body: 'Sent as the canary', asMemberId: canaryId },
    });

    const viewedByStranger = await client.request('GET', `/api/messages/threads/${threadId}`, {
      token: stranger.token,
    });
    const message = viewedByStranger.body.data.messages.find((m: any) => m.body === 'Sent as the canary');
    expect(message.asMember).toBeNull();
    expect(message.senderMemberId).toBeNull();
  });

  it('still shows the canary to the owner’s own account everywhere', async () => {
    // Opting out hides an alter from everyone else; it must never also hide
    // them from the account that owns them.
    const ownView = await client.request('GET', '/api/social/profiles/owner-system', { token: owner.token });
    expect((ownView.body.data.profile.members ?? []).some((m: any) => m.id === canaryId)).toBe(true);
  });
});
