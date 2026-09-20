import {
  ACHIEVEMENTS,
  evaluateAchievements,
  newId,
  now,
  type AchievementMetric,
} from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import type { Scope } from '../db/repository.js';
import { findUserById, readSettings } from '../auth/users.js';
import { notify } from './notifications.js';

/**
 * Achievements are evaluated from the database rather than incremented by
 * callers, so they stay correct after an import, a restore, or a deletion —
 * the count is whatever is actually there.
 */

function countRows(table: string, scope: Scope, extraSql = '', params: unknown[] = []): number {
  const clauses = ['"userId" = ?', '"deletedAt" IS NULL'];
  const values: unknown[] = [scope.userId];
  if (scope.systemId) {
    clauses.push('"systemId" = ?');
    values.push(scope.systemId);
  }
  if (extraSql) clauses.push(extraSql);
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${clauses.join(' AND ')}`)
    .get(...values, ...params) as { n: number };
  return row.n;
}

function distinctTrackingDays(scope: Scope): number {
  const sources = [
    ['frontEvents', 'startedAt'],
    ['journalEntries', 'entryDate'],
    ['moodEntries', 'recordedAt'],
    ['emotionEntries', 'recordedAt'],
    ['sleepEntries', 'startedAt'],
  ] as const;
  const days = new Set<string>();
  for (const [table, column] of sources) {
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT substr("${column}", 1, 10) AS day FROM "${table}"
         WHERE "userId" = ? AND "deletedAt" IS NULL AND "${column}" IS NOT NULL`,
      )
      .all(scope.userId) as { day: string }[];
    for (const row of rows) if (row.day) days.add(row.day);
  }
  return days.size;
}

function taskStreakDays(scope: Scope): number {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT substr("completedAt", 1, 10) AS day FROM "tasks"
       WHERE "userId" = ? AND "deletedAt" IS NULL AND "completedAt" IS NOT NULL
       ORDER BY day DESC`,
    )
    .all(scope.userId) as { day: string }[];
  let streak = 0;
  let cursor = new Date();
  for (const row of rows) {
    const expected = cursor.toISOString().slice(0, 10);
    if (row.day === expected) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    } else if (row.day < expected) {
      break;
    }
  }
  return streak;
}

export function collectMetrics(scope: Scope): Partial<Record<AchievementMetric, number>> {
  return {
    'members.count': countRows('members', scope),
    'frontEvents.count': countRows('frontEvents', scope),
    'journalEntries.count': countRows('journalEntries', scope),
    'notes.count': countRows('notes', scope),
    'tasks.completed': countRows('tasks', scope, '"completed" = 1'),
    'tasks.streakDays': taskStreakDays(scope),
    'calendarEvents.count': countRows('calendarEvents', scope),
    'emotionEntries.count': countRows('emotionEntries', scope),
    'sleepEntries.count': countRows('sleepEntries', scope),
    'subsystems.count': countRows('subsystems', scope),
    'relationships.count': countRows('relationships', scope),
    'polls.count': countRows('polls', scope),
    'headspaceObjects.count': countRows('headspaceObjects', scope),
    'stories.count': countRows('stories', scope),
    trackingDays: distinctTrackingDays(scope),
    'backups.count': (
      getDb().prepare('SELECT COUNT(*) AS n FROM backups WHERE userId = ?').get(scope.userId) as {
        n: number;
      }
    ).n,
  };
}

/** Evaluates and records anything newly earned. Returns the keys unlocked now. */
export async function checkAchievements(scope: Scope): Promise<string[]> {
  const user = findUserById(scope.userId);
  if (!user) return [];
  const settings = readSettings(user);
  if (!settings.achievementsEnabled) return [];

  const unlocked = new Set(
    (
      getDb()
        .prepare(
          'SELECT achievementKey FROM "achievements" WHERE "userId" = ? AND "deletedAt" IS NULL',
        )
        .all(scope.userId) as { achievementKey: string }[]
    ).map((row) => row.achievementKey),
  );

  const earned = evaluateAchievements(collectMetrics(scope), unlocked);
  if (earned.length === 0) return [];

  const timestamp = now();
  const insert = getDb().prepare(
    `INSERT INTO "achievements"
      ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
       "achievementKey","unlockedAt","progress","seen")
     VALUES (?,?,?,NULL,'system',?,?,NULL,1,?,?,0,0)`,
  );
  for (const achievement of earned) {
    insert.run(newId('ach'), scope.userId, scope.systemId, timestamp, timestamp, achievement.key, timestamp);
  }

  if (settings.achievementToasts) {
    for (const achievement of earned) {
      await notify({
        userId: scope.userId,
        category: 'achievements',
        kind: 'achievement.unlocked',
        title: achievement.label,
        body: achievement.description,
        link: '/achievements',
      });
    }
  }

  return earned.map((a) => a.key);
}

export function achievementCatalogue(): typeof ACHIEVEMENTS {
  return ACHIEVEMENTS;
}
