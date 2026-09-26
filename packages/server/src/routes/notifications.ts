import { Router } from 'express';
import { requireCollection } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { deserialize, listRecords } from '../db/repository.js';
import { markAllRead, markRead, unreadByCategory, unreadCount } from '../services/notifications.js';

/** How many system chat threads have a message since they were last read — same "unread" test the thread list itself uses. */
function unreadSystemChatThreads(userId: string, systemId: string | null): number {
  if (!systemId) return 0;
  return listRecords('systemChatThreads', { userId, systemId }, { limit: 200 }).items.filter(
    (thread) =>
      thread['lastMessageAt'] &&
      (!thread['lastReadAt'] || (thread['lastReadAt'] as string) < (thread['lastMessageAt'] as string)),
  ).length;
}

export const notificationsRouter: Router = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : null;
    const unreadOnly = req.query['unread'] === 'true';
    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));

    const rows = getDb()
      .prepare(
        `SELECT * FROM "notifications"
         WHERE "userId" = ? AND "deletedAt" IS NULL
           AND (? IS NULL OR "category" = ?)
           AND (? = 0 OR "readAt" IS NULL)
         ORDER BY "createdAt" DESC LIMIT ?`,
      )
      .all(context.user.id, category, category, unreadOnly ? 1 : 0, limit) as Record<string, unknown>[];

    ok(res, {
      notifications: rows.map((row) => deserialize(requireCollection('notifications'), row)),
      unread: unreadCount(context.user.id),
      byCategory: unreadByCategory(context.user.id),
    });
  }),
);

/** The counts every badge in the app reads from, in one request. */
notificationsRouter.get(
  '/badges',
  handler((req, res) => {
    const context = auth(req);
    const db = getDb();
    const dmMessages = (
      db
        .prepare(
          'SELECT COALESCE(SUM("unreadCount"), 0) AS n FROM "conversations" WHERE "userId" = ? AND "deletedAt" IS NULL',
        )
        .get(context.user.id) as { n: number }
    ).n;
    // One combined "chat" badge for both dm and system chat, since they are
    // one nav destination now — a thread counts once here, same as a dm
    // conversation's own unreadCount already treats "unread" as per-thread.
    const messages = dmMessages + unreadSystemChatThreads(context.scope.userId, context.scope.systemId);
    const friendRequests = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM "friendRequests" WHERE "toUserId" = ? AND "status" = 'pending' AND "deletedAt" IS NULL`,
        )
        .get(context.user.id) as { n: number }
    ).n;
    const byCategory = unreadByCategory(context.user.id);

    ok(res, {
      notifications: unreadCount(context.user.id),
      messages,
      friendRequests,
      flux: byCategory['fluxActivity'] ?? 0,
      total: unreadCount(context.user.id) + messages + friendRequests,
    });
  }),
);

notificationsRouter.post(
  '/read',
  handler((req, res) => {
    const context = auth(req);
    const { ids, category, all } = req.body as { ids?: string[]; category?: string; all?: boolean };
    const changed = all || !ids?.length ? markAllRead(context.user.id, category) : markRead(context.user.id, ids);
    ok(res, { read: changed, unread: unreadCount(context.user.id) });
  }),
);

notificationsRouter.delete(
  '/:id',
  handler((req, res) => {
    const context = auth(req);
    getDb()
      .prepare('UPDATE "notifications" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(new Date().toISOString(), new Date().toISOString(), String(req.params['id']), context.user.id);
    ok(res, { deleted: true });
  }),
);

notificationsRouter.delete(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const timestamp = new Date().toISOString();
    const changed = getDb()
      .prepare(
        'UPDATE "notifications" SET "deletedAt" = ?, "updatedAt" = ? WHERE "userId" = ? AND "readAt" IS NOT NULL AND "deletedAt" IS NULL',
      )
      .run(timestamp, timestamp, context.user.id).changes;
    ok(res, { cleared: changed });
  }),
);
