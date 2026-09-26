import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('badges', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'badges@example.com', displayName: 'Badges' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('counts an unread system chat thread the same as a chat destination now shares with dms', async () => {
    const threads = await client.request('GET', '/api/system/chat/threads', { token: user.token });
    const threadId = threads.body.data.threads[0].id;

    const before = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(before.body.data.messages).toBe(0);

    await client.request('POST', `/api/system/chat/threads/${threadId}/messages`, {
      token: user.token,
      body: { body: 'hello system' },
    });

    const withUnread = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(withUnread.body.data.messages).toBe(1);
    expect(withUnread.body.data.total).toBe(withUnread.body.data.notifications + withUnread.body.data.friendRequests + 1);

    await client.request('POST', `/api/system/chat/threads/${threadId}/read`, { token: user.token });

    const afterRead = await client.request('GET', '/api/notifications/badges', { token: user.token });
    expect(afterRead.body.data.messages).toBe(0);
  });
});
