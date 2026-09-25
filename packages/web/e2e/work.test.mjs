import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Clocking in is only worth automating for the part a unit test cannot see:
 * a real rate turning into a live, ticking estimate on screen, and a shift
 * that comes out the other end with that same rate attached — not just that
 * the arithmetic is right in isolation.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Work Test' });
});

after(async () => {
  session.browser.close();
});

describe('work: clocking in with a rate', () => {
  it('estimates live earnings while clocked in, from the workplace rate', async () => {
    const { page } = session;
    await page.goto(`${BASE}/work`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    await page.getByRole('tab', { name: 'Workplaces' }).click();
    await page.getByRole('button', { name: 'Add a workplace' }).click();
    await page.getByLabel('Employer').fill('Cafe Nova');
    await page.getByLabel('Hourly rate').fill('30');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Clock in' }).click();
    await page.waitForTimeout(500);

    const description = page.locator('.page-header__description');
    const first = await description.textContent();
    assert.match(first ?? '', /Clocked in for/);
    assert.match(first ?? '', /\$30\.00\/hr/);
    assert.match(first ?? '', /Est\. \$0\.0\d/);

    // A real tick: the estimate should have moved on after a couple of
    // seconds at $30/hr, not sat frozen at the value it opened with.
    await page.waitForTimeout(2500);
    const second = await description.textContent();
    assert.notEqual(second, first, 'the live earnings estimate never advanced');

    await page.getByRole('button', { name: 'Clock out' }).click();
    await page.waitForTimeout(500);
    // Clocking out opens the shift for editing; close that to see the schedule.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.getByRole('tab', { name: 'Schedule' }).click();
    await page.waitForTimeout(400);
    assert.match(await page.textContent('body'), /Est\. \$0\.0\d/);
  });
});
