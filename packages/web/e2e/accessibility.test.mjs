import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Automated WCAG 2 A/AA scan.
 *
 * Contrast, missing labels and ARIA misuse are exactly the kind of thing a
 * manual pass misses on some screen nobody thought to click through again
 * after the last redesign. A real assistive-technology walkthrough still
 * matters and this does not replace one, but it catches the mechanical half
 * of the problem on every run rather than whenever someone remembers to look.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Accessibility Scan' });
});

after(async () => {
  await session.browser.close();
});

async function violations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`);
}

describe('accessibility', () => {
  it('has no WCAG 2 A/AA violations on any of the main screens', async () => {
    const { page } = session;
    const routes = [
      '', 'members', 'journal', 'tasks', 'calendar', 'settings/appearance',
      'messages', 'flux', 'finances', 'more', 'search', 'notifications', 'vault', 'stats',
    ];
    const broken = [];

    for (const route of routes) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      for (const v of await violations(page)) broken.push(`/${route}: ${v}`);
    }

    assert.deepEqual(broken, []);
  });

  it('has no violations with a dialog open', async () => {
    const { page } = session;
    await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Add a member' }).first().click();
    await page.waitForTimeout(400);

    try {
      assert.deepEqual(await violations(page), []);
    } finally {
      // Left open, this dialog outlives the test and confuses whichever one
      // runs next on the same shared page.
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(200);
    }
  });

  it('has no violations with the colour picker expanded', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    assert.deepEqual(await violations(page), []);
  });

  it('has no violations once a member and some records exist', async () => {
    const { page } = session;
    await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Add a member' }).first().click();
    await page.waitForTimeout(400);
    await page.getByLabel('Display name').fill('Accessibility Alter');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(700);

    await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    // The first member on the account can trigger the once-a-day fronting
    // ritual on this very reload — dismiss it so it does not block the click
    // below, the same way the dialog in the test above is closed first.
    const ritual = page.getByRole('dialog').getByRole('button', { name: 'Close' });
    if (await ritual.isVisible().catch(() => false)) {
      await ritual.click();
      await page.waitForTimeout(300);
    }
    const listViolations = await violations(page);

    await page.getByRole('button', { name: 'Accessibility Alter' }).first().click();
    await page.waitForTimeout(600);
    const profileViolations = await violations(page);

    assert.deepEqual([...listViolations, ...profileViolations], []);
  });
});
