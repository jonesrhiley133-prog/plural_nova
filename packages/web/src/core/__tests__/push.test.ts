import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush, isInstalled, pushStatus, pushSupported, watchAndroidPushToken } from '../push.js';

/**
 * The Android bridge branch of push.ts.
 *
 * The browser Push API path (Notification/PushManager) is exercised by hand
 * against real devices rather than jsdom, which has no push service to fake
 * convincingly. What is worth pinning down here is the part unique to this
 * codebase: that `window.PluralNovaAndroid`, when present, is taken as the
 * whole story — the browser APIs are never consulted alongside it.
 */

const post = vi.fn((_path: string, _body?: unknown) => Promise.resolve({}));
vi.mock('../api.js', () => ({
  api: { post: (path: string, body?: unknown) => post(path, body) },
}));

const FCM_TOKEN_KEY = 'pluralnova.fcmToken';

function installBridge(overrides: Partial<Record<'getFcmToken' | 'deleteFcmToken' | 'notificationsAllowed', unknown>> = {}) {
  (window as unknown as { PluralNovaAndroid: unknown }).PluralNovaAndroid = {
    getFcmToken: () => 'fcm-token-abc',
    notificationsAllowed: () => true,
    deleteFcmToken: () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  post.mockClear();
  localStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { PluralNovaAndroid?: unknown }).PluralNovaAndroid;
});

describe('the Android push bridge', () => {
  it('is reported as supported and installed even without browser push APIs', () => {
    installBridge();
    expect(pushSupported()).toBe(true);
    expect(isInstalled()).toBe(true);
  });

  it('reports default until a token has been registered', async () => {
    installBridge();
    expect((await pushStatus()).state).toBe('default');
  });

  it('reports denied without touching the network when the OS permission is off', async () => {
    installBridge({ notificationsAllowed: () => false });

    expect((await pushStatus()).state).toBe('denied');

    const result = await enablePush();
    expect(result.state).toBe('denied');
    expect(post).not.toHaveBeenCalled();
  });

  it('registers the FCM token with the server and remembers it', async () => {
    installBridge();

    const result = await enablePush('Pixel 8');
    expect(result.state).toBe('subscribed');
    expect(post).toHaveBeenCalledWith('/api/devices', {
      label: 'Pixel 8',
      platform: 'android',
      fcmToken: 'fcm-token-abc',
    });
    expect(localStorage.getItem(FCM_TOKEN_KEY)).toBe('fcm-token-abc');
    expect((await pushStatus()).state).toBe('subscribed');
  });

  it('reports an error rather than registering an empty token', async () => {
    installBridge({ getFcmToken: () => '' });

    const result = await enablePush();
    expect(result.state).toBe('error');
    expect(post).not.toHaveBeenCalled();
  });

  it('surfaces a failed registration instead of silently remembering the token', async () => {
    installBridge();
    post.mockRejectedValueOnce(new Error('offline'));

    const result = await enablePush();
    expect(result.state).toBe('error');
    expect(localStorage.getItem(FCM_TOKEN_KEY)).toBeNull();
  });

  it('clears the remembered token and asks the bridge to invalidate it', async () => {
    const deleteFcmToken = vi.fn();
    installBridge({ deleteFcmToken });

    await enablePush();
    await disablePush();

    expect(localStorage.getItem(FCM_TOKEN_KEY)).toBeNull();
    expect(deleteFcmToken).toHaveBeenCalledTimes(1);
    expect((await pushStatus()).state).toBe('default');
  });

  it('silently re-registers when Firebase has rotated the token since it was last registered', async () => {
    installBridge();
    await enablePush();
    post.mockClear();

    // Firebase can hand out a new token entirely on its own — nothing on this
    // page asked for one, and nothing told it one had changed.
    installBridge({ getFcmToken: () => 'fcm-token-rotated' });

    const result = await pushStatus();
    expect(result.state).toBe('subscribed');
    expect(post).toHaveBeenCalledWith('/api/devices', {
      label: expect.any(String),
      platform: 'android',
      fcmToken: 'fcm-token-rotated',
    });
    expect(localStorage.getItem(FCM_TOKEN_KEY)).toBe('fcm-token-rotated');
  });

  it('does not touch the server on a status check when the token has not changed', async () => {
    installBridge();
    await enablePush();
    post.mockClear();

    const result = await pushStatus();
    expect(result.state).toBe('subscribed');
    expect(post).not.toHaveBeenCalled();
  });

  it('watches for a rotated token on every resume, and does nothing outside the Android app', async () => {
    const stopOutsideAndroid = watchAndroidPushToken();
    expect(typeof stopOutsideAndroid).toBe('function');
    stopOutsideAndroid();

    installBridge();
    await enablePush();
    post.mockClear();
    installBridge({ getFcmToken: () => 'fcm-token-rotated' });

    const stop = watchAndroidPushToken();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(localStorage.getItem(FCM_TOKEN_KEY)).toBe('fcm-token-rotated');

    stop();
    post.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(post).not.toHaveBeenCalled();
  });
});
