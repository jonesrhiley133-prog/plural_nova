import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('authentication', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('registers an account, creates a system, and issues a recovery code once', async () => {
    const result = await client.request('POST', '/api/auth/register', {
      body: {
        email: 'vega@example.com',
        password: 'constellation-42',
        displayName: 'Vega',
        systemName: 'The Meridian System',
      },
    });

    expect(result.status).toBe(201);
    expect(result.body.data.user.email).toBe('vega@example.com');
    expect(result.body.data.user.activeSystemId).toBeTruthy();
    expect(result.body.data.recoveryCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    expect(result.body.data.settings.mode).toBe('system');

    // The recovery code is never returned again.
    const me = await client.request('GET', '/api/auth/me', { token: result.body.data.token });
    expect(me.body.data.recoveryCode).toBeUndefined();
  });

  it('rejects a weak password with a field-level message', async () => {
    const result = await client.request('POST', '/api/auth/register', {
      body: { email: 'weak@example.com', password: 'short', displayName: 'Weak' },
    });
    expect(result.status).toBe(422);
    expect(result.body.error.details.password).toContain('10 characters');
  });

  it('refuses a duplicate email', async () => {
    await registerUser(client, { email: 'twice@example.com' });
    const second = await client.request('POST', '/api/auth/register', {
      body: { email: 'twice@example.com', password: 'a-strong-password-1', displayName: 'Again' },
    });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('already an account');
  });

  it('signs in and keeps the session working across requests', async () => {
    await registerUser(client, { email: 'signin@example.com' });
    const login = await client.request('POST', '/api/auth/login', {
      body: { email: 'signin@example.com', password: 'a-strong-password-1' },
    });
    expect(login.status).toBe(200);

    const me = await client.request('GET', '/api/auth/me', { token: login.body.data.token });
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('signin@example.com');
  });

  it('gives the same answer whether or not an email is registered', async () => {
    const known = await client.request('POST', '/api/auth/forgot-password', {
      body: { email: 'signin@example.com' },
    });
    const unknown = await client.request('POST', '/api/auth/forgot-password', {
      body: { email: 'nobody-at-all@example.com' },
    });
    expect(known.body.data.message).toBe(unknown.body.data.message);
    expect(known.status).toBe(unknown.status);
  });

  it('resets a password with a code and revokes existing sessions', async () => {
    const account = await registerUser(client, { email: 'reset@example.com' });
    const forgot = await client.request('POST', '/api/auth/forgot-password', {
      body: { email: 'reset@example.com' },
    });
    const code = forgot.body.data.devCode as string | undefined;
    expect(code).toBeTruthy();

    const reset = await client.request('POST', '/api/auth/reset-password', {
      body: { email: 'reset@example.com', code, password: 'a-brand-new-password-9' },
    });
    expect(reset.status).toBe(200);

    const oldSession = await client.request('GET', '/api/auth/me', { token: account.token });
    expect(oldSession.status).toBe(401);

    const newSession = await client.request('GET', '/api/auth/me', { token: reset.body.data.token });
    expect(newSession.status).toBe(200);
  });

  it('revokes the session on sign-out', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/auth/logout', { token: account.token });
    const after = await client.request('GET', '/api/auth/me', { token: account.token });
    expect(after.status).toBe(401);
  });

  it('refuses unauthenticated access with a readable message', async () => {
    const result = await client.request('GET', '/api/records/members');
    expect(result.status).toBe(401);
    expect(result.body.error.message).toBe('Sign in to continue.');
    expect(result.body.error.message).not.toContain('undefined');
  });

  it('seeds a guest account with demo data that survives a reload', async () => {
    const guest = await client.request('POST', '/api/auth/guest', { body: { days: 30 } });
    expect(guest.status).toBe(201);
    const token = guest.body.data.token;

    const members = await client.request('GET', '/api/records/members', { token });
    expect(members.body.data.total).toBeGreaterThan(3);

    const fronts = await client.request('GET', '/api/records/frontEvents', { token });
    expect(fronts.body.data.total).toBeGreaterThan(10);

    // Signing in again returns the same data — guest data is stored, not generated per session.
    const again = await client.request('GET', '/api/records/members', { token });
    expect(again.body.data.total).toBe(members.body.data.total);
  });

  it('turns a guest account into a real one without losing data', async () => {
    const guest = await client.request('POST', '/api/auth/guest', { body: { days: 7 } });
    const token = guest.body.data.token;
    const before = await client.request('GET', '/api/records/journalEntries', { token });

    const claimed = await client.request('POST', '/api/auth/claim', {
      token,
      body: { email: 'claimed@example.com', password: 'a-strong-password-1' },
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.data.user.isGuest).toBe(false);

    const after = await client.request('GET', '/api/records/journalEntries', { token });
    expect(after.body.data.total).toBe(before.body.data.total);
  });

  it('logs a restorable entry when a setting changes, and restoring it puts the value back', async () => {
    const account = await registerUser(client);
    const me = await client.request('GET', '/api/auth/me', { token: account.token });
    const originalWeekStart = me.body.data.settings.weekStart;
    const flipped = originalWeekStart === 1 ? 0 : 1;

    const changed = await client.request('PUT', '/api/auth/settings', {
      token: account.token,
      body: { weekStart: flipped },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.settings.weekStart).toBe(flipped);

    const history = await client.request('GET', '/api/stats/activity', { token: account.token });
    const entry = (history.body.data.items as any[]).find(
      (item) => item.entityId === 'weekStart' && item.restorable,
    );
    expect(entry).toBeTruthy();
    expect(entry.category).toBe('settings');
    expect(JSON.parse(entry.newValue)).toBe(flipped);
    expect(JSON.parse(entry.previousValue)).toBe(originalWeekStart);

    const restored = await client.request('POST', `/api/auth/history/${entry.id}/restore`, {
      token: account.token,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.settings.weekStart).toBe(originalWeekStart);

    // A restored entry cannot be restored a second time.
    const again = await client.request('POST', `/api/auth/history/${entry.id}/restore`, {
      token: account.token,
    });
    expect(again.status).toBe(400);
  });

  it('reports category counts on the activity feed and can filter by one', async () => {
    const account = await registerUser(client);
    await client.request('PUT', '/api/auth/settings', {
      token: account.token,
      body: { weekStart: 0 },
    });

    const history = await client.request('GET', '/api/stats/activity', { token: account.token });
    const categories = history.body.data.categories as { key: string; count: number }[];
    expect(categories.some((entry) => entry.key === 'settings')).toBe(true);

    const filtered = await client.request('GET', '/api/stats/activity?category=settings', {
      token: account.token,
    });
    expect(filtered.body.data.items.length).toBeGreaterThan(0);
    expect((filtered.body.data.items as any[]).every((item) => item.category === 'settings')).toBe(true);
  });
});
