import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('device registration', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'devices@example.com', displayName: 'Devices' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('registers a device from a Web Push subscription', async () => {
    const result = await client.request('POST', '/api/devices', {
      token: user.token,
      body: {
        label: 'Desktop Firefox',
        platform: 'web',
        subscription: { endpoint: 'https://push.example.com/sub-a', keys: { p256dh: 'key', auth: 'auth' } },
      },
    });
    expect(result.status).toBe(201);
    expect(result.body.data.created).toBe(true);

    const list = await client.request('GET', '/api/devices', { token: user.token });
    const device = list.body.data.devices.find((d: { label: string }) => d.label === 'Desktop Firefox');
    expect(device?.hasPush).toBe(true);
    expect(device?.platform).toBe('web');
  });

  it('updates the same row instead of duplicating when a subscription re-registers', async () => {
    const first = await client.request('POST', '/api/devices', {
      token: user.token,
      body: {
        label: 'Laptop Chrome',
        platform: 'web',
        subscription: { endpoint: 'https://push.example.com/sub-b', keys: { p256dh: 'key1', auth: 'auth1' } },
      },
    });
    const second = await client.request('POST', '/api/devices', {
      token: user.token,
      body: {
        label: 'Laptop Chrome (renamed)',
        platform: 'web',
        subscription: { endpoint: 'https://push.example.com/sub-b', keys: { p256dh: 'key2', auth: 'auth2' } },
      },
    });

    expect(second.body.data.updated).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);

    const list = await client.request('GET', '/api/devices', { token: user.token });
    expect(list.body.data.devices.filter((d: { id: string }) => d.id === first.body.data.id)).toHaveLength(1);
  });

  it('registers a device from a native FCM token instead of a subscription', async () => {
    const result = await client.request('POST', '/api/devices', {
      token: user.token,
      body: { label: 'Pixel 8', platform: 'android', fcmToken: 'fcm-token-1' },
    });
    expect(result.status).toBe(201);

    const list = await client.request('GET', '/api/devices', { token: user.token });
    const device = list.body.data.devices.find((d: { label: string }) => d.label === 'Pixel 8');
    expect(device?.hasPush).toBe(true);
    expect(device?.platform).toBe('android');
  });

  it('dedupes by FCM token the same way it dedupes by push endpoint', async () => {
    const first = await client.request('POST', '/api/devices', {
      token: user.token,
      body: { label: 'Pixel 9', platform: 'android', fcmToken: 'fcm-token-2' },
    });
    const second = await client.request('POST', '/api/devices', {
      token: user.token,
      body: { label: 'Pixel 9', platform: 'android', fcmToken: 'fcm-token-2' },
    });

    expect(second.body.data.updated).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);

    const list = await client.request('GET', '/api/devices', { token: user.token });
    expect(list.body.data.devices.filter((d: { id: string }) => d.id === first.body.data.id)).toHaveLength(1);
  });
});

describe('FCM delivery with no Firebase project configured', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'fcm-unconfigured@example.com', displayName: 'No Firebase' });
    await client.request('POST', '/api/devices', {
      token: user.token,
      body: { label: 'Android without Firebase set up', platform: 'android', fcmToken: 'fcm-token-unconfigured' },
    });
  });
  afterAll(() => client.close());

  it('reports no delivery rather than crashing when the server has no Firebase credentials', async () => {
    const result = await client.request('POST', '/api/devices/test', { token: user.token });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain('No device accepted');
  });
});
