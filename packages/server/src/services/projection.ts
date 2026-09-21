import { getCollection } from '@pluralnova/shared';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * Removing what another account is not entitled to see.
 *
 * Fields carry a `sensitive` flag, and the flag documented itself as being
 * excluded from shared projections. Nothing enforced it. The exposure surfaces
 * happened to be allowlists — `publicProfileView` names every field it emits —
 * so nothing was leaking, but a promise that holds only because the one place
 * it matters was written carefully is not a promise, and the codebase already
 * contains one projection that spreads a record wholesale.
 *
 * So the flag is real now, and this is belt to the allowlist's braces. An
 * allowlist is still the better pattern and is still what the profile view
 * uses; this catches the case where somebody adds a field to a collection
 * without knowing which projections will carry it, which is the failure that
 * actually happens.
 */

/** A record as another account may see it: sensitive fields removed. */
export function shareableView(collectionName: string, record: StoredRecord): StoredRecord {
  const sensitive = sensitiveFields(collectionName);
  if (sensitive.size === 0) return record;

  const view: StoredRecord = { ...record };
  for (const name of sensitive) delete view[name];
  return view;
}

const cache = new Map<string, ReadonlySet<string>>();

/** Which fields of a collection are marked sensitive. Resolved once per collection. */
export function sensitiveFields(collectionName: string): ReadonlySet<string> {
  const cached = cache.get(collectionName);
  if (cached) return cached;

  const collection = getCollection(collectionName);
  const names = new Set<string>(
    (collection?.fields ?? []).filter((field) => field.sensitive).map((field) => field.name),
  );
  cache.set(collectionName, names);
  return names;
}
