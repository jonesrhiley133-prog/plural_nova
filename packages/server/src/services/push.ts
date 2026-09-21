import { readFileSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Web push.
 *
 * VAPID keys are generated once and kept on disk, because regenerating them
 * silently invalidates every subscription a user has already granted. A failed
 * delivery with a 404/410 means the subscription is gone for good, so it is
 * removed rather than retried forever.
 */

interface KeyFile {
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

let keys: KeyFile | null = null;

export function ensurePushKeys(): KeyFile {
  if (keys) return keys;
  try {
    keys = JSON.parse(readFileSync(config.keyFile, 'utf8')) as KeyFile;
  } catch {
    const generated = webpush.generateVAPIDKeys();
    keys = { vapidPublicKey: generated.publicKey, vapidPrivateKey: generated.privateKey };
    writeFileSync(config.keyFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
  }
  webpush.setVapidDetails(config.pushContact, keys.vapidPublicKey, keys.vapidPrivateKey);
  return keys;
}

export function publicKey(): string {
  return ensurePushKeys().vapidPublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app route the notification opens. */
  link?: string;
  tag?: string;
  category?: string;
  badgeCount?: number;
}

interface DeviceRow {
  id: string;
  pushEndpoint: string | null;
  pushP256dh: string | null;
  pushAuth: string | null;
  pushEnabled: number;
}

export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  ensurePushKeys();
  const devices = getDb()
    .prepare(
      `SELECT id, pushEndpoint, pushP256dh, pushAuth, pushEnabled FROM "devices"
       WHERE userId = ? AND deletedAt IS NULL AND pushEnabled = 1 AND pushEndpoint IS NOT NULL`,
    )
    .all(userId) as DeviceRow[];

  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      if (!device.pushEndpoint || !device.pushP256dh || !device.pushAuth) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: device.pushEndpoint,
            keys: { p256dh: device.pushP256dh, auth: device.pushAuth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          getDb()
            .prepare('UPDATE "devices" SET pushEndpoint = NULL, pushEnabled = 0 WHERE id = ?')
            .run(device.id);
        } else {
          console.warn('[pluralnova] push delivery failed:', status ?? error);
        }
      }
    }),
  );
  return delivered;
}
