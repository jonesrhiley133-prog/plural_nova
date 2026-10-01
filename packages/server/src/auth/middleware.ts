import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../http/errors.js';
import type { Scope } from '../db/repository.js';
import { findSession, isAppUnlocked, isVaultUnlocked, touchSession, unlockApp, type SessionRow } from './sessions.js';
import { findUserById, readSettings, type UserRow } from './users.js';
import type { AppSettings } from '@pluralnova/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
  settings: AppSettings;
  scope: Scope;
  vaultUnlocked: boolean;
  appLockUnlocked: boolean;
}

function readToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const query = req.query['token'];
  return typeof query === 'string' && query ? query : null;
}

/** Attaches auth when a valid token is present, but does not require one. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next();
  const session = findSession(token);
  if (!session) return next();
  const user = findUserById(session.userId);
  if (!user) return next();
  touchSession(session.id);
  req.auth = buildContext(user, session);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) return next(unauthorized('Sign in to continue.'));
  const session = findSession(token);
  if (!session) return next(unauthorized('Your session has expired. Sign in again.'));
  const user = findUserById(session.userId);
  if (!user) return next(unauthorized('That account no longer exists.'));
  touchSession(session.id);
  req.auth = buildContext(user, session);
  next();
}

/** Guards the vault behind a fresh unlock on top of a valid session. */
export function requireVault(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.vaultUnlocked) {
    return next(forbidden('The vault is locked. Unlock it to continue.'));
  }
  next();
}

export function buildContext(user: UserRow, session: SessionRow): AuthContext {
  const settings = readSettings(user);
  // Sliding, not flat: without this, the unlock window set by the last
  // `/api/app-lock/unlock` call expires on its own after `autoLockMinutes`
  // regardless of how actively the app is being used in the meantime, so a
  // long but continuous session gets interrupted by a lock screen mid-use —
  // indistinguishable from random to whoever hits it. Any authenticated
  // request while already unlocked pushes the window forward instead, so
  // "N minutes" means N minutes of actual inactivity.
  if (isAppUnlocked(session)) {
    unlockApp(session.id, settings.appLock.autoLockMinutes);
  }
  return {
    user,
    session,
    settings,
    scope: { userId: user.id, systemId: user.activeSystemId },
    vaultUnlocked: isVaultUnlocked(session),
    appLockUnlocked: isAppUnlocked(session),
  };
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Throws unless the account is in System Mode, for system-only endpoints. */
export function requireSystemMode(req: Request): AuthContext {
  const context = auth(req);
  if (context.settings.mode !== 'system') {
    throw forbidden('This is a System Mode feature. Switch modes in settings to use it.');
  }
  return context;
}
