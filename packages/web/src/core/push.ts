import { api } from './api.js';

/**
 * Notifications and the badge.
 *
 * The chain is: browser permission → a push subscription → a device row on the
 * server. Each step can fail for a different reason, so each reports a
 * different, actionable message rather than a single "notifications failed".
 *
 * Delivery while the app is closed is handled by the service worker, not by the
 * page — that is what makes these behave like application notifications rather
 * than something that only appears while a tab is open.
 *
 * The native Android app has no service worker push channel to subscribe
 * through — a plain WebView has no Web Push service behind it — so it bridges
 * to Firebase Cloud Messaging instead, through a small native object the app
 * injects as `window.PluralNovaAndroid`. Every function below checks for that
 * bridge first and, when it is there, takes an entirely separate path that
 * never touches `Notification`/`PushManager` at all. Everything calling into
 * this module (Settings, onboarding) is unaffected either way.
 */

export type PushState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'
  | 'subscribed'
  | 'error';

export interface PushStatus {
  state: PushState;
  message: string;
  canAsk: boolean;
}

/** The interface `MainActivity` injects. Absent entirely outside the Android app. */
interface AndroidPushBridge {
  getFcmToken?: () => string;
  deleteFcmToken?: () => void;
  notificationsAllowed?: () => boolean;
}

/** The last token this device successfully registered with the server, if any. */
const FCM_TOKEN_KEY = 'pluralnova.fcmToken';

function androidBridge(): AndroidPushBridge | null {
  const bridge = (window as unknown as { PluralNovaAndroid?: AndroidPushBridge }).PluralNovaAndroid;
  return bridge && typeof bridge.getFcmToken === 'function' ? bridge : null;
}

async function androidPushStatus(bridge: AndroidPushBridge): Promise<PushStatus> {
  if (bridge.notificationsAllowed && !bridge.notificationsAllowed()) {
    return {
      state: 'denied',
      message: 'Your device is blocking notifications for PluralNova. Allow them in Android settings, then try again.',
      canAsk: false,
    };
  }

  const registered = localStorage.getItem(FCM_TOKEN_KEY);
  if (!registered) return { state: 'default', message: 'Notifications are not turned on yet.', canAsk: true };

  /*
   * Firebase can rotate this device's token on its own — a security-driven
   * refresh on Google's side, not only when this page asks for one — and the
   * native side has no route back into this page's session to tell it when
   * that happens (see PushMessagingService.kt's onNewToken). The bridge's own
   * getFcmToken always returns whatever is current, though, so comparing it
   * against what was last registered on every status check catches a
   * rotation the moment anything asks — Settings, an app resume — rather
   * than reporting "on" for a device the server can no longer reach.
   */
  const current = bridge.getFcmToken?.();
  if (current && current !== registered) return enableAndroidPush(bridge, deviceLabel());

  return { state: 'subscribed', message: 'Notifications are on for this device.', canAsk: false };
}

async function enableAndroidPush(bridge: AndroidPushBridge, label: string): Promise<PushStatus> {
  if (bridge.notificationsAllowed && !bridge.notificationsAllowed()) {
    return {
      state: 'denied',
      message: 'Notifications are blocked. Allow them in Android settings to turn them on.',
      canAsk: false,
    };
  }

  try {
    const token = bridge.getFcmToken?.();
    if (!token) {
      return { state: 'error', message: 'Notifications could not be set up on this device.', canAsk: true };
    }

    await api.post('/api/devices', { label, platform: 'android', fcmToken: token });
    localStorage.setItem(FCM_TOKEN_KEY, token);

    return { state: 'subscribed', message: 'Notifications are on for this device.', canAsk: false };
  } catch (error) {
    return {
      state: 'error',
      message:
        error instanceof Error
          ? `Notifications could not be set up: ${error.message}`
          : 'Notifications could not be set up on this device.',
      canAsk: true,
    };
  }
}

function disableAndroidPush(bridge: AndroidPushBridge): void {
  localStorage.removeItem(FCM_TOKEN_KEY);
  // Best-effort: this invalidates the token at the source, so a stale device
  // row gets cleaned up server-side the same way an expired browser
  // subscription does, the next time delivery to it is attempted.
  try {
    bridge.deleteFcmToken?.();
  } catch {
    // Nothing more to do from here if the native side could not clear it.
  }
}

function base64ToUint8Array(base64: string) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  // Backed by an explicit ArrayBuffer so the result satisfies BufferSource.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  if (androidBridge()) return true;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushStatus(): Promise<PushStatus> {
  const bridge = androidBridge();
  if (bridge) return androidPushStatus(bridge);

  if (!pushSupported()) {
    return {
      state: 'unsupported',
      message:
        'This browser cannot deliver notifications while PluralNova is closed. In-app notifications still work.',
      canAsk: false,
    };
  }

  if (Notification.permission === 'denied') {
    return {
      state: 'denied',
      message:
        'Your browser is blocking notifications for PluralNova. Allow them in your browser or system settings, then try again.',
      canAsk: false,
    };
  }

  if (Notification.permission === 'default') {
    return { state: 'default', message: 'Notifications are not turned on yet.', canAsk: true };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription
    ? { state: 'subscribed', message: 'Notifications are on for this device.', canAsk: false }
    : { state: 'granted', message: 'Permission granted — finishing setup.', canAsk: true };
}

export async function enablePush(label = deviceLabel()): Promise<PushStatus> {
  const bridge = androidBridge();
  if (bridge) return enableAndroidPush(bridge, label);

  if (!pushSupported()) return pushStatus();

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    return {
      state: permission === 'denied' ? 'denied' : 'default',
      message:
        permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser settings to turn them on.'
          : 'Notifications were not turned on.',
      canAsk: permission !== 'denied',
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await api.get<{ publicKey: string }>('/api/push-key');

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      }));

    await api.post('/api/devices', {
      label,
      platform: navigator.platform || navigator.userAgent.slice(0, 80),
      subscription: subscription.toJSON(),
    });

    return { state: 'subscribed', message: 'Notifications are on for this device.', canAsk: false };
  } catch (error) {
    return {
      state: 'error',
      message:
        error instanceof Error
          ? `Notifications could not be set up: ${error.message}`
          : 'Notifications could not be set up on this device.',
      canAsk: true,
    };
  }
}

export async function disablePush(): Promise<void> {
  const bridge = androidBridge();
  if (bridge) {
    disableAndroidPush(bridge);
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

export async function sendTestNotification(): Promise<void> {
  await api.post('/api/devices/test');
}

/**
 * Catches a rotated FCM token the moment this device is plausibly looking at
 * it again, rather than only whenever someone happens to reopen Settings. A
 * no-op on anything but the Android app — the browser Push API has no
 * equivalent silent-rotation problem, so there is nothing here for it to
 * reconcile.
 */
export function watchAndroidPushToken(): () => void {
  const bridge = androidBridge();
  if (!bridge) return () => {};
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void androidPushStatus(bridge);
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

/** A human-readable name for this browser/OS — also reused to label this device when it registers for anything else that needs a stable device identity, such as message encryption keys. */
export function deviceLabel(): string {
  if (androidBridge()) return 'PluralNova (Android app)';
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) return 'iPhone or iPad';
  if (/Android/.test(agent)) return 'Android device';
  if (/CrOS/.test(agent)) return 'Chromebook';
  if (/Mac/.test(agent)) return 'Mac';
  if (/Windows/.test(agent)) return 'Windows PC';
  return 'This device';
}

/**
 * The count on the installed app's icon. Supported on Android and desktop
 * Chrome; a browser without it simply ignores the call, which is why nothing
 * here throws.
 */
export async function setAppBadge(count: number): Promise<void> {
  const badging = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await badging.setAppBadge?.(count);
    else await badging.clearAppBadge?.();
  } catch {
    // Badging is a nicety; failing to set it is never worth surfacing.
  }
}

/** True when the app is running installed rather than in a browser tab. */
export function isInstalled(): boolean {
  return (
    Boolean(androidBridge()) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
