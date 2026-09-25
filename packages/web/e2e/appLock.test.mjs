import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The app-wide PIN lock: turning it on, the lock screen actually gating the
 * routes (including across a reload, the way relaunching the app would),
 * recovering a forgotten PIN with the account password, and turning it back
 * off — the whole loop, not just the settings card.
 */

let session;
const ACCOUNT_PASSWORD = 'orbit-lantern-4417';

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'App Lock Test' });
});

after(async () => {
  session.browser.close();
});

describe('app-wide PIN lock', () => {
  it('turns on, gates the app (including across a reload), and can be turned back off', async () => {
    const { page } = session;

    await page.goto(`${BASE}/settings/privacy`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.getByLabel('Choose a PIN').fill('135790');
    await page.getByRole('button', { name: 'Turn on app lock' }).click();
    await page.waitForTimeout(500);

    const lockNow = page.getByRole('button', { name: 'Lock now' });
    await lockNow.waitFor({ state: 'visible' });

    // Reloading mid-session must not bypass a lock that is already off —
    // this is the "unlocked" half of the round trip, checked before locking.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Lock now' }).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: 'Lock now' }).click();
    await page.waitForTimeout(500);
    await page.getByLabel('App lock PIN').waitFor({ state: 'visible' });

    // A relaunch (reload) while locked must still show the lock screen rather
    // than the settings page it was showing before — this is what "protects
    // the entire app" means, not just the one screen that requested a lock.
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('App lock PIN').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: 'Lock now' }).count(), 0);

    await page.getByLabel('App lock PIN').fill('000000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(400);
    assert.match(await page.textContent('body'), /not right/);
    await page.getByLabel('App lock PIN').waitFor({ state: 'visible' });

    await page.getByLabel('App lock PIN').fill('135790');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Lock now' }).waitFor({ state: 'visible' });

    // Forgotten PIN: the account password sets a new one.
    await page.getByRole('button', { name: 'Lock now' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Forgot your PIN?' }).click();
    await page.getByLabel('Account password').fill(ACCOUNT_PASSWORD);
    await page.getByLabel('New PIN').fill('222444');
    await page.getByRole('button', { name: 'Set new PIN' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Lock now' }).waitFor({ state: 'visible' });

    // The recovered PIN is the one that works from now on.
    await page.getByRole('button', { name: 'Lock now' }).click();
    await page.waitForTimeout(500);
    await page.getByLabel('App lock PIN').fill('222444');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Lock now' }).waitFor({ state: 'visible' });

    // Turning it off again through the management dialog.
    await page.getByRole('button', { name: 'Change or remove PIN' }).click();
    await page.getByLabel('Current PIN').fill('222444');
    await page.getByRole('button', { name: 'Remove PIN', exact: true }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Turn on app lock' }).waitFor({ state: 'visible' });

    // With the lock off, a reload must never show a lock screen.
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByLabel('App lock PIN').count(), 0);
    await page.getByRole('button', { name: 'Turn on app lock' }).waitFor({ state: 'visible' });
  });
});
