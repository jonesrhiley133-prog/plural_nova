import { readFileSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Push delivery, over two independent transports.
 *
 * Browsers get Web Push: VAPID keys are generated once and kept on disk,
 * because regenerating them silently invalidates every subscription a user
 * has already granted. A failed delivery with a 404/410 means the
 * subscription is gone for good, so it is removed rather than retried
 * forever.
 *
 * The native Android app has no browser Push API to subscribe through, so it
 * gets Firebase Cloud Messaging instead, gated entirely on whether the
 * self-hoster configured `PLURALNOVA_FIREBASE_CREDENTIALS` — with nothing
 * configured, FCM sends are simply skipped, same as a device with no
 * subscription at all. Every device row carries at most one transport;
 * `sendPush` sends the same payload down whichever one a device has.
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
  fcmToken: string | null;
  pushEnabled: number;
}

let fcmApp: App | null | undefined;

/** Undefined = not yet attempted, null = attempted and unavailable. Never throws. */
function ensureFirebase(): App | null {
  if (fcmApp !== undefined) return fcmApp;
  if (!config.firebaseCredentialsFile) {
    fcmApp = null;
    return fcmApp;
  }
  try {
    fcmApp = initializeApp({ credential: cert(config.firebaseCredentialsFile) }, 'pluralnova-fcm');
  } catch (error) {
    console.warn('[pluralnova] could not load Firebase credentials; FCM push is disabled:', error);
    fcmApp = null;
  }
  return fcmApp;
}

/**
 * Data-only, never a "notification" message: that is what makes the Android
 * app's own FirebaseMessagingService.onMessageReceived() run unconditionally
 * (including while the app is foregrounded), so it can build the visible
 * notification itself from the same PushPayload shape Web Push delivers.
 */
async function sendFcm(deviceId: string, token: string, payload: PushPayload): Promise<boolean> {
  const app = ensureFirebase();
  if (!app) return false;
  try {
    await getMessaging(app).send({
      token,
      android: { priority: 'high' },
      data: {
        title: payload.title,
        body: payload.body,
        ...(payload.link ? { link: payload.link } : {}),
        ...(payload.tag ? { tag: payload.tag } : {}),
        ...(payload.category ? { category: payload.category } : {}),
        ...(payload.badgeCount !== undefined ? { badgeCount: String(payload.badgeCount) } : {}),
      },
    });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      getDb().prepare('UPDATE "devices" SET fcmToken = NULL, pushEnabled = 0 WHERE id = ?').run(deviceId);
    } else {
      console.warn('[pluralnova] FCM delivery failed:', code ?? error);
    }
    return false;
  }
}

export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  ensurePushKeys();
  const devices = getDb()
    .prepare(
      `SELECT id, pushEndpoint, pushP256dh, pushAuth, fcmToken, pushEnabled FROM "devices"
       WHERE userId = ? AND deletedAt IS NULL AND pushEnabled = 1
         AND (pushEndpoint IS NOT NULL OR fcmToken IS NOT NULL)`,
    )
    .all(userId) as DeviceRow[];

  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      if (device.fcmToken) {
        if (await sendFcm(device.id, device.fcmToken, payload)) delivered += 1;
        return;
      }
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
