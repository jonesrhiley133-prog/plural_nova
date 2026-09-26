import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, claimHandle, openBrowser, signUp } from './helpers.mjs';

/**
 * Two systems, two browsers.
 *
 * The claim this feature makes is that the server cannot read what is sent
 * through it, and the whole point of the design is that a padlock shown over
 * plaintext would be worse than no padlock at all. That is only checkable from
 * outside: both sides, and then a look at what the server actually holds.
 *
 * It has been wrong once. Keys used to be published the first time a
 * conversation was opened, so the first messages between any two systems went
 * out in the clear while the header said "Encrypted end to end".
 */

const SENT = ['first thing i said', 'second thing i said', 'third thing i said'];

let aurora;
let beacon;

// Tracked as soon as each is launched, so a browser opened before a failure is
// still closed — otherwise the run never exits and the failure reads as a hang.
const opened = [];

async function newSystem(name, handle) {
  const session = await openBrowser({ width: 414, height: 896 });
  opened.push(session);
  await signUp(session.page, { name });
  await claimHandle(session.page, handle, name);
  session.handle = handle;
  return session;
}

before(async () => {
  const stamp = Date.now().toString().slice(-6);
  aurora = await newSystem('Aurora System', `aurora${stamp}`);
  beacon = await newSystem('Beacon System', `beacon${stamp}`);
});

after(async () => {
  await Promise.all(opened.map((session) => session.browser.close()));
});

describe('messaging between two systems', () => {
  it('delivers a friend request that the other side can accept', async () => {
    await aurora.page.goto(`${BASE}/friends`, { waitUntil: 'networkidle' });
    await aurora.page.waitForTimeout(800);
    await aurora.page.getByRole('button', { name: /add|request|invite/i }).first().click();
    await aurora.page.waitForTimeout(500);

    const dialog = aurora.page.getByRole('dialog');
    await dialog.getByLabel(/their handle/i).fill(beacon.handle);
    await dialog.getByRole('button', { name: /send/i }).first().click();
    await aurora.page.waitForTimeout(1500);

    await beacon.page.goto(`${BASE}/friends`, { waitUntil: 'networkidle' });
    await beacon.page.waitForTimeout(1200);
    const accept = beacon.page.getByRole('button', { name: /accept/i }).first();
    assert.equal(await accept.count(), 1, 'the request never reached the other system');
    await accept.click();
    await beacon.page.waitForTimeout(1500);
  });

  it('shows messages oldest first, on both sides', async () => {
    await aurora.page.goto(`${BASE}/friends`, { waitUntil: 'networkidle' });
    await aurora.page.waitForTimeout(1200);
    await aurora.page.getByRole('button', { name: /message/i }).first().click();
    await aurora.page.waitForTimeout(1800);

    for (const line of SENT) {
      await aurora.page.getByRole('textbox', { name: 'Message' }).fill(line);
      await aurora.page.getByRole('button', { name: 'Send' }).click();
      await aurora.page.waitForTimeout(800);
    }
    await aurora.page.waitForTimeout(1200);

    const positions = async (page) => {
      const text = await page.locator('.chat-conversation__messages').textContent();
      return SENT.map((line) => text.indexOf(line));
    };

    const sender = await positions(aurora.page);
    assert.ok(sender.every((at) => at >= 0), 'the sender cannot see what they sent');
    assert.ok(sender[0] < sender[1] && sender[1] < sender[2], 'the sender sees them newest first');

    await beacon.page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });
    await beacon.page.waitForTimeout(1500);
    // Beacon is a System Mode account, so Chat Home opens on the System tab —
    // a dm from Aurora is on the Direct tab.
    await beacon.page.getByRole('tab', { name: /direct/i }).click();
    await beacon.page.waitForTimeout(500);
    const thread = beacon.page.getByRole('button', { name: /Aurora/i }).first();
    if (await thread.count()) {
      await thread.click();
      await beacon.page.waitForTimeout(2000);
    }

    const receiver = await positions(beacon.page);
    assert.ok(receiver.every((at) => at >= 0), 'the messages never arrived');
    assert.ok(receiver[0] < receiver[1] && receiver[1] < receiver[2], 'they arrived newest first');
  });

  it('stores ciphertext the server cannot read', async () => {
    const stored = await beacon.page.evaluate(async () => {
      const auth = { authorization: `Bearer ${localStorage.getItem('pluralnova.token')}` };
      const list = await (await fetch('/api/messages/conversations', { headers: auth })).json();
      const threadId = list.data?.conversations?.[0]?.threadId;
      if (!threadId) return null;
      const thread = await (await fetch(`/api/messages/threads/${threadId}?limit=20`, { headers: auth })).json();
      return (thread.data?.messages ?? []).map((message) => ({
        encrypted: message.encrypted,
        body: String(message.body ?? ''),
      }));
    });

    assert.ok(stored && stored.length >= SENT.length, `no stored messages found: ${JSON.stringify(stored)}`);
    for (const message of stored) {
      assert.equal(message.encrypted, true, `a message was stored in the clear: ${message.body}`);
      assert.ok(
        !SENT.some((line) => message.body.includes(line)),
        `the stored body is readable: ${message.body}`,
      );
    }
  });

  it('shows a padlock on every message, and decrypts them for the reader', async () => {
    const body = await beacon.page.locator('.chat-conversation__messages').textContent();
    for (const line of SENT) assert.ok(body.includes(line), `"${line}" did not decrypt`);

    const padlocks = await beacon.page.locator('[aria-label="Encrypted"]').count();
    const open = await beacon.page.locator('[aria-label="Not encrypted"]').count();
    assert.equal(open, 0, 'a message went out in the clear');
    assert.ok(padlocks >= SENT.length, `only ${padlocks} of ${SENT.length} messages are marked encrypted`);
  });

  it('delivers a reply without the other side reloading', async () => {
    await beacon.page.getByRole('textbox', { name: 'Message' }).fill('and this is my reply');
    await beacon.page.getByRole('button', { name: 'Send' }).click();
    await beacon.page.waitForTimeout(2000);

    // No navigation on Aurora's side: this has to arrive over the socket.
    await aurora.page.waitForTimeout(3000);
    const body = await aurora.page.locator('.chat-conversation__messages').textContent();
    assert.match(body, /and this is my reply/, 'the reply never arrived live');
  });
});
