import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The colour picker's saturation/value square and hue slider are real pointer
 * and native-range-input interactions, which is exactly the class of thing a
 * jsdom unit test cannot exercise — jsdom does not implement a browser's own
 * "arrow key nudges a range input" behaviour, and it has no `setPointerCapture`
 * at all. Both are covered here against a real, rendered Chromium instead.
 *
 * This is also where the picker was actually caught sticking: dragging the hue
 * slider more than a step or two looked like it stopped responding, because
 * the displayed hue was being re-derived from the 8-bit hex it had just
 * written, and most one-degree nudges round-trip through hex unchanged.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Colour Picker Test' });
});

after(async () => {
  await session.browser.close();
});

const accentVar = (page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

/**
 * Waits for a locator's value to satisfy `predicate`, polling rather than
 * sleeping a fixed amount. A run alongside the rest of the suite gives the
 * renderer far less CPU time per event than running this file alone does, so
 * a fixed delay between key presses is either too short under load or
 * needlessly slow when idle — polling adapts to whichever is true right now,
 * and still fails loudly if a press is genuinely never applied.
 */
async function waitForValue(locator, predicate, { timeout = 5000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = Number(await locator.inputValue());
    if (predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for value to match; last seen was ${value}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

describe('the colour picker', () => {
  it('moves the accent when the hue slider is dragged with the mouse', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const hue = page.locator('.color-picker__hue');
    await hue.scrollIntoViewIfNeeded();
    const before = await accentVar(page);
    const box = await hue.boundingBox();

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    assert.notEqual(await accentVar(page), before, 'dragging the hue slider did not change the accent');
  });

  it('advances the hue by exactly one degree per key press, all the way through a long press', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const hue = page.locator('.color-picker__hue');
    await hue.focus();
    const start = Number(await hue.inputValue());

    // The bug this exists for moved the slider a handful of times and then
    // stopped responding to further presses, well short of the true total —
    // so each press is confirmed applied before the next one is sent, rather
    // than firing all 30 and hoping a fixed delay was long enough.
    for (let i = 1; i <= 30; i += 1) {
      await page.keyboard.press('ArrowRight');
      await waitForValue(hue, (value) => value === start + i);
    }

    assert.equal(Number(await hue.inputValue()), start + 30);
  });

  it('drags the saturation/value square to a chosen point', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const sv = page.locator('.color-picker__sv');
    await sv.scrollIntoViewIfNeeded();
    const box = await sv.boundingBox();
    const before = await accentVar(page);

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.85, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    assert.notEqual(await accentVar(page), before, 'dragging the SV square did not change the accent');

    const thumb = page.locator('.color-picker__sv-thumb');
    const valuetext = await thumb.getAttribute('aria-valuetext');
    assert.match(valuetext ?? '', /Saturation \d+%, brightness \d+%/);
  });

  it('accepts a typed hex value and applies it as the accent', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const text = page.locator('.color-picker__text');
    await text.fill('#22c55e');
    await text.blur();
    await page.waitForTimeout(300);

    assert.equal(await accentVar(page), '#22c55e');
  });

  it('remembers a chosen colour as recent, across a full reload', async () => {
    const { page } = session;
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const text = page.locator('.color-picker__text');
    await text.fill('#f472b6');
    await text.blur();
    await page.waitForTimeout(300);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Exact match: a substring match would also catch the header swatch's
    // "Current colour #f472b6" label, since that just-applied colour is also
    // the current one.
    const recentSwatch = page.getByRole('button', { name: '#f472b6', exact: true });
    assert.equal(await recentSwatch.count(), 1, 'the colour just chosen was not offered back as a recent one');
  });
});
