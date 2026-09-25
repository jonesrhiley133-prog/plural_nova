import { Router, type Request } from 'express';
import { newId, now } from '@pluralnova/shared';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { handler, ok } from '../http/respond.js';
import { badRequest, forbidden, unauthorized } from '../http/errors.js';
import { rateLimit } from '../http/rateLimit.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { hashSecret, verifySecret } from '../auth/passwords.js';
import { isAppUnlocked, lockApp, setWebauthnChallenge, unlockApp } from '../auth/sessions.js';
import { updateUser } from '../auth/users.js';
import { getDb } from '../db/index.js';

/**
 * The app-wide lock.
 *
 * Separate from the per-alter profile PIN (which only gates switching who is
 * active, in `system.ts`) and from the vault (which gates one collection at
 * the data layer, in `vault.ts`): this is a second factor over the whole
 * client, checked once at unlock rather than on every request. The client
 * never mounts a route while locked, so nothing behind the lock screen is
 * ever fetched in the first place — see `AppLockGate` on the web side.
 */

export const appLockRouter: Router = Router();
appLockRouter.use(requireAuth);

const unlockLimiter = rateLimit({
  max: 6,
  windowMs: 15 * 60_000,
  message: 'Too many attempts. Wait a few minutes before trying again.',
});

interface WebauthnCredentialRow {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function listCredentials(userId: string): WebauthnCredentialRow[] {
  return getDb()
    .prepare('SELECT * FROM webauthnCredentials WHERE userId = ? ORDER BY createdAt ASC')
    .all(userId) as WebauthnCredentialRow[];
}

function transportsOf(row: { transports: string | null }): AuthenticatorTransportFuture[] | undefined {
  return row.transports ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[]) : undefined;
}

/** The relying-party id/origin are read from the request rather than fixed, since PluralNova is self-hosted on whatever domain its owner puts it on. */
function rpFrom(req: Request): { rpID: string; origin: string } {
  return { rpID: req.hostname, origin: `${req.protocol}://${req.get('host')}` };
}

appLockRouter.get(
  '/status',
  handler((req, res) => {
    const context = auth(req);
    const credentials = listCredentials(context.user.id);
    ok(res, {
      configured: Boolean(context.user.appLockPinHash),
      unlocked: isAppUnlocked(context.session),
      unlockedUntil: context.session.appLockUnlockedUntil,
      biometricRegistered: credentials.length > 0,
      biometricLabels: credentials.map((c) => c.label ?? 'This device'),
    });
  }),
);

/** Sets the PIN for the first time, or changes it (requires the current one). */
appLockRouter.post(
  '/setup',
  handler(async (req, res) => {
    const context = auth(req);
    const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };
    if (!pin || !/^\d{4,8}$/.test(pin)) {
      throw badRequest('Choose a PIN of 4 to 8 digits.');
    }
    if (context.user.appLockPinHash) {
      const valid = await verifySecret(currentPin ?? '', {
        hash: context.user.appLockPinHash,
        salt: context.user.appLockPinSalt,
      });
      if (!valid) throw unauthorized('That is not the current app lock PIN.');
    }
    const hashed = await hashSecret(pin);
    updateUser(context.user.id, { appLockPinHash: hashed.hash, appLockPinSalt: hashed.salt });
    const until = unlockApp(context.session.id, context.settings.appLock.autoLockMinutes);
    ok(res, { configured: true, unlocked: true, unlockedUntil: until });
  }),
);

appLockRouter.post(
  '/unlock',
  unlockLimiter,
  handler(async (req, res) => {
    const context = auth(req);
    if (!context.user.appLockPinHash) throw badRequest('Set an app lock PIN first.');
    const { pin } = req.body as { pin?: string };
    const valid = await verifySecret(pin ?? '', {
      hash: context.user.appLockPinHash,
      salt: context.user.appLockPinSalt,
    });
    if (!valid) throw unauthorized('That PIN is not right.');
    const until = unlockApp(context.session.id, context.settings.appLock.autoLockMinutes);
    ok(res, { unlocked: true, unlockedUntil: until });
  }),
);

/** Re-locks immediately — used by "Lock now", by backgrounding, and by the inactivity timer. */
appLockRouter.post(
  '/lock',
  handler((req, res) => {
    const context = auth(req);
    lockApp(context.session.id);
    ok(res, { unlocked: false, lockedAt: now() });
  }),
);

/** Removes the PIN and any registered devices, turning the feature off. Requires the current PIN. */
appLockRouter.delete(
  '/pin',
  handler(async (req, res) => {
    const context = auth(req);
    const { pin } = req.body as { pin?: string };
    if (!context.user.appLockPinHash) throw badRequest('There is no app lock PIN to remove.');
    const valid = await verifySecret(pin ?? '', {
      hash: context.user.appLockPinHash,
      salt: context.user.appLockPinSalt,
    });
    if (!valid) throw unauthorized('That PIN is not right.');
    updateUser(context.user.id, { appLockPinHash: null, appLockPinSalt: null });
    lockApp(context.session.id);
    getDb().prepare('DELETE FROM webauthnCredentials WHERE userId = ?').run(context.user.id);
    ok(res, { configured: false });
  }),
);

/**
 * A last resort for a forgotten PIN: the account password is a secret a
 * casual "found the phone unlocked" attacker would not also have, so it is
 * an acceptable second way in without making the lock screen pointless.
 * Sets a new PIN rather than only removing the old one, matching "reset".
 */
appLockRouter.post(
  '/recover',
  unlockLimiter,
  handler(async (req, res) => {
    const context = auth(req);
    if (!context.user.appLockPinHash) throw badRequest('There is no app lock PIN to recover.');
    if (!context.user.passwordHash) throw badRequest('This account has no password to verify with.');
    const { accountPassword, newPin } = req.body as { accountPassword?: string; newPin?: string };
    if (!newPin || !/^\d{4,8}$/.test(newPin)) {
      throw badRequest('Choose a new PIN of 4 to 8 digits.');
    }
    const valid = await verifySecret(accountPassword ?? '', {
      hash: context.user.passwordHash,
      salt: context.user.passwordSalt,
    });
    if (!valid) throw unauthorized('That password is not right.');
    const hashed = await hashSecret(newPin);
    updateUser(context.user.id, { appLockPinHash: hashed.hash, appLockPinSalt: hashed.salt });
    const until = unlockApp(context.session.id, context.settings.appLock.autoLockMinutes);
    ok(res, { configured: true, unlocked: true, unlockedUntil: until });
  }),
);

// ── Biometric unlock (WebAuthn) ──────────────────────────────────────────────

/** Registering a new device requires already being unlocked — biometric is an alternative to the PIN, never a way around never having set one. */
appLockRouter.post(
  '/webauthn/register-options',
  handler(async (req, res) => {
    const context = auth(req);
    if (!context.user.appLockPinHash) throw badRequest('Set an app lock PIN first.');
    if (!context.appLockUnlocked) throw forbidden('Unlock the app lock before adding a device.');

    const { rpID } = rpFrom(req);
    const existing = listCredentials(context.user.id);
    const options = await generateRegistrationOptions({
      rpName: 'PluralNova',
      rpID,
      userName: context.user.email || context.user.displayName,
      userID: Buffer.from(context.user.id, 'utf8'),
      userDisplayName: context.user.displayName,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: transportsOf(c) })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    setWebauthnChallenge(context.session.id, options.challenge);
    ok(res, options);
  }),
);

appLockRouter.post(
  '/webauthn/register',
  handler(async (req, res) => {
    const context = auth(req);
    if (!context.appLockUnlocked) throw forbidden('Unlock the app lock before adding a device.');
    const challenge = context.session.webauthnChallenge;
    if (!challenge) throw badRequest('That registration attempt expired. Try again.');

    const { response, label } = req.body as { response: RegistrationResponseJSON; label?: string };
    const { rpID, origin } = rpFrom(req);
    setWebauthnChallenge(context.session.id, null);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    }).catch(() => ({ verified: false as const }));
    if (!verification.verified || !verification.registrationInfo) {
      throw badRequest('That device could not be verified.');
    }

    const { credential } = verification.registrationInfo;
    getDb()
      .prepare(
        `INSERT INTO webauthnCredentials (id, userId, credentialId, publicKey, counter, transports, label, createdAt, lastUsedAt)
         VALUES (@id, @userId, @credentialId, @publicKey, @counter, @transports, @label, @createdAt, @lastUsedAt)`,
      )
      .run({
        id: newId('wac'),
        userId: context.user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        label: label?.trim().slice(0, 60) || null,
        createdAt: now(),
        lastUsedAt: null,
      });
    ok(res, { registered: true });
  }),
);

/** Reachable while locked — this is how a locked client offers "Use Face ID / fingerprint" as an alternative to the PIN. */
appLockRouter.post(
  '/webauthn/auth-options',
  handler(async (req, res) => {
    const context = auth(req);
    const credentials = listCredentials(context.user.id);
    if (credentials.length === 0) throw badRequest('No device is registered for biometric unlock.');
    const { rpID } = rpFrom(req);
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: transportsOf(c) })),
      userVerification: 'required',
    });
    setWebauthnChallenge(context.session.id, options.challenge);
    ok(res, options);
  }),
);

appLockRouter.post(
  '/webauthn/authenticate',
  unlockLimiter,
  handler(async (req, res) => {
    const context = auth(req);
    const challenge = context.session.webauthnChallenge;
    if (!challenge) throw badRequest('That unlock attempt expired. Try again.');

    const { response } = req.body as { response: AuthenticationResponseJSON };
    const row = getDb()
      .prepare('SELECT * FROM webauthnCredentials WHERE userId = ? AND credentialId = ?')
      .get(context.user.id, response?.id) as WebauthnCredentialRow | undefined;
    setWebauthnChallenge(context.session.id, null);
    if (!row) throw unauthorized('That device is not registered.');

    const { rpID, origin } = rpFrom(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: row.credentialId,
        publicKey: new Uint8Array(Buffer.from(row.publicKey, 'base64url')),
        counter: row.counter,
        transports: transportsOf(row),
      },
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const, authenticationInfo: undefined }));
    if (!verification.verified || !verification.authenticationInfo) {
      throw unauthorized('That device could not be verified.');
    }

    getDb()
      .prepare('UPDATE webauthnCredentials SET counter = ?, lastUsedAt = ? WHERE id = ?')
      .run(verification.authenticationInfo.newCounter, now(), row.id);

    const until = unlockApp(context.session.id, context.settings.appLock.autoLockMinutes);
    ok(res, { unlocked: true, unlockedUntil: until });
  }),
);

appLockRouter.delete(
  '/webauthn',
  handler((req, res) => {
    const context = auth(req);
    getDb().prepare('DELETE FROM webauthnCredentials WHERE userId = ?').run(context.user.id);
    ok(res, { biometricRegistered: false });
  }),
);
