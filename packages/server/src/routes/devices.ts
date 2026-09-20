import { Router } from 'express';
import { newId, now, requireCollection } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, notFound } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { getDb } from '../db/index.js';
import { deserialize } from '../db/repository.js';
import { publicKey, sendPush } from '../services/push.js';

/**
 * Devices and push subscriptions.
 *
 * A subscription belongs to a device, not to the account, so signing out on one
 * phone does not stop notifications on another. Registering the same endpoint
 * twice updates the existing row instead of creating a duplicate that would
 * deliver everything twice.
 */

export const devicesRouter: Router = Router();
devicesRouter.use(requireAuth);

devicesRouter.get(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const rows = getDb()
      .prepare('SELECT * FROM "devices" WHERE "userId" = ? AND "deletedAt" IS NULL ORDER BY "lastSeenAt" DESC')
      .all(context.user.id) as Record<string, unknown>[];
    ok(res, {
      devices: rows
        .map((row) => deserialize(requireCollection('devices'), row))
        .map((device) => ({
          id: device.id,
          label: device['label'],
          platform: device['platform'],
          lastSeenAt: device['lastSeenAt'],
          lastSyncAt: device['lastSyncAt'],
          pushEnabled: device['pushEnabled'],
          // The endpoint itself is a capability URL, so it is never returned.
          hasPush: Boolean(device['pushEndpoint']),
        })),
      vapidPublicKey: publicKey(),
    });
  }),
);

devicesRouter.post(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const body = req.body as {
      label?: string;
      platform?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };

    const endpoint = body.subscription?.endpoint ?? null;
    const timestamp = now();
    const existing = endpoint
      ? (getDb()
          .prepare('SELECT "id" FROM "devices" WHERE "userId" = ? AND "pushEndpoint" = ?')
          .get(context.user.id, endpoint) as { id: string } | undefined)
      : undefined;

    if (existing) {
      getDb()
        .prepare(
          `UPDATE "devices" SET "label" = ?, "platform" = ?, "pushP256dh" = ?, "pushAuth" = ?,
           "pushEnabled" = 1, "lastSeenAt" = ?, "updatedAt" = ?, "deletedAt" = NULL WHERE "id" = ?`,
        )
        .run(
          body.label ?? 'This device',
          body.platform ?? '',
          body.subscription?.keys?.p256dh ?? null,
          body.subscription?.keys?.auth ?? null,
          timestamp,
          timestamp,
          existing.id,
        );
      ok(res, { id: existing.id, updated: true });
      return;
    }

    const id = newId('dev');
    getDb()
      .prepare(
        `INSERT INTO "devices"
          ("id","userId","systemId","memberId","visibility","createdAt","updatedAt","deletedAt","version",
           "label","platform","pushEndpoint","pushP256dh","pushAuth","lastSeenAt","lastSyncAt","pushEnabled")
         VALUES (?,?,?,NULL,'private',?,?,NULL,1,?,?,?,?,?,?,NULL,?)`,
      )
      .run(
        id,
        context.user.id,
        context.user.activeSystemId,
        timestamp,
        timestamp,
        body.label ?? 'This device',
        body.platform ?? '',
        endpoint,
        body.subscription?.keys?.p256dh ?? null,
        body.subscription?.keys?.auth ?? null,
        timestamp,
        endpoint ? 1 : 0,
      );
    ok(res, { id, created: true }, 201);
  }),
);

devicesRouter.delete(
  '/:id',
  handler((req, res) => {
    const context = auth(req);
    const result = getDb()
      .prepare('UPDATE "devices" SET "deletedAt" = ?, "pushEnabled" = 0, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), String(req.params['id']), context.user.id);
    if (result.changes === 0) throw notFound('That device');
    ok(res, { removed: true });
  }),
);

/** Sends a real notification so the user can confirm the whole chain works. */
devicesRouter.post(
  '/test',
  handler(async (req, res) => {
    const context = auth(req);
    const delivered = await sendPush(context.user.id, {
      title: 'PluralNova',
      body: 'Notifications are working on this device.',
      link: '/notifications',
      tag: 'test',
    });
    if (delivered === 0) {
      throw badRequest(
        'No device accepted the notification. Check that notifications are allowed for PluralNova in your browser or system settings.',
      );
    }
    ok(res, { delivered });
  }),
);
