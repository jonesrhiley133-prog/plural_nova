import { Router } from 'express';
import { newId, now, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { rateLimit } from '../http/rateLimit.js';
import { getDb, transaction } from '../db/index.js';
import { deserialize, getRecord } from '../db/repository.js';
import { shareableView } from '../services/projection.js';
import { notify } from '../services/notifications.js';
import { publish, publishToMany } from '../realtime/hub.js';
import {
  areFriends,
  counterpartSummary,
  isBlockedEitherWay,
  profileByHandle,
  profileOf,
} from './social.js';

/**
 * Flux Messages.
 *
 * Three decisions shape this file:
 *
 *   • Messages are one row per message, shared by both participants — not a
 *     copy per side. A message therefore cannot exist for the sender and be
 *     missing for the recipient.
 *   • Order comes from a server-assigned `sequence` per thread, not from the
 *     sender's clock. A message written offline and replayed an hour later
 *     lands after what came before it, and the list renders oldest → newest.
 *   • Every new message is stored as plain text, encrypted/encryptionKeyId
 *     forced to their unset defaults regardless of what a request claims.
 *     The key endpoints below and the `encrypted`/`encryptionKeyId` columns
 *     themselves stay, since older rows that predate this still carry real
 *     ciphertext the client still knows how to open.
 */

export const messagesRouter: Router = Router();
messagesRouter.use(requireAuth);

const db = () => getDb();

const sendLimiter = rateLimit({
  max: 60,
  windowMs: 60_000,
  message: 'Sending too many messages. Slow down for a moment.',
});
const newConversationLimiter = rateLimit({ max: 20, windowMs: 60_000 });
// Fires on keystrokes, so generous — the client already throttles how often
// it actually calls this, this just bounds a misbehaving client.
const typingLimiter = rateLimit({ max: 90, windowMs: 60_000 });

interface ThreadRow {
  id: string;
  createdAt: string;
  lastMessageAt: string | null;
  nextSequence: number;
}

function threadIdFor(a: string, b: string): string {
  // Deterministic from the pair, so both sides compute the same id without a
  // round trip and a race cannot create two threads for one conversation.
  return `thr_${[a, b].sort().join('__')}`.slice(0, 120);
}

function ensureThread(userId: string, otherUserId: string): ThreadRow {
  const id = threadIdFor(userId, otherUserId);
  const existing = db().prepare('SELECT * FROM threads WHERE id = ?').get(id) as ThreadRow | undefined;
  if (existing) return existing;
  const timestamp = now();
  db()
    .prepare('INSERT INTO threads (id, createdAt, lastMessageAt, nextSequence) VALUES (?, ?, NULL, 1)')
    .run(id, timestamp);
  return { id, createdAt: timestamp, lastMessageAt: null, nextSequence: 1 };
}

function conversationFor(userId: string, threadId: string): StoredRecord | null {
  const row = db()
    .prepare('SELECT * FROM "conversations" WHERE "userId" = ? AND "threadId" = ? AND "deletedAt" IS NULL')
    .get(userId, threadId) as Record<string, unknown> | undefined;
  return row ? deserialize(requireCollection('conversations'), row) : null;
}

function ensureConversation(
  userId: string,
  otherUserId: string,
  threadId: string,
  state: 'accepted' | 'request',
): StoredRecord {
  const existing = conversationFor(userId, threadId);
  if (existing) return existing;
  const timestamp = now();
  const id = newId('cnv');
  db()
    .prepare(
      `INSERT INTO "conversations"
        ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
         "threadId","otherUserId","title","asMemberId","lastMessageAt","lastMessagePreview","unreadCount",
         "state","muted","pinned","settings")
       VALUES (?,?,NULL,NULL,'private',?,?,NULL,1,?,?,'',NULL,NULL,'',0,?,0,0,NULL)`,
    )
    .run(id, userId, timestamp, timestamp, threadId, otherUserId, state);
  return conversationFor(userId, threadId)!;
}

function requireParticipant(userId: string, threadId: string): StoredRecord {
  const conversation = conversationFor(userId, threadId);
  if (!conversation) throw notFound('That conversation');
  return conversation;
}

// — Encryption keys —————————————————————————————————————————

messagesRouter.post(
  '/keys',
  handler((req, res) => {
    const context = auth(req);
    const { publicKey, deviceLabel, algorithm } = req.body as {
      publicKey?: string;
      deviceLabel?: string;
      algorithm?: string;
    };
    if (!publicKey) throw badRequest('A public key is required.');
    const label = deviceLabel ?? 'default';

    // `deviceLabel` is now a stable per-device id (the device's own `devices`
    // row id), not a hardcoded value every browser shared — so a key is kept
    // active per device rather than one "latest wins" key per account, and a
    // second device signing in no longer retires the first device's key.
    // Publishing is called on every sign-in, so this has to be a no-op when
    // the device's key has not actually changed, rather than growing a new
    // row (and retiring the one just created) on every single launch.
    const existing = db()
      .prepare(
        `SELECT "id","publicKey" FROM "messageKeys"
         WHERE "userId" = ? AND "deviceLabel" = ? AND "retiredAt" IS NULL`,
      )
      .get(context.user.id, label) as { id: string; publicKey: string } | undefined;
    if (existing && existing.publicKey === publicKey) {
      ok(res, { keyId: existing.id }, 200);
      return;
    }

    // A real rotation for this same device (its local key changed) still
    // retires that device's own previous key — it can no longer decrypt
    // with the one it just lost anyway — without touching any other
    // device's row.
    if (existing) {
      db()
        .prepare('UPDATE "messageKeys" SET "retiredAt" = ? WHERE "id" = ?')
        .run(now(), existing.id);
    }

    const id = newId('mky');
    db()
      .prepare(
        `INSERT INTO "messageKeys" (id, userId, deviceLabel, publicKey, algorithm, createdAt, retiredAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, context.user.id, label, publicKey, algorithm ?? 'ECDH-P256', now());

    // Tells this account's own other already-open devices a new key exists
    // (so a conversation left open there picks it up as a fan-out target
    // without a reload), and anyone who already has a conversation with
    // this account for the same reason — otherwise a message sent from
    // their side while this device was already open would never be sealed
    // for it, since their own key list would still be missing it.
    const counterparts = db()
      .prepare('SELECT DISTINCT "userId" FROM "conversations" WHERE "otherUserId" = ?')
      .all(context.user.id) as { userId: string }[];
    publishToMany(
      [context.user.id, ...counterparts.map((row) => row.userId)],
      { type: 'messageKey.new', userId: context.user.id },
    );
    ok(res, { keyId: id }, 201);
  }),
);

messagesRouter.get(
  '/keys/:userId',
  handler((req, res) => {
    const context = auth(req);
    const target = String(req.params['userId']);
    if (isBlockedEitherWay(context.user.id, target)) throw notFound('That system');
    const rows = db()
      .prepare(
        `SELECT id, publicKey, algorithm, createdAt FROM "messageKeys"
         WHERE userId = ? AND retiredAt IS NULL ORDER BY createdAt DESC`,
      )
      .all(target) as { id: string; publicKey: string; algorithm: string; createdAt: string }[];
    ok(res, { keys: rows });
  }),
);

// — Conversations ———————————————————————————————————————————

messagesRouter.get(
  '/conversations',
  handler((req, res) => {
    const context = auth(req);
    const rows = db()
      .prepare(
        `SELECT * FROM "conversations" WHERE "userId" = ? AND "deletedAt" IS NULL
         ORDER BY "pinned" DESC, "lastMessageAt" DESC NULLS LAST, "createdAt" DESC`,
      )
      .all(context.user.id) as Record<string, unknown>[];

    const conversations = rows
      .map((row) => deserialize(requireCollection('conversations'), row))
      .filter((conversation) => !isBlockedEitherWay(context.user.id, conversation['otherUserId'] as string))
      .map((conversation): Record<string, unknown> => ({
        ...conversation,
        // Previews are stored, but they are the user's own copy of their own
        // thread; nothing here is shown to the other side.
        counterpart: counterpartSummary(conversation['otherUserId'] as string),
      }));

    ok(res, {
      conversations: conversations.filter((c) => c['state'] !== 'request'),
      requests: conversations.filter((c) => c['state'] === 'request'),
      unreadTotal: conversations.reduce((sum, c) => sum + Number(c['unreadCount'] ?? 0), 0),
    });
  }),
);

messagesRouter.post(
  '/conversations',
  newConversationLimiter,
  handler((req, res) => {
    const context = auth(req);
    const { handle, userId } = req.body as { handle?: string; userId?: string };
    const profile = handle ? profileByHandle(handle) : userId ? profileOf(userId) : null;
    const otherUserId = (profile?.['userId'] as string) ?? userId;
    if (!otherUserId) throw notFound('That system');
    if (otherUserId === context.user.id) throw badRequest('You cannot message yourself here.');
    if (isBlockedEitherWay(context.user.id, otherUserId)) throw notFound('That system');

    const friends = areFriends(context.user.id, otherUserId);
    if (!friends && profile && profile['acceptMessageRequests'] === false) {
      throw forbidden('That system is not accepting message requests.');
    }

    const thread = ensureThread(context.user.id, otherUserId);
    const mine = ensureConversation(context.user.id, otherUserId, thread.id, 'accepted');
    // The recipient sees it as a request until they reply or accept, unless
    // they are already friends.
    ensureConversation(otherUserId, context.user.id, thread.id, friends ? 'accepted' : 'request');

    ok(res, { conversation: { ...mine, counterpart: counterpartSummary(otherUserId) } }, 201);
  }),
);

messagesRouter.patch(
  '/conversations/:id',
  handler((req, res) => {
    const context = auth(req);
    const body = req.body as {
      muted?: boolean;
      pinned?: boolean;
      state?: string;
      asMemberId?: string | null;
      settings?: Record<string, unknown>;
      title?: string;
    };

    const row = db()
      .prepare('SELECT * FROM "conversations" WHERE "id" = ? AND "userId" = ?')
      .get(String(req.params['id']), context.user.id) as Record<string, unknown> | undefined;
    if (!row) throw notFound('That conversation');

    const assignments: string[] = ['"updatedAt" = ?', '"version" = "version" + 1'];
    const params: unknown[] = [now()];
    const set = (column: string, value: unknown): void => {
      assignments.push(`"${column}" = ?`);
      params.push(value);
    };

    if (body.muted !== undefined) set('muted', body.muted ? 1 : 0);
    if (body.pinned !== undefined) set('pinned', body.pinned ? 1 : 0);
    if (body.title !== undefined) set('title', String(body.title).slice(0, 120));
    if (body.asMemberId !== undefined) set('asMemberId', body.asMemberId);
    if (body.settings !== undefined) set('settings', JSON.stringify(body.settings));
    if (body.state && ['accepted', 'archived', 'blocked'].includes(body.state)) set('state', body.state);

    db()
      .prepare(`UPDATE "conversations" SET ${assignments.join(', ')} WHERE "id" = ? AND "userId" = ?`)
      .run(...params, String(req.params['id']), context.user.id);

    ok(res, { conversation: conversationFor(context.user.id, row['threadId'] as string) });
  }),
);

/**
 * Removes the conversation from the caller's own list only — conversations are
 * one row per side, so this cannot touch the other party's copy, the shared
 * thread, or its messages. They reappear (as a request, unless already
 * friends) the moment either side sends another message.
 */
messagesRouter.delete(
  '/conversations/:id',
  handler((req, res) => {
    const context = auth(req);
    const result = db()
      .prepare('UPDATE "conversations" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That conversation');
    ok(res, { deleted: true });
  }),
);

// — Messages ————————————————————————————————————————————————

/** Whether `userId` shows their member list on their own public profile — the one "show head mates" switch this app has. */
function showsMemberList(userId: string): boolean {
  const row = getDb()
    .prepare('SELECT "showMemberList" FROM "constellationProfiles" WHERE "userId" = ? AND "deletedAt" IS NULL')
    .get(userId) as { showMemberList: number | null } | undefined;
  return row?.showMemberList === 1;
}

function messageView(message: StoredRecord, viewerId: string): Record<string, unknown> {
  const senderId = message['senderUserId'] as string;
  const isMine = senderId === viewerId;
  let asMember: Record<string, unknown> | null = null;
  const memberId = message['senderMemberId'] as string | null;
  if (memberId) {
    const rawMember = getRecord('members', { userId: senderId, systemId: null }, memberId);
    if (rawMember) {
      // Defense in depth, not the gate itself: strips `sensitive` fields
      // (e.g. `notes`) from a raw record that otherwise never leaves this
      // function, so a later edit that accidentally returns more of it can't
      // leak one by itself.
      const member = shareableView('members', rawMember);
      const privacy = (member['privacy'] ?? {}) as Record<string, unknown>;
      // The same gate the public profile's own member list uses: "show head
      // mates" off, or this one alter opted out, means whoever sent this
      // message is never attributed to a specific alter for anyone but the
      // sender's own account — "send as a member" is not a second, ungated
      // place that identity can leak from.
      if (isMine || (showsMemberList(senderId) && privacy['showOnProfile'] !== false)) {
        asMember = {
          id: member.id,
          name: member['name'],
          color: member['color'],
          icon: member['icon'],
          avatarUrl: privacy['showAvatar'] !== false ? member['avatarUrl'] : null,
        };
      }
    }
  }
  return {
    // `...message` would otherwise spread the raw `senderMemberId` straight
    // through regardless of what `asMember` above just decided, making that
    // gate cosmetic — it must say the same thing `asMember` says, never more.
    ...message,
    senderMemberId: asMember ? message['senderMemberId'] : null,
    isMine,
    asMember,
  };
}

/**
 * Returns messages in ascending sequence: oldest first, newest last. Paging
 * backwards uses `before`, so loading history prepends rather than reversing
 * the list the reader is already looking at.
 */
messagesRouter.get(
  '/threads/:threadId',
  handler((req, res) => {
    const context = auth(req);
    const threadId = String(req.params['threadId']);
    const conversation = requireParticipant(context.user.id, threadId);
    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));
    const before = req.query['before'] ? Number(req.query['before']) : null;

    const rows = db()
      .prepare(
        `SELECT * FROM "messages"
         WHERE "threadId" = ? AND "deletedAt" IS NULL AND (? IS NULL OR "sequence" < ?)
         ORDER BY "sequence" DESC LIMIT ?`,
      )
      .all(threadId, before, before, limit) as Record<string, unknown>[];

    // Fetched newest-first so the limit takes the most recent page, then
    // reversed once so the caller always receives OLD → NEW.
    const messages = rows
      .map((row) => deserialize(requireCollection('messages'), row))
      .reverse()
      .map((message) => messageView(message, context.user.id));

    ok(res, {
      threadId,
      conversation: { ...conversation, counterpart: counterpartSummary(conversation['otherUserId'] as string) },
      messages,
      hasMore: rows.length === limit,
      oldestSequence: messages[0]?.['sequence'] ?? null,
    });
  }),
);

messagesRouter.post(
  '/threads/:threadId',
  sendLimiter,
  handler(async (req, res) => {
    const context = auth(req);
    const threadId = String(req.params['threadId']);
    const conversation = requireParticipant(context.user.id, threadId);
    const otherUserId = conversation['otherUserId'] as string;
    if (isBlockedEitherWay(context.user.id, otherUserId)) {
      throw forbidden('You cannot send messages in this conversation.');
    }

    const body = req.body as {
      body?: string;
      clientId?: string;
      attachments?: unknown[];
      asMemberId?: string | null;
      replyToId?: string | null;
      forwardedFrom?: Record<string, unknown> | null;
    };
    const text = body.body ?? '';
    if (!text && (body.attachments?.length ?? 0) === 0) throw badRequest('Write something first.');

    // A replayed send from an offline outbox carries the same clientId, so it
    // resolves to the message already stored instead of a duplicate.
    if (body.clientId) {
      const existing = db()
        .prepare('SELECT * FROM "messages" WHERE "threadId" = ? AND "clientId" = ?')
        .get(threadId, body.clientId) as Record<string, unknown> | undefined;
      if (existing) {
        ok(res, { message: messageView(deserialize(requireCollection('messages'), existing), context.user.id) });
        return;
      }
    }

    const stored = transaction(() => {
      const thread = db().prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as ThreadRow;
      const sequence = thread.nextSequence;
      const timestamp = now();
      const id = newId('msg');

      db()
        .prepare(
          `INSERT INTO "messages"
            ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
             "threadId","senderUserId","senderMemberId","body","sentAt","sequence","attachments","readBy",
             "edited","encrypted","encryptionKeyId","clientId","replyToId","reactions","forwardedFrom")
           VALUES (?,?,?,NULL,'private',?,?,NULL,1,?,?,?,?,?,?,?,?,0,?,?,?,?,NULL,?)`,
        )
        .run(
          id,
          context.user.id,
          context.user.activeSystemId,
          timestamp,
          timestamp,
          threadId,
          context.user.id,
          body.asMemberId ?? (conversation['asMemberId'] as string) ?? null,
          text.slice(0, 20_000),
          timestamp,
          sequence,
          JSON.stringify(body.attachments ?? []),
          JSON.stringify([context.user.id]),
          0,
          '',
          body.clientId ?? '',
          body.replyToId ?? null,
          body.forwardedFrom ? JSON.stringify(body.forwardedFrom) : null,
        );

      db()
        .prepare('UPDATE threads SET nextSequence = ?, lastMessageAt = ? WHERE id = ?')
        .run(sequence + 1, timestamp, threadId);

      // A preview is stored on each side's own conversation row. The recipient's
      // copy is written here because it is their row, not the sender's.
      //
      // Both clear deletedAt: a conversation either side deleted from their own
      // list is only hidden, not gone (the row and the shared thread survive),
      // so it belongs back on screen the moment the conversation continues —
      // the same way it reappears in any other messaging app.
      const preview = text.slice(0, 120);
      db()
        .prepare(
          `UPDATE "conversations" SET "lastMessageAt" = ?, "lastMessagePreview" = ?, "updatedAt" = ?, "deletedAt" = NULL
           WHERE "threadId" = ? AND "userId" = ?`,
        )
        .run(timestamp, preview, timestamp, threadId, context.user.id);
      db()
        .prepare(
          `UPDATE "conversations"
           SET "lastMessageAt" = ?, "lastMessagePreview" = ?, "unreadCount" = "unreadCount" + 1, "updatedAt" = ?, "deletedAt" = NULL
           WHERE "threadId" = ? AND "userId" = ?`,
        )
        .run(timestamp, preview, timestamp, threadId, otherUserId);

      return db().prepare('SELECT * FROM "messages" WHERE "id" = ?').get(id) as Record<string, unknown>;
    });

    const message = deserialize(requireCollection('messages'), stored);
    publish(otherUserId, {
      type: 'message.new',
      threadId,
      messageId: message.id,
      fromUserId: context.user.id,
    });
    publish(context.user.id, {
      type: 'message.new',
      threadId,
      messageId: message.id,
      fromUserId: context.user.id,
    });

    const recipientConversation = conversationFor(otherUserId, threadId);
    if (recipientConversation?.['muted'] !== true) {
      await notify({
        userId: otherUserId,
        category: 'messages',
        kind: 'message.new',
        title: `${counterpartSummary(context.user.id)['displayName']} sent a message`,
        body: text.slice(0, 120),
        link: `/social/messages/${threadId}`,
        actorUserId: context.user.id,
      });
    }

    ok(res, { message: messageView(message, context.user.id) }, 201);
  }),
);

messagesRouter.post(
  '/threads/:threadId/read',
  handler((req, res) => {
    const context = auth(req);
    const threadId = String(req.params['threadId']);
    requireParticipant(context.user.id, threadId);

    db()
      .prepare('UPDATE "conversations" SET "unreadCount" = 0, "updatedAt" = ? WHERE "threadId" = ? AND "userId" = ?')
      .run(now(), threadId, context.user.id);

    // Read receipts are opt-in per conversation; when they are off the other
    // side is simply not told, rather than being told something untrue.
    const conversation = conversationFor(context.user.id, threadId);
    const settings = (conversation?.['settings'] ?? {}) as Record<string, unknown>;
    if (settings['readReceipts'] !== false) {
      const otherUserId = conversation?.['otherUserId'] as string;
      publish(otherUserId, { type: 'message.read', threadId, byUserId: context.user.id });
      db()
        .prepare(
          `UPDATE "messages" SET "readBy" = json_insert("readBy", '$[#]', ?)
           WHERE "threadId" = ? AND "senderUserId" != ? AND "readBy" NOT LIKE ?`,
        )
        .run(context.user.id, threadId, context.user.id, `%${context.user.id}%`);
    }

    ok(res, { read: true });
  }),
);

/**
 * Purely ephemeral — never written to any collection, never replayed to a
 * client that was not already connected the moment it was sent. A missed
 * "stopped typing" is expected and harmless: the receiving side expires its
 * own indicator after a few seconds of silence rather than trusting this to
 * always arrive.
 */
messagesRouter.post(
  '/threads/:threadId/typing',
  typingLimiter,
  handler((req, res) => {
    const context = auth(req);
    const threadId = String(req.params['threadId']);
    const conversation = requireParticipant(context.user.id, threadId);
    const settings = (conversation['settings'] ?? {}) as Record<string, unknown>;

    // The same opt-out as read receipts: both are "let the other side see
    // what I'm doing right now", so one switch covers both.
    if (settings['readReceipts'] !== false) {
      const { isTyping } = req.body as { isTyping?: boolean };
      publish(conversation['otherUserId'] as string, {
        type: 'typing',
        threadId,
        fromUserId: context.user.id,
        isTyping: isTyping !== false,
      });
    }
    ok(res, { sent: true });
  }),
);

messagesRouter.post(
  '/threads/:threadId/accept',
  handler((req, res) => {
    const context = auth(req);
    const threadId = String(req.params['threadId']);
    requireParticipant(context.user.id, threadId);
    db()
      .prepare(`UPDATE "conversations" SET "state" = 'accepted', "updatedAt" = ? WHERE "threadId" = ? AND "userId" = ?`)
      .run(now(), threadId, context.user.id);
    ok(res, { accepted: true });
  }),
);

messagesRouter.delete(
  '/messages/:id',
  handler((req, res) => {
    const context = auth(req);
    const row = db()
      .prepare('SELECT * FROM "messages" WHERE "id" = ? AND "deletedAt" IS NULL')
      .get(String(req.params['id'])) as Record<string, unknown> | undefined;
    if (!row || row['senderUserId'] !== context.user.id) throw notFound('That message');

    db()
      .prepare('UPDATE "messages" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ?')
      .run(now(), now(), row['id']);

    const threadId = row['threadId'] as string;
    const messageId = String(row['id']);
    const conversation = requireParticipant(context.user.id, threadId);
    const otherUserId = conversation['otherUserId'] as string;
    publish(otherUserId, { type: 'message.deleted', threadId, messageId });
    publish(context.user.id, { type: 'message.deleted', threadId, messageId });

    ok(res, { deleted: true });
  }),
);

/**
 * Toggles the caller's own reaction. DMs are 1:1, so `reactions` never grows
 * past two userIds per emoji — kept as the same emoji-keyed map shape System
 * Chat uses so the client can render both with one component.
 */
messagesRouter.post(
  '/messages/:id/reactions',
  handler((req, res) => {
    const context = auth(req);
    const { emoji } = req.body as { emoji?: string };
    if (!emoji) throw badRequest('Choose a reaction.');

    const row = db()
      .prepare('SELECT * FROM "messages" WHERE "id" = ? AND "deletedAt" IS NULL')
      .get(String(req.params['id'])) as Record<string, unknown> | undefined;
    if (!row) throw notFound('That message');

    const threadId = row['threadId'] as string;
    const conversation = requireParticipant(context.user.id, threadId);
    const otherUserId = conversation['otherUserId'] as string;
    if (isBlockedEitherWay(context.user.id, otherUserId)) throw forbidden('You cannot react in this conversation.');

    const reactions = (row['reactions'] ? JSON.parse(String(row['reactions'])) : {}) as Record<string, string[]>;
    const current = reactions[emoji] ?? [];
    reactions[emoji] = current.includes(context.user.id)
      ? current.filter((id) => id !== context.user.id)
      : [...current, context.user.id];
    if (reactions[emoji].length === 0) delete reactions[emoji];

    db()
      .prepare('UPDATE "messages" SET "reactions" = ?, "updatedAt" = ? WHERE "id" = ?')
      .run(JSON.stringify(reactions), now(), row['id']);

    const messageId = String(row['id']);
    publish(otherUserId, { type: 'reaction.new', threadId, messageId, kind: 'dm' });
    publish(context.user.id, { type: 'reaction.new', threadId, messageId, kind: 'dm' });

    ok(res, { reactions });
  }),
);
