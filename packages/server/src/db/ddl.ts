import { COLLECTIONS, type CollectionDef, type FieldDef } from '@pluralnova/shared';

/**
 * SQLite DDL, generated from the collection registry.
 *
 * Writing 65 CREATE TABLE statements by hand would mean 65 chances for the
 * server's idea of a column to drift from the client's. Deriving them instead
 * means a field added to the registry exists in the database, the API, the form
 * and the backup at the same time.
 */

/** Columns every record table carries, in a fixed order. */
export const BASE_COLUMNS: { name: string; sql: string }[] = [
  { name: 'id', sql: '"id" TEXT PRIMARY KEY' },
  { name: 'userId', sql: '"userId" TEXT NOT NULL' },
  { name: 'systemId', sql: '"systemId" TEXT' },
  { name: 'memberId', sql: '"memberId" TEXT' },
  { name: 'visibility', sql: `"visibility" TEXT NOT NULL DEFAULT 'private'` },
  { name: 'createdAt', sql: '"createdAt" TEXT NOT NULL' },
  { name: 'updatedAt', sql: '"updatedAt" TEXT NOT NULL' },
  { name: 'deletedAt', sql: '"deletedAt" TEXT' },
  { name: 'version', sql: '"version" INTEGER NOT NULL DEFAULT 1' },
];

export const BASE_COLUMN_NAMES = BASE_COLUMNS.map((c) => c.name);

export function sqlTypeFor(field: FieldDef): string {
  switch (field.kind) {
    case 'int':
    case 'bool':
    case 'duration':
      return 'INTEGER';
    case 'real':
    case 'money':
      return 'REAL';
    default:
      // text, longtext, date, time, datetime, enum, ref, color, url, image,
      // plus json/tags/refs which are stored as serialised JSON text.
      return 'TEXT';
  }
}

/** Fields the registry declares, minus anything already provided by the base columns. */
export function ownFields(collection: CollectionDef): FieldDef[] {
  return collection.fields.filter((field) => !BASE_COLUMN_NAMES.includes(field.name));
}

export function columnDefinition(field: FieldDef): string {
  return `"${field.name}" ${sqlTypeFor(field)}`;
}

export function createTableSql(collection: CollectionDef): string {
  const columns = [...BASE_COLUMNS.map((c) => c.sql), ...ownFields(collection).map(columnDefinition)];
  return `CREATE TABLE IF NOT EXISTS "${collection.name}" (\n  ${columns.join(',\n  ')}\n)`;
}

export function indexStatements(collection: CollectionDef): string[] {
  const statements: string[] = [
    `CREATE INDEX IF NOT EXISTS "idx_${collection.name}_owner" ON "${collection.name}" ("userId", "deletedAt")`,
    `CREATE INDEX IF NOT EXISTS "idx_${collection.name}_sync" ON "${collection.name}" ("userId", "updatedAt")`,
  ];
  if (collection.scope === 'system') {
    statements.push(
      `CREATE INDEX IF NOT EXISTS "idx_${collection.name}_system" ON "${collection.name}" ("systemId", "deletedAt")`,
    );
  }
  for (const combo of collection.indexes ?? []) {
    const name = `idx_${collection.name}_${combo.join('_')}`.slice(0, 60);
    const cols = combo.map((c) => `"${c}"`).join(', ');
    statements.push(`CREATE INDEX IF NOT EXISTS "${name}" ON "${collection.name}" (${cols})`);
  }
  return statements;
}

/** Tables that are not registry collections: accounts, sessions, jobs, and so on. */
export const SUPPORT_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT UNIQUE,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordSalt" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'system',
    "activeSystemId" TEXT,
    "activeMemberId" TEXT,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "vaultPinHash" TEXT,
    "vaultPinSalt" TEXT,
    "recoveryCodeHash" TEXT,
    "resetCodeHash" TEXT,
    "resetExpiresAt" TEXT,
    "isGuest" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "deletedAt" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "createdAt" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "lastSeenAt" TEXT NOT NULL,
    "userAgent" TEXT,
    "vaultUnlockedUntil" TEXT,
    "revokedAt" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" ("userId")`,
  `CREATE TABLE IF NOT EXISTS "loginAttempts" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "attemptedAt" TEXT NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_login_attempts" ON "loginAttempts" ("key", "attemptedAt")`,
  `CREATE TABLE IF NOT EXISTS "threads" (
    "id" TEXT PRIMARY KEY,
    "createdAt" TEXT NOT NULL,
    "lastMessageAt" TEXT,
    "nextSequence" INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS "backups" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "formatVersion" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "notes" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_backups_user" ON "backups" ("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "uploads" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "messageKeys" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'ECDH-P256',
    "createdAt" TEXT NOT NULL,
    "retiredAt" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_message_keys_user" ON "messageKeys" ("userId", "retiredAt")`,
  `CREATE TABLE IF NOT EXISTS "meta" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL
  )`,
];

export function allStatements(): string[] {
  const statements = [...SUPPORT_TABLES];
  for (const collection of COLLECTIONS) {
    statements.push(createTableSql(collection));
    statements.push(...indexStatements(collection));
  }
  return statements;
}
