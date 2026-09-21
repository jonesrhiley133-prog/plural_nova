import { Router } from 'express';
import { now } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, forbidden, unauthorized } from '../http/errors.js';
import { rateLimit } from '../http/rateLimit.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { hashSecret, verifySecret } from '../auth/passwords.js';
import { isVaultUnlocked, lockVault, unlockVault } from '../auth/sessions.js';
import { updateUser } from '../auth/users.js';
import { countRecords } from '../db/repository.js';

/**
 * The private vault.
 *
 * The lock is a server-side property of the session, not a flag in the client.
 * A locked session cannot read vault rows through any endpoint — records, sync,
 * search or backup — because each of those checks the same session state. Vault
 * content is also excluded from notification previews by the notification
 * service, so nothing in it reaches a lock screen.
 */

export const vaultRouter: Router = Router();
vaultRouter.use(requireAuth);

const unlockLimiter = rateLimit({
  max: 6,
  windowMs: 15 * 60_000,
  message: 'Too many PIN attempts. Wait a few minutes before trying again.',
});

vaultRouter.get(
  '/status',
  handler((req, res) => {
    const context = auth(req);
    ok(res, {
      configured: Boolean(context.user.vaultPinHash),
      unlocked: isVaultUnlocked(context.session),
      unlockedUntil: context.session.vaultUnlockedUntil,
      autoLockMinutes: context.settings.privacy.vaultAutoLockMinutes,
      itemCount: context.vaultUnlocked ? countRecords('vaultItems', context.scope) : null,
    });
  }),
);

vaultRouter.post(
  '/setup',
  handler(async (req, res) => {
    const context = auth(req);
    const { pin, currentPin } = req.body as { pin?: string; currentPin?: string };

    if (!pin || pin.length < 4 || pin.length > 32) {
      throw badRequest('Choose a PIN of at least 4 characters.');
    }

    if (context.user.vaultPinHash) {
      const valid = await verifySecret(currentPin ?? '', {
        hash: context.user.vaultPinHash,
        salt: context.user.vaultPinSalt,
      });
      if (!valid) throw unauthorized('That is not the current vault PIN.');
    }

    const hashed = await hashSecret(pin);
    updateUser(context.user.id, { vaultPinHash: hashed.hash, vaultPinSalt: hashed.salt });
    unlockVault(context.session.id, context.settings.privacy.vaultAutoLockMinutes);
    ok(res, { configured: true, unlocked: true });
  }),
);

vaultRouter.post(
  '/unlock',
  unlockLimiter,
  handler(async (req, res) => {
    const context = auth(req);
    if (!context.user.vaultPinHash) throw badRequest('Set a vault PIN first.');

    const { pin } = req.body as { pin?: string };
    const valid = await verifySecret(pin ?? '', {
      hash: context.user.vaultPinHash,
      salt: context.user.vaultPinSalt,
    });
    if (!valid) throw unauthorized('That PIN is not right.');

    const until = unlockVault(context.session.id, context.settings.privacy.vaultAutoLockMinutes);
    ok(res, { unlocked: true, unlockedUntil: until });
  }),
);

vaultRouter.post(
  '/lock',
  handler((req, res) => {
    const context = auth(req);
    lockVault(context.session.id);
    ok(res, { unlocked: false, lockedAt: now() });
  }),
);

/** Removes the PIN and, with it, the extra protection. Requires the current PIN. */
vaultRouter.delete(
  '/pin',
  handler(async (req, res) => {
    const context = auth(req);
    const { pin, moveItemsTo } = req.body as { pin?: string; moveItemsTo?: 'keep' | 'delete' };
    if (!context.user.vaultPinHash) throw badRequest('There is no vault PIN to remove.');

    const valid = await verifySecret(pin ?? '', {
      hash: context.user.vaultPinHash,
      salt: context.user.vaultPinSalt,
    });
    if (!valid) throw unauthorized('That PIN is not right.');
    if (moveItemsTo === 'delete') {
      throw forbidden('Delete vault items individually first — this action will not remove them for you.');
    }

    updateUser(context.user.id, { vaultPinHash: null, vaultPinSalt: null });
    lockVault(context.session.id);
    ok(res, { configured: false });
  }),
);
