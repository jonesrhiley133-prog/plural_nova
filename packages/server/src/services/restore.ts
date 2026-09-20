import {
  getCollection,
  now,
  type ConflictStrategy,
  type StoredRecord,
} from '@pluralnova/shared';
import { getDb } from '../db/index.js';
import { BASE_COLUMN_NAMES, ownFields } from '../db/ddl.js';
import { encodeValue } from '../db/repository.js';
import type { Scope } from '../db/repository.js';

/**
 * Bulk restore.
 *
 * Shared by backup restore, import and demo seeding. Three properties matter
 * more than speed here:
 *
 *   • One row failing never aborts the rest — it is counted and reported.
 *   • Nothing is deleted. `replace` overwrites rows with the same id and leaves
 *     everything else alone; there is no code path that empties a table.
 *   • Ownership is rewritten to the restoring account, so a backup can never
 *     insert rows belonging to someone else.
 */

export interface RestoreReport {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  byCollection: Record<string, { imported: number; updated: number; skipped: number; failed: number }>;
  problems: { collection: string; id: string; reason: string }[];
}

function emptyReport(): RestoreReport {
  return { imported: 0, updated: 0, skipped: 0, failed: 0, byCollection: {}, problems: [] };
}

export function restoreCollections(
  scope: Scope,
  collections: Record<string, StoredRecord[]>,
  strategy: ConflictStrategy = 'merge',
  only: string[] = [],
): RestoreReport {
  const report = emptyReport();
  const db = getDb();
  const wanted = new Set(only);

  for (const [name, rows] of Object.entries(collections)) {
    if (wanted.size > 0 && !wanted.has(name)) continue;
    const collection = getCollection(name);
    if (!collection || !Array.isArray(rows)) continue;

    const stats = { imported: 0, updated: 0, skipped: 0, failed: 0 };
    report.byCollection[name] = stats;

    const fields = ownFields(collection);
    const columns = [...BASE_COLUMN_NAMES, ...fields.map((f) => f.name)];
    const insert = db.prepare(
      `INSERT INTO "${name}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
    );
    const exists = db.prepare(`SELECT "version" FROM "${name}" WHERE "id" = ? AND "userId" = ?`);
    const remove = db.prepare(`DELETE FROM "${name}" WHERE "id" = ? AND "userId" = ?`);

    const applyRow = db.transaction((row: StoredRecord) => {
      const id = String(row.id ?? '');
      if (!id) throw new Error('missing id');

      const current = exists.get(id, scope.userId) as { version: number } | undefined;
      if (current) {
        if (strategy === 'skipExisting') {
          stats.skipped += 1;
          return;
        }
        if (strategy === 'merge' && Number(row.version ?? 1) <= current.version) {
          // The stored copy is the same age or newer, so the file has nothing
          // to add. This is what makes restoring a backup twice a no-op.
          stats.skipped += 1;
          return;
        }
        remove.run(id, scope.userId);
        stats.updated += 1;
      } else {
        stats.imported += 1;
      }

      const timestamp = now();
      const values: unknown[] = [
        id,
        scope.userId,
        collection.scope === 'system' ? scope.systemId : (row.systemId as string) ?? scope.systemId,
        collection.memberScoped ? (row.memberId as string) ?? null : null,
        (row.visibility as string) ?? 'private',
        (row.createdAt as string) ?? timestamp,
        (row.updatedAt as string) ?? timestamp,
        (row.deletedAt as string) ?? null,
        Number(row.version ?? 1),
      ];
      for (const field of fields) values.push(encodeValue(field, row[field.name] ?? field.defaultValue ?? null));
      insert.run(...(values as never[]));
    });

    for (const row of rows) {
      try {
        applyRow(row);
      } catch (error) {
        stats.failed += 1;
        report.problems.push({
          collection: name,
          id: String(row?.id ?? '(no id)'),
          reason: error instanceof Error ? error.message : 'Could not be written.',
        });
      }
    }

    report.imported += stats.imported;
    report.updated += stats.updated;
    report.skipped += stats.skipped;
    report.failed += stats.failed;
  }

  return report;
}

/** Removes every record belonging to a system, used by "start over" and account purge. */
export function purgeSystemData(scope: Scope, collectionNames: string[]): number {
  const db = getDb();
  let removed = 0;
  for (const name of collectionNames) {
    const collection = getCollection(name);
    if (!collection) continue;
    const sql =
      collection.scope === 'system' && scope.systemId
        ? `DELETE FROM "${name}" WHERE "userId" = ? AND "systemId" = ?`
        : `DELETE FROM "${name}" WHERE "userId" = ?`;
    const params = collection.scope === 'system' && scope.systemId ? [scope.userId, scope.systemId] : [scope.userId];
    removed += db.prepare(sql).run(...params).changes;
  }
  return removed;
}
