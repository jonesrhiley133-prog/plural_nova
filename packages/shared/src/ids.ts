/**
 * Identifier helpers.
 *
 * Ids are generated on whichever side creates the record — the client mints ids
 * for offline-first writes, the server mints them for anything it originates —
 * so they must be collision-resistant without coordination. A 22-character
 * base32 random suffix gives ~110 bits of entropy; the prefix keeps ids
 * legible in logs and backups.
 */

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford-ish: no i, l, o, u

/** Both Node and browsers expose this; typed structurally so neither lib is required. */
interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const source = (globalThis as { crypto?: Partial<RandomSource> }).crypto;
  if (typeof source?.getRandomValues === 'function') {
    return source.getRandomValues(out);
  }
  for (let i = 0; i < length; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Random token of `length` characters from the id alphabet. */
export function randomToken(length = 22): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** `prefix_xxxxxxxx…` — stable, sortable-by-nothing, unique everywhere. */
export function newId(prefix: string): string {
  return `${prefix}_${randomToken(22)}`;
}

/** Short human-facing code (invite codes, recovery codes). */
export function newCode(groups = 3, size = 4): string {
  return Array.from({ length: groups }, () => randomToken(size).toUpperCase()).join('-');
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]+_[0-9a-z]{16,32}$/.test(value);
}
