import Database from 'better-sqlite3';
import { COLLECTIONS, newId, now } from '@pluralnova/shared';
import { config, ensureDirectories } from '../config.js';
import { allStatements, BASE_COLUMNS, columnDefinition, ownFields } from './ddl.js';

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
    avatarUrl: 'TEXT',
    bannerUrl: 'TEXT',
    bio: 'TEXT',
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
 * Direct and group system-chat threads used to store only the participants a
 * member picked when starting the chat, not the member who started it — which
 * the active-chatter thread-list filter now depends on knowing. Backfills
 * every distinct sender its own messages already prove was really part of the
 * conversation. A thread nobody has ever sent a message in is left as it was;
 * the first message sent in it goes through the normal create path, which
 * already records the sender as a participant going forward.
 *
 * Idempotent: re-running only ever adds ids to a thread's stored list, and a
 * thread whose list already names everyone its messages do is left untouched.
 */
function backfillThreadParticipants(db: Db): number {
  const threads = db
    .prepare(
      `SELECT id, participantMemberIds FROM systemChatThreads
       WHERE deletedAt IS NULL AND kind IN ('direct', 'group')`,
    )
    .all() as { id: string; participantMemberIds: string | null }[];

  let updated = 0;
  for (const thread of threads) {
    const senders = db
      .prepare(
        `SELECT DISTINCT memberId FROM systemChatMessages
         WHERE threadId = ? AND deletedAt IS NULL AND memberId IS NOT NULL AND memberId != ''`,
      )
      .all(thread.id) as { memberId: string }[];
    if (senders.length === 0) continue;

    let current: string[] = [];
    try {
      current = JSON.parse(thread.participantMemberIds || '[]') as string[];
    } catch {
      current = [];
    }
    const merged = [...new Set([...current, ...senders.map((row) => row.memberId)])];
    if (merged.length === current.length) continue;

    db.prepare('UPDATE systemChatThreads SET participantMemberIds = ? WHERE id = ?').run(
      JSON.stringify(merged),
      thread.id,
    );
    updated += 1;
  }
  return updated;
}

/**
 * `systemChatMessages.sequence` is new. The generic column-add step above
 * (`ALTER TABLE ... ADD COLUMN`, no SQL-level `DEFAULT`) leaves it `NULL` on
 * every row that already existed when this ran; a message created through
 * the normal API without one explicitly set gets the field's declared
 * default of `0` instead, via `validateFields`. Either way it means "never
 * sequenced" and is backfilled the same way: 1, 2, 3... in the order these
 * messages already rendered in (`sentAt`, tied-broken by `id` — the only
 * ordering that ever existed before this), then seeds that thread's row in
 * the generic `threads` support table (already created above by this same
 * migration, the first time it ever runs) so the next real send continues
 * the count correctly instead of starting back at 1.
 *
 * Idempotent: only ever looks at messages still sitting at `NULL`/`0`, so a
 * thread nothing is pending for is one query that finds zero rows.
 */
function backfillSystemChatMessageSequence(db: Db): number {
  const threads = db
    .prepare(
      `SELECT DISTINCT threadId FROM systemChatMessages
       WHERE deletedAt IS NULL AND (sequence IS NULL OR sequence = 0) AND threadId IS NOT NULL AND threadId != ''`,
    )
    .all() as { threadId: string }[];

  let migrated = 0;
  for (const { threadId } of threads) {
    const pending = db
      .prepare(
        `SELECT id FROM systemChatMessages
         WHERE threadId = ? AND deletedAt IS NULL AND (sequence IS NULL OR sequence = 0)
         ORDER BY sentAt ASC, id ASC`,
      )
      .all(threadId) as { id: string }[];
    if (pending.length === 0) continue;

    let sequence = 1;
    for (const { id } of pending) {
      db.prepare('UPDATE systemChatMessages SET sequence = ? WHERE id = ?').run(sequence, id);
      sequence += 1;
    }

    const existing = db.prepare('SELECT nextSequence FROM threads WHERE id = ?').get(threadId) as
      | { nextSequence: number }
      | undefined;
    if (existing) {
      if (existing.nextSequence < sequence) {
        db.prepare('UPDATE threads SET nextSequence = ? WHERE id = ?').run(sequence, threadId);
      }
    } else {
      db.prepare('INSERT INTO threads (id, createdAt, lastMessageAt, nextSequence) VALUES (?, ?, NULL, ?)').run(
        threadId,
        now(),
        sequence,
      );
    }
    migrated += pending.length;
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
export function migrate(
  db: Db,
): {
  created: string[];
  addedColumns: string[];
  backfilledChatThreads: number;
  backfilledThreadParticipants: number;
  backfilledChatSequence: number;
} {
  const created: string[] = [];
  const addedColumns: string[] = [];
  let backfilledChatThreads = 0;
  let backfilledThreadParticipants = 0;
  let backfilledChatSequence = 0;

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
      // A base column can grow after a table already exists (fieldMeta did),
      // the same way a registry field can — same PRAGMA-then-ALTER technique.
      for (const column of BASE_COLUMNS) {
        if (existing.has(column.name)) continue;
        db.exec(`ALTER TABLE "${collection.name}" ADD COLUMN ${column.sql.replace(/ NOT NULL/, '')}`);
        addedColumns.push(`${collection.name}.${column.name}`);
      }
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
    backfilledThreadParticipants = backfillThreadParticipants(db);
    // Needs every message already pointed at a real threadId (the backfill
    // just above), since it assigns sequence numbers per thread.
    backfilledChatSequence = backfillSystemChatMessageSequence(db);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { created, addedColumns, backfilledChatThreads, backfilledThreadParticipants, backfilledChatSequence };
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
