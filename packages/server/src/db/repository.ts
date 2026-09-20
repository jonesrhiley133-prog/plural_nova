import {
  newId,
  now,
  requireCollection,
  validateRecord,
  type CollectionDef,
  type FieldDef,
  type StoredRecord,
  type Visibility,
} from '@pluralnova/shared';
import { getDb } from './index.js';
import { BASE_COLUMN_NAMES, ownFields } from './ddl.js';
import { conflict, notFound, validationFailed } from '../http/errors.js';

/**
 * The scoped record store.
 *
 * Every read and write here takes a `Scope` and every generated statement
 * includes it. There is no code path that reads a record table without an owner
 * filter, which is what makes "permissions are enforced server-side" true by
 * construction rather than by remembering.
 */

export interface Scope {
  userId: string;
  systemId: string | null;
}

/** Fields stored as JSON text rather than a scalar column. */
const JSON_KINDS = new Set(['json', 'tags', 'refs']);

function isJsonField(field: FieldDef): boolean {
  return JSON_KINDS.has(field.kind);
}

function encodeValue(field: FieldDef, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (isJsonField(field)) return JSON.stringify(value);
  if (field.kind === 'bool') return value ? 1 : 0;
  return value;
}

function decodeValue(field: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined) {
    if (field.kind === 'tags' || field.kind === 'refs') return [];
    if (field.kind === 'bool') return false;
    return null;
  }
  if (isJsonField(field)) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      // A malformed JSON column should not take the whole list down with it.
      return field.kind === 'json' ? null : [];
    }
  }
  if (field.kind === 'bool') return value === 1 || value === true;
  return value;
}

export function deserialize(collection: CollectionDef, row: Record<string, unknown>): StoredRecord {
  const out: Record<string, unknown> = {};
  for (const name of BASE_COLUMN_NAMES) out[name] = row[name] ?? null;
  for (const field of ownFields(collection)) out[field.name] = decodeValue(field, row[field.name]);
  return out as StoredRecord;
}

export interface ListQuery {
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
  memberId?: string | null;
  search?: string;
  /** Exact-match filters, restricted to fields the collection actually declares. */
  filters?: Record<string, string | number | boolean | null>;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** Half-open range filter on a datetime field. */
  range?: { field: string; from?: string; to?: string };
}

export interface ListResult {
  items: StoredRecord[];
  nextCursor: string | null;
  total: number;
}

function scopeClause(collection: CollectionDef, scope: Scope): { sql: string; params: unknown[] } {
  const parts = ['"userId" = ?'];
  const params: unknown[] = [scope.userId];
  if (collection.scope === 'system' && scope.systemId) {
    parts.push('"systemId" = ?');
    params.push(scope.systemId);
  }
  return { sql: parts.join(' AND '), params };
}

function sortColumn(collection: CollectionDef, requested?: string): string {
  const known = new Set([...BASE_COLUMN_NAMES, ...collection.fields.map((f) => f.name)]);
  if (requested && known.has(requested)) return requested;
  if (collection.sortField && known.has(collection.sortField)) return collection.sortField;
  return 'updatedAt';
}

export function listRecords(
  collectionName: string,
  scope: Scope,
  query: ListQuery = {},
): ListResult {
  const collection = requireCollection(collectionName);
  const db = getDb();
  const { sql: scopeSql, params: scopeParams } = scopeClause(collection, scope);

  const where: string[] = [scopeSql];
  const params: unknown[] = [...scopeParams];

  if (!query.includeDeleted) where.push('"deletedAt" IS NULL');

  if (query.memberId !== undefined && collection.memberScoped) {
    if (query.memberId === null) where.push('"memberId" IS NULL');
    else {
      where.push('"memberId" = ?');
      params.push(query.memberId);
    }
  }

  const knownFields = new Map(collection.fields.map((f) => [f.name, f]));
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    const field = knownFields.get(key);
    if (!field && !BASE_COLUMN_NAMES.includes(key)) continue;
    if (value === null) {
      where.push(`"${key}" IS NULL`);
    } else {
      where.push(`"${key}" = ?`);
      params.push(field ? encodeValue(field, value) : value);
    }
  }

  if (query.range && knownFields.has(query.range.field)) {
    if (query.range.from) {
      where.push(`"${query.range.field}" >= ?`);
      params.push(query.range.from);
    }
    if (query.range.to) {
      where.push(`"${query.range.field}" < ?`);
      params.push(query.range.to);
    }
  }

  const searchTerm = query.search?.trim();
  if (searchTerm) {
    const searchable = collection.fields.filter((fieldDef) => fieldDef.searchable);
    if (searchable.length > 0) {
      where.push(`(${searchable.map((fieldDef) => `"${fieldDef.name}" LIKE ?`).join(' OR ')})`);
      for (let i = 0; i < searchable.length; i += 1) params.push(`%${searchTerm}%`);
    }
  }

  const whereSql = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM "${collection.name}" WHERE ${whereSql}`).get(...params) as {
      n: number;
    }
  ).n;

  const column = sortColumn(collection, query.sortField);
  const direction = (query.sortDir ?? collection.sortDir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;

  const rows = db
    .prepare(
      `SELECT * FROM "${collection.name}" WHERE ${whereSql}
       ORDER BY "${column}" ${direction} NULLS LAST, "id" ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Record<string, unknown>[];

  const items = rows.map((row) => deserialize(collection, row));
  const consumed = offset + items.length;
  return { items, nextCursor: consumed < total ? String(consumed) : null, total };
}

export function getRecord(
  collectionName: string,
  scope: Scope,
  id: string,
  options: { includeDeleted?: boolean } = {},
): StoredRecord | null {
  const collection = requireCollection(collectionName);
  const { sql, params } = scopeClause(collection, scope);
  const deletedClause = options.includeDeleted ? '' : ' AND "deletedAt" IS NULL';
  const row = getDb()
    .prepare(`SELECT * FROM "${collection.name}" WHERE ${sql} AND "id" = ?${deletedClause}`)
    .get(...params, id) as Record<string, unknown> | undefined;
  return row ? deserialize(collection, row) : null;
}

export function requireRecord(collectionName: string, scope: Scope, id: string): StoredRecord {
  const record = getRecord(collectionName, scope, id);
  if (!record) throw notFound(requireCollection(collectionName).singular);
  return record;
}

export interface WriteOptions {
  /** Supplied by an offline client so a replayed operation is idempotent. */
  id?: string;
  /** Rejects the write when the stored row has moved on. */
  expectedVersion?: number;
  visibility?: Visibility;
  memberId?: string | null;
  /** Skips validation for trusted internal writes (restore, demo seeding). */
  trusted?: boolean;
}

export function createRecord(
  collectionName: string,
  scope: Scope,
  input: Record<string, unknown>,
  options: WriteOptions = {},
): StoredRecord {
  const collection = requireCollection(collectionName);
  const prefix = collectionName.slice(0, 3).toLowerCase();

  let values: Record<string, unknown>;
  if (options.trusted) {
    values = { ...input };
  } else {
    const result = validateRecord(collection, input, { partial: false });
    if (!result.ok) throw validationFailed(result.errors);
    values = result.values;
  }

  const timestamp = now();
  const record: Record<string, unknown> = {
    id: options.id ?? (input['id'] as string) ?? newId(prefix),
    userId: scope.userId,
    systemId: collection.scope === 'system' ? scope.systemId : (input['systemId'] as string) ?? scope.systemId,
    memberId: collection.memberScoped ? options.memberId ?? (values['memberId'] as string) ?? null : null,
    visibility: options.visibility ?? (values['visibility'] as Visibility) ?? 'private',
    createdAt: (input['createdAt'] as string) ?? timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    version: 1,
  };

  for (const field of ownFields(collection)) {
    const supplied = Object.prototype.hasOwnProperty.call(values, field.name);
    const raw = supplied ? values[field.name] : field.defaultValue ?? null;
    record[field.name] = encodeValue(field, raw);
  }

  const columns = Object.keys(record);
  getDb()
    .prepare(
      `INSERT INTO "${collection.name}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...columns.map((c) => record[c] as never));

  return requireRecord(collectionName, scope, record['id'] as string);
}

export function updateRecord(
  collectionName: string,
  scope: Scope,
  id: string,
  input: Record<string, unknown>,
  options: WriteOptions = {},
): StoredRecord {
  const collection = requireCollection(collectionName);
  const existing = requireRecord(collectionName, scope, id);

  if (options.expectedVersion !== undefined && existing.version !== options.expectedVersion) {
    throw conflict(
      'This record changed somewhere else since you opened it. Review both versions before saving.',
    );
  }

  let values: Record<string, unknown>;
  if (options.trusted) {
    values = { ...input };
  } else {
    const result = validateRecord(collection, input, { partial: true });
    if (!result.ok) throw validationFailed(result.errors);
    values = result.values;
  }

  const assignments: string[] = ['"updatedAt" = ?', '"version" = "version" + 1'];
  const params: unknown[] = [now()];

  if (options.visibility || values['visibility']) {
    assignments.push('"visibility" = ?');
    params.push(options.visibility ?? values['visibility']);
  }
  if (collection.memberScoped && (options.memberId !== undefined || 'memberId' in values)) {
    assignments.push('"memberId" = ?');
    params.push(options.memberId ?? values['memberId'] ?? null);
  }

  for (const field of ownFields(collection)) {
    if (!Object.prototype.hasOwnProperty.call(values, field.name)) continue;
    assignments.push(`"${field.name}" = ?`);
    params.push(encodeValue(field, values[field.name]));
  }

  const { sql, params: scopeParams } = scopeClause(collection, scope);
  getDb()
    .prepare(`UPDATE "${collection.name}" SET ${assignments.join(', ')} WHERE ${sql} AND "id" = ?`)
    .run(...params, ...scopeParams, id);

  return requireRecord(collectionName, scope, id);
}

/**
 * Soft delete. Rows keep their data and leave a `deletedAt` marker so the trash
 * can restore them and so a sync pull can tell other devices the row is gone.
 */
export function deleteRecord(collectionName: string, scope: Scope, id: string): StoredRecord {
  const collection = requireCollection(collectionName);
  const existing = requireRecord(collectionName, scope, id);
  const { sql, params } = scopeClause(collection, scope);
  const timestamp = now();
  getDb()
    .prepare(
      `UPDATE "${collection.name}" SET "deletedAt" = ?, "updatedAt" = ?, "version" = "version" + 1
       WHERE ${sql} AND "id" = ?`,
    )
    .run(timestamp, timestamp, ...params, id);
  return { ...existing, deletedAt: timestamp, updatedAt: timestamp, version: existing.version + 1 };
}

export function restoreRecord(collectionName: string, scope: Scope, id: string): StoredRecord {
  const collection = requireCollection(collectionName);
  const { sql, params } = scopeClause(collection, scope);
  const timestamp = now();
  const result = getDb()
    .prepare(
      `UPDATE "${collection.name}" SET "deletedAt" = NULL, "updatedAt" = ?, "version" = "version" + 1
       WHERE ${sql} AND "id" = ?`,
    )
    .run(timestamp, ...params, id);
  if (result.changes === 0) throw notFound(collection.singular);
  return requireRecord(collectionName, scope, id);
}

/** Permanent removal. Only ever reached from an explicit "delete forever". */
export function purgeRecord(collectionName: string, scope: Scope, id: string): void {
  const collection = requireCollection(collectionName);
  const { sql, params } = scopeClause(collection, scope);
  getDb().prepare(`DELETE FROM "${collection.name}" WHERE ${sql} AND "id" = ?`).run(...params, id);
}

export function countRecords(
  collectionName: string,
  scope: Scope,
  filters: Record<string, unknown> = {},
): number {
  const collection = requireCollection(collectionName);
  const { sql, params } = scopeClause(collection, scope);
  const where = [sql, '"deletedAt" IS NULL'];
  const values = [...params];
  const knownFields = new Map(collection.fields.map((f) => [f.name, f]));
  for (const [key, value] of Object.entries(filters)) {
    const field = knownFields.get(key);
    if (!field && !BASE_COLUMN_NAMES.includes(key)) continue;
    where.push(`"${key}" = ?`);
    values.push(field ? encodeValue(field, value) : value);
  }
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM "${collection.name}" WHERE ${where.join(' AND ')}`)
    .get(...values) as { n: number };
  return row.n;
}

/** Everything changed since `since`, used by the sync pull. */
export function changedSince(
  collectionName: string,
  scope: Scope,
  since: string,
  limit = 500,
): StoredRecord[] {
  const collection = requireCollection(collectionName);
  const { sql, params } = scopeClause(collection, scope);
  const rows = getDb()
    .prepare(
      `SELECT * FROM "${collection.name}" WHERE ${sql} AND "updatedAt" > ?
       ORDER BY "updatedAt" ASC LIMIT ?`,
    )
    .all(...params, since, limit) as Record<string, unknown>[];
  return rows.map((row) => deserialize(collection, row));
}

export function allRecords(collectionName: string, scope: Scope): StoredRecord[] {
  const collection = requireCollection(collectionName);
  const parts = ['"userId" = ?'];
  const params: unknown[] = [scope.userId];
  if (collection.scope === 'system' && scope.systemId) {
    parts.push('"systemId" = ?');
    params.push(scope.systemId);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM "${collection.name}" WHERE ${parts.join(' AND ')}`)
    .all(...params) as Record<string, unknown>[];
  return rows.map((row) => deserialize(collection, row));
}

export { encodeValue, decodeValue };
