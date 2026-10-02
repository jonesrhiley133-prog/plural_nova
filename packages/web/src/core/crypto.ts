/**
 * Message encryption — historical only.
 *
 * Messages no longer seals anything new; every message sent today is plain
 * text, and `sealMessage`/`publishMessageKey` have no caller left in the app.
 * What stays real is reading what this was used for before: an ECDH key pair
 * generated in the browser, its private half never leaving it, derives the
 * same shared secret as whoever it talked to, and `openMessage` undoes the
 * AES-GCM sealing a past version of this conversation used. Removing this
 * module would make old conversations un-openable, which is a worse outcome
 * than carrying a retired code path.
 */

import { api } from './api.js';
import { deviceLabel } from './push.js';

const KEY_STORAGE = 'pluralnova.messageKey';
const ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface KeyPairRecord {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
  /**
   * This browser's own row in the `devices` collection — the same identity
   * push notifications register under — reused as a stable `deviceLabel`
   * rather than inventing a second notion of "this device". Absent until the
   * first successful check-in.
   */
  deviceId?: string;
  /** This device's own current active key id, once published. Lets a received message's sealed copies be told apart: the one variant addressed to this id is this device's; any other is addressed to a different device entirely. */
  activeKeyId?: string;
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.generateKey === 'function';
}

function persist(record: KeyPairRecord): void {
  try {
    localStorage.setItem(KEY_STORAGE, JSON.stringify(record));
  } catch {
    // Without storage the key lasts for this session only; messages sent with
    // it stay readable for as long as the tab is open, and the next launch
    // publishes a new one.
  }
}

export async function loadOrCreateKeyPair(): Promise<KeyPairRecord | null> {
  if (!cryptoAvailable()) return null;

  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) return JSON.parse(stored) as KeyPairRecord;
  } catch {
    // Unreadable storage falls through to generating a fresh pair.
  }

  try {
    const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['deriveKey', 'deriveBits']);
    const record: KeyPairRecord = {
      publicKeyJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
      privateKeyJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      createdAt: new Date().toISOString(),
    };
    persist(record);
    return record;
  } catch {
    return null;
  }
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['deriveKey']);
}

async function importPublic(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, []);
}

async function deriveSharedKey(privateJwk: JsonWebKey, publicJwk: JsonWebKey): Promise<CryptoKey> {
  const [privateKey, publicKey] = await Promise.all([
    importPrivate(privateJwk),
    importPublic(publicJwk),
  ]);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  // Backed by an explicit ArrayBuffer so the result satisfies BufferSource.
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export interface SealedMessage {
  /** `iv.ciphertext`, both base64 — the shape the server stores verbatim. */
  body: string;
  encrypted: true;
}

export async function sealMessage(
  plaintext: string,
  privateJwk: JsonWebKey,
  recipientPublicJwk: JsonWebKey,
): Promise<SealedMessage> {
  const key = await deriveSharedKey(privateJwk, recipientPublicJwk);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext).slice().buffer,
  );
  return { body: `${toBase64(iv)}.${toBase64(ciphertext)}`, encrypted: true };
}

export class DecryptionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionFailed';
  }
}

export async function openMessage(
  sealed: string,
  privateJwk: JsonWebKey,
  senderPublicJwk: JsonWebKey,
): Promise<string> {
  const [ivPart, cipherPart] = sealed.split('.');
  if (!ivPart || !cipherPart) {
    throw new DecryptionFailed('This message is not in a format PluralNova can read.');
  }

  try {
    const key = await deriveSharedKey(privateJwk, senderPublicJwk);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivPart) },
      key,
      fromBase64(cipherPart),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // Almost always a key mismatch: the sender encrypted to a key this device
    // no longer holds. Said plainly, because a blank message is worse.
    throw new DecryptionFailed(
      'This message was encrypted to a key this device does not have. It cannot be read here.',
    );
  }
}

/**
 * This browser's row in the `devices` collection: created on first use and
 * matched by id after, so every call from the same browser confirms the same
 * device rather than registering a new one. Carries no push credentials of
 * its own, and (per the server's own handling of such a check-in) never
 * touches a push subscription this device may separately have registered.
 */
async function ensureDeviceId(pair: KeyPairRecord): Promise<string | null> {
  try {
    const result = await api.post<{ id: string }>('/api/devices', {
      id: pair.deviceId,
      label: deviceLabel(),
      platform: navigator.platform || navigator.userAgent.slice(0, 80),
    });
    if (result.id !== pair.deviceId) {
      pair.deviceId = result.id;
      persist(pair);
    }
    return result.id;
  } catch {
    return pair.deviceId ?? null;
  }
}

/**
 * Publishes this device's public key so other systems can encrypt to it, and
 * returns the key pair with its current server-assigned key id attached —
 * the id a received message's sealed copies are matched against to find the
 * one addressed to this device.
 *
 * Called once per session, from the point the account is known, and again
 * whenever a conversation needs the result. Safe to repeat: the server keys
 * the registry on this device's own stable id, not on the call, so publishing
 * again confirms the same key stays active rather than rotating it.
 */
export async function publishMessageKey(): Promise<KeyPairRecord | null> {
  const pair = await loadOrCreateKeyPair();
  if (!pair) return null;
  const deviceId = await ensureDeviceId(pair);
  if (!deviceId) return pair;
  try {
    const result = await api.post<{ keyId: string }>('/api/messages/keys', {
      publicKey: JSON.stringify(pair.publicKeyJwk),
      deviceLabel: deviceId,
    });
    if (result.keyId !== pair.activeKeyId) {
      pair.activeKeyId = result.keyId;
      persist(pair);
    }
  } catch {
    // Without this, messages to this device are sent in the clear and labelled
    // as such. That is a worse conversation, not a broken one.
  }
  return pair;
}
