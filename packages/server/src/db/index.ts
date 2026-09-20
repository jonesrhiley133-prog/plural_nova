import Database from 'better-sqlite3';
import { COLLECTIONS } from '@pluralnova/shared';
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
export function migrate(db: Db): { created: string[]; addedColumns: string[] } {
  const created: string[] = [];
  const addedColumns: string[] = [];

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

    const version = db.prepare('SELECT value FROM meta WHERE key = ?').get('schemaVersion') as
      | { value: string }
      | undefined;
    if (!version) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schemaVersion', '1');
      created.push('schema');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { created, addedColumns };
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
