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
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushStatus(): Promise<PushStatus> {
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
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

export async function sendTestNotification(): Promise<void> {
  await api.post('/api/devices/test');
}

function deviceLabel(): string {
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
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
