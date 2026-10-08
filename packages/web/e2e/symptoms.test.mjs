import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Symptoms: a small, separate log on the Cycle & Wellbeing hub, not limited
 * to the cycle. These checks exist to prove the deep link into the tab
 * actually opens it (the tab-state initializer only recognised `checkIns`
 * until this was added) and that logging one round-trips through a save.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Symptom Tester' });
});

after(async () => {
  await session.browser.close();
});

describe('the Symptoms tab', () => {
  it('opens from a direct link and saves a symptom with its own category, intensity and duration', async () => {
    const { page } = session;

    await page.goto(`${BASE}/wellbeing?tab=symptoms`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByRole('tab', { name: 'Symptoms' }).getAttribute('aria-selected'),
      'true',
      '?tab=symptoms should open directly on the Symptoms tab, not fall back to Games',
    );
    assert.match(await page.textContent('body'), /Nothing logged yet/);

    await page.getByRole('button', { name: 'Log a symptom' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByLabel('Symptom').fill('Dizziness');
    await dialog.getByRole('button', { name: 'Other', exact: true }).click();
    await dialog.getByRole('button', { name: 'Overwhelming', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);

    assert.equal(await page.getByRole('dialog').count(), 0, 'the dialog should close on save');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const body = await page.textContent('body');
    assert.match(body, /Dizziness/);
    assert.match(body, /Other/);
    assert.match(body, /Logged/, 'the stat row should appear once something is logged');
  });
});
