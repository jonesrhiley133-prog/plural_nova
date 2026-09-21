import { newId, now } from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import type { Scope } from '../db/repository.js';

/**
 * The system history log.
 *
 * Written from the server rather than the client, so the record of what changed
 * cannot disagree with what actually changed. Entries are plain sentences
 * because this is something a system reads, not a debug trace.
 */

export interface HistoryInput {
  eventType: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  memberId?: string | null;
  note?: string;
  meta?: Record<string, unknown> | null;
  automatic?: boolean;
}

export function recordHistory(scope: Scope, input: HistoryInput): void {
  if (!scope.systemId) return;
  const timestamp = now();
  getDb()
    .prepare(
      `INSERT INTO "systemHistory"
        ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
         "eventType","summary","entityType","entityId","occurredAt","note","meta","automatic")
       VALUES (?,?,?,?,?,?,?,NULL,1,?,?,?,?,?,?,?,?)`,
    )
    .run(
      newId('hst'),
      scope.userId,
      scope.systemId,
      input.memberId ?? null,
      'system',
      timestamp,
      timestamp,
      input.eventType,
      input.summary,
      input.entityType ?? '',
      input.entityId ?? '',
      timestamp,
      input.note ?? '',
      input.meta ? JSON.stringify(input.meta) : null,
      input.automatic === false ? 0 : 1,
    );
}

/** Human phrasing for the automatic entries, kept in one place. */
export const historyPhrases = {
  memberCreated: (name: string) => `${name} was added`,
  memberUpdated: (name: string) => `${name}’s profile was updated`,
  memberDeleted: (name: string) => `${name} was removed`,
  frontStarted: (name: string) => `${name} started fronting`,
  frontEnded: (name: string, duration: string) => `${name} stopped fronting after ${duration}`,
  frontCleared: () => 'The front was cleared',
  coFrontChanged: (names: string) => `Co-fronting changed to ${names}`,
  relationshipChanged: (label: string) => `A relationship was updated: ${label}`,
  settingChanged: (what: string) => `${what} was changed`,
  systemCreated: (name: string) => `${name} was created`,
  imported: (count: number) => `${count} record${count === 1 ? '' : 's'} were imported`,
  restored: (count: number) => `${count} record${count === 1 ? '' : 's'} were restored from a backup`,
} as const;
