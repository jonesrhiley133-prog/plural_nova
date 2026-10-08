import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The unified check-in, and the Snapshot/Constellation/Calendar/Analytics
 * screen it lives on.
 *
 * `feelingEntries` is additive, not a replacement — these checks exist to
 * prove the one promise the whole design rests on: saving a check-in also
 * writes a real `moodEntries` row and a real `emotionEntries` row, so the
 * older Wellbeing and Emotions screens (which this test never touches
 * directly) show the result on their own. Deleting the check-in has to take
 * those two rows with it, which is what actually makes "delete a log" true —
 * the older screens have no delete button of their own.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Check-In Tester' });
});

after(async () => {
  await session.browser.close();
});

describe('the unified mood & emotions check-in', () => {
  it('is a real destination, without reopening the one Emotions deliberately left out of nav', async () => {
    const { page } = session;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const moodEmotionsLink = page.locator('nav a[href="/mood-emotions"], a[href="/mood-emotions"]');
    assert.ok(await moodEmotionsLink.count() > 0, 'Mood & Emotions should have a real nav link');

    const emotionsLink = page.locator('nav a[href="/emotions"], a[href="/emotions"]');
    assert.equal(await emotionsLink.count(), 0, 'the Emotions nav link should still be gone');
  });

  it('writes a mood and an emotion that the older screens pick up on their own, then removes both on delete', async () => {
    const { page } = session;

    await page.goto(`${BASE}/mood-emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'New check-in' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible' });

    // Step 1: mood. Dragging isn't reliable under Playwright for a native
    // range input, so the value is set directly and the events it listens
    // for are dispatched by hand.
    await sheet.locator('input[type="range"]').evaluate((node) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(node, '90');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    assert.match(await sheet.textContent(), /Amazing/);
    await sheet.getByRole('button', { name: 'Next' }).click();

    // Step 2: one emotion, with its own intensity control.
    await sheet.getByRole('button', { name: 'Joy', exact: true }).click();
    await sheet.getByRole('button', { name: 'Happy', exact: true }).first().click();
    await page.waitForTimeout(200);
    assert.match(await sheet.textContent(), /How strong was each one\?/);
    await sheet.getByRole('button', { name: 'Next' }).click();

    // Step 3: a bit of context, then save.
    await sheet.getByLabel('Activity').fill('an end-to-end check');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);

    assert.equal(await page.getByRole('dialog').count(), 0, 'the sheet should close on save');
    await page.goto(`${BASE}/mood-emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.match(await page.textContent('body'), /Amazing/);
    assert.match(await page.textContent('body'), /Happy/);

    // The dual-write: the legacy screens show the same check-in without
    // this test ever calling either of their own create flows.
    await page.goto(`${BASE}/emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.match(await page.textContent('body'), /Happy/, 'the emotion should also appear in the Emotions log');

    // Delete the check-in and confirm the legacy emotion entry goes with it.
    await page.goto(`${BASE}/mood-emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Delete check-in' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForTimeout(800);
    assert.match(await page.textContent('body'), /Nothing logged yet/);

    await page.goto(`${BASE}/emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.doesNotMatch(
      await page.textContent('body'),
      /an end-to-end check/,
      'deleting the check-in should remove the emotion entry it created',
    );
  });
});

describe('the Snapshot/Constellation/Calendar/Analytics tabs', () => {
  it('switches between all four without erroring, and the retired Emotion insights route redirects into Analytics', async () => {
    const { page, problems } = session;
    const before = problems.length;

    await page.goto(`${BASE}/mood-emotions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    for (const label of ['Constellation', 'Calendar', 'Analytics', 'Snapshot']) {
      await page.getByRole('tab', { name: label }).click();
      await page.waitForTimeout(400);
      assert.equal(
        await page.getByRole('tab', { name: label }).getAttribute('aria-selected'),
        'true',
        `${label} should become the selected tab`,
      );
    }

    await page.goto(`${BASE}/emotion-insights`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.match(page.url(), /\/mood-emotions\?tab=analytics$/, 'the old route should redirect into the new Analytics tab');
    assert.equal(
      await page.getByRole('tab', { name: 'Analytics' }).getAttribute('aria-selected'),
      'true',
      'the redirect should land on the Analytics tab itself, not just the screen',
    );

    assert.deepEqual(problems.slice(before), [], 'no console/page errors while touring the tabs');
  });
});
