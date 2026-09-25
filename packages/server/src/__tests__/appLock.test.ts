import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('app lock', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('starts unconfigured, same as the vault before its own PIN is set', async () => {
    const account = await registerUser(client);
    const status = await client.request('GET', '/api/app-lock/status', { token: account.token });
    expect(status.status).toBe(200);
    expect(status.body.data.configured).toBe(false);
    expect(status.body.data.biometricRegistered).toBe(false);
  });

  it('rejects a PIN that is not 4 to 8 digits', async () => {
    const account = await registerUser(client);
    const setup = await client.request('POST', '/api/app-lock/setup', {
      token: account.token,
      body: { pin: '12' },
    });
    expect(setup.status).toBe(400);
  });

  it('sets up a PIN and is immediately unlocked', async () => {
    const account = await registerUser(client);
    const setup = await client.request('POST', '/api/app-lock/setup', {
      token: account.token,
      body: { pin: '4242' },
    });
    expect(setup.status).toBe(200);
    expect(setup.body.data.unlocked).toBe(true);

    const status = await client.request('GET', '/api/app-lock/status', { token: account.token });
    expect(status.body.data.configured).toBe(true);
    expect(status.body.data.unlocked).toBe(true);
  });

  it('locks and requires the PIN to unlock again', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });

    const locked = await client.request('POST', '/api/app-lock/lock', { token: account.token });
    expect(locked.status).toBe(200);
    expect(locked.body.data.unlocked).toBe(false);

    const stillLocked = await client.request('GET', '/api/app-lock/status', { token: account.token });
    expect(stillLocked.body.data.unlocked).toBe(false);

    const wrong = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '0000' },
    });
    expect(wrong.status).toBe(401);

    const right = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '4242' },
    });
    expect(right.status).toBe(200);
    expect(right.body.data.unlocked).toBe(true);
  });

  it('rate-limits unlock attempts separately from the vault', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });
    await client.request('POST', '/api/vault/setup', { token: account.token, body: { pin: '4242' } });
    await client.request('POST', '/api/app-lock/lock', { token: account.token });
    await client.request('POST', '/api/vault/lock', { token: account.token });

    // Exhausting the vault's unlock attempts must not touch app lock's budget.
    for (let i = 0; i < 6; i += 1) {
      await client.request('POST', '/api/vault/unlock', { token: account.token, body: { pin: '0000' } });
    }
    const vaultBlocked = await client.request('POST', '/api/vault/unlock', {
      token: account.token,
      body: { pin: '0000' },
    });
    expect(vaultBlocked.status).toBe(429);

    const appLockStillWorks = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '4242' },
    });
    expect(appLockStillWorks.status).toBe(200);
  });

  it('rate-limits its own unlock attempts', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });
    await client.request('POST', '/api/app-lock/lock', { token: account.token });

    for (let i = 0; i < 6; i += 1) {
      await client.request('POST', '/api/app-lock/unlock', { token: account.token, body: { pin: '0000' } });
    }
    const seventh = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '0000' },
    });
    expect(seventh.status).toBe(429);
  });

  it('changes the PIN with the current one and refuses without it', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });

    const noCurrentPin = await client.request('POST', '/api/app-lock/setup', {
      token: account.token,
      body: { pin: '5252' },
    });
    expect(noCurrentPin.status).toBe(401);

    const changed = await client.request('POST', '/api/app-lock/setup', {
      token: account.token,
      body: { pin: '5252', currentPin: '4242' },
    });
    expect(changed.status).toBe(200);

    await client.request('POST', '/api/app-lock/lock', { token: account.token });
    const unlockOld = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '4242' },
    });
    expect(unlockOld.status).toBe(401);

    const unlockNew = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '5252' },
    });
    expect(unlockNew.status).toBe(200);
  });

  it('removes the PIN with the current one, turning the lock off', async () => {
    const account = await registerUser(client);
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });

    const wrongRemove = await client.request('DELETE', '/api/app-lock/pin', {
      token: account.token,
      body: { pin: '0000' },
    });
    expect(wrongRemove.status).toBe(401);

    const removed = await client.request('DELETE', '/api/app-lock/pin', {
      token: account.token,
      body: { pin: '4242' },
    });
    expect(removed.status).toBe(200);
    expect(removed.body.data.configured).toBe(false);

    const status = await client.request('GET', '/api/app-lock/status', { token: account.token });
    expect(status.body.data.configured).toBe(false);
  });

  it('recovers a forgotten PIN with the account password', async () => {
    const account = await registerUser(client, { email: 'recover-me@example.com' });
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '4242' } });
    await client.request('POST', '/api/app-lock/lock', { token: account.token });

    const wrongPassword = await client.request('POST', '/api/app-lock/recover', {
      token: account.token,
      body: { accountPassword: 'not-it-at-all', newPin: '9999' },
    });
    expect(wrongPassword.status).toBe(401);

    const recovered = await client.request('POST', '/api/app-lock/recover', {
      token: account.token,
      body: { accountPassword: 'a-strong-password-1', newPin: '9999' },
    });
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.unlocked).toBe(true);

    await client.request('POST', '/api/app-lock/lock', { token: account.token });
    const unlockNew = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '9999' },
    });
    expect(unlockNew.status).toBe(200);
  });

  it('keeps app lock separate from the vault PIN', async () => {
    const account = await registerUser(client, { email: 'separate@example.com' });
    await client.request('POST', '/api/app-lock/setup', { token: account.token, body: { pin: '1111' } });
    await client.request('POST', '/api/vault/setup', { token: account.token, body: { pin: '2222' } });

    const crossed = await client.request('POST', '/api/app-lock/unlock', {
      token: account.token,
      body: { pin: '2222' },
    });
    expect(crossed.status).toBe(401);

    const vaultStatus = await client.request('GET', '/api/vault/status', { token: account.token });
    expect(vaultStatus.body.data.configured).toBe(true);
  });

  it('requires authentication', async () => {
    const result = await client.request('GET', '/api/app-lock/status');
    expect(result.status).toBe(401);
  });
});
