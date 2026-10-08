import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * Insights: Patterns, Story, Cycle comparison and Landscape. The statistics
 * behind each tab are covered server-side (`insights.test.ts`) — these
 * checks exist to prove the screen itself is wired up: a real nav link, the
 * Cycle comparison tab staying hidden until cycle tracking is turned on and
 * then actually appearing, and every tab rendering without an error even
 * with nothing logged yet.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Insights Tester' });
});

after(async () => {
  await session.browser.close();
});

describe('Insights', () => {
  it('is a real nav destination', async () => {
    const { page } = session;
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const link = page.locator('nav a[href="/insights"], a[href="/insights"]');
    assert.ok((await link.count()) > 0, 'Insights should have a real nav link');
  });

  it('tours Patterns, Story and Landscape with nothing logged yet, keeping Cycle comparison hidden', async () => {
    const { page, problems } = session;
    const before = problems.length;

    await page.goto(`${BASE}/insights`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    assert.equal(await page.getByRole('tab', { name: 'Cycle comparison' }).count(), 0, 'cycle tracking is off by default');

    for (const label of ['Story', 'Landscape', 'Patterns']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await page.waitForTimeout(400);
      assert.equal(
        await page.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected'),
        'true',
        `${label} should become the selected tab`,
      );
    }

    assert.deepEqual(problems.slice(before), [], 'no console/page errors while touring the tabs with no data logged');
  });

  it('reveals Cycle comparison once cycle tracking is turned on, and it reads the existing cycle stats', async () => {
    const { page, problems } = session;
    const before = problems.length;

    await page.goto(`${BASE}/cycle`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const enableButton = page.getByRole('button', { name: 'Turn on cycle tracking' });
    if (await enableButton.count()) {
      await enableButton.click();
      await page.waitForTimeout(500);
    }

    await page.goto(`${BASE}/insights?tab=cycle`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByRole('tab', { name: 'Cycle comparison' }).getAttribute('aria-selected'),
      'true',
      '?tab=cycle should open directly on Cycle comparison now that tracking is on',
    );
    assert.match(await page.textContent('body'), /Nothing logged yet/);

    assert.deepEqual(problems.slice(before), [], 'no console/page errors after turning cycle tracking on');
  });
});
