import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, claimHandle, openBrowser, signUp } from './helpers.mjs';

/**
 * Two systems, two browsers.
 *
 * Messages between two accounts are plain text end to end now — stored that
 * way, shown that way, with nothing claiming otherwise. That is only
 * checkable from outside: both sides, and then a look at what the server
 * actually holds.
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

    await beacon.page.goto(`${BASE}/social/messages`, { waitUntil: 'networkidle' });
    await beacon.page.waitForTimeout(1500);
    const thread = beacon.page.getByRole('button', { name: /Aurora/i }).first();
    if (await thread.count()) {
      await thread.click();
      await beacon.page.waitForTimeout(2000);
    }

    const receiver = await positions(beacon.page);
    assert.ok(receiver.every((at) => at >= 0), 'the messages never arrived');
    assert.ok(receiver[0] < receiver[1] && receiver[1] < receiver[2], 'they arrived newest first');
  });

  it('stores messages as plain, readable text', async () => {
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
      assert.equal(message.encrypted, false, `a message was unexpectedly marked encrypted: ${message.body}`);
    }
    for (const line of SENT) {
      assert.ok(stored.some((message) => message.body.includes(line)), `"${line}" was not stored as plain text`);
    }
  });

  it('shows no encryption indicator anywhere on the messages', async () => {
    const body = await beacon.page.locator('.chat-conversation__messages').textContent();
    for (const line of SENT) assert.ok(body.includes(line), `"${line}" did not render`);

    const locked = await beacon.page.locator('[aria-label="Encrypted"]').count();
    const unlocked = await beacon.page.locator('[aria-label="Not encrypted"]').count();
    assert.equal(locked, 0, 'a message showed as encrypted, which no longer exists');
    assert.equal(unlocked, 0, 'a message showed an encryption status at all, which no longer exists');
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
