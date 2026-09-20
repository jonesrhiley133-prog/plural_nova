/**
 * Message encryption.
 *
 * Real, or absent. An ECDH key pair is generated in the browser and the private
 * half never leaves it; the public half is published so others can derive the
 * same shared secret. Bodies are sealed with AES-GCM before they are sent, so
 * the server stores ciphertext it has no way to read.
 *
 * When the other side has published no key there is nothing to encrypt to. The
 * message is sent in the clear and the interface says so — a padlock over
 * plaintext would be worse than no padlock at all.
 */

const KEY_STORAGE = 'pluralnova.messageKey';
const ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface KeyPairRecord {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.generateKey === 'function';
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
    try {
      localStorage.setItem(KEY_STORAGE, JSON.stringify(record));
    } catch {
      // Without storage the key lasts for this session only; messages sent with
      // it stay readable for as long as the tab is open, and the next launch
      // publishes a new one.
    }
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
