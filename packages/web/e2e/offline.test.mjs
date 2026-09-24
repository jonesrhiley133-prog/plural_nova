import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * The difference between an installed app and a bookmark.
 *
 * Each of these once failed: the app signed the user out on an offline launch,
 * because a token that could not be checked was treated the same as a token
 * that had been rejected.
 */

let session;

before(async () => {
  session = await openBrowser();
  await signUp(session.page);
});

after(async () => {
  await session.context.setOffline(false);
  await session.browser.close();
});

async function addNote(page, title) {
  await page.goto(`${BASE}/notes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /add note/i }).first().click();
  await page.waitForTimeout(300);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Title$/i).fill(title);
  await dialog.getByRole('button', { name: /^Save$/i }).click();
  await page.waitForTimeout(1200);
}

describe('with no connection', () => {
  it('installs a service worker that takes control of the page', async () => {
    const registration = await session.page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, state: ready.active?.state ?? null };
    });

    assert.equal(registration.state, 'activated');
    assert.equal(registration.scope, `${BASE}/`);
  });

  it('has someone fronting before anything goes offline', async () => {
    const { page } = session;
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const auth = {
        'content-type': 'application/json',
        authorization: `Bearer ${localStorage.getItem('pluralnova.token')}`,
      };
      const member = await (
        await fetch('/api/records/members', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ name: 'Offline Test Member', color: '#9d8cf0' }),
        })
      ).json();
      await fetch('/api/fronting/start', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ memberId: member.data.id }),
      });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const body = await page.textContent('body');
    assert.ok(body.includes('Offline Test Member'), 'the front did not take while still online');
  });

  it('opens the app rather than the sign-in screen', async () => {
    const { page, context } = session;
    await addNote(page, 'Written while connected');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const body = await page.textContent('body');
    assert.ok(!body.includes('Create an account'), 'an offline launch signed the user out');
    assert.ok(body.includes('Written while connected'), 'offline launch lost the stored records');

    // The note above only proves the /notes screen survives; who's fronting
    // is shown on the dashboard, so that needs its own offline navigation.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const dashboardBody = await page.textContent('body');
    assert.ok(dashboardBody.includes('Offline Test Member'), 'offline launch forgot who was fronting');
    assert.ok(!dashboardBody.includes('Nobody is marked as'), 'offline launch fell back to a false "nobody fronting"');
  });

  it('keeps a write made offline, and says it is waiting', async () => {
    const { page } = session;
    await addNote(page, 'Written with no signal');

    const body = await page.textContent('body');
    assert.ok(body.includes('Written with no signal'), 'the offline write was not kept');
    assert.match(body, /waiting to sync|offline|saved on this device/i);
  });

  it('finds already-synced content through search with no connection', async () => {
    const { page } = session;
    await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.getByRole('searchbox', { name: 'Search' }).fill('no signal');
    await page.waitForTimeout(600);
    const body = await page.textContent('body');
    assert.ok(body.includes('Written with no signal'), 'offline search did not find a note already on this device');
  });

  it('does not get stuck checking the vault forever with no connection', async () => {
    const { page } = session;
    await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const body = await page.textContent('body');
    assert.ok(!body.includes('Checking the vault…'), 'the vault screen is stuck on its loading state with no way out');
  });

  it('sends that write to the server once the connection is back', async () => {
    const { page, context } = session;
    await context.setOffline(false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    const titles = await page.evaluate(async () => {
      const response = await fetch('/api/records/notes?limit=50', {
        headers: { authorization: `Bearer ${localStorage.getItem('pluralnova.token')}` },
      });
      const payload = await response.json();
      return (payload.data?.items ?? []).map((note) => note.title);
    });

    assert.ok(titles.includes('Written with no signal'), `server has: ${titles.join(', ')}`);
  });
});
