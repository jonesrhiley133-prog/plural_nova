import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';
import { notify } from '../services/notifications.js';
import * as push from '../services/push.js';

describe('badges', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'badges@example.com', displayName: 'Badges' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('counts an unread system chat thread on its own badge, separate from Messages', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token: user.token });
    const threadId = threads.body.data.threads[0].id;

    const before = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(before.body.data.systemChat).toBe(0);
    expect(before.body.data.messages).toBe(0);

    await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token: user.token,
      body: { body: 'hello system' },
    });

    const withUnread = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(withUnread.body.data.systemChat).toBe(1);
    expect(withUnread.body.data.messages).toBe(0);
    expect(withUnread.body.data.total).toBe(
      withUnread.body.data.notifications + withUnread.body.data.friendRequests + 1,
    );

    await client.request('POST', `/api/system/chat/threads/${threadId}/read`, { token: user.token });

    const afterRead = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(afterRead.body.data.systemChat).toBe(0);
  });
});

describe('the in-app and push channels are independent', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'channels@example.com', displayName: 'Channels' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('still pushes a category whose in-app channel is off', async () => {
    const sendPush = vi.spyOn(push, 'sendPush').mockResolvedValue(1);
    try {
      await client.request('PUT', '/api/auth/settings', {
        token: user.token,
        body: {
          notifications: { fronting: { inApp: false, foreground: true, push: true, badge: true } },
        },
      });

      const result = await notify({
        userId: user.userId,
        category: 'fronting',
        kind: 'front.started',
        title: 'Someone is fronting',
        link: '/fronting',
      });

      expect(result).toBeNull();
      expect(sendPush).toHaveBeenCalledTimes(1);

      const list = await client.request('GET', '/api/notifications', { token: user.token });
      expect(
        list.body.data.notifications.find((n: { kind: string }) => n.kind === 'front.started'),
      ).toBeUndefined();
    } finally {
      sendPush.mockRestore();
    }
  });

  it('still shows a category whose push channel is off', async () => {
    const sendPush = vi.spyOn(push, 'sendPush').mockResolvedValue(0);
    try {
      await client.request('PUT', '/api/auth/settings', {
        token: user.token,
        body: {
          notifications: { fronting: { inApp: true, foreground: true, push: false, badge: true } },
        },
      });

      const result = await notify({
        userId: user.userId,
        category: 'fronting',
        kind: 'front.ended',
        title: 'Fronting ended',
        link: '/fronting',
      });

      expect(result).not.toBeNull();
      expect(sendPush).not.toHaveBeenCalled();

      const list = await client.request('GET', '/api/notifications', { token: user.token });
      expect(
        list.body.data.notifications.find((n: { kind: string }) => n.kind === 'front.ended'),
      ).toBeTruthy();
    } finally {
      sendPush.mockRestore();
    }
  });
});

describe('cozy messages', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'cozy@example.com', displayName: 'Cozy' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('drops a cozy-only notification when the setting is off, but leaves an ordinary one alone', async () => {
    await client.request('PUT', '/api/auth/settings', { token: user.token, body: { cozyMessages: false } });

    const cozy = await notify({
      userId: user.userId,
      category: 'birthdays',
      kind: 'birthday.annual',
      title: "Someone's birthday is today!",
      link: '/calendar',
    });
    expect(cozy).toBeNull();

    const ordinary = await notify({
      userId: user.userId,
      category: 'fronting',
      kind: 'front.started',
      title: 'Someone is fronting',
      link: '/fronting',
    });
    expect(ordinary).not.toBeNull();

    await client.request('PUT', '/api/auth/settings', { token: user.token, body: { cozyMessages: true } });
  });

  it('notifies when a board post is created, through the generic records route', async () => {
    const created = await client.request('POST', '/api/records/boards', {
      token: user.token,
      body: { boardType: 'vibe', body: 'feeling alright today' },
    });
    expect(created.status).toBe(201);

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find((n: { kind: string }) => n.kind === 'board.posted');
    expect(found).toBeTruthy();
    expect(found.link).toBe('/boards');
  });
});
