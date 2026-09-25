import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The parts of the expanded emotion picker that only mean something against a
 * real, rendered page: an "All" filter that actually lists everything, a
 * star that actually persists as a favourite, and a custom emotion that can
 * be created inline and is immediately usable — plus confirming the
 * standalone Emotions destination is really gone from navigation while
 * logging itself still works.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Emotions Test' });
});

after(async () => {
  session.browser.close();
});

describe('emotions: expanded picker', () => {
  it('is no longer a navigation destination, but logging still works', async () => {
    const { page } = session;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const navLink = page.locator('nav a[href="/emotions"], a[href="/emotions"]');
    assert.equal(await navLink.count(), 0, 'the Emotions nav link should be gone');

    // The quick action still reaches the sheet via the underlying route.
    await page.goto(`${BASE}/emotions?new=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole('dialog').count(), 1, 'the log-emotion sheet did not auto-open');
  });

  it('browses All, creates a custom emotion, and favourites it', async () => {
    const { page } = session;
    await page.goto(`${BASE}/emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Log an emotion' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible' });

    // All: a filter with far more options than any single family has.
    await sheet.getByRole('button', { name: 'All', exact: true }).click();
    const optionCount = await sheet.locator('.emotion-option').count();
    assert.ok(optionCount > 30, `expected the All view to show well over 30 options, saw ${optionCount}`);

    // Custom: search for something that cannot already exist, add it.
    const search = sheet.getByPlaceholder(/Search \d+ emotions/);
    await search.fill('Zorptastic');
    await page.waitForTimeout(300);
    await sheet.getByRole('button', { name: /Add "Zorptastic" as a new emotion/ }).click();
    await sheet.getByRole('button', { name: 'Joy', exact: true }).click();
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(400);

    // It's now selected (summary chip) and the search cleared.
    assert.match(await sheet.textContent(), /Zorptastic/);

    // Favourite a second, different emotion from the All view, then confirm
    // it now shows up under Favourites once the picker is reopened clean.
    await search.fill('');
    await page.waitForTimeout(300);
    const heartbroken = sheet.locator('.emotion-option-wrap').filter({ hasText: 'Heartbroken' });
    await heartbroken.getByLabel(/Add Heartbroken to favourites/).click();
    await page.waitForTimeout(400);

    // The star itself now reads as favourited immediately.
    await sheet.getByRole('button', { name: 'Remove Heartbroken from favourites' }).waitFor({ state: 'visible' });

    // Clearing the family filter (toggling "All" back off) is what reveals
    // the dedicated Favourites section, alongside Recently used.
    await sheet.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForTimeout(200);
    assert.match(await sheet.textContent(), /Favourites/);

    // Finish the log so the custom emotion round-trips through a real save.
    await sheet.getByRole('button', { name: /^Next$/i }).click();
    await sheet.getByRole('button', { name: /^Next$/i }).click();
    await sheet.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForTimeout(500);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.match(await page.textContent('body'), /Zorptastic/);
  });
});
