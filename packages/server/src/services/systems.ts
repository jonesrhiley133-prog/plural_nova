import { DEFAULT_ACCENT, newId, now, type StoredRecord } from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import { deserialize } from '../db/repository.js';
import { requireCollection } from '@pluralnova/shared';
import { updateUser, type UserRow } from '../auth/users.js';
import { recordHistory, historyPhrases } from './history.js';

/**
 * Systems.
 *
 * An account always has at least one, created during registration, because a
 * zero-system account has nowhere to put a member and every screen would have
 * to special-case it. A zero-*member* system, on the other hand, is a normal
 * state and is handled with an empty state, not an error.
 */

export function createSystem(
  user: UserRow,
  input: { name?: string; description?: string; systemType?: string; accent?: string } = {},
): StoredRecord {
  const timestamp = now();
  const id = newId('sys');
  getDb()
    .prepare(
      `INSERT INTO "systems"
        ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
         "name","pronouns","description","systemType","avatarUrl","bannerUrl","avatarFocus","bannerFocus",
         "accent","memberCount","terminology","privacy","archived")
       VALUES (?,?,?,NULL,'private',?,?,NULL,1,?,'',?,?,'','',NULL,NULL,?,0,NULL,NULL,0)`,
    )
    .run(
      id,
      user.id,
      id,
      timestamp,
      timestamp,
      input.name?.trim() || `${user.displayName}’s system`,
      input.description ?? '',
      input.systemType ?? '',
      input.accent ?? DEFAULT_ACCENT,
    );

  const created = getSystem(user.id, id);
  if (!created) throw new Error('System was not created.');
  recordHistory(
    { userId: user.id, systemId: id },
    {
      eventType: 'system.created',
      summary: historyPhrases.systemCreated(created['name'] as string),
      entityType: 'systems',
      entityId: id,
    },
  );
  return created;
}

export function getSystem(userId: string, systemId: string): StoredRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM "systems" WHERE "userId" = ? AND "id" = ? AND "deletedAt" IS NULL')
    .get(userId, systemId) as Record<string, unknown> | undefined;
  return row ? deserialize(requireCollection('systems'), row) : null;
}

export function listSystems(userId: string): StoredRecord[] {
  const rows = getDb()
    .prepare('SELECT * FROM "systems" WHERE "userId" = ? AND "deletedAt" IS NULL ORDER BY "createdAt" ASC')
    .all(userId) as Record<string, unknown>[];
  return rows.map((row) => deserialize(requireCollection('systems'), row));
}

/**
 * Returns the account's active system, creating one if the account somehow has
 * none. Called on every session start so a half-finished registration or a
 * restored backup never lands the user in a state with no system at all.
 */
export function ensureActiveSystem(user: UserRow): { user: UserRow; system: StoredRecord } {
  if (user.activeSystemId) {
    const existing = getSystem(user.id, user.activeSystemId);
    if (existing) return { user, system: existing };
  }
  const systems = listSystems(user.id);
  const system = systems[0] ?? createSystem(user);
  const updated = updateUser(user.id, { activeSystemId: system['id'] as string });
  return { user: updated, system };
}

export function refreshMemberCount(userId: string, systemId: string): number {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS n FROM "members" WHERE "userId" = ? AND "systemId" = ? AND "deletedAt" IS NULL',
    )
    .get(userId, systemId) as { n: number };
  getDb()
    .prepare('UPDATE "systems" SET "memberCount" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
    .run(row.n, now(), systemId, userId);
  return row.n;
}
