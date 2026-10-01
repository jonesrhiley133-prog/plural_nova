import { describe, expect, it } from 'vitest';
import { DecryptionFailed, loadOrCreateKeyPair, sealMessage } from '../crypto.js';
import { decryptMessageBody } from '../messages.js';

/**
 * The fan-out decrypt algorithm. A message encrypted after the multi-device
 * fix carries one sealed copy per device that might need to read it, each
 * tagged with that device's own key id. These pin down the three shapes a
 * viewer can be in — the intended recipient, the account's own other device,
 * and the sending device re-reading its own history — plus the single-
 * ciphertext shape from before the fix, which still has to keep decrypting.
 */
describe('decryptMessageBody', () => {
  async function device() {
    localStorage.clear();
    const pair = await loadOrCreateKeyPair();
    if (!pair) throw new Error('WebCrypto is unavailable in this environment');
    return pair;
  }

  it('decrypts the copy addressed to this device, pairing with the sender key', async () => {
    const alice = await device();
    const bob = await device();
    const sealed = await sealMessage('hello', alice.privateKeyJwk, bob.publicKeyJwk);
    const body = JSON.stringify([{ keyId: 'bob-key', body: sealed.body }]);
    const directory = new Map([['alice-key', alice.publicKeyJwk]]);

    const opened = await decryptMessageBody(body, 'alice-key', bob.privateKeyJwk, 'bob-key', directory, null);
    expect(opened).toBe('hello');
  });

  it("lets the sender's own other device read the copy addressed to it", async () => {
    const alice1 = await device();
    const alice2 = await device();
    const bob = await device();
    // Sealed between Alice's two devices, as the fan-out does for every
    // device besides the one actually sending.
    const sealed = await sealMessage('hello', alice1.privateKeyJwk, alice2.publicKeyJwk);
    const body = JSON.stringify([{ keyId: 'alice2-key', body: sealed.body }]);
    const directory = new Map([
      ['alice1-key', alice1.publicKeyJwk],
      ['bob-key', bob.publicKeyJwk],
    ]);

    const opened = await decryptMessageBody(body, 'alice1-key', alice2.privateKeyJwk, 'alice2-key', directory, null);
    expect(opened).toBe('hello');
  });

  it('falls back to the first copy when none match: the sender re-reading their own message', async () => {
    const alice = await device();
    const bob = await device();
    const sealed = await sealMessage('hello', alice.privateKeyJwk, bob.publicKeyJwk);
    const body = JSON.stringify([{ keyId: 'bob-key', body: sealed.body }]);
    const directory = new Map([['bob-key', bob.publicKeyJwk]]);

    // No copy is addressed to Alice's own key id — she sent this, so the
    // fan-out never targeted her sending device.
    const opened = await decryptMessageBody(body, 'alice-key', alice.privateKeyJwk, 'alice-key', directory, null);
    expect(opened).toBe('hello');
  });

  it('opens a pre-fan-out message sealed as a single ciphertext', async () => {
    const alice = await device();
    const bob = await device();
    const sealed = await sealMessage('legacy message', alice.privateKeyJwk, bob.publicKeyJwk);

    const opened = await decryptMessageBody(sealed.body, 'browser', bob.privateKeyJwk, undefined, new Map(), alice.publicKeyJwk);
    expect(opened).toBe('legacy message');
  });

  it('refuses a legacy-shaped body when no legacy key is known', async () => {
    const bob = await device();
    await expect(
      decryptMessageBody('not-json', '', bob.privateKeyJwk, undefined, new Map(), null),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });

  it('refuses a fan-out copy this device cannot pair a sender key for', async () => {
    const alice = await device();
    const bob = await device();
    const sealed = await sealMessage('hello', alice.privateKeyJwk, bob.publicKeyJwk);
    const body = JSON.stringify([{ keyId: 'bob-key', body: sealed.body }]);

    // Bob's own key id matches, but his key directory has nothing for
    // "alice-key" — nothing to resolve the sender's public key against.
    await expect(
      decryptMessageBody(body, 'alice-key', bob.privateKeyJwk, 'bob-key', new Map(), null),
    ).rejects.toBeInstanceOf(DecryptionFailed);
  });
});
