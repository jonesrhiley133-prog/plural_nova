import { mergeSettings, newId, now, type AppSettings, type PublicUser } from '@pluralnova/shared';
import { getDb } from '../db/index.js';

export interface UserRow {
  id: string;
  email: string | null;
  displayName: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  mode: 'system' | 'singlet';
  activeSystemId: string | null;
  activeMemberId: string | null;
  settings: string;
  vaultPinHash: string | null;
  vaultPinSalt: string | null;
  recoveryCodeHash: string | null;
  resetCodeHash: string | null;
  resetExpiresAt: string | null;
  isGuest: number;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function findUserById(id: string): UserRow | null {
  return (getDb().prepare('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL').get(id) as
    | UserRow
    | undefined) ?? null;
}

export function findUserByEmail(email: string): UserRow | null {
  return (getDb()
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND deletedAt IS NULL')
    .get(email.trim()) as UserRow | undefined) ?? null;
}

export function insertUser(input: {
  email: string | null;
  displayName: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  mode: 'system' | 'singlet';
  isGuest?: boolean;
  settings?: Partial<AppSettings>;
}): UserRow {
  const timestamp = now();
  const row: UserRow = {
    id: newId('usr'),
    email: input.email?.trim().toLowerCase() ?? null,
    displayName: input.displayName.trim() || 'Someone',
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    mode: input.mode,
    activeSystemId: null,
    activeMemberId: null,
    settings: JSON.stringify(mergeSettings({ ...input.settings, mode: input.mode })),
    vaultPinHash: null,
    vaultPinSalt: null,
    recoveryCodeHash: null,
    resetCodeHash: null,
    resetExpiresAt: null,
    isGuest: input.isGuest ? 1 : 0,
    onboardedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  getDb()
    .prepare(
      `INSERT INTO users (id, email, displayName, passwordHash, passwordSalt, mode, activeSystemId,
        activeMemberId, settings, vaultPinHash, vaultPinSalt, recoveryCodeHash, resetCodeHash,
        resetExpiresAt, isGuest, onboardedAt, createdAt, updatedAt, deletedAt)
       VALUES (@id, @email, @displayName, @passwordHash, @passwordSalt, @mode, @activeSystemId,
        @activeMemberId, @settings, @vaultPinHash, @vaultPinSalt, @recoveryCodeHash, @resetCodeHash,
        @resetExpiresAt, @isGuest, @onboardedAt, @createdAt, @updatedAt, @deletedAt)`,
    )
    .run(row);
  return row;
}

export function updateUser(id: string, patch: Partial<UserRow>): UserRow {
  const allowed: (keyof UserRow)[] = [
    'email', 'displayName', 'passwordHash', 'passwordSalt', 'mode', 'activeSystemId',
    'activeMemberId', 'settings', 'vaultPinHash', 'vaultPinSalt', 'recoveryCodeHash',
    'resetCodeHash', 'resetExpiresAt', 'isGuest', 'onboardedAt', 'deletedAt',
  ];
  const assignments: string[] = ['updatedAt = ?'];
  const params: unknown[] = [now()];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    assignments.push(`${key} = ?`);
    params.push(patch[key] as never);
  }
  getDb().prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);
  const updated = findUserById(id);
  if (!updated) throw new Error('User disappeared during update.');
  return updated;
}

/**
 * Settings are read through `mergeSettings`, so a row written by an older
 * release still returns a complete object rather than leaving new fields
 * undefined at the call site.
 */
export function readSettings(user: UserRow): AppSettings {
  try {
    return mergeSettings({ ...(JSON.parse(user.settings) as Partial<AppSettings>), mode: user.mode });
  } catch {
    return mergeSettings({ mode: user.mode });
  }
}

export function writeSettings(user: UserRow, settings: AppSettings): UserRow {
  return updateUser(user.id, { settings: JSON.stringify(settings), mode: settings.mode });
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: user.displayName,
    createdAt: user.createdAt,
    mode: user.mode,
    activeSystemId: user.activeSystemId,
    activeMemberId: user.activeMemberId,
    onboardedAt: user.onboardedAt,
    isGuest: user.isGuest === 1,
  };
}

/** Minimal profile for someone else's account: never leaks email or settings. */
export function toCounterpart(user: UserRow): { id: string; displayName: string } {
  return { id: user.id, displayName: user.displayName };
}
