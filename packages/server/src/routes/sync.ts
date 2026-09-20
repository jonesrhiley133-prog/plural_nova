import { Router } from 'express';
import {
  COLLECTIONS,
  getCollection,
  now,
  type StoredRecord,
  type SyncConflict,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import {
  changedSince,
  createRecord,
  deleteRecord,
  getRecord,
  updateRecord,
} from '../db/repository.js';
import { getDb } from '../db/index.js';
import { publish } from '../realtime/hub.js';

/**
 * Delta sync.
 *
 * Pull asks "what changed since this timestamp" and push replays the client's
 * offline queue in order. Conflicts are surfaced, not resolved silently: when
 * both sides moved, the server's copy is returned alongside the rejection so
 * the client can show both and let the person decide.
 *
 * Deletes travel as rows with `deletedAt` set, so a device that was offline
 * learns that something was removed rather than resurrecting it on the next push.
 */

export const syncRouter: Router = Router();
syncRouter.use(requireAuth);

const EPOCH = '1970-01-01T00:00:00.000Z';

syncRouter.get(
  '/pull',
  handler((req, res) => {
    const context = auth(req);
    const since = typeof req.query['since'] === 'string' && req.query['since'] ? req.query['since'] : EPOCH;
    const only = typeof req.query['collections'] === 'string' ? req.query['collections'].split(',') : null;
    const perCollection = Math.min(1000, Math.max(50, Number(req.query['limit'] ?? 500)));

    const changes: Record<string, StoredRecord[]> = {};
    let hasMore = false;
    let cursor = since;

    for (const collection of COLLECTIONS) {
      if (only && !only.includes(collection.name)) continue;
      if (collection.systemOnly && context.settings.mode !== 'system') continue;
      // Vault rows only travel when the vault is open on this session.
      if (collection.vault && !context.vaultUnlocked) continue;

      const rows = changedSince(collection.name, context.scope, since, perCollection);
      if (rows.length === 0) continue;
      changes[collection.name] = rows;
      if (rows.length === perCollection) hasMore = true;
      const newest = rows[rows.length - 1]?.updatedAt;
      if (newest && newest > cursor) cursor = newest;
    }

    // With nothing newer, the cursor advances to now so the next pull is cheap.
    if (!hasMore && Object.keys(changes).length === 0) cursor = now();

    ok(res, { changes, cursor, hasMore, serverTime: now() });
  }),
);

interface PushOperation {
  id: string;
  collection: string;
  recordId: string;
  op: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
  baseVersion: number;
}

syncRouter.post(
  '/push',
  handler((req, res) => {
    const context = auth(req);
    const operations = (req.body as { operations?: PushOperation[] }).operations;
    if (!Array.isArray(operations)) throw badRequest('Send an "operations" array.');
    if (operations.length > 500) throw badRequest('Send at most 500 operations at a time.');

    const applied: string[] = [];
    const conflicts: SyncConflict[] = [];
    const rejected: { operationId: string; error: { code: string; message: string } }[] = [];

    for (const operation of operations) {
      const collection = getCollection(operation.collection);
      if (!collection || collection.serverManaged) {
        rejected.push({
          operationId: operation.id,
          error: {
            code: 'bad_request',
            message: `"${operation.collection}" cannot be synced directly.`,
          },
        });
        continue;
      }

      try {
        const existing = getRecord(operation.collection, context.scope, operation.recordId, {
          includeDeleted: true,
        });

        if (operation.op === 'delete') {
          if (existing && !existing.deletedAt) deleteRecord(operation.collection, context.scope, operation.recordId);
          applied.push(operation.id);
          continue;
        }

        if (!operation.payload) {
          rejected.push({
            operationId: operation.id,
            error: { code: 'bad_request', message: 'An upsert needs a payload.' },
          });
          continue;
        }

        if (!existing) {
          createRecord(operation.collection, context.scope, operation.payload, {
            id: operation.recordId,
          });
          applied.push(operation.id);
          continue;
        }

        // The client edited an older copy than the one stored. Rather than
        // overwriting, hand back the server's version so the UI can offer both.
        if (operation.baseVersion > 0 && existing.version > operation.baseVersion) {
          conflicts.push({
            operationId: operation.id,
            collection: operation.collection,
            recordId: operation.recordId,
            server: existing,
            resolution: 'needs_review',
          });
          continue;
        }

        updateRecord(operation.collection, context.scope, operation.recordId, operation.payload);
        applied.push(operation.id);
      } catch (error) {
        rejected.push({
          operationId: operation.id,
          error: {
            code: 'conflict',
            message: error instanceof Error ? error.message : 'That change could not be applied.',
          },
        });
      }
    }

    if (applied.length > 0) publish(context.user.id, { type: 'sync.hint', cursor: now() });
    ok(res, { applied, conflicts, rejected, cursor: now(), serverTime: now() });
  }),
);

/** Records that this device has caught up, for the "last synced" line in settings. */
syncRouter.post(
  '/checkpoint',
  handler((req, res) => {
    const context = auth(req);
    const { deviceId, cursor } = req.body as { deviceId?: string; cursor?: string };
    if (deviceId) {
      getDb()
        .prepare('UPDATE "devices" SET "lastSyncAt" = ?, "lastSeenAt" = ? WHERE "id" = ? AND "userId" = ?')
        .run(cursor ?? now(), now(), deviceId, context.user.id);
    }
    ok(res, { cursor: cursor ?? now() });
  }),
);

syncRouter.get(
  '/status',
  handler((req, res) => {
    const context = auth(req);
    const devices = getDb()
      .prepare(
        'SELECT "id","label","lastSyncAt","lastSeenAt" FROM "devices" WHERE "userId" = ? AND "deletedAt" IS NULL ORDER BY "lastSeenAt" DESC',
      )
      .all(context.user.id);
    ok(res, { serverTime: now(), devices, syncEnabled: context.settings.syncEnabled });
  }),
);
