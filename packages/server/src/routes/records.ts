import { Router } from 'express';
import {
  CRUD_COLLECTIONS,
  getCollection,
  type CollectionDef,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  purgeRecord,
  restoreRecord,
  updateRecord,
  type ListQuery,
} from '../db/repository.js';
import { recordHistory } from '../services/history.js';
import { checkAchievements } from '../services/achievements.js';
import { refreshMemberCount } from '../services/systems.js';
import { publish } from '../realtime/hub.js';

/**
 * Generic CRUD.
 *
 * Every non-social collection is served here, from the registry, which is why
 * fifty-odd modules do not need fifty-odd near-identical route files. Anything
 * with behaviour beyond storage — fronting, messaging, polls — layers its own
 * router on top; this one only has to be correct about scoping and validation.
 */

export const recordsRouter: Router = Router();
recordsRouter.use(requireAuth);

const SERVED = new Map(CRUD_COLLECTIONS.map((c) => [c.name, c]));

function collectionFor(name: string | undefined, mode: 'system' | 'singlet'): CollectionDef {
  const collection = name ? SERVED.get(name) : undefined;
  if (!collection) throw notFound('That kind of record');
  if (collection.systemOnly && mode !== 'system') {
    throw forbidden('That is a System Mode feature. Switch modes in settings to use it.');
  }
  return collection;
}

function parseListQuery(query: Record<string, unknown>, collection: CollectionDef): ListQuery {
  const filters: Record<string, string> = {};
  const known = new Set(collection.fields.map((f) => f.name));
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('filter.')) continue;
    const field = key.slice(7);
    if (known.has(field) && typeof value === 'string') filters[field] = value;
  }

  const range =
    typeof query['rangeField'] === 'string'
      ? {
          field: query['rangeField'],
          ...(typeof query['from'] === 'string' ? { from: query['from'] } : {}),
          ...(typeof query['to'] === 'string' ? { to: query['to'] } : {}),
        }
      : undefined;

  return {
    limit: query['limit'] ? Number(query['limit']) : 100,
    cursor: typeof query['cursor'] === 'string' ? query['cursor'] : null,
    includeDeleted: query['includeDeleted'] === 'true',
    ...(query['memberId'] !== undefined
      ? { memberId: query['memberId'] === 'none' ? null : String(query['memberId']) }
      : {}),
    ...(typeof query['search'] === 'string' ? { search: query['search'] } : {}),
    filters,
    ...(typeof query['sort'] === 'string' ? { sortField: query['sort'] } : {}),
    ...(query['dir'] === 'asc' || query['dir'] === 'desc' ? { sortDir: query['dir'] } : {}),
    ...(range ? { range } : {}),
  };
}

recordsRouter.get(
  '/',
  handler((req, res) => {
    const context = auth(req);
    ok(
      res,
      CRUD_COLLECTIONS.filter((c) => context.settings.mode === 'system' || !c.systemOnly).map((c) => ({
        name: c.name,
        label: c.label,
        singular: c.singular,
        icon: c.icon,
        area: c.area,
        titleField: c.titleField,
        memberScoped: Boolean(c.memberScoped),
        vault: Boolean(c.vault),
      })),
    );
  }),
);

recordsRouter.get(
  '/:collection',
  handler((req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    if (collection.vault && !context.vaultUnlocked) {
      throw forbidden('The vault is locked. Unlock it to see what is inside.');
    }
    const result = listRecords(collection.name, context.scope, parseListQuery(req.query, collection));
    ok(res, result);
  }),
);

recordsRouter.get(
  '/:collection/:id',
  handler((req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    if (collection.vault && !context.vaultUnlocked) {
      throw forbidden('The vault is locked. Unlock it to see what is inside.');
    }
    const record = getRecord(collection.name, context.scope, String(req.params['id']));
    if (!record) throw notFound(collection.singular);
    ok(res, record);
  }),
);

recordsRouter.post(
  '/:collection',
  handler(async (req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    if (collection.vault && !context.vaultUnlocked) throw forbidden('The vault is locked.');

    const body = req.body as Record<string, unknown>;
    const record = createRecord(collection.name, context.scope, body, {
      ...(typeof body['id'] === 'string' ? { id: body['id'] } : {}),
      visibility:
        (body['visibility'] as never) ?? (collection.neverPublic ? 'private' : context.settings.privacy.defaultVisibility),
      ...(collection.memberScoped
        ? { memberId: (body['memberId'] as string | null) ?? context.user.activeMemberId }
        : {}),
    });

    afterWrite(context.scope, collection, record.id, 'created', record);
    await checkAchievements(context.scope);
    ok(res, record, 201);
  }),
);

recordsRouter.patch(
  '/:collection/:id',
  handler(async (req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    if (collection.vault && !context.vaultUnlocked) throw forbidden('The vault is locked.');

    const body = req.body as Record<string, unknown>;
    const record = updateRecord(collection.name, context.scope, String(req.params['id']), body, {
      ...(typeof body['expectedVersion'] === 'number'
        ? { expectedVersion: body['expectedVersion'] }
        : {}),
    });

    afterWrite(context.scope, collection, record.id, 'updated', record);
    await checkAchievements(context.scope);
    ok(res, record);
  }),
);

recordsRouter.delete(
  '/:collection/:id',
  handler((req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    const record = deleteRecord(collection.name, context.scope, String(req.params['id']));
    afterWrite(context.scope, collection, record.id, 'deleted', record);
    ok(res, { deleted: true, id: record.id, restorableUntil: thirtyDaysFrom(record.deletedAt) });
  }),
);

recordsRouter.post(
  '/:collection/:id/restore',
  handler((req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    const record = restoreRecord(collection.name, context.scope, String(req.params['id']));
    afterWrite(context.scope, collection, record.id, 'updated', record);
    ok(res, record);
  }),
);

/** Permanent deletion. Separate verb, separate confirmation, no undo. */
recordsRouter.delete(
  '/:collection/:id/permanent',
  handler((req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    if (req.query['confirm'] !== 'permanent') {
      throw badRequest('Add ?confirm=permanent to delete this for good.');
    }
    purgeRecord(collection.name, context.scope, String(req.params['id']));
    ok(res, { purged: true });
  }),
);

/** Batch create, used by import flows and by the offline outbox on reconnect. */
recordsRouter.post(
  '/:collection/batch',
  handler(async (req, res) => {
    const context = auth(req);
    const collection = collectionFor(req.params['collection'], context.settings.mode);
    const rows = (req.body as { records?: Record<string, unknown>[] }).records;
    if (!Array.isArray(rows)) throw badRequest('Send a "records" array.');
    if (rows.length > 500) throw badRequest('Send at most 500 records at a time.');

    const created: string[] = [];
    const failed: { index: number; message: string }[] = [];
    rows.forEach((row, index) => {
      try {
        const record = createRecord(collection.name, context.scope, row, {
          ...(typeof row['id'] === 'string' ? { id: row['id'] } : {}),
        });
        created.push(record.id);
      } catch (error) {
        // One bad row must not discard the other 499.
        failed.push({
          index,
          message: error instanceof Error ? error.message : 'Could not be saved.',
        });
      }
    });

    if (created.length > 0) afterWrite(context.scope, collection, created[0]!, 'created', null);
    await checkAchievements(context.scope);
    ok(res, { created: created.length, ids: created, failed }, failed.length ? 207 : 201);
  }),
);

function thirtyDaysFrom(timestamp: string | null): string | null {
  if (!timestamp) return null;
  return new Date(new Date(timestamp).getTime() + 30 * 86_400_000).toISOString();
}

/**
 * Side effects every write shares: tell other devices, keep the member count
 * honest, and append to system history for the collections that are audited.
 */
function afterWrite(
  scope: { userId: string; systemId: string | null },
  collection: CollectionDef,
  id: string,
  action: 'created' | 'updated' | 'deleted',
  record: Record<string, unknown> | null,
): void {
  publish(scope.userId, { type: 'record.changed', collection: collection.name, id, action });

  if (collection.name === 'members' && scope.systemId) {
    refreshMemberCount(scope.userId, scope.systemId);
  }

  if (collection.audited && record) {
    const title = String(record[collection.titleField] ?? 'A record');
    const verb = action === 'created' ? 'added' : action === 'deleted' ? 'removed' : 'updated';
    recordHistory(scope, {
      eventType: `${collection.name}.${action}`,
      summary: `${title} was ${verb}`,
      entityType: collection.name,
      entityId: id,
      ...(collection.memberScoped && typeof record['memberId'] === 'string'
        ? { memberId: record['memberId'] }
        : {}),
    });
  }
}

export { collectionFor };
export const servedCollections = (): CollectionDef[] => [...SERVED.values()];
export const collectionIsServed = (name: string): boolean => SERVED.has(name);
export const lookupCollection = getCollection;
