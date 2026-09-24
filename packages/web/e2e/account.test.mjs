import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Three ways an account can go wrong between visits: it comes back in the wrong
 * mode, a System Mode account with nobody in it yet gets bounced between
 * screens that each want a member first, and a demo account quietly loses its
 * data. None of them are visible from inside a single page load.
 */

let session;

before(async () => {
  session = await openBrowser();
});

after(async () => {
  await session.browser.close();
});

describe('an account across visits', () => {
  it('lets a System Mode account with nobody in it yet use every system screen', async () => {
    const { page } = session;
    await signUp(page, { name: 'Empty System', mode: 'system' });

    for (const route of ['quick-front', 'fronting', 'stats', 'members', 'profiles', 'organize']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      assert.equal(
        new URL(page.url()).pathname,
        `/${route}`,
        `/${route} redirected an account with no members`,
      );
      const text = ((await page.locator('#main-content').textContent()) ?? '').trim();
      assert.ok(text.length > 20, `/${route} rendered nothing without members`);
    }
  });

  it('comes back in the mode it was left in', async () => {
    const { page } = session;
    const { email } = await signUp(page, { name: 'Mode Test', mode: 'system' });

    await page.goto(`${BASE}/settings/account`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.waitForTimeout(1000);
    const confirm = page.getByRole('dialog').getByRole('button', { name: /sign out/i });
    if (await confirm.count()) {
      await confirm.first().click();
      await page.waitForTimeout(1800);
    }

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('orbit-lantern-4417');
    await page.getByRole('button', { name: /^Sign in$/ }).last().click();
    await page.waitForTimeout(2200);

    const nav = ((await page.locator('.app-bottom-nav').textContent()) ?? '').replace(/\s+/g, ' ');
    assert.match(nav, /Fronting/, 'signing back in dropped the account out of System Mode');
  });

  it('keeps a demo account and its data across a reload', async () => {
    const { page } = session;

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /explore with demo data/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole('dialog').getByRole('button', { name: /One month/ }).click();
    await page.waitForTimeout(3000);

    const before = await page.textContent('body');
    assert.match(before, /demo|nothing here is real/i, 'a demo account did not say it was one');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);

    const after = await page.textContent('body');
    assert.ok(!after.includes('Create an account'), 'a reload signed the demo account out');
    assert.equal(after.length, before.length, 'a reload changed what the demo account held');
  });
});
