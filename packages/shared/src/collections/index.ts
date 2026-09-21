import type { CollectionDef } from './schema.js';
import { CORE_COLLECTIONS } from './core.js';
import { SYSTEM_COLLECTIONS } from './system.js';
import { LIFE_COLLECTIONS } from './life.js';
import { CREATIVE_COLLECTIONS } from './creative.js';
import { WORK_COLLECTIONS } from './work.js';
import { SOCIAL_COLLECTIONS } from './social.js';

export * from './schema.js';
export * from './core.js';
export * from './system.js';
export * from './life.js';
export * from './creative.js';
export * from './work.js';
export * from './social.js';

/** Every collection PluralNova stores, in one list. */
export const COLLECTIONS: readonly CollectionDef[] = [
  ...CORE_COLLECTIONS,
  ...SYSTEM_COLLECTIONS,
  ...LIFE_COLLECTIONS,
  ...CREATIVE_COLLECTIONS,
  ...WORK_COLLECTIONS,
  ...SOCIAL_COLLECTIONS,
];

const BY_NAME = new Map(COLLECTIONS.map((c) => [c.name, c]));

export function getCollection(name: string): CollectionDef | undefined {
  return BY_NAME.get(name);
}

export function requireCollection(name: string): CollectionDef {
  const found = BY_NAME.get(name);
  if (!found) throw new Error(`Unknown collection: ${name}`);
  return found;
}

export function collectionNames(): string[] {
  return COLLECTIONS.map((c) => c.name);
}

/** Collections the generic CRUD router serves. */
export const CRUD_COLLECTIONS = COLLECTIONS.filter((c) => !c.serverManaged);

/** Collections a full backup walks. */
export const BACKUP_COLLECTIONS = COLLECTIONS.filter((c) => c.backup !== false);

/** Collections hidden entirely while the account is in Singlet Mode. */
export const SYSTEM_ONLY_COLLECTIONS = COLLECTIONS.filter((c) => c.systemOnly);

/** Collections the global search index walks. */
export const SEARCHABLE_COLLECTIONS = COLLECTIONS.filter(
  (c) => !c.vault && c.fields.some((field) => field.searchable),
);

export function collectionsInArea(area: CollectionDef['area']): CollectionDef[] {
  return COLLECTIONS.filter((c) => c.area === area);
}

export function isVisibleInMode(collection: CollectionDef, mode: 'system' | 'singlet'): boolean {
  return mode === 'system' || !collection.systemOnly;
}
