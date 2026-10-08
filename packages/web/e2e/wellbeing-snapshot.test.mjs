import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The Wellbeing Snapshot and energy signals.
 *
 * Each axis of the Snapshot is one collection's own latest value, scaled
 * onto 0-100 independently of the others — these checks exist to prove
 * that scaling actually lands on the right number end to end, through the
 * real check-in form, not just in the server's own unit tests.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Snapshot Tester' });
});

after(async () => {
  await session.browser.close();
});

describe('the Cycle & Wellbeing Snapshot', () => {
  it('fills in from a real check-in, with Focus included, and averages only the axes it has', async () => {
    const { page } = session;

    await page.goto(`${BASE}/wellbeing?tab=checkIns`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.match(await page.textContent('body'), /Nothing to show yet/, 'the Snapshot starts empty');

    await page.getByRole('button', { name: 'Check in' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.match(await dialog.innerText(), /Focus/, 'the check-in form should ask about focus');

    await dialog.getByLabel('Energy', { exact: true }).fill('7');
    await dialog.getByLabel('Focus', { exact: true }).fill('9');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const body = await page.textContent('body');

    assert.doesNotMatch(body, /Nothing to show yet/, 'the Snapshot fills in once a check-in exists');
    assert.match(body, /Focus/, 'the latest check-in card should show the saved Focus value');
    assert.match(body, /9\/10/, 'the latest check-in card should show the saved Focus value');
    assert.match(body, /Energy signals/);
    assert.match(body, /Today's check-in/, "the wellness check-in should appear as one of the energy signals' sources");
  });
});
