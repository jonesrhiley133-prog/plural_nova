import Database from 'better-sqlite3';
import { COLLECTIONS, newId, now } from '@pluralnova/shared';
import { config, ensureDirectories } from '../config.js';
import { allStatements, columnDefinition, ownFields } from './ddl.js';

export type Db = Database.Database;

let connection: Db | null = null;

export function getDb(): Db {
  if (!connection) throw new Error('Database has not been opened yet.');
  return connection;
}

export function openDatabase(file: string = config.databaseFile): Db {
  ensureDirectories();
  const db = new Database(file);
  // WAL keeps reads from blocking on writes, which matters because sync pulls
  // and realtime fan-out both read while a request is writing.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  connection = db;
  return db;
}

export function closeDatabase(): void {
  connection?.close();
  connection = null;
}

/** Columns added to a fixed (non-registry) table after its `CREATE TABLE` first shipped. */
const FIXED_TABLE_COLUMNS: Record<string, Record<string, string>> = {
  users: {
    appLockPinHash: 'TEXT',
    appLockPinSalt: 'TEXT',
  },
  sessions: {
    appLockUnlockedUntil: 'TEXT',
    webauthnChallenge: 'TEXT',
  },
};

/**
 * The old System Chat was one shared room per system with named channels
 * rather than real threads. Every distinct channel a system actually used
 * becomes a `systemChatThreads` row (kind `system`), and every message that
 * predates threads is pointed at the one for its channel — so existing system
 * chat history survives the move to threads unchanged, just reorganised.
 *
 * Idempotent: it only ever looks at messages that still have no `threadId`,
 * so a boot with nothing left to backfill runs one query and stops.
 */
function backfillSystemChatThreads(db: Db): number {
  const pending = db
    .prepare(
      `SELECT DISTINCT userId, systemId, COALESCE(channel, 'general') as channel
       FROM systemChatMessages
       WHERE deletedAt IS NULL AND (threadId IS NULL OR threadId = '') AND systemId IS NOT NULL`,
    )
    .all() as { userId: string; systemId: string; channel: string }[];

  let migrated = 0;
  for (const row of pending) {
    let thread = db
      .prepare(
        `SELECT id FROM systemChatThreads
         WHERE systemId = ? AND kind = 'system' AND name = ? AND deletedAt IS NULL`,
      )
      .get(row.systemId, row.channel) as { id: string } | undefined;

    if (!thread) {
      const id = newId('sct');
      const timestamp = now();
      db.prepare(
        `INSERT INTO systemChatThreads
           (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
            kind, name, participantMemberIds, lastMessageAt, lastMessagePreview, lastReadAt,
            pinned, muted, archived, settings)
         VALUES (@id, @userId, @systemId, NULL, 'private', @createdAt, @updatedAt, NULL, 1,
            'system', @name, '[]', NULL, NULL, NULL, 0, 0, 0, NULL)`,
      ).run({
        id,
        userId: row.userId,
        systemId: row.systemId,
        createdAt: timestamp,
        updatedAt: timestamp,
        name: row.channel,
      });
      thread = { id };
    }

    const result = db
      .prepare(
        `UPDATE systemChatMessages SET threadId = ?
         WHERE systemId = ? AND COALESCE(channel, 'general') = ? AND (threadId IS NULL OR threadId = '')`,
      )
      .run(thread.id, row.systemId, row.channel);
    migrated += result.changes;
  }
  return migrated;
}

/**
 * Brings the database up to the registry's shape.
 *
 * Tables are created if missing and columns are added if the registry grew,
 * which is the whole migration story for record tables: a field added to a
 * collection appears as a nullable column on the next boot, and existing rows
 * keep working because every field is optional at the storage layer.
 *
 * Column removals are deliberately not automated — dropping a column drops the
 * data in it, and that should be a decision someone makes on purpose.
 */
export function migrate(db: Db): { created: string[]; addedColumns: string[]; backfilledChatThreads: number } {
  const created: string[] = [];
  const addedColumns: string[] = [];
  let backfilledChatThreads = 0;

  db.exec('BEGIN');
  try {
    for (const statement of allStatements()) db.exec(statement);

    for (const collection of COLLECTIONS) {
      const existing = new Set(
        db
          .prepare(`PRAGMA table_info("${collection.name}")`)
          .all()
          .map((row) => (row as { name: string }).name),
      );
      for (const field of ownFields(collection)) {
        if (existing.has(field.name)) continue;
        db.exec(`ALTER TABLE "${collection.name}" ADD COLUMN ${columnDefinition(field)}`);
        addedColumns.push(`${collection.name}.${field.name}`);
      }
    }

    /*
     * The fixed tables (users, sessions, ...) aren't registry-driven, so a
     * column added to one after it first shipped needs its own entry here —
     * the same PRAGMA-then-ALTER technique as above, just spelled out by hand
     * since there's no schema to derive it from.
     */
    for (const [table, columns] of Object.entries(FIXED_TABLE_COLUMNS)) {
      const existing = new Set(
        db
          .prepare(`PRAGMA table_info("${table}")`)
          .all()
          .map((row) => (row as { name: string }).name),
      );
      for (const [name, sql] of Object.entries(columns)) {
        if (existing.has(name)) continue;
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${sql}`);
        addedColumns.push(`${table}.${name}`);
      }
    }

    const version = db.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as
      | { value: string }
      | undefined;
    if (!version) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schemaVersion', '1');
      created.push('schema');
    }

    // Runs last, once systemChatThreads and systemChatMessages.threadId both
    // definitely exist from the steps above.
    backfilledChatThreads = backfillSystemChatThreads(db);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { created, addedColumns, backfilledChatThreads };
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

/** Runs `fn` inside a transaction; better-sqlite3 handles nesting via savepoints. */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}
