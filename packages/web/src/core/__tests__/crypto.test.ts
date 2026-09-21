import { describe, expect, it } from 'vitest';
import {
  DecryptionFailed,
  loadOrCreateKeyPair,
  openMessage,
  sealMessage,
} from '../crypto.js';

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
