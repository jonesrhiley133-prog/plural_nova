import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password storage.
 *
 * scrypt with a per-password salt, from Node's own crypto — no plaintext, no
 * reversible encoding, and no third-party dependency in the path that protects
 * everyone's account. Comparison is constant-time so a wrong password cannot be
 * narrowed down by timing it.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface PasswordHash {
  hash: string;
  salt: string;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string | null; salt: string | null },
): Promise<boolean> {
  if (!stored.hash || !stored.salt) return false;
  const salt = Buffer.from(stored.salt, 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  const derived = await scryptAsync(password, salt, expected.length || KEY_LENGTH);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Same construction, reused for vault PINs and recovery codes. */
export const hashSecret = hashPassword;
export const verifySecret = verifyPassword;
