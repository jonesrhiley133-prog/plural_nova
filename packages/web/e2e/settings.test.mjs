import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * "It does not save" is the most common way a settings screen fails, and the
 * least visible: the request goes out, the response comes back, and the control
 * on screen still shows the old value. These press the controls and then reload
 * the page, because that is the only version of "saved" that counts.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Settings Test' });
});

after(async () => {
  await session.browser.close();
});

describe('settings', () => {
  it('changes what the app calls people, everywhere, for good', async () => {
    const { page } = session;

    await page.goto(`${BASE}/settings/terminology`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /^headmate$/i }).first().click();
    await page.waitForTimeout(1200);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const stillChosen = await page
      .getByRole('button', { name: /^headmate$/i })
      .first()
      .getAttribute('data-selected');
    assert.equal(stillChosen, 'true', 'the chosen word did not survive a reload');

    // The word has to have changed on screens that never mention terminology.
    await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const heading = (await page.locator('h1').first().textContent()).trim();
    assert.equal(heading, 'Headmates');

    const body = (await page.textContent('body')).replace(/\s+/g, ' ');
    assert.doesNotMatch(
      body.replace(/headmates?/gi, ''),
      /\bmembers?\b/i,
      'the old word is still on the page',
    );
  });

  it('keeps a notification channel that was switched off', async () => {
    const { page } = session;

    await page.goto(`${BASE}/settings/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const boxes = page.getByRole('checkbox');
    const total = await boxes.count();
    assert.ok(total > 0, 'the notification grid rendered no controls');

    let index = -1;
    for (let i = 0; i < total; i += 1) {
      if (await boxes.nth(i).isChecked()) {
        index = i;
        // Fails outright if the control does not move when pressed.
        await boxes.nth(i).uncheck();
        break;
      }
    }
    assert.ok(index >= 0, 'nothing was switched on to switch off');

    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    assert.equal(
      await page.getByRole('checkbox').nth(index).isChecked(),
      false,
      'the notification setting came back on after a reload',
    );
  });
});
