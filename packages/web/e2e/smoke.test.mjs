import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ROUTES, openBrowser, signUp } from './helpers.mjs';

/**
 * Does every screen open, and does the app fit on a phone?
 *
 * Fifty-odd routes is too many to keep checking by hand, and the two ways they
 * go wrong are both quiet: a screen that throws renders an error panel nobody
 * sees until they visit it, and a column that overflows takes the whole page
 * sideways without any single element looking wrong.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page);
});

after(async () => {
  await session.browser.close();
});

describe('every screen', () => {
  it('opens with content and no errors', async () => {
    const { page, problems } = session;
    const broken = [];

    for (const route of ROUTES) {
      const before = problems.length;
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      // Enough for the lazy chunk and its first request to settle.
      await page.waitForTimeout(550);

      const text = ((await page.locator('#main-content').textContent().catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 20) broken.push(`/${route}: rendered almost nothing`);
      if (/Something went wrong|\[object Object\]|undefined|NaN/.test(text)) {
        broken.push(`/${route}: ${text.slice(0, 100)}`);
      }
      if (problems.length > before) broken.push(`/${route}: ${problems.slice(before).join('; ')}`);
    }

    assert.deepEqual(broken, []);
  });

  it('fits a 360px phone without scrolling sideways', async () => {
    const { page } = session;
    const overflowing = [];

    for (const route of ROUTES) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(450);

      const slack = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (slack > 1) overflowing.push(`/${route} is ${slack}px too wide`);
    }

    assert.deepEqual(overflowing, []);
  });

  it('never leaves the end of a page under the bottom bar', async () => {
    const { page } = session;
    const trapped = [];

    for (const route of ['settings', 'help', 'features', 'more', 'dictionary']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const overlap = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const bar = document.querySelector('.app-bottom-nav');
        const last = document.querySelector('.app-main')?.lastElementChild;
        if (!bar || !last) return 0;
        return Math.round(last.getBoundingClientRect().bottom - bar.getBoundingClientRect().top);
      });
      if (overlap > 0) trapped.push(`/${route} ends ${overlap}px under the bar`);
    }

    assert.deepEqual(trapped, []);
  });
});
