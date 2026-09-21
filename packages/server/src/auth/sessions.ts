import { createHash, randomBytes } from 'node:crypto';
import { newId, now } from '@pluralnova/shared';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

/**
 * Sessions are opaque random tokens, not signed claims.
 *
 * The server keeps only a SHA-256 of the token, so a database copy does not hand
 * anyone a working session, and revocation is real: signing out, deleting the
 * account or losing a device removes the row and the token stops working
 * immediately. A self-contained token could not do that.
 */

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  vaultUnlockedUntil: string | null;
  revokedAt: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string, userAgent?: string): { token: string; session: SessionRow } {
  const token = randomBytes(32).toString('base64url');
  const createdAt = now();
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
  const session: SessionRow = {
    id: newId('ses'),
    userId,
    tokenHash: hashToken(token),
    createdAt,
    expiresAt,
    lastSeenAt: createdAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
    vaultUnlockedUntil: null,
    revokedAt: null,
  };
  getDb()
    .prepare(
      `INSERT INTO sessions (id, userId, tokenHash, createdAt, expiresAt, lastSeenAt, userAgent, vaultUnlockedUntil, revokedAt)
       VALUES (@id, @userId, @tokenHash, @createdAt, @expiresAt, @lastSeenAt, @userAgent, @vaultUnlockedUntil, @revokedAt)`,
    )
    .run(session);
  return { token, session };
}

export function findSession(token: string): SessionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM sessions WHERE tokenHash = ?')
    .get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt <= now()) return null;
  return row;
}

export function touchSession(id: string): void {
  getDb().prepare('UPDATE sessions SET lastSeenAt = ? WHERE id = ?').run(now(), id);
}

export function revokeSession(id: string): void {
  getDb().prepare('UPDATE sessions SET revokedAt = ? WHERE id = ?').run(now(), id);
}

export function revokeAllSessions(userId: string, exceptId?: string): void {
  if (exceptId) {
    getDb()
      .prepare('UPDATE sessions SET revokedAt = ? WHERE userId = ? AND id != ? AND revokedAt IS NULL')
      .run(now(), userId, exceptId);
  } else {
    getDb()
      .prepare('UPDATE sessions SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL')
      .run(now(), userId);
  }
}

export function listSessions(userId: string): SessionRow[] {
  return getDb()
    .prepare('SELECT * FROM sessions WHERE userId = ? AND revokedAt IS NULL ORDER BY lastSeenAt DESC')
    .all(userId) as SessionRow[];
}

export function unlockVault(sessionId: string, minutes: number): string {
  const until = new Date(Date.now() + Math.max(1, minutes) * 60_000).toISOString();
  getDb().prepare('UPDATE sessions SET vaultUnlockedUntil = ? WHERE id = ?').run(until, sessionId);
  return until;
}

export function lockVault(sessionId: string): void {
  getDb().prepare('UPDATE sessions SET vaultUnlockedUntil = NULL WHERE id = ?').run(sessionId);
}

export function isVaultUnlocked(session: SessionRow): boolean {
  return Boolean(session.vaultUnlockedUntil && session.vaultUnlockedUntil > now());
}

/** Housekeeping: drop sessions that expired or were revoked more than a week ago. */
export function pruneSessions(): number {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const result = getDb()
    .prepare('DELETE FROM sessions WHERE expiresAt < ? OR (revokedAt IS NOT NULL AND revokedAt < ?)')
    .run(now(), cutoff);
  return result.changes;
}
