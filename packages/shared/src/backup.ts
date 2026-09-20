import { BACKUP_COLLECTIONS, getCollection } from './collections/index.js';
import type { StoredRecord } from './types.js';

/**
 * The backup format.
 *
 * A backup is the whole account in one structured, versioned file. It is the
 * thing that makes leaving PluralNova possible, so it is deliberately boring:
 * plain JSON, every collection named, counts stated up front, and a checksum so
 * a truncated download is detected before it is restored over live data.
 */

export const BACKUP_FORMAT = 'pluralnova.backup' as const;
export const BACKUP_VERSION = 3;

/** Versions this build knows how to read. Older files are migrated forward. */
export const SUPPORTED_BACKUP_VERSIONS = [1, 2, 3] as const;

export interface BackupAccount {
  displayName: string;
  email: string | null;
  mode: 'system' | 'singlet';
  activeSystemId: string | null;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  app: { name: string; version: string };
  account: BackupAccount;
  settings: Record<string, unknown>;
  /** Collection name → rows. Missing collections mean "nothing to restore", not an error. */
  collections: Record<string, StoredRecord[]>;
  counts: Record<string, number>;
  /** Cheap integrity check over the serialised collections. */
  checksum: string;
  notes?: string;
}

export type ConflictStrategy = 'merge' | 'replace' | 'skipExisting';

export interface RestoreOptions {
  strategy: ConflictStrategy;
  /** Restore only these collections; empty means all of them. */
  collections: string[];
  includeSettings: boolean;
  includeSocial: boolean;
}

export const DEFAULT_RESTORE_OPTIONS: RestoreOptions = {
  strategy: 'merge',
  collections: [],
  includeSettings: true,
  includeSocial: true,
};

export interface BackupValidation {
  valid: boolean;
  version: number | null;
  errors: string[];
  warnings: string[];
  /** What a restore would touch, so the user sees it before anything is written. */
  preview: { collection: string; label: string; count: number }[];
  totalRecords: number;
  createdAt: string | null;
  checksumOk: boolean;
}

/**
 * A stable 32-bit checksum. Not a security control — its job is to notice a
 * truncated or corrupted file before the contents are trusted.
 */
export function checksumOf(collections: Record<string, StoredRecord[]>): string {
  const names = Object.keys(collections).sort();
  let hash = 0x811c9dc5;
  for (const name of names) {
    const chunk = `${name}:${collections[name]?.length ?? 0}:${JSON.stringify(collections[name] ?? [])}`;
    for (let i = 0; i < chunk.length; i += 1) {
      hash ^= chunk.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createBackup(input: {
  account: BackupAccount;
  settings: Record<string, unknown>;
  collections: Record<string, StoredRecord[]>;
  appVersion: string;
  notes?: string;
}): BackupFile {
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(input.collections)) counts[name] = rows.length;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    app: { name: 'PluralNova', version: input.appVersion },
    account: input.account,
    settings: input.settings,
    collections: input.collections,
    counts,
    checksum: checksumOf(input.collections),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function isRecordArray(value: unknown): value is StoredRecord[] {
  return Array.isArray(value) && value.every((row) => row !== null && typeof row === 'object');
}

/**
 * Validates a parsed backup without touching any data. Unknown collections are a
 * warning rather than a failure: a file from a newer build should still restore
 * everything this build understands.
 */
export function validateBackup(input: unknown): BackupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const preview: BackupValidation['preview'] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      version: null,
      errors: ['This file is not a PluralNova backup.'],
      warnings,
      preview,
      totalRecords: 0,
      createdAt: null,
      checksumOk: false,
    };
  }

  const file = input as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    errors.push('This file is not a PluralNova backup — the format marker is missing.');
  }

  const version = typeof file.version === 'number' ? file.version : null;
  if (version === null) {
    errors.push('The backup does not say which version it was written with.');
  } else if (version > BACKUP_VERSION) {
    errors.push(
      `This backup was made by a newer version of PluralNova (format ${version}). Update the app, then restore it.`,
    );
  } else if (!SUPPORTED_BACKUP_VERSIONS.includes(version as 1 | 2 | 3)) {
    errors.push(`Backup format ${version} cannot be read by this version.`);
  }

  const collections = (file.collections ?? {}) as Record<string, unknown>;
  let totalRecords = 0;
  for (const [name, rows] of Object.entries(collections)) {
    if (!isRecordArray(rows)) {
      errors.push(`The "${name}" section is malformed and will be skipped.`);
      continue;
    }
    const def = getCollection(name);
    if (!def) {
      warnings.push(`"${name}" is not a collection this version knows about — it will be kept but not shown.`);
    }
    totalRecords += rows.length;
    preview.push({ collection: name, label: def?.label ?? name, count: rows.length });
  }

  if (preview.length === 0) errors.push('The backup contains no data.');

  const checksumOk =
    typeof file.checksum === 'string' && isValidCollections(collections)
      ? checksumOf(collections as Record<string, StoredRecord[]>) === file.checksum
      : false;
  if (!checksumOk && typeof file.checksum === 'string') {
    warnings.push('The checksum does not match. The file may be incomplete — restore with care.');
  }

  preview.sort((a, b) => b.count - a.count);

  return {
    valid: errors.length === 0,
    version,
    errors,
    warnings,
    preview,
    totalRecords,
    createdAt: typeof file.createdAt === 'string' ? file.createdAt : null,
    checksumOk,
  };
}

function isValidCollections(value: Record<string, unknown>): boolean {
  return Object.values(value).every(isRecordArray);
}

/**
 * Brings older backups up to the current shape. Each step is small and
 * documented, so a file written two releases ago restores without special cases
 * scattered through the restore path.
 */
export function migrateBackup(file: BackupFile): BackupFile {
  let migrated: BackupFile = { ...file, collections: { ...file.collections } };

  if (migrated.version < 2) {
    // v1 kept fronting under "fronts" and had no co-fronter list.
    const legacy = migrated.collections['fronts'];
    if (legacy) {
      migrated.collections['frontEvents'] = legacy.map((row) => ({
        ...row,
        coFronterIds: Array.isArray(row['coFronterIds']) ? row['coFronterIds'] : [],
      }));
      delete migrated.collections['fronts'];
    }
    migrated.version = 2;
  }

  if (migrated.version < 3) {
    // v2 stored visibility as a boolean "private" flag.
    for (const rows of Object.values(migrated.collections)) {
      for (const row of rows) {
        if (typeof row['visibility'] !== 'string') {
          row['visibility'] = row['private'] === false ? 'system' : 'private';
        }
        delete row['private'];
        if (typeof row['version'] !== 'number') row['version'] = 1;
      }
    }
    migrated.version = 3;
  }

  migrated = { ...migrated, checksum: checksumOf(migrated.collections) };
  return migrated;
}

/** Collections a backup should contain, with their labels, for the export screen. */
export function backupSections(): { name: string; label: string; area: string }[] {
  return BACKUP_COLLECTIONS.map((c) => ({ name: c.name, label: c.label, area: c.area }));
}

export function suggestedFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `pluralnova-backup-${stamp}.json`;
}
