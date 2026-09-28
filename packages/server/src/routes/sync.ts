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
  getFieldMeta,
  getRecord,
  updateRecord,
} from '../db/repository.js';
import { getDb } from '../db/index.js';
import { publish } from '../realtime/hub.js';
import { recordHistory } from '../services/history.js';

/**
 * Delta sync.
 *
 * Pull asks "what changed since this timestamp" and push replays the client's
 * offline queue in order. A record moving on since the client's base is not by
 * itself a conflict — only a field the server itself changed is, checked one
 * field at a time against `fieldMeta` (see db/repository.ts), so two devices
 * editing different fields of the same record both survive instead of one
 * silently overwriting the other. A genuine same-field clash is settled by
 * whichever edit actually happened later; the value that loses is kept in
 * system history and handed back in `conflicts` rather than discarded.
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
  /** When the client made this edit, for deciding a genuine same-field conflict. */
  queuedAt?: string;
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

        if (existing.deletedAt) {
          // Someone removed this while the client was offline. There is
          // nothing left to apply the edit to, and it must not come back just
          // because an old local copy still has it.
          conflicts.push({
            operationId: operation.id,
            collection: operation.collection,
            recordId: operation.recordId,
            server: existing,
            resolution: 'server_wins',
            lostFields: operation.payload,
          });
          continue;
        }

        // Nothing has moved since the client's base: the common case, and the
        // cheapest — every field in the payload applies as sent.
        if (operation.baseVersion === 0 || existing.version <= operation.baseVersion) {
          updateRecord(operation.collection, context.scope, operation.recordId, operation.payload);
          applied.push(operation.id);
          continue;
        }

        // Something changed the record since the client's base, but that is
        // not automatically a conflict: a different device editing a
        // different field should not cost either edit. Only a field the
        // server itself changed since that base is a real, same-field clash.
        const fieldMeta = getFieldMeta(operation.collection, context.scope, operation.recordId);
        const payloadFields = Object.keys(operation.payload);
        const contested = payloadFields.filter((field) => {
          const meta = fieldMeta[field];
          return meta !== undefined && meta.v > operation.baseVersion;
        });

        if (contested.length === 0) {
          updateRecord(operation.collection, context.scope, operation.recordId, operation.payload, {
            fieldTimestamp: operation.queuedAt,
          });
          applied.push(operation.id);
          continue;
        }

        // For each contested field the later edit wins; a field nobody else
        // touched still merges in regardless of how the contested ones land.
        const toApply: Record<string, unknown> = {};
        const lost: Record<string, unknown> = {};
        for (const field of payloadFields) {
          const serverWhen = fieldMeta[field]?.t ?? existing.updatedAt;
          const clientIsNewer = typeof operation.queuedAt === 'string' && operation.queuedAt > serverWhen;
          if (!contested.includes(field) || clientIsNewer) toApply[field] = operation.payload[field];
          else lost[field] = operation.payload[field];
        }

        const merged =
          Object.keys(toApply).length > 0
            ? updateRecord(operation.collection, context.scope, operation.recordId, toApply, {
                fieldTimestamp: operation.queuedAt,
              })
            : existing;

        if (Object.keys(lost).length === 0) {
          applied.push(operation.id);
          continue;
        }

        // The losing value is not gone: system history keeps it (where the
        // account has one) and the response hands it back so the client can
        // offer to keep it instead of the server's answer.
        recordHistory(context.scope, {
          eventType: `${operation.collection}.conflict`,
          summary: `A change to ${collection.singular} could not be saved because it had already changed elsewhere.`,
          entityType: operation.collection,
          entityId: operation.recordId,
          previousValue: JSON.stringify(lost),
          newValue: JSON.stringify(
            Object.fromEntries(Object.keys(lost).map((field) => [field, merged[field]])),
          ),
          restorable: true,
        });

        conflicts.push({
          operationId: operation.id,
          collection: operation.collection,
          recordId: operation.recordId,
          server: merged,
          resolution: 'needs_review',
          lostFields: lost,
        });
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
