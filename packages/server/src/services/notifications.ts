import {
  applyTerminology,
  newId,
  notificationAllowed,
  now,
  resolveTerminology,
  type NotificationCategory,
  type StoredRecord,
} from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import { findUserById, readSettings } from '../auth/users.js';
import { publish } from '../realtime/hub.js';
import { sendPush } from './push.js';

/**
 * Notification delivery.
 *
 * One entry point decides all four channels — in-app, foreground, push and
 * badge — by reading the account's saved preferences. Nothing else in the
 * server creates a notification, so a category the user switched off is off
 * everywhere, including on the lock screen.
 */

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  actorUserId?: string;
  actorMemberId?: string;
  meta?: Record<string, unknown>;
  /** Content that must never appear in a push payload (message text, vault items). */
  private?: boolean;
}

export async function notify(input: NotifyInput): Promise<StoredRecord | null> {
  const user = findUserById(input.userId);
  if (!user) return null;
  const settings = readSettings(user);

  if (!notificationAllowed(settings, input.category, 'inApp')) return null;

  // Titles and bodies are authored with {{tokens}} exactly like client-side
  // strings, so a switch/journal/etc. mention lands in the account's own
  // words even though it never passes through a React render.
  const terms = resolveTerminology(settings.terminology);
  const title = applyTerminology(input.title, terms);
  const body = input.body ? applyTerminology(input.body, terms) : input.body;

  const timestamp = now();
  const id = newId('ntf');
  getDb()
    .prepare(
      `INSERT INTO "notifications"
        ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
         "kind","title","body","category","link","readAt","meta","actorUserId","actorMemberId")
       VALUES (?,?,?,?,?,?,?,NULL,1,?,?,?,?,?,NULL,?,?,?)`,
    )
    .run(
      id,
      input.userId,
      user.activeSystemId,
      input.actorMemberId ?? null,
      'private',
      timestamp,
      timestamp,
      input.kind,
      title,
      (body ?? '').slice(0, 500),
      input.category,
      input.link ?? '',
      input.meta ? JSON.stringify(input.meta) : null,
      input.actorUserId ?? '',
      input.actorMemberId ?? null,
    );

  publish(input.userId, { type: 'notification.new', notificationId: id, category: input.category });

  if (notificationAllowed(settings, input.category, 'push')) {
    // Previews are suppressed for private content and whenever the account has
    // turned them off, so a locked screen shows that something arrived without
    // showing what it said.
    const showPreview = settings.privacy.showMessagePreviews && !input.private;
    await sendPush(input.userId, {
      title,
      body: showPreview ? body ?? '' : 'Open PluralNova to read it.',
      link: input.link ?? '/notifications',
      tag: input.kind,
      category: input.category,
      badgeCount: unreadCount(input.userId),
    }).catch((error: unknown) => {
      console.warn('[pluralnova] push failed:', error);
    });
  }

  return { id } as unknown as StoredRecord;
}

export function unreadCount(userId: string): number {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM "notifications" WHERE userId = ? AND deletedAt IS NULL AND readAt IS NULL',
    )
    .get(userId) as { n: number };
  return row.n;
}

export function unreadByCategory(userId: string): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT category, COUNT(*) AS n FROM "notifications"
       WHERE userId = ? AND deletedAt IS NULL AND readAt IS NULL GROUP BY category`,
    )
    .all(userId) as { category: string; n: number }[];
  const out: Record<string, number> = {};
  for (const row of rows) out[row.category] = row.n;
  return out;
}

export function markRead(userId: string, ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const result = getDb()
    .prepare(
      `UPDATE "notifications" SET readAt = ?, updatedAt = ?, version = version + 1
       WHERE userId = ? AND readAt IS NULL AND id IN (${placeholders})`,
    )
    .run(now(), now(), userId, ...ids);
  return result.changes;
}

export function markAllRead(userId: string, category?: string): number {
  const timestamp = now();
  const sql = category
    ? `UPDATE "notifications" SET readAt = ?, updatedAt = ?, version = version + 1
       WHERE userId = ? AND readAt IS NULL AND category = ?`
    : `UPDATE "notifications" SET readAt = ?, updatedAt = ?, version = version + 1
       WHERE userId = ? AND readAt IS NULL`;
  const params = category ? [timestamp, timestamp, userId, category] : [timestamp, timestamp, userId];
  return getDb().prepare(sql).run(...params).changes;
}
