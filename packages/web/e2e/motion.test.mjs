import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, PHONE, openBrowser, signUp } from './helpers.mjs';

/**
 * Motion, and the two ways of turning it off.
 *
 * Content arrives by animating from transparent, which is fine until the
 * animation does not run: `both` holds a keyframe's last frame, but only for
 * an animation that happened at all. Get that wrong and asking for no motion —
 * which people with vestibular disorders do, and which this app's own
 * performance tier does — leaves the page blank.
 *
 * That failure is invisible to every other check here, because they all run
 * with motion on.
 */

const visibleCards = () => {
  // Any card, not only ones that are a direct child of a known container: the
  // point is whether content is on screen, and a fresh account's screens do
  // not all lay out the same way.
  const cards = [...document.querySelectorAll('.card, .list-row')];
  const faded = cards.filter((element) => {
    const box = element.getBoundingClientRect();
    return Number(getComputedStyle(element).opacity) < 0.95 || box.width < 2 || box.height < 2;
  });
  const first = document.querySelector('.app-main > *');
  return {
    total: cards.length,
    faded: faded.length,
    mainOpacity: first ? Number(getComputedStyle(first).opacity) : 0,
  };
};

const effectTokens = () => {
  const read = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const card = document.querySelector('.card');
  return {
    effects: document.documentElement.getAttribute('data-effects'),
    motion: read('--motion'),
    blur: read('--blur-surface'),
    glow: read('--glow-opacity'),
    starfield: read('--starfield-opacity'),
    backdrop: card ? getComputedStyle(card).backdropFilter : '',
  };
};

describe('motion', () => {
  it('still shows the page when the device asks for no motion', async () => {
    const session = await openBrowser(PHONE, { reducedMotion: 'reduce' });
    try {
      await signUp(session.page, { name: 'Reduced Motion' });
      // The dashboard, because a brand new account has cards there and no
      // members yet — an empty members grid would pass this check by having
      // nothing to hide.
      await session.page.goto(BASE, { waitUntil: 'networkidle' });
      await session.page.waitForTimeout(1200);

      const seen = await session.page.evaluate(visibleCards);
      assert.equal(await session.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion').trim()), '0');
      assert.ok(seen.total > 0, 'no cards rendered at all');
      assert.equal(seen.faded, 0, `${seen.faded} of ${seen.total} cards were left transparent`);
      assert.ok(seen.mainOpacity >= 0.95, `page content sat at opacity ${seen.mainOpacity}`);
    } finally {
      await session.browser.close();
    }
  });
});

describe('the performance tier', () => {
  let session;

  before(async () => {
    session = await openBrowser();
    await signUp(session.page, { name: 'Performance' });
  });

  after(async () => {
    await session.browser.close();
  });

  it('actually stops drawing the expensive parts, and keeps doing so', async () => {
    const { page } = session;

    await page.goto(`${BASE}/settings/performance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const before = await page.evaluate(effectTokens);
    assert.notEqual(before.effects, 'performance', 'started in performance mode, so this proves nothing');

    await page.getByLabel('Visual effects').selectOption('performance');
    await page.waitForTimeout(1200);

    const after = await page.evaluate(effectTokens);
    assert.equal(after.effects, 'performance');
    assert.equal(after.motion, '0');
    assert.equal(after.blur, '0px');
    assert.equal(after.glow, '0');
    assert.equal(after.starfield, '0');

    // A setting that only holds until the next screen is not a setting, and a
    // token that reads 0 while the element still blurs is not an economy.
    await page.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const moved = await page.evaluate(effectTokens);
    assert.equal(moved.effects, 'performance', 'the setting did not survive a navigation');
    assert.equal(moved.motion, '0');
    assert.ok(!/blur\(\s*[1-9]/.test(moved.backdrop), `cards still blur: ${moved.backdrop}`);

    const seen = await page.evaluate(visibleCards);
    assert.equal(seen.faded, 0, 'performance mode left content transparent');
  });
});
