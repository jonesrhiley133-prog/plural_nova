import { Router } from 'express';
import { newId, now, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb, transaction } from '../db/index.js';
import { deserialize, getRecord } from '../db/repository.js';
import { notify } from '../services/notifications.js';
import { publish } from '../realtime/hub.js';
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
 *   • Encryption is real or absent. The server holds public keys and ciphertext
 *     it cannot read; when the recipient has published no key, the message is
 *     sent in the clear and the UI says so rather than showing a padlock.
 */

export const messagesRouter: Router = Router();
messagesRouter.use(requireAuth);

const db = () => getDb();

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

    // Publishing a new key for a device retires the old one rather than
    // deleting it, so messages encrypted to the previous key can still be
    // identified by `encryptionKeyId` instead of silently failing to decrypt.
    db()
      .prepare('UPDATE "messageKeys" SET "retiredAt" = ? WHERE "userId" = ? AND "deviceLabel" = ? AND "retiredAt" IS NULL')
      .run(now(), context.user.id, deviceLabel ?? 'default');

    const id = newId('mky');
    db()
      .prepare(
        `INSERT INTO "messageKeys" (id, userId, deviceLabel, publicKey, algorithm, createdAt, retiredAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, context.user.id, deviceLabel ?? 'default', publicKey, algorithm ?? 'ECDH-P256', now());
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

// — Messages ————————————————————————————————————————————————

function messageView(message: StoredRecord, viewerId: string): Record<string, unknown> {
  const senderId = message['senderUserId'] as string;
  let asMember: Record<string, unknown> | null = null;
  const memberId = message['senderMemberId'] as string | null;
  if (memberId) {
    const member = getRecord('members', { userId: senderId, systemId: null }, memberId);
    if (member) {
      asMember = { id: member.id, name: member['name'], color: member['color'], icon: member['icon'] };
    }
  }
  return {
    ...message,
    isMine: senderId === viewerId,
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
      encrypted?: boolean;
      encryptionKeyId?: string;
      attachments?: unknown[];
      asMemberId?: string | null;
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
             "edited","encrypted","encryptionKeyId","clientId")
           VALUES (?,?,?,NULL,'private',?,?,NULL,1,?,?,?,?,?,?,?,?,0,?,?,?)`,
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
          body.encrypted ? 1 : 0,
          body.encryptionKeyId ?? '',
          body.clientId ?? '',
        );

      db()
        .prepare('UPDATE threads SET nextSequence = ?, lastMessageAt = ? WHERE id = ?')
        .run(sequence + 1, timestamp, threadId);

      // A preview is stored on each side's own conversation row. The recipient's
      // copy is written here because it is their row, not the sender's.
      const preview = body.encrypted ? '' : text.slice(0, 120);
      db()
        .prepare(
          `UPDATE "conversations" SET "lastMessageAt" = ?, "lastMessagePreview" = ?, "updatedAt" = ?
           WHERE "threadId" = ? AND "userId" = ?`,
        )
        .run(timestamp, preview, timestamp, threadId, context.user.id);
      db()
        .prepare(
          `UPDATE "conversations"
           SET "lastMessageAt" = ?, "lastMessagePreview" = ?, "unreadCount" = "unreadCount" + 1, "updatedAt" = ?
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
        body: body.encrypted ? 'Encrypted message' : text.slice(0, 120),
        link: `/messages/${threadId}`,
        actorUserId: context.user.id,
        private: Boolean(body.encrypted),
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
    const result = db()
      .prepare('UPDATE "messages" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "senderUserId" = ?')
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That message');
    ok(res, { deleted: true });
  }),
);
