import { Router } from 'express';
import {
  buildDemoData,
  isEmail,
  mergeSettings,
  newCode,
  now,
  validatePassword,
  type AppSettings,
  type DemoPeriod,
} from '@pluralnova/shared';
import { config } from '../config.js';
import { handler, ok } from '../http/respond.js';
import { badRequest, conflict, unauthorized, validationFailed } from '../http/errors.js';
import { rateLimit } from '../http/rateLimit.js';
import { hashPassword, hashSecret, verifyPassword, verifySecret } from './passwords.js';
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeSession,
} from './sessions.js';
import {
  findUserByEmail,
  findUserById,
  insertUser,
  readSettings,
  toPublicUser,
  updateUser,
  writeSettings,
  type UserRow,
} from './users.js';
import { auth, requireAuth } from './middleware.js';
import { createSystem, ensureActiveSystem, listSystems, refreshMemberCount } from '../services/systems.js';
import { restoreCollections } from '../services/restore.js';
import { getDb } from '../db/index.js';

export const authRouter: Router = Router();

const loginLimiter = rateLimit({
  max: 8,
  windowMs: 10 * 60_000,
  keyOf: (req) => String((req.body as { email?: string })?.email ?? req.ip ?? ''),
  message: 'Too many sign-in attempts. Wait a few minutes and try again.',
});

// Sized to blunt automated signups without locking out a whole school or
// office behind one address.
const signupLimiter = rateLimit({ max: 20, windowMs: 60 * 60_000 });

interface SessionPayload {
  token: string;
  expiresAt: string;
  user: ReturnType<typeof toPublicUser>;
  settings: AppSettings;
  systems: unknown[];
  recoveryCode?: string;
}

function startSession(user: UserRow, userAgent: string | undefined, recoveryCode?: string): SessionPayload {
  const { user: withSystem } = ensureActiveSystem(user);
  const { token, session } = createSession(withSystem.id, userAgent);
  return {
    token,
    expiresAt: session.expiresAt,
    user: toPublicUser(withSystem),
    settings: readSettings(withSystem),
    systems: listSystems(withSystem.id),
    ...(recoveryCode ? { recoveryCode } : {}),
  };
}

authRouter.post(
  '/register',
  signupLimiter,
  handler(async (req, res) => {
    const body = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
      mode?: 'system' | 'singlet';
      systemName?: string;
    };

    const errors: Record<string, string> = {};
    const email = (body.email ?? '').trim().toLowerCase();
    if (!isEmail(email)) errors['email'] = 'Enter a valid email address.';
    const passwordError = validatePassword(body.password ?? '');
    if (passwordError) errors['password'] = passwordError;
    if (!(body.displayName ?? '').trim()) errors['displayName'] = 'Tell us what to call you.';
    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    if (findUserByEmail(email)) {
      throw conflict('There is already an account with that email. Try signing in instead.');
    }

    const { hash, salt } = await hashPassword(body.password!);
    const mode = body.mode === 'singlet' ? 'singlet' : 'system';
    const user = insertUser({
      email,
      displayName: body.displayName!.trim(),
      passwordHash: hash,
      passwordSalt: salt,
      mode,
    });

    // A recovery code is issued once, at registration. It is stored hashed, so
    // it cannot be read back — the plaintext is shown here and never again.
    const recoveryCode = newCode(4, 4);
    const recovery = await hashSecret(recoveryCode);
    const system = createSystem(user, { name: body.systemName });
    const withSystem = updateUser(user.id, {
      recoveryCodeHash: `${recovery.salt}:${recovery.hash}`,
      activeSystemId: system['id'] as string,
    });

    ok(res, startSession(withSystem, req.header('user-agent'), recoveryCode), 201);
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  handler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw badRequest('Enter your email and password.');

    const user = findUserByEmail(email);
    const valid = user
      ? await verifyPassword(password, { hash: user.passwordHash, salt: user.passwordSalt })
      : // A dummy verification keeps the response time similar whether or not
        // the account exists, so timing does not reveal which emails are registered.
        await verifyPassword(password, { hash: null, salt: null });

    if (!user || !valid) throw unauthorized('That email and password do not match.');
    ok(res, startSession(user, req.header('user-agent')));
  }),
);

authRouter.post(
  '/guest',
  rateLimit({ max: 10, windowMs: 60 * 60_000 }),
  handler(async (req, res) => {
    const body = req.body as { days?: number; displayName?: string };
    const days = ([7, 30, 60, 90] as const).includes(body.days as DemoPeriod)
      ? (body.days as DemoPeriod)
      : 30;

    const user = insertUser({
      email: null,
      displayName: (body.displayName ?? 'Guest').trim() || 'Guest',
      passwordHash: null,
      passwordSalt: null,
      mode: 'system',
      isGuest: true,
    });
    const system = createSystem(user, { name: 'The Meridian System', description: 'Example data.' });
    const systemId = system['id'] as string;
    const withSystem = updateUser(user.id, { activeSystemId: systemId, onboardedAt: now() });

    const demo = buildDemoData({ userId: user.id, systemId, days });
    restoreCollections({ userId: user.id, systemId }, demo, 'replace');
    refreshMemberCount(user.id, systemId);

    ok(res, { ...startSession(withSystem, req.header('user-agent')), demoDays: days }, 201);
  }),
);

/** Turns a guest account into a real one without losing any of its data. */
authRouter.post(
  '/claim',
  requireAuth,
  handler(async (req, res) => {
    const context = auth(req);
    if (context.user.isGuest !== 1) throw badRequest('This account is already registered.');

    const { email, password, displayName } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const errors: Record<string, string> = {};
    const cleanEmail = (email ?? '').trim().toLowerCase();
    if (!isEmail(cleanEmail)) errors['email'] = 'Enter a valid email address.';
    const passwordError = validatePassword(password ?? '');
    if (passwordError) errors['password'] = passwordError;
    if (Object.keys(errors).length > 0) throw validationFailed(errors);
    if (findUserByEmail(cleanEmail)) throw conflict('There is already an account with that email.');

    const { hash, salt } = await hashPassword(password!);
    const recoveryCode = newCode(4, 4);
    const recovery = await hashSecret(recoveryCode);
    const updated = updateUser(context.user.id, {
      email: cleanEmail,
      passwordHash: hash,
      passwordSalt: salt,
      isGuest: 0,
      recoveryCodeHash: `${recovery.salt}:${recovery.hash}`,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
    });
    ok(res, { user: toPublicUser(updated), recoveryCode });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  handler((req, res) => {
    revokeSession(auth(req).session.id);
    ok(res, { signedOut: true });
  }),
);

authRouter.post(
  '/logout-everywhere',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    revokeAllSessions(context.user.id);
    ok(res, { signedOut: true });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    ok(
      res,
      listSessions(context.user.id).map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
        current: session.id === context.session.id,
      })),
    );
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    const target = listSessions(context.user.id).find((s) => s.id === req.params['id']);
    if (!target) throw badRequest('That session is not signed in any more.');
    revokeSession(target.id);
    ok(res, { revoked: true });
  }),
);

/**
 * Password reset.
 *
 * The response is identical whether or not the address is registered, so this
 * endpoint cannot be used to test which emails have accounts. In a deployment
 * with mail configured the code is emailed; without it, the code is returned
 * only for a local, non-production server so the flow is testable.
 */
authRouter.post(
  '/forgot-password',
  rateLimit({ max: 5, windowMs: 30 * 60_000 }),
  handler(async (req, res) => {
    const { email } = req.body as { email?: string };
    const user = email ? findUserByEmail(email) : null;
    let devCode: string | undefined;

    if (user) {
      const code = newCode(3, 3);
      const hashed = await hashSecret(code);
      updateUser(user.id, {
        resetCodeHash: `${hashed.salt}:${hashed.hash}`,
        resetExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      if (config.exposeResetCodes) devCode = code;
    }

    ok(res, {
      sent: true,
      message: 'If that email has an account, a reset code is on its way.',
      ...(devCode ? { devCode } : {}),
    });
  }),
);

authRouter.post(
  '/reset-password',
  rateLimit({ max: 8, windowMs: 30 * 60_000 }),
  handler(async (req, res) => {
    const { email, code, password } = req.body as {
      email?: string;
      code?: string;
      password?: string;
    };
    const passwordError = validatePassword(password ?? '');
    if (passwordError) throw validationFailed({ password: passwordError });

    const user = email ? findUserByEmail(email) : null;
    if (!user?.resetCodeHash || !user.resetExpiresAt || user.resetExpiresAt < now()) {
      throw unauthorized('That reset code is not valid any more. Request a new one.');
    }
    const [salt = '', hash = ''] = user.resetCodeHash.split(':');
    if (!(await verifySecret(code ?? '', { hash, salt }))) {
      throw unauthorized('That reset code is not correct.');
    }

    const next = await hashPassword(password!);
    updateUser(user.id, {
      passwordHash: next.hash,
      passwordSalt: next.salt,
      resetCodeHash: null,
      resetExpiresAt: null,
    });
    // Everything else signed in with the old password is signed out.
    revokeAllSessions(user.id);
    ok(res, startSession(findUserById(user.id)!, req.header('user-agent')));
  }),
);

authRouter.post(
  '/recover',
  rateLimit({ max: 6, windowMs: 60 * 60_000 }),
  handler(async (req, res) => {
    const { email, recoveryCode, password } = req.body as {
      email?: string;
      recoveryCode?: string;
      password?: string;
    };
    const passwordError = validatePassword(password ?? '');
    if (passwordError) throw validationFailed({ password: passwordError });

    const user = email ? findUserByEmail(email) : null;
    if (!user?.recoveryCodeHash) throw unauthorized('That recovery code is not correct.');
    const [salt = '', hash = ''] = user.recoveryCodeHash.split(':');
    if (!(await verifySecret((recoveryCode ?? '').trim().toUpperCase(), { hash, salt }))) {
      throw unauthorized('That recovery code is not correct.');
    }

    const next = await hashPassword(password!);
    const newCodeValue = newCode(4, 4);
    const newRecovery = await hashSecret(newCodeValue);
    updateUser(user.id, {
      passwordHash: next.hash,
      passwordSalt: next.salt,
      recoveryCodeHash: `${newRecovery.salt}:${newRecovery.hash}`,
    });
    revokeAllSessions(user.id);
    ok(res, startSession(findUserById(user.id)!, req.header('user-agent'), newCodeValue));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  handler(async (req, res) => {
    const context = auth(req);
    const { currentPassword, password } = req.body as {
      currentPassword?: string;
      password?: string;
    };
    const valid = await verifyPassword(currentPassword ?? '', {
      hash: context.user.passwordHash,
      salt: context.user.passwordSalt,
    });
    if (!valid) throw unauthorized('That is not your current password.');
    const passwordError = validatePassword(password ?? '');
    if (passwordError) throw validationFailed({ password: passwordError });

    const next = await hashPassword(password!);
    updateUser(context.user.id, { passwordHash: next.hash, passwordSalt: next.salt });
    revokeAllSessions(context.user.id, context.session.id);
    ok(res, { changed: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    const { user } = ensureActiveSystem(context.user);
    ok(res, {
      user: toPublicUser(user),
      settings: readSettings(user),
      systems: listSystems(user.id),
      session: { id: context.session.id, expiresAt: context.session.expiresAt },
    });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    const { displayName, activeSystemId, activeMemberId, onboarded } = req.body as {
      displayName?: string;
      activeSystemId?: string;
      activeMemberId?: string | null;
      onboarded?: boolean;
    };

    const patch: Partial<UserRow> = {};
    if (displayName?.trim()) patch.displayName = displayName.trim();
    if (activeSystemId) {
      const owned = listSystems(context.user.id).some((s) => s['id'] === activeSystemId);
      if (!owned) throw badRequest('That system is not on this account.');
      patch.activeSystemId = activeSystemId;
    }
    if (activeMemberId !== undefined) patch.activeMemberId = activeMemberId;
    if (onboarded) patch.onboardedAt = now();

    const updated = updateUser(context.user.id, patch);
    ok(res, { user: toPublicUser(updated), settings: readSettings(updated) });
  }),
);

authRouter.put(
  '/settings',
  requireAuth,
  handler((req, res) => {
    const context = auth(req);
    // Settings are merged, never replaced wholesale, so a client that posts a
    // partial object cannot wipe fields it did not know about.
    const merged = mergeSettings({ ...context.settings, ...(req.body as Partial<AppSettings>) });
    const updated = writeSettings(context.user, merged);
    ok(res, { settings: readSettings(updated), user: toPublicUser(updated) });
  }),
);

authRouter.delete(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const context = auth(req);
    const { password, confirm } = req.body as { password?: string; confirm?: string };
    if (confirm !== 'DELETE') {
      throw badRequest('Type DELETE to confirm that you want the account removed.');
    }
    if (context.user.passwordHash) {
      const valid = await verifyPassword(password ?? '', {
        hash: context.user.passwordHash,
        salt: context.user.passwordSalt,
      });
      if (!valid) throw unauthorized('That password is not correct.');
    }

    // Soft-delete the account, then hard-delete the session rows so access stops
    // immediately. The data itself is removed by the purge endpoint or by the
    // retention job, which leaves a window to undo a mistaken deletion.
    updateUser(context.user.id, { deletedAt: now(), email: null });
    getDb().prepare('DELETE FROM sessions WHERE userId = ?').run(context.user.id);
    ok(res, { deleted: true });
  }),
);
