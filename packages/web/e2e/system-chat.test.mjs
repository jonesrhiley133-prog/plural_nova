import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * System Chat, one system, two alters.
 *
 * "Mine" here has no second account to lean on the way a dm does — it is
 * whichever alter the send-as strip currently has selected, and every
 * message's side has to be judged against that fresh each time, not against
 * whichever alter happened to send it first. Switching who is sending is the
 * whole point of the feature, so a message flipping sides when it does is
 * correct, not a bug — the bug this covers is it not flipping, or not saving
 * as the alter actually chosen.
 */

let session;
let chatterA;
let chatterB;

async function createMember(page, name, color) {
  return page.evaluate(
    async ({ name, color }) => {
      const auth = {
        'content-type': 'application/json',
        authorization: `Bearer ${localStorage.getItem('pluralnova.token')}`,
      };
      const result = await (
        await fetch('/api/records/members', { method: 'POST', headers: auth, body: JSON.stringify({ name, color }) })
      ).json();
      return result.data.id;
    },
    { name, color },
  );
}

const mineOf = async (locator) => (await locator.getAttribute('class') ?? '').includes('chat-message--mine');

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Chat Test System' });
  chatterA = await createMember(session.page, 'Chatter A', '#7dd3fc');
  chatterB = await createMember(session.page, 'Chatter B', '#f9a8d4');
  assert.ok(chatterA && chatterB, 'test members were not created');

  await session.page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });
  await session.page.waitForTimeout(1000);
  await session.page.getByRole('button', { name: /General/i }).first().click();
  await session.page.waitForTimeout(800);
});

after(async () => {
  await session.browser.close();
});

describe('system chat: sender identity and ordering', () => {
  it('sends as the chosen chatter and puts it on the right', async () => {
    const { page } = session;
    await page.getByRole('radio', { name: 'Send as Chatter A' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('hello from A');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(1200);

    const bubble = page.locator('.chat-message', { hasText: 'hello from A' }).last();
    assert.ok(await mineOf(bubble), "A's own message did not render as mine");
  });

  it('reclassifies it — without moving it — the moment the active chatter changes', async () => {
    const { page } = session;
    await page.getByRole('radio', { name: 'Send as Chatter B' }).click();
    await page.waitForTimeout(400);

    const fromA = page.locator('.chat-message', { hasText: 'hello from A' }).last();
    assert.ok(!(await mineOf(fromA)), "A's message still reads as mine after switching to B");

    await page.getByRole('textbox', { name: 'Message' }).fill('hello from B');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(1200);

    const fromB = page.locator('.chat-message', { hasText: 'hello from B' }).last();
    assert.ok(await mineOf(fromB), "B's own message did not render as mine");
  });

  it('attributes correctly again on switching back', async () => {
    const { page } = session;
    await page.getByRole('radio', { name: 'Send as Chatter A' }).click();
    await page.waitForTimeout(400);

    const fromA = page.locator('.chat-message', { hasText: 'hello from A' }).last();
    const fromB = page.locator('.chat-message', { hasText: 'hello from B' }).last();
    assert.ok(await mineOf(fromA), "A's message did not go back to reading as mine");
    assert.ok(!(await mineOf(fromB)), "B's message still reads as mine once A is active again");
  });

  const RAPID = ['rapid one', 'rapid two', 'rapid three', 'rapid four'];

  it('keeps rapidly sent messages in order, including after a reload', async () => {
    const { page } = session;
    const box = page.getByRole('textbox', { name: 'Message' });
    const send = page.getByRole('button', { name: 'Send' });
    for (const line of RAPID) {
      await box.fill(line);
      await send.click();
    }
    await page.waitForTimeout(1500);

    const positions = async () => {
      const text = await page.locator('.chat-conversation__messages').textContent();
      return RAPID.map((line) => text.indexOf(line));
    };

    let at = await positions();
    assert.ok(at.every((index) => index >= 0), `a rapidly sent message is missing: ${JSON.stringify(at)}`);
    for (let i = 1; i < at.length; i += 1) {
      assert.ok(at[i - 1] < at[i], `"${RAPID[i]}" is not after "${RAPID[i - 1]}"`);
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    at = await positions();
    assert.ok(at.every((index) => index >= 0), `a message vanished after reload: ${JSON.stringify(at)}`);
    for (let i = 1; i < at.length; i += 1) {
      assert.ok(at[i - 1] < at[i], `order broke after reload: "${RAPID[i]}" is not after "${RAPID[i - 1]}"`);
    }
  });
});
