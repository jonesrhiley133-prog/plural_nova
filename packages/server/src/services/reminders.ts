import { now, type NotificationCategory } from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import { notify } from './notifications.js';

/**
 * Reminder delivery.
 *
 * Tasks, events and shifts carry a `remindAt`. A sweep runs on a timer, picks
 * up whatever has come due, delivers it through the normal notification path —
 * so the user's category preferences and quiet hours apply — and marks it sent
 * so it is never delivered twice.
 */

interface DueRow {
  id: string;
  userId: string;
  title: string;
  remindAt: string;
  when: string | null;
}

const SOURCES: {
  table: string;
  titleColumn: string;
  whenColumn: string;
  /** Delivered as-is when set, instead of the computed "Due <when>" body — for a source with its own message rather than a due date. */
  bodyColumn?: string;
  category: NotificationCategory;
  kind: string;
  link: string;
  label: string;
}[] = [
  {
    table: 'tasks',
    titleColumn: 'title',
    whenColumn: 'dueAt',
    category: 'tasks',
    kind: 'task.reminder',
    link: '/tasks',
    label: 'Task',
  },
  {
    table: 'assignments',
    titleColumn: 'name',
    whenColumn: 'dueAt',
    category: 'assignmentDue',
    kind: 'assignment.reminder',
    link: '/school/assignments',
    label: 'Assignment',
  },
  {
    table: 'calendarEvents',
    titleColumn: 'title',
    whenColumn: 'startsAt',
    category: 'events',
    kind: 'event.reminder',
    link: '/calendar',
    label: 'Event',
  },
  {
    table: 'workShifts',
    titleColumn: 'role',
    whenColumn: 'startsAt',
    category: 'events',
    kind: 'shift.reminder',
    link: '/work',
    label: 'Shift',
  },
  {
    table: 'reminders',
    titleColumn: 'title',
    whenColumn: 'remindAt',
    bodyColumn: 'body',
    category: 'customReminders',
    kind: 'reminder.custom',
    link: '/reminders',
    label: 'Reminder',
  },
];

export async function runReminderSweep(limit = 50): Promise<number> {
  const db = getDb();
  const timestamp = now();
  let delivered = 0;

  for (const source of SOURCES) {
    const bodySelect = source.bodyColumn ? `"${source.bodyColumn}"` : 'NULL';
    const rows = db
      .prepare(
        `SELECT "id", "userId", "${source.titleColumn}" AS title, "remindAt", "${source.whenColumn}" AS when_, ${bodySelect} AS body_
         FROM "${source.table}"
         WHERE "remindAt" IS NOT NULL AND "remindAt" != '' AND "remindAt" <= ?
           AND ("remindSent" IS NULL OR "remindSent" = 0) AND "deletedAt" IS NULL
         LIMIT ?`,
      )
      .all(timestamp, limit) as (DueRow & { when_: string | null; body_: string | null })[];

    for (const row of rows) {
      // Marked before delivery: a failed push is better than a loop that
      // re-notifies every minute because the send threw.
      db.prepare(`UPDATE "${source.table}" SET "remindSent" = 1, "updatedAt" = ? WHERE "id" = ?`).run(
        timestamp,
        row.id,
      );

      await notify({
        userId: row.userId,
        category: source.category,
        kind: source.kind,
        title: row.title?.trim() || `${source.label} reminder`,
        body: row.body_?.trim() || (row.when_ ? `Due ${new Date(row.when_).toLocaleString()}` : ''),
        link: source.link,
      }).catch((error: unknown) => {
        console.warn('[pluralnova] reminder delivery failed:', error);
      });
      delivered += 1;
    }
  }

  return delivered;
}

interface BirthdayRow {
  id: string;
  userId: string;
  name: string;
  birthday: string;
}

/**
 * Birthdays notify once a year, not once ever — they don't fit the
 * `remindAt`/`remindSent` shape above, which is built for a single instant.
 * `lastBirthdayNotifiedYear` plays the same "don't resend" role `remindSent`
 * plays for everything else, just scoped to a year instead of forever.
 */
export async function runBirthdayCheck(limit = 200): Promise<number> {
  const db = getDb();
  const today = new Date();
  const monthDay = `${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  const year = today.getUTCFullYear();
  let delivered = 0;

  const rows = db
    .prepare(
      `SELECT "id", "userId", "name", "birthday"
       FROM "members"
       WHERE "birthday" IS NOT NULL AND "birthday" != ''
         AND substr("birthday", 6, 5) = ?
         AND ("lastBirthdayNotifiedYear" IS NULL OR "lastBirthdayNotifiedYear" != ?)
         AND "deletedAt" IS NULL
       LIMIT ?`,
    )
    .all(monthDay, year, limit) as BirthdayRow[];

  for (const row of rows) {
    db.prepare(`UPDATE "members" SET "lastBirthdayNotifiedYear" = ?, "updatedAt" = ? WHERE "id" = ?`).run(
      year,
      now(),
      row.id,
    );

    await notify({
      userId: row.userId,
      category: 'birthdays',
      kind: 'birthday.annual',
      title: `${row.name || 'Someone'}'s birthday is today!`,
      link: '/calendar',
    }).catch((error: unknown) => {
      console.warn('[pluralnova] birthday notification failed:', error);
    });
    delivered += 1;
  }

  return delivered;
}
