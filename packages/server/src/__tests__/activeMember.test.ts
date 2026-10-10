import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * A PIN-protected member's PIN gates two different things: switching the
 * account's active profile (`/active-member`, already existing) and, new
 * here, just confirming "yes, this is really them" for one moment without
 * also reassigning that active profile — the speaking-identity a Direct
 * Message is sent as must not quietly become the account's default
 * attribution everywhere else just because its PIN was entered once.
 */
describe('member PIN verification', () => {
  let client: TestClient;
  let user: { token: string; userId: string };
  let lockedId: string;
  let openId: string;

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'pinverify@example.com', displayName: 'Pin Verify' });

    await client.request('PUT', '/api/auth/settings', {
      token: user.token,
      body: { privacy: { requireProfilePins: true } },
    });

    const locked = await client.request('POST', '/api/records/members', { token: user.token, body: { name: 'Locked' } });
    lockedId = locked.body.data.id;
    await client.request('POST', `/api/system/members/${lockedId}/pin`, { token: user.token, body: { pin: '4242' } });

    const open = await client.request('POST', '/api/records/members', { token: user.token, body: { name: 'Open' } });
    openId = open.body.data.id;
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('rejects a wrong PIN and accepts the right one, without touching activeMemberId', async () => {
    const before = await client.request('GET', '/api/auth/me', { token: user.token });
    expect(before.body.data.user.activeMemberId).toBeNull();

    const wrong = await client.request('POST', `/api/system/members/${lockedId}/verify-pin`, {
      token: user.token,
      body: { pin: '0000' },
    });
    expect(wrong.status).toBe(400);

    const right = await client.request('POST', `/api/system/members/${lockedId}/verify-pin`, {
      token: user.token,
      body: { pin: '4242' },
    });
    expect(right.status).toBe(200);
    expect(right.body.data.verified).toBe(true);

    // Unlike /active-member, verifying never reassigns the account's active profile.
    const after = await client.request('GET', '/api/auth/me', { token: user.token });
    expect(after.body.data.user.activeMemberId).toBeNull();
  });

  it('needs no PIN at all for a member who was never given one', async () => {
    const result = await client.request('POST', `/api/system/members/${openId}/verify-pin`, {
      token: user.token,
      body: {},
    });
    expect(result.status).toBe(200);
    expect(result.body.data.verified).toBe(true);
  });
});
