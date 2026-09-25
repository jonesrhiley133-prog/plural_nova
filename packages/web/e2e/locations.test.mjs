import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Saved places turn logging a visit into one tap, and the session they start
 * is a real timed span — this is the part a unit test cannot see: a real tick
 * advancing the on-screen seconds while the session is open, and the record
 * that comes out the other end once it's stopped.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Locations Test' });
});

after(async () => {
  session.browser.close();
});

describe('saved locations and timed sessions', () => {
  it('adds a saved place, starts a session that ticks by the second, and stops it', async () => {
    const { page } = session;
    await page.goto(`${BASE}/locations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Add a place' }).first().click();
    await page.getByLabel('Name').fill('Home');
    const iconField = page.getByLabel('Icon');
    if (await iconField.count()) await iconField.fill('🏠');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForTimeout(400);

    const chip = page.getByRole('button', { name: /Home/ }).first();
    await chip.waitFor({ state: 'visible' });
    await chip.click();
    await page.waitForTimeout(300);

    assert.match(await page.textContent('body'), /At Home/);

    const counter = page.locator('.numeric').first();
    const readSeconds = async () => {
      const text = await counter.textContent();
      const match = text?.match(/(\d+)s/);
      return match ? Number(match[1]) : null;
    };

    const first = await readSeconds();
    assert.notEqual(first, null, 'no live seconds counter was shown for the active session');

    // A real tick, not a value frozen at start: read again after enough time
    // for the second-by-second timer to have moved on.
    await page.waitForTimeout(2200);
    const second = await readSeconds();
    assert.ok(second > first, `expected the live counter to advance past ${first}, saw ${second}`);

    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForTimeout(500);

    assert.doesNotMatch(await page.textContent('body'), /At Home/);

    // The stopped session is now a row in the visit history below.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.match(await page.textContent('body'), /Home/);
  });
});
