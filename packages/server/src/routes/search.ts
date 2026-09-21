import { Router } from 'express';
import { SEARCHABLE_COLLECTIONS, listFields } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { listRecords } from '../db/repository.js';

/**
 * Global search.
 *
 * Runs over the fields each collection declared as searchable, scoped to the
 * account. Vault contents are excluded unless the vault is unlocked, and
 * messages are searched only within the requester's own conversations.
 */

export const searchRouter: Router = Router();
searchRouter.use(requireAuth);

export interface SearchHit {
  collection: string;
  collectionLabel: string;
  id: string;
  title: string;
  snippet: string;
  icon: string;
  updatedAt: string;
  memberId: string | null;
}

searchRouter.get(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const query = String(req.query['q'] ?? '').trim();
    const limit = Math.min(20, Math.max(1, Number(req.query['perCollection'] ?? 5)));
    const only = typeof req.query['in'] === 'string' ? new Set(req.query['in'].split(',')) : null;

    if (query.length < 2) {
      ok(res, { query, hits: [], byCollection: {}, total: 0 });
      return;
    }

    const hits: SearchHit[] = [];
    const byCollection: Record<string, number> = {};

    for (const collection of SEARCHABLE_COLLECTIONS) {
      if (only && !only.has(collection.name)) continue;
      if (collection.systemOnly && context.settings.mode !== 'system') continue;
      if (collection.vault && !context.vaultUnlocked) continue;
      if (collection.serverManaged && collection.name !== 'notifications') continue;

      const result = listRecords(collection.name, context.scope, { search: query, limit });
      if (result.items.length === 0) continue;
      byCollection[collection.name] = result.total;

      for (const item of result.items) {
        const title = String(item[collection.titleField] ?? '').trim();
        hits.push({
          collection: collection.name,
          collectionLabel: collection.label,
          id: item.id,
          title: title || `Untitled ${collection.singular.toLowerCase()}`,
          snippet: snippetFor(item, query, collection.fields.map((f) => f.name)),
          icon: collection.icon,
          updatedAt: item.updatedAt,
          memberId: (item['memberId'] as string) ?? null,
        });
      }
    }

    hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    ok(res, {
      query,
      hits,
      byCollection,
      total: Object.values(byCollection).reduce((sum, n) => sum + n, 0),
    });
  }),
);

/** Pulls the matching phrase out of whichever field contains it, with context. */
function snippetFor(record: Record<string, unknown>, query: string, fields: string[]): string {
  const needle = query.toLowerCase();
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const index = value.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    const start = Math.max(0, index - 40);
    const end = Math.min(value.length, index + query.length + 60);
    return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
  }
  return '';
}

/** Lets the client show which collections can be filtered on, with their columns. */
searchRouter.get(
  '/scopes',
  handler((req, res) => {
    const context = auth(req);
    ok(res, {
      scopes: SEARCHABLE_COLLECTIONS.filter(
        (c) => (context.settings.mode === 'system' || !c.systemOnly) && !c.serverManaged,
      ).map((c) => ({
        name: c.name,
        label: c.label,
        icon: c.icon,
        columns: listFields(c).map((f) => ({ name: f.name, label: f.label })),
      })),
    });
  }),
);
