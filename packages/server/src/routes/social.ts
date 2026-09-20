import { Router } from 'express';
import {
  newId,
  now,
  requireCollection,
  validateHandle,
  type StoredRecord,
  type Visibility,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { deserialize, getRecord, listRecords } from '../db/repository.js';
import { findUserById } from '../auth/users.js';
import { notify } from '../services/notifications.js';
import { publish } from '../realtime/hub.js';

/**
 * Constellations, friends and Flux.
 *
 * These are the only records that cross account boundaries, so none of them go
 * through the generic CRUD layer. Every read here answers "may this account see
 * this row?" explicitly, and the answer never depends on anything the client
 * sent.
 */

export const socialRouter: Router = Router();
socialRouter.use(requireAuth);

const db = () => getDb();

// — Profiles ————————————————————————————————————————————————

function profileOf(userId: string): StoredRecord | null {
  const row = db()
    .prepare('SELECT * FROM "constellationProfiles" WHERE "userId" = ? AND "deletedAt" IS NULL')
    .get(userId) as Record<string, unknown> | undefined;
  return row ? deserialize(requireCollection('constellationProfiles'), row) : null;
}

function profileByHandle(handle: string): StoredRecord | null {
  const row = db()
    .prepare('SELECT * FROM "constellationProfiles" WHERE lower("handle") = lower(?) AND "deletedAt" IS NULL')
    .get(handle) as Record<string, unknown> | undefined;
  return row ? deserialize(requireCollection('constellationProfiles'), row) : null;
}

/** `blocked` in either direction hides both accounts from each other entirely. */
function friendshipState(userId: string, otherUserId: string): string | null {
  const row = db()
    .prepare('SELECT "state" FROM "friendships" WHERE "userId" = ? AND "otherUserId" = ? AND "deletedAt" IS NULL')
    .get(userId, otherUserId) as { state: string } | undefined;
  return row?.state ?? null;
}

function isBlockedEitherWay(a: string, b: string): boolean {
  return friendshipState(a, b) === 'blocked' || friendshipState(b, a) === 'blocked';
}

function areFriends(a: string, b: string): boolean {
  if (a === b) return true;
  const forward = friendshipState(a, b);
  const back = friendshipState(b, a);
  return (forward === 'active' || forward === 'muted') && (back === 'active' || back === 'muted');
}

/** What `viewer` is allowed to see of `owner`'s record at a given visibility. */
function canSee(viewerId: string, ownerId: string, visibility: Visibility): boolean {
  if (viewerId === ownerId) return true;
  if (isBlockedEitherWay(viewerId, ownerId)) return false;
  if (visibility === 'public') return true;
  if (visibility === 'friends') return areFriends(viewerId, ownerId);
  // `private`, `system` and `members` never leave the owning account.
  return false;
}

socialRouter.get(
  '/profile',
  handler((req, res) => {
    const context = auth(req);
    ok(res, { profile: profileOf(context.user.id) });
  }),
);

socialRouter.put(
  '/profile',
  handler((req, res) => {
    const context = auth(req);
    const body = req.body as Record<string, unknown>;
    const handle = String(body['handle'] ?? '').trim();
    const handleError = validateHandle(handle);
    if (handleError) throw badRequest(handleError, { handle: handleError });

    const taken = profileByHandle(handle);
    if (taken && taken['userId'] !== context.user.id) {
      throw conflict('That handle is already taken. Try another.');
    }

    const existing = profileOf(context.user.id);
    const collection = requireCollection('constellationProfiles');
    const timestamp = now();
    const values: Record<string, unknown> = {
      handle,
      displayName: String(body['displayName'] ?? handle).slice(0, 120),
      bio: String(body['bio'] ?? '').slice(0, 2000),
      avatarUrl: String(body['avatarUrl'] ?? ''),
      bannerUrl: String(body['bannerUrl'] ?? ''),
      avatarFocus: body['avatarFocus'] ?? null,
      bannerFocus: body['bannerFocus'] ?? null,
      accent: String(body['accent'] ?? ''),
      systemType: String(body['systemType'] ?? ''),
      pronouns: String(body['pronouns'] ?? ''),
      isPublic: body['isPublic'] ? 1 : 0,
      showMemberCount: body['showMemberCount'] ? 1 : 0,
      showMemberList: body['showMemberList'] ? 1 : 0,
      showCurrentFronter: body['showCurrentFronter'] ? 1 : 0,
      acceptFriendRequests: body['acceptFriendRequests'] === false ? 0 : 1,
      acceptMessageRequests: body['acceptMessageRequests'] === false ? 0 : 1,
      memberSort: String(body['memberSort'] ?? 'orbit'),
      memberColumns: Math.min(5, Math.max(1, Number(body['memberColumns'] ?? 3))),
      pinnedMediaIds: JSON.stringify(body['pinnedMediaIds'] ?? []),
      customInfo: body['customInfo'] ? JSON.stringify(body['customInfo']) : null,
    };

    if (existing) {
      const assignments = Object.keys(values).map((key) => `"${key}" = ?`);
      db()
        .prepare(
          `UPDATE "constellationProfiles" SET ${assignments.join(', ')}, "updatedAt" = ?, "version" = "version" + 1
           WHERE "id" = ? AND "userId" = ?`,
        )
        .run(...Object.values(values) as never[], timestamp, existing.id, context.user.id);
    } else {
      const columns = ['id', 'userId', 'systemId', 'memberId', 'visibility', 'createdAt', 'updatedAt', 'deletedAt', 'version', ...Object.keys(values)];
      db()
        .prepare(
          `INSERT INTO "constellationProfiles" (${columns.map((c) => `"${c}"`).join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
        )
        .run(
          newId('cnp'),
          context.user.id,
          context.user.activeSystemId,
          null,
          values['isPublic'] ? 'public' : 'private',
          timestamp,
          timestamp,
          null,
          1,
          ...(Object.values(values) as never[]),
        );
    }
    void collection;
    ok(res, { profile: profileOf(context.user.id) });
  }),
);

socialRouter.get(
  '/discover',
  handler((req, res) => {
    const context = auth(req);
    const query = String(req.query['q'] ?? '').trim();
    const rows = db()
      .prepare(
        `SELECT * FROM "constellationProfiles"
         WHERE "isPublic" = 1 AND "deletedAt" IS NULL AND "userId" != ?
           AND (? = '' OR lower("handle") LIKE lower(?) OR lower("displayName") LIKE lower(?))
         ORDER BY "updatedAt" DESC LIMIT 40`,
      )
      .all(context.user.id, query, `%${query}%`, `%${query}%`) as Record<string, unknown>[];

    const profiles = rows
      .map((row) => deserialize(requireCollection('constellationProfiles'), row))
      .filter((profile) => !isBlockedEitherWay(context.user.id, profile['userId'] as string))
      .map((profile) => publicProfileView(context.user.id, profile));
    ok(res, { profiles });
  }),
);

/**
 * Trims a profile to what the viewer may see. Per-member privacy is applied
 * here too — a member who opted out is not in the list at all, rather than
 * being sent and hidden by the client.
 */
function publicProfileView(viewerId: string, profile: StoredRecord): Record<string, unknown> {
  const ownerId = profile['userId'] as string;
  const isOwner = viewerId === ownerId;
  const friends = areFriends(viewerId, ownerId);
  const scope = { userId: ownerId, systemId: (profile['systemId'] as string) ?? null };

  const view: Record<string, unknown> = {
    id: profile.id,
    userId: ownerId,
    handle: profile['handle'],
    displayName: profile['displayName'],
    bio: profile['bio'],
    avatarUrl: profile['avatarUrl'],
    bannerUrl: profile['bannerUrl'],
    avatarFocus: profile['avatarFocus'],
    bannerFocus: profile['bannerFocus'],
    accent: profile['accent'],
    systemType: profile['systemType'],
    pronouns: profile['pronouns'],
    memberSort: profile['memberSort'],
    memberColumns: profile['memberColumns'],
    customInfo: profile['customInfo'],
    isFriend: friends,
    isOwner,
    acceptsFriendRequests: profile['acceptFriendRequests'] === true,
    acceptsMessages: profile['acceptMessageRequests'] === true,
  };

  if (profile['showMemberCount'] === true || isOwner) {
    const row = db()
      .prepare('SELECT COUNT(*) AS n FROM "members" WHERE "userId" = ? AND "deletedAt" IS NULL')
      .get(ownerId) as { n: number };
    view['memberCount'] = row.n;
  }

  if (profile['showMemberList'] === true || isOwner) {
    const members = listRecords('members', scope, { limit: 200 }).items;
    view['members'] = members
      .filter((member) => {
        const privacy = (member['privacy'] ?? {}) as Record<string, unknown>;
        return isOwner || privacy['showOnProfile'] !== false;
      })
      .map((member) => {
        const privacy = (member['privacy'] ?? {}) as Record<string, unknown>;
        return {
          id: member.id,
          name: member['name'],
          pronouns: member['pronouns'],
          color: member['color'],
          icon: member['icon'],
          avatarUrl: privacy['showAvatar'] === false && !isOwner ? '' : member['avatarUrl'],
          orbitOrder: member['orbitOrder'],
          frontStatus:
            profile['showCurrentFronter'] === true && privacy['showFronting'] !== false
              ? member['frontStatus']
              : null,
        };
      });
  }

  if (profile['showCurrentFronter'] === true || isOwner) {
    const fronting = listRecords('frontEvents', scope, { filters: { endedAt: null }, limit: 10 }).items;
    view['currentlyFronting'] = fronting
      .map((event) => {
        const memberId = event['memberId'] as string | null;
        if (!memberId) return null;
        const member = getRecord('members', scope, memberId);
        const privacy = (member?.['privacy'] ?? {}) as Record<string, unknown>;
        if (!member || (privacy['showFronting'] === false && !isOwner)) return null;
        return { id: member.id, name: member['name'], color: member['color'], icon: member['icon'] };
      })
      .filter(Boolean);
  }

  const pinned = (profile['pinnedMediaIds'] as string[]) ?? [];
  if (pinned.length > 0) {
    view['pinnedGallery'] = pinned
      .map((id) => getRecord('mediaItems', scope, id))
      .filter((item): item is StoredRecord => Boolean(item) && item!['visibility'] !== 'private')
      .map((item) => ({ id: item.id, url: item['url'], title: item['title'], mediaType: item['mediaType'] }));
  }

  return view;
}

socialRouter.get(
  '/profiles/:handle',
  handler((req, res) => {
    const context = auth(req);
    const profile = profileByHandle(String(req.params['handle']));
    if (!profile) throw notFound('That profile');

    const ownerId = profile['userId'] as string;
    if (isBlockedEitherWay(context.user.id, ownerId)) throw notFound('That profile');
    if (profile['isPublic'] !== true && ownerId !== context.user.id && !areFriends(context.user.id, ownerId)) {
      throw forbidden('This profile is private.');
    }
    ok(res, { profile: publicProfileView(context.user.id, profile) });
  }),
);

// — Friends —————————————————————————————————————————————————

function counterpartSummary(userId: string): Record<string, unknown> {
  const profile = profileOf(userId);
  const user = findUserById(userId);
  return {
    userId,
    handle: profile?.['handle'] ?? null,
    displayName: profile?.['displayName'] ?? user?.displayName ?? 'Someone',
    avatarUrl: profile?.['avatarUrl'] ?? '',
    accent: profile?.['accent'] ?? '',
  };
}

socialRouter.get(
  '/friends',
  handler((req, res) => {
    const context = auth(req);
    const rows = db()
      .prepare('SELECT * FROM "friendships" WHERE "userId" = ? AND "deletedAt" IS NULL ORDER BY "createdAt" DESC')
      .all(context.user.id) as Record<string, unknown>[];
    const friendships = rows.map((row) => deserialize(requireCollection('friendships'), row));
    ok(res, {
      friends: friendships
        .filter((f) => f['state'] !== 'blocked')
        .map((f) => ({
          ...counterpartSummary(f['otherUserId'] as string),
          state: f['state'],
          mutual: areFriends(context.user.id, f['otherUserId'] as string),
          lastInteractionAt: f['lastInteractionAt'],
        })),
      blocked: friendships
        .filter((f) => f['state'] === 'blocked')
        .map((f) => counterpartSummary(f['otherUserId'] as string)),
    });
  }),
);

socialRouter.get(
  '/friends/requests',
  handler((req, res) => {
    const context = auth(req);
    const incoming = db()
      .prepare(
        `SELECT * FROM "friendRequests" WHERE "toUserId" = ? AND "status" = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC`,
      )
      .all(context.user.id) as Record<string, unknown>[];
    const outgoing = db()
      .prepare(
        `SELECT * FROM "friendRequests" WHERE "fromUserId" = ? AND "status" = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC`,
      )
      .all(context.user.id) as Record<string, unknown>[];

    const shape = (row: Record<string, unknown>, otherKey: 'fromUserId' | 'toUserId') => {
      const request = deserialize(requireCollection('friendRequests'), row);
      return {
        id: request.id,
        message: request['message'],
        createdAt: request.createdAt,
        ...counterpartSummary(request[otherKey] as string),
      };
    };

    ok(res, {
      incoming: incoming.map((row) => shape(row, 'fromUserId')),
      outgoing: outgoing.map((row) => shape(row, 'toUserId')),
    });
  }),
);

socialRouter.post(
  '/friends/requests',
  handler(async (req, res) => {
    const context = auth(req);
    const { handle, userId, message } = req.body as {
      handle?: string;
      userId?: string;
      message?: string;
    };

    const target = handle ? profileByHandle(handle) : userId ? profileOf(userId) : null;
    const targetUserId = (target?.['userId'] as string) ?? userId;
    if (!targetUserId) throw notFound('That system');
    if (targetUserId === context.user.id) throw badRequest('You are already yourself.');
    if (isBlockedEitherWay(context.user.id, targetUserId)) throw notFound('That system');
    if (target && target['acceptFriendRequests'] === false) {
      throw forbidden('That system is not accepting friend requests right now.');
    }
    if (areFriends(context.user.id, targetUserId)) throw conflict('You are already friends.');

    const existing = db()
      .prepare(
        `SELECT "id" FROM "friendRequests"
         WHERE "fromUserId" = ? AND "toUserId" = ? AND "status" = 'pending' AND "deletedAt" IS NULL`,
      )
      .get(context.user.id, targetUserId) as { id: string } | undefined;
    if (existing) throw conflict('You have already sent that request.');

    const id = newId('frq');
    const timestamp = now();
    db()
      .prepare(
        `INSERT INTO "friendRequests"
          ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
           "fromUserId","toUserId","message","status","respondedAt")
         VALUES (?,?,?,NULL,'private',?,?,NULL,1,?,?,?,'pending',NULL)`,
      )
      .run(
        id,
        context.user.id,
        context.user.activeSystemId,
        timestamp,
        timestamp,
        context.user.id,
        targetUserId,
        (message ?? '').slice(0, 500),
      );

    const me = counterpartSummary(context.user.id);
    publish(targetUserId, { type: 'friend.request', requestId: id, fromUserId: context.user.id });
    await notify({
      userId: targetUserId,
      category: 'friendRequests',
      kind: 'friend.request',
      title: `${me['displayName']} sent a friend request`,
      body: message?.slice(0, 120) ?? '',
      link: '/friends',
      actorUserId: context.user.id,
    });

    ok(res, { id, status: 'pending' }, 201);
  }),
);

function upsertFriendship(userId: string, otherUserId: string, state: string): void {
  const existing = db()
    .prepare('SELECT "id" FROM "friendships" WHERE "userId" = ? AND "otherUserId" = ?')
    .get(userId, otherUserId) as { id: string } | undefined;
  const timestamp = now();
  if (existing) {
    db()
      .prepare(
        `UPDATE "friendships" SET "state" = ?, "deletedAt" = NULL, "updatedAt" = ?, "version" = "version" + 1
         WHERE "id" = ?`,
      )
      .run(state, timestamp, existing.id);
    return;
  }
  db()
    .prepare(
      `INSERT INTO "friendships"
        ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
         "otherUserId","state","note","lastInteractionAt")
       VALUES (?,?,NULL,NULL,'private',?,?,NULL,1,?,?,'',?)`,
    )
    .run(newId('frs'), userId, timestamp, timestamp, otherUserId, state, timestamp);
}

socialRouter.post(
  '/friends/requests/:id/accept',
  handler(async (req, res) => {
    const context = auth(req);
    const row = db()
      .prepare(`SELECT * FROM "friendRequests" WHERE "id" = ? AND "toUserId" = ? AND "status" = 'pending'`)
      .get(String(req.params['id']), context.user.id) as Record<string, unknown> | undefined;
    if (!row) throw notFound('That request');

    const fromUserId = row['fromUserId'] as string;
    db()
      .prepare(`UPDATE "friendRequests" SET "status" = 'accepted', "respondedAt" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .run(now(), now(), row['id']);
    upsertFriendship(context.user.id, fromUserId, 'active');
    upsertFriendship(fromUserId, context.user.id, 'active');

    const me = counterpartSummary(context.user.id);
    publish(fromUserId, { type: 'friend.accepted', userId: context.user.id });
    await notify({
      userId: fromUserId,
      category: 'friendRequests',
      kind: 'friend.accepted',
      title: `${me['displayName']} accepted your friend request`,
      link: '/friends',
      actorUserId: context.user.id,
    });
    ok(res, { accepted: true });
  }),
);

socialRouter.post(
  '/friends/requests/:id/decline',
  handler((req, res) => {
    const context = auth(req);
    const result = db()
      .prepare(
        `UPDATE "friendRequests" SET "status" = 'declined', "respondedAt" = ?, "updatedAt" = ?
         WHERE "id" = ? AND "toUserId" = ? AND "status" = 'pending'`,
      )
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That request');
    // The sender is not told, so declining is not an event they can react to.
    ok(res, { declined: true });
  }),
);

socialRouter.delete(
  '/friends/requests/:id',
  handler((req, res) => {
    const context = auth(req);
    const result = db()
      .prepare(
        `UPDATE "friendRequests" SET "status" = 'cancelled', "respondedAt" = ?, "updatedAt" = ?
         WHERE "id" = ? AND "fromUserId" = ? AND "status" = 'pending'`,
      )
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That request');
    ok(res, { cancelled: true });
  }),
);

socialRouter.delete(
  '/friends/:userId',
  handler((req, res) => {
    const context = auth(req);
    const other = String(req.params['userId']);
    const timestamp = now();
    db()
      .prepare('UPDATE "friendships" SET "deletedAt" = ?, "updatedAt" = ? WHERE "userId" = ? AND "otherUserId" = ?')
      .run(timestamp, timestamp, context.user.id, other);
    db()
      .prepare('UPDATE "friendships" SET "deletedAt" = ?, "updatedAt" = ? WHERE "userId" = ? AND "otherUserId" = ?')
      .run(timestamp, timestamp, other, context.user.id);
    ok(res, { removed: true });
  }),
);

socialRouter.post(
  '/friends/:userId/state',
  handler((req, res) => {
    const context = auth(req);
    const state = String((req.body as { state?: string }).state ?? '');
    if (!['active', 'muted', 'blocked'].includes(state)) {
      throw badRequest('State must be active, muted or blocked.');
    }
    upsertFriendship(context.user.id, String(req.params['userId']), state);
    ok(res, { state });
  }),
);

// — Flux ————————————————————————————————————————————————————

function postView(viewerId: string, post: StoredRecord): Record<string, unknown> {
  const ownerId = post['userId'] as string;
  const author = counterpartSummary(ownerId);
  let asMember: Record<string, unknown> | null = null;
  if (post['authorKind'] === 'member' && post['memberId']) {
    const member = getRecord('members', { userId: ownerId, systemId: post['systemId'] as string }, post['memberId'] as string);
    if (member) {
      asMember = { id: member.id, name: member['name'], color: member['color'], icon: member['icon'], avatarUrl: member['avatarUrl'] };
    }
  }
  const myReaction = db()
    .prepare('SELECT "emoji" FROM "reactions" WHERE "targetId" = ? AND "userId" = ? AND "deletedAt" IS NULL')
    .get(post.id, viewerId) as { emoji: string } | undefined;

  return {
    ...post,
    author,
    asMember,
    isMine: ownerId === viewerId,
    myReaction: myReaction?.emoji ?? null,
  };
}

socialRouter.get(
  '/flux',
  handler((req, res) => {
    const context = auth(req);
    const scopeParam = String(req.query['scope'] ?? 'friends');
    const limit = Math.min(60, Math.max(1, Number(req.query['limit'] ?? 30)));
    const before = typeof req.query['before'] === 'string' ? req.query['before'] : now();

    const friendIds = (
      db()
        .prepare(
          `SELECT "otherUserId" FROM "friendships"
           WHERE "userId" = ? AND "deletedAt" IS NULL AND "state" IN ('active','muted')`,
        )
        .all(context.user.id) as { otherUserId: string }[]
    ).map((row) => row.otherUserId);

    const visibleAuthors = [context.user.id, ...friendIds];
    const placeholders = visibleAuthors.map(() => '?').join(', ');

    const sql =
      scopeParam === 'mine'
        ? `SELECT * FROM "posts" WHERE "userId" = ? AND "deletedAt" IS NULL AND "postedAt" < ?
           ORDER BY "postedAt" DESC LIMIT ?`
        : scopeParam === 'public'
          ? `SELECT * FROM "posts" WHERE "visibility" = 'public' AND "deletedAt" IS NULL AND "postedAt" < ?
             ORDER BY "postedAt" DESC LIMIT ?`
          : `SELECT * FROM "posts"
             WHERE "deletedAt" IS NULL AND "postedAt" < ?
               AND (("userId" IN (${placeholders}) AND "visibility" IN ('friends','public'))
                    OR "userId" = ?)
             ORDER BY "postedAt" DESC LIMIT ?`;

    const params =
      scopeParam === 'mine'
        ? [context.user.id, before, limit]
        : scopeParam === 'public'
          ? [before, limit]
          : [before, ...visibleAuthors, context.user.id, limit];

    const rows = db().prepare(sql).all(...params) as Record<string, unknown>[];
    const posts = rows
      .map((row) => deserialize(requireCollection('posts'), row))
      .filter((post) => !isBlockedEitherWay(context.user.id, post['userId'] as string))
      .map((post) => postView(context.user.id, post));

    ok(res, {
      posts,
      nextCursor: posts.length === limit ? (posts[posts.length - 1]?.['postedAt'] as string) : null,
    });
  }),
);

socialRouter.post(
  '/flux',
  handler((req, res) => {
    const context = auth(req);
    const body = req.body as {
      body?: string;
      media?: unknown[];
      visibility?: Visibility;
      authorKind?: 'system' | 'member';
      memberId?: string | null;
      tags?: string[];
      contentWarning?: string;
      repostOfId?: string;
    };

    const text = (body.body ?? '').trim();
    if (!text && (body.media?.length ?? 0) === 0 && !body.repostOfId) {
      throw badRequest('Write something, add an image, or repost.');
    }

    const id = newId('pst');
    const timestamp = now();
    const visibility: Visibility = (['private', 'friends', 'public'] as const).includes(
      body.visibility as 'private' | 'friends' | 'public',
    )
      ? (body.visibility as Visibility)
      : 'friends';

    db()
      .prepare(
        `INSERT INTO "posts"
          ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
           "body","postedAt","media","authorKind","repostOfId","reactionCount","commentCount","repostCount",
           "tags","edited","contentWarning")
         VALUES (?,?,?,?,?,?,?,NULL,1,?,?,?,?,?,0,0,0,?,0,?)`,
      )
      .run(
        id,
        context.user.id,
        context.user.activeSystemId,
        body.authorKind === 'member' ? body.memberId ?? null : null,
        visibility,
        timestamp,
        timestamp,
        text.slice(0, 5000),
        timestamp,
        JSON.stringify(body.media ?? []),
        body.authorKind === 'member' ? 'member' : 'system',
        body.repostOfId ?? null,
        JSON.stringify(body.tags ?? []),
        (body.contentWarning ?? '').slice(0, 200),
      );

    if (body.repostOfId) {
      db()
        .prepare('UPDATE "posts" SET "repostCount" = "repostCount" + 1 WHERE "id" = ?')
        .run(body.repostOfId);
    }

    const row = db().prepare('SELECT * FROM "posts" WHERE "id" = ?').get(id) as Record<string, unknown>;
    ok(res, postView(context.user.id, deserialize(requireCollection('posts'), row)), 201);
  }),
);

function loadVisiblePost(viewerId: string, id: string): StoredRecord {
  const row = db().prepare('SELECT * FROM "posts" WHERE "id" = ? AND "deletedAt" IS NULL').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw notFound('That post');
  const post = deserialize(requireCollection('posts'), row);
  if (!canSee(viewerId, post['userId'] as string, post['visibility'] as Visibility)) {
    throw notFound('That post');
  }
  return post;
}

socialRouter.get(
  '/flux/:id',
  handler((req, res) => {
    const context = auth(req);
    ok(res, postView(context.user.id, loadVisiblePost(context.user.id, String(req.params['id']))));
  }),
);

socialRouter.patch(
  '/flux/:id',
  handler((req, res) => {
    const context = auth(req);
    const post = loadVisiblePost(context.user.id, String(req.params['id']));
    if (post['userId'] !== context.user.id) throw forbidden('That is not your post.');
    const body = req.body as { body?: string; contentWarning?: string; visibility?: Visibility };
    db()
      .prepare(
        `UPDATE "posts" SET "body" = ?, "contentWarning" = ?, "visibility" = ?, "edited" = 1,
         "updatedAt" = ?, "version" = "version" + 1 WHERE "id" = ?`,
      )
      .run(
        (body.body ?? (post['body'] as string)).slice(0, 5000),
        (body.contentWarning ?? (post['contentWarning'] as string) ?? '').slice(0, 200),
        body.visibility ?? post['visibility'],
        now(),
        post.id,
      );
    ok(res, postView(context.user.id, loadVisiblePost(context.user.id, post.id)));
  }),
);

socialRouter.delete(
  '/flux/:id',
  handler((req, res) => {
    const context = auth(req);
    const result = db()
      .prepare('UPDATE "posts" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That post');
    ok(res, { deleted: true });
  }),
);

socialRouter.post(
  '/flux/:id/reactions',
  handler(async (req, res) => {
    const context = auth(req);
    const post = loadVisiblePost(context.user.id, String(req.params['id']));
    const emoji = String((req.body as { emoji?: string }).emoji ?? '★').slice(0, 16);

    const existing = db()
      .prepare('SELECT * FROM "reactions" WHERE "targetId" = ? AND "userId" = ? AND "deletedAt" IS NULL')
      .get(post.id, context.user.id) as { id: string; emoji: string } | undefined;

    if (existing?.emoji === emoji) {
      db().prepare('UPDATE "reactions" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ?').run(now(), now(), existing.id);
      db().prepare('UPDATE "posts" SET "reactionCount" = max(0, "reactionCount" - 1) WHERE "id" = ?').run(post.id);
      ok(res, { emoji: null });
      return;
    }

    if (existing) {
      db().prepare('UPDATE "reactions" SET "emoji" = ?, "updatedAt" = ? WHERE "id" = ?').run(emoji, now(), existing.id);
    } else {
      const timestamp = now();
      db()
        .prepare(
          `INSERT INTO "reactions"
            ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
             "targetType","targetId","emoji")
           VALUES (?,?,?,NULL,'private',?,?,NULL,1,'post',?,?)`,
        )
        .run(newId('rct'), context.user.id, context.user.activeSystemId, timestamp, timestamp, post.id, emoji);
      db().prepare('UPDATE "posts" SET "reactionCount" = "reactionCount" + 1 WHERE "id" = ?').run(post.id);
    }

    const ownerId = post['userId'] as string;
    if (ownerId !== context.user.id) {
      publish(ownerId, { type: 'flux.activity', postId: post.id, kind: 'reaction' });
      await notify({
        userId: ownerId,
        category: 'fluxActivity',
        kind: 'flux.reaction',
        title: `${counterpartSummary(context.user.id)['displayName']} reacted ${emoji}`,
        link: `/flux/${post.id}`,
        actorUserId: context.user.id,
      });
    }
    ok(res, { emoji });
  }),
);

socialRouter.get(
  '/flux/:id/comments',
  handler((req, res) => {
    const context = auth(req);
    const post = loadVisiblePost(context.user.id, String(req.params['id']));
    const rows = db()
      .prepare('SELECT * FROM "comments" WHERE "postId" = ? AND "deletedAt" IS NULL ORDER BY "postedAt" ASC')
      .all(post.id) as Record<string, unknown>[];
    ok(res, {
      comments: rows
        .map((row) => deserialize(requireCollection('comments'), row))
        .filter((comment) => !isBlockedEitherWay(context.user.id, comment['userId'] as string))
        .map((comment) => ({
          ...comment,
          author: counterpartSummary(comment['userId'] as string),
          isMine: comment['userId'] === context.user.id,
        })),
    });
  }),
);

socialRouter.post(
  '/flux/:id/comments',
  handler(async (req, res) => {
    const context = auth(req);
    const post = loadVisiblePost(context.user.id, String(req.params['id']));
    const body = (req.body as { body?: string; replyToId?: string; memberId?: string }).body?.trim();
    if (!body) throw badRequest('Write something first.');

    const id = newId('cmt');
    const timestamp = now();
    db()
      .prepare(
        `INSERT INTO "comments"
          ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
           "postId","body","postedAt","replyToId","authorKind","edited")
         VALUES (?,?,?,?,'friends',?,?,NULL,1,?,?,?,?,?,0)`,
      )
      .run(
        id,
        context.user.id,
        context.user.activeSystemId,
        (req.body as { memberId?: string }).memberId ?? null,
        timestamp,
        timestamp,
        post.id,
        body.slice(0, 2000),
        timestamp,
        (req.body as { replyToId?: string }).replyToId ?? null,
        (req.body as { memberId?: string }).memberId ? 'member' : 'system',
      );
    db().prepare('UPDATE "posts" SET "commentCount" = "commentCount" + 1 WHERE "id" = ?').run(post.id);

    const ownerId = post['userId'] as string;
    if (ownerId !== context.user.id) {
      publish(ownerId, { type: 'flux.activity', postId: post.id, kind: 'comment' });
      await notify({
        userId: ownerId,
        category: 'fluxActivity',
        kind: 'flux.comment',
        title: `${counterpartSummary(context.user.id)['displayName']} commented`,
        body: body.slice(0, 120),
        link: `/flux/${post.id}`,
        actorUserId: context.user.id,
      });
    }
    ok(res, { id }, 201);
  }),
);

socialRouter.delete(
  '/flux/:postId/comments/:id',
  handler((req, res) => {
    const context = auth(req);
    const result = db()
      .prepare('UPDATE "comments" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That comment');
    db()
      .prepare('UPDATE "posts" SET "commentCount" = max(0, "commentCount" - 1) WHERE "id" = ?')
      .run(String(req.params['postId']));
    ok(res, { deleted: true });
  }),
);

export { areFriends, isBlockedEitherWay, profileOf, profileByHandle, counterpartSummary, canSee };
