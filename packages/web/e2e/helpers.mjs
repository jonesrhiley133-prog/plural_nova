/**
 * Shared scaffolding for the end-to-end checks.
 *
 * These run against a real build served by the real server, because the things
 * they are looking for — a service worker that never installs, a column that
 * takes the page sideways on a phone, a session that does not survive going
 * offline — are invisible to a unit test by construction.
 */

import { chromium } from 'playwright';

export const BASE = process.env['PLURALNOVA_E2E_URL'] ?? 'http://localhost:4000';

/** The phone width worth holding the line at: a small Android in portrait. */
export const PHONE = { width: 360, height: 780 };

export async function openBrowser(viewport = PHONE, contextOptions = {}) {
  const browser = await chromium.launch({
    ...(process.env['PLAYWRIGHT_CHROMIUM'] ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM'] } : {}),
  });
  // contextOptions is how a check asks for something about the device rather
  // than the app — reducedMotion, colorScheme, a different locale.
  const context = await browser.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();

  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    // A request cancelled by navigating away is not a failure.
    const reason = request.failure()?.errorText ?? '';
    if (reason !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${request.url()} ${reason}`);
  });

  return { browser, context, page, problems };
}

/**
 * A fresh account, through the interface rather than the API: registration and
 * onboarding are part of what these checks are checking.
 */
export async function signUp(page, { name = 'End To End', mode = 'system' } = {}) {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

  // Start from a signed-out browser, so a file can register more than one
  // account without the second one landing on the previous one's dashboard.
  // A reload rather than a second goto: two navigations in flight at once
  // cancel each other, and the cancelled one surfaces as ERR_ABORTED.
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* Blocked storage means there was nothing to clear. */
    }
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('What should we call you?').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('orbit-lantern-4417');
  await page.getByRole('radio').nth(mode === 'system' ? 0 : 1).check();
  await page.getByRole('button', { name: 'Create an account' }).click();

  await page.waitForSelector('text=Step 1 of 10');
  for (let step = 1; step <= 9; step += 1) {
    await page.getByRole('button', { name: /^(Next|Skip)$/ }).last().click();
    await page.waitForTimeout(120);
  }
  await page.getByRole('button', { name: /^Open / }).click();
  await page.waitForTimeout(1200);

  return { email };
}

/**
 * Claims a public handle, which is how one system finds another. Systems are
 * not discoverable until they have one.
 */
export async function claimHandle(page, handle, displayName) {
  await page.goto(`${BASE}/constellations`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const edit = page.getByRole('button', { name: /edit|set up|create.*profile|publish/i }).first();
  if (await edit.count()) {
    await edit.click();
    await page.waitForTimeout(500);
  }

  await page.getByLabel('Handle').first().fill(handle);
  await page.getByLabel('Display name').first().fill(displayName);
  const discoverable = page.getByLabel(/discoverable/i).first();
  if ((await discoverable.count()) && !(await discoverable.isChecked())) await discoverable.check();
  await page.getByRole('button', { name: /^(Save|Publish)/i }).first().click();
  await page.waitForTimeout(1500);
}

/** Every route the shell can reach without an id, which is what a smoke test wants. */
export const ROUTES = [
  '',
  'whos-there', 'quick-front', 'fronting', 'stats', 'members', 'profiles', 'organize',
  'subsystems', 'system-history', 'relationships', 'headspace', 'system-chat', 'bulletin',
  'polls', 'journal', 'notes', 'tasks', 'calendar', 'media', 'flags', 'achievements',
  'daily-summary', 'wellbeing', 'emotions', 'body-map', 'emotion-insights', 'sleep',
  'fitness', 'cycle', 'finances', 'contacts', 'emergency', 'locations', 'work', 'vault',
  'constellations', 'friends', 'flux', 'messages', 'notifications', 'music', 'video',
  'fics', 'characters', 'stories', 'resources', 'dictionary', 'templates', 'import',
  'backup', 'settings', 'help', 'features', 'search', 'more',
];
