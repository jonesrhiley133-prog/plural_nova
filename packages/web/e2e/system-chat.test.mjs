import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, openBrowser, signUp } from './helpers.mjs';

/**
 * System Chat, one system, two alters.
 *
 * Alignment is a Discord-style open feed, never a chat bubble, and every
 * message's side is strictly its position in the conversation's permanent
 * sequence — message 1 left, 2 right, 3 left... — regardless of who sent
 * it, who is currently chosen to send as, or how many messages happen to be
 * loaded. A message changing sides after it has already rendered, for any
 * reason, is exactly the bug this file guards against.
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

/** A group/direct system-chat thread, created directly rather than through the "New chat" dialog, so a test can control exactly who is on it. */
async function createGroupThread(page, memberIds, name) {
  return page.evaluate(
    async ({ memberIds, name }) => {
      const auth = {
        'content-type': 'application/json',
        authorization: `Bearer ${localStorage.getItem('pluralnova.token')}`,
      };
      const result = await (
        await fetch('/api/system/chat/threads', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ kind: 'group', name, participantMemberIds: memberIds }),
        })
      ).json();
      return result.data.thread.id;
    },
    { memberIds, name },
  );
}

/** Reads a message's row-level alignment — 'left', 'right', or 'pending' for a send still in flight. Never which alter sent it. */
async function sideOf(page, text) {
  const row = page
    .locator('.chat-feed-row')
    .filter({ has: page.locator('.chat-feed__body', { hasText: text }) })
    .last();
  const classes = (await row.getAttribute('class')) ?? '';
  if (classes.includes('chat-feed-row--left')) return 'left';
  if (classes.includes('chat-feed-row--right')) return 'right';
  if (classes.includes('chat-feed-row--pending')) return 'pending';
  return 'unknown';
}

before(async () => {
  session = await openBrowser();
  await signUp(session.page, { name: 'Chat Test System' });
  chatterA = await createMember(session.page, 'Chatter A', '#7dd3fc');
  chatterB = await createMember(session.page, 'Chatter B', '#f9a8d4');
  assert.ok(chatterA && chatterB, 'test members were not created');

  await session.page.goto(`${BASE}/system/chat`, { waitUntil: 'networkidle' });
  await session.page.waitForTimeout(1000);
  await session.page.getByRole('button', { name: /General/i }).first().click();
  await session.page.waitForTimeout(800);
});

after(async () => {
  await session.browser.close();
});

describe('system chat: strict positional alternation', () => {
  const SIX = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const EXPECTED = ['left', 'right', 'left', 'right', 'left', 'right'];
  // Mixed and repeated senders on purpose — alignment must ignore all of it.
  const SENDERS = ['Chatter A', 'Chatter A', 'Chatter B', 'Chatter A', 'Chatter B', 'Chatter B'];

  it('alternates left, right, left, right, left, right by position, never by sender', async () => {
    const { page } = session;
    const box = page.getByRole('textbox', { name: 'Message' });
    const send = page.getByRole('button', { name: 'Send' });

    for (let i = 0; i < SIX.length; i += 1) {
      await page.getByRole('radio', { name: `Send as ${SENDERS[i]}` }).click();
      await box.fill(SIX[i]);
      await send.click();
      await page.waitForTimeout(900);
    }

    for (let i = 0; i < SIX.length; i += 1) {
      assert.equal(await sideOf(page, SIX[i]), EXPECTED[i], `"${SIX[i]}" (position ${i + 1}) is not ${EXPECTED[i]}`);
    }
  });

  it('never moves once rendered — not when who is sending changes, not after leaving and returning — and continues correctly', async () => {
    const { page } = session;

    // Toggling who the composer sends as must never retroactively reclassify
    // already-rendered history — exactly the bug this redesign replaces.
    await page.getByRole('radio', { name: 'Send as Chatter B' }).click();
    await page.waitForTimeout(400);
    for (let i = 0; i < SIX.length; i += 1) {
      assert.equal(await sideOf(page, SIX[i]), EXPECTED[i], `"${SIX[i]}" moved after switching who is sending`);
    }

    // Leave the conversation entirely and come back to it.
    await page.goto(`${BASE}/system/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /General/i }).first().click();
    await page.waitForTimeout(800);
    for (let i = 0; i < SIX.length; i += 1) {
      assert.equal(await sideOf(page, SIX[i]), EXPECTED[i], `"${SIX[i]}" moved after leaving and returning`);
    }

    // A 7th message must continue the exact same sequence: left, since the 6th was right.
    await page.getByRole('textbox', { name: 'Message' }).fill('seventh');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForTimeout(1200);
    assert.equal(await sideOf(page, 'seventh'), 'left', '"seventh" did not land on the correct next side');
  });

  it("redacts a deleted message in place, leaving its neighbors exactly where they were", async () => {
    const { page } = session;
    // "third" sits at position 3 (left). Removing it must not pull "second"
    // (right) and "fourth" (right) together onto adjacent, same-sided slots —
    // its slot has to stay occupied by a tombstone, not disappear.
    const row = page.locator('.chat-feed-row').filter({ has: page.locator('.chat-feed__body', { hasText: 'third' }) }).last();
    await row.hover();
    await row.getByLabel('Message actions').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(800);

    assert.equal(await sideOf(page, 'second'), 'right', '"second" moved after its neighbor was deleted');
    assert.equal(await sideOf(page, 'fourth'), 'right', '"fourth" moved after its neighbor was deleted');
    assert.ok((await page.getByText('Message removed').count()) >= 1, 'the removed message tombstone did not appear');
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

/**
 * The active chatter, not the send-as strip above, is what decides which
 * threads even show up in the list — a fresh account starts with no active
 * chatter at all, so a direct/group thread between two alters should stay
 * invisible until one of its own participants becomes the active chatter,
 * and disappear again once someone unrelated does instead.
 */
describe('active chatter: thread visibility and header identity', () => {
  const THREAD_NAME = 'A and B only';
  let chatterC;

  it('shows only the whole-system thread and a notice when no one is the active chatter', async () => {
    const { page } = session;
    chatterC = await createMember(page, 'Chatter C', '#c4b5fd');
    await createGroupThread(page, [chatterA, chatterB], THREAD_NAME);

    await page.goto(`${BASE}/system/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    assert.equal(
      await page.getByText(/no one.*active profile/i).count(),
      1,
      'the no-active-chatter notice did not show on a fresh account',
    );
    assert.equal(
      await page.getByRole('button', { name: new RegExp(THREAD_NAME, 'i') }).count(),
      0,
      "A and B's thread is visible before anyone is the active chatter",
    );
    assert.ok(
      (await page.getByRole('button', { name: /General/i }).count()) >= 1,
      'the whole-system thread disappeared along with everything else',
    );
  });

  it("shows a chatter's own threads, and their avatar in the header, once they become active", async () => {
    const { page } = session;
    await page.getByRole('button', { name: /Currently chatting as/i }).click();
    await page.getByRole('menuitem', { name: 'Chatter A' }).click();
    await page.waitForTimeout(700);

    assert.equal(
      await page.getByText(/no one.*active profile/i).count(),
      0,
      'the no-active-chatter notice stayed after picking Chatter A',
    );
    assert.equal(
      await page.getByRole('button', { name: new RegExp(THREAD_NAME, 'i') }).count(),
      1,
      "Chatter A's own thread with B did not appear once A became the active chatter",
    );
    assert.ok(
      (await page.getByRole('button', { name: /Currently chatting as Chatter A/i }).count()) >= 1,
      'the header avatar did not switch to name Chatter A as the active chatter',
    );
  });

  it('swaps the visible thread list — without touching the thread itself — when switching to an unrelated chatter', async () => {
    const { page } = session;
    await page.getByRole('button', { name: /Currently chatting as/i }).click();
    await page.getByRole('menuitem', { name: 'Chatter C' }).click();
    await page.waitForTimeout(700);

    assert.equal(
      await page.getByRole('button', { name: new RegExp(THREAD_NAME, 'i') }).count(),
      0,
      "Chatter C can see A and B's thread despite not being a participant",
    );
    assert.ok(
      (await page.getByRole('button', { name: /General/i }).count()) >= 1,
      'the whole-system thread disappeared for Chatter C',
    );

    // Switch back to A and confirm the thread is exactly as it was — the
    // point of this feature is that switching re-filters the list, it never
    // rewrites or removes the underlying conversation.
    await page.getByRole('button', { name: /Currently chatting as/i }).click();
    await page.getByRole('menuitem', { name: 'Chatter A' }).click();
    await page.waitForTimeout(700);

    assert.equal(
      await page.getByRole('button', { name: new RegExp(THREAD_NAME, 'i') }).count(),
      1,
      "A and B's thread did not come back for A after switching away and back",
    );
  });
});
