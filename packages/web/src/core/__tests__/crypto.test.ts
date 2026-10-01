import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DecryptionFailed,
  loadOrCreateKeyPair,
  openMessage,
  publishMessageKey,
  sealMessage,
} from '../crypto.js';

const post = vi.fn((_path: string, _body?: unknown) => Promise.resolve({}));
vi.mock('../api.js', () => ({
  api: { post: (path: string, body?: unknown) => post(path, body) },
}));

/**
 * These run against the platform's real WebCrypto, not a stub. If the key
 * agreement or the AES-GCM framing were wrong, every one of them would fail —
 * which is the point, because "encrypted messages that will not decrypt" is a
 * bug someone only discovers after they have already sent something private.
 */
describe('message encryption', () => {
  async function pair() {
    localStorage.clear();
    const first = await loadOrCreateKeyPair();
    localStorage.clear();
    const second = await loadOrCreateKeyPair();
    if (!first || !second) throw new Error('WebCrypto is unavailable in this environment');
    return { first, second };
  }

  it('reuses the stored key pair rather than generating a new one each time', async () => {
    localStorage.clear();
    const first = await loadOrCreateKeyPair();
    const again = await loadOrCreateKeyPair();
    expect(again).toEqual(first);
  });

  it('round-trips a message between two key pairs', async () => {
    const { first, second } = await pair();
    const sealed = await sealMessage('you are allowed to rest', first.privateKeyJwk, second.publicKeyJwk);

    expect(sealed.encrypted).toBe(true);
    expect(sealed.body).not.toContain('rest');
    expect(sealed.body.split('.')).toHaveLength(2);

    const opened = await openMessage(sealed.body, second.privateKeyJwk, first.publicKeyJwk);
    expect(opened).toBe('you are allowed to rest');
  });

  it('produces a different ciphertext for the same text each time', async () => {
    const { first, second } = await pair();
    const a = await sealMessage('same words', first.privateKeyJwk, second.publicKeyJwk);
    const b = await sealMessage('same words', first.privateKeyJwk, second.publicKeyJwk);
    expect(a.body).not.toBe(b.body);
  });

  it('refuses a message sealed for someone else', async () => {
    const { first, second } = await pair();
    localStorage.clear();
    const outsider = await loadOrCreateKeyPair();
    if (!outsider) throw new Error('WebCrypto is unavailable in this environment');

    const sealed = await sealMessage('private', first.privateKeyJwk, second.publicKeyJwk);
    await expect(
      openMessage(sealed.body, outsider.privateKeyJwk, first.publicKeyJwk),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });

  it('refuses a tampered body instead of returning something wrong', async () => {
    const { first, second } = await pair();
    const sealed = await sealMessage('unedited', first.privateKeyJwk, second.publicKeyJwk);
    const [iv, cipher] = sealed.body.split('.') as [string, string];
    const flipped = `${cipher.slice(0, -2)}${cipher.slice(-2) === 'AA' ? 'AB' : 'AA'}`;

    await expect(
      openMessage(`${iv}.${flipped}`, second.privateKeyJwk, first.publicKeyJwk),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });

  it('reports a body that is not in the sealed format at all', async () => {
    const { first, second } = await pair();
    await expect(
      openMessage('not-sealed', second.privateKeyJwk, first.publicKeyJwk),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });
});

/**
 * Publishing used to retire a device's key under a hardcoded label shared by
 * every browser, so a second device signing in locked the first one out —
 * the bug this device-scoped identity exists to fix. These pin down the
 * replacement: a stable per-device id reused across calls, and a published
 * key id a viewer can tell its own fan-out copy apart by.
 */
describe('publishing a message key', () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
  });

  it('registers this device once and checks in under the same id after', async () => {
    post.mockImplementation((path: string) =>
      path === '/api/devices' ? Promise.resolve({ id: 'dev_1' }) : Promise.resolve({ keyId: 'mky_1' }),
    );

    const first = await publishMessageKey();
    expect(first?.deviceId).toBe('dev_1');
    expect(first?.activeKeyId).toBe('mky_1');

    await publishMessageKey();
    const deviceCalls = post.mock.calls.filter(([path]) => path === '/api/devices');
    expect(deviceCalls).toHaveLength(2);
    // The id this device was given the first time comes back on the second
    // check-in, so the server recognises it as the same device rather than
    // registering a new one.
    expect(deviceCalls[1]?.[1]).toMatchObject({ id: 'dev_1' });
  });

  it('keeps the key id already on record when a later check-in fails', async () => {
    let deviceCalls = 0;
    post.mockImplementation((path: string) => {
      if (path === '/api/devices') {
        deviceCalls += 1;
        return deviceCalls > 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ id: 'dev_1' });
      }
      return Promise.resolve({ keyId: 'mky_1' });
    });

    const first = await publishMessageKey();
    expect(first?.activeKeyId).toBe('mky_1');

    const second = await publishMessageKey();
    expect(second?.deviceId).toBe('dev_1');
    expect(second?.activeKeyId).toBe('mky_1');
  });

  it('returns the key pair without publishing when WebCrypto has nothing stored and the network is unreachable', async () => {
    post.mockImplementation(() => Promise.reject(new Error('offline')));
    const result = await publishMessageKey();
    expect(result?.deviceId).toBeUndefined();
    expect(result?.activeKeyId).toBeUndefined();
  });
});
