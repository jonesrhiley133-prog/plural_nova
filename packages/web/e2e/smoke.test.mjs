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

  it('never leaves the end of a page under the bar or the action button', async () => {
    const { page } = session;
    const trapped = [];

    for (const route of ['settings', 'help', 'features', 'more', 'dictionary', 'stats', 'wellbeing']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Both float over the page, so both have to be cleared — the action
      // button is the taller of the two and used to cover the last row.
      const overlaps = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const last = document.querySelector('.app-main')?.lastElementChild;
        if (!last) return [];
        const bottom = last.getBoundingClientRect().bottom;
        return ['.app-bottom-nav', '.quick-action-button']
          .map((selector) => {
            const floating = document.querySelector(selector);
            if (!floating) return null;
            const over = Math.round(bottom - floating.getBoundingClientRect().top);
            return over > 0 ? `${selector} by ${over}px` : null;
          })
          .filter(Boolean);
      });

      for (const overlap of overlaps) trapped.push(`/${route} is covered: ${overlap}`);
    }

    assert.deepEqual(trapped, []);
  });

  // In-Sys Chat and Messages both live outside <Layout> on purpose (see
  // App.tsx) — two separate route trees now, not one shared chat page — so
  // neither has a #main-content or bottom nav for the checks above to find.
  // Each gets the same two guarantees here instead, against its own root.
  it('in-sys chat and messages both open with content and fit a 360px phone', async () => {
    const { page } = session;

    for (const route of ['system/chat', 'social/messages']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(550);

      const text = ((await page.locator('.chat-app').textContent().catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
      assert.ok(text.length > 20, `/${route} rendered almost nothing`);

      const slack = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.ok(slack <= 1, `/${route} is ${slack}px too wide`);
    }
  });
});
