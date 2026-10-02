import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';
import { runBirthdayCheck, runReminderSweep, runScheduledNoteSweep } from '../services/reminders.js';

/**
 * The reminder sweep's generic SOURCES loop already delivers task/event/
 * assignment/shift reminders by computing a "Due <when>" body from their own
 * due date. A user-authored reminder has no due date distinct from the
 * reminder itself — it has its own message — so these tests pin down the one
 * thing that source does differently: the message it was given is delivered
 * verbatim, not replaced by a computed one.
 */

describe('the custom reminders sweep', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'reminders@example.com', displayName: 'Reminders' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('delivers a past-due reminder with its own message, then never again', async () => {
    const remindAt = new Date(Date.now() - 60_000).toISOString();
    const created = await client.request('POST', '/api/records/reminders', {
      token: user.token,
      body: { title: 'Water the plants', body: 'They looked thirsty this morning.', remindAt },
    });
    expect(created.status).toBe(201);
    const reminderId = created.body.data.id;

    const delivered = await runReminderSweep();
    expect(delivered).toBeGreaterThanOrEqual(1);

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find((n: { kind: string }) => n.kind === 'reminder.custom');
    expect(found).toBeTruthy();
    expect(found.title).toBe('Water the plants');
    expect(found.body).toBe('They looked thirsty this morning.');
    expect(found.link).toBe('/reminders');

    const record = await client.request('GET', `/api/records/reminders/${reminderId}`, { token: user.token });
    expect(record.body.data.remindSent).toBe(true);

    // Sweeping again must not deliver the same reminder a second time.
    const countBefore = list.body.data.notifications.filter((n: { kind: string }) => n.kind === 'reminder.custom').length;
    await runReminderSweep();
    const listAfter = await client.request('GET', '/api/notifications', { token: user.token });
    const countAfter = listAfter.body.data.notifications.filter(
      (n: { kind: string }) => n.kind === 'reminder.custom',
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it('leaves a reminder with no message to fall back to its due time, same as any other source', async () => {
    const remindAt = new Date(Date.now() - 60_000).toISOString();
    await client.request('POST', '/api/records/reminders', {
      token: user.token,
      body: { title: 'Call back', remindAt },
    });

    await runReminderSweep();

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find(
      (n: { kind: string; title: string }) => n.kind === 'reminder.custom' && n.title === 'Call back',
    );
    expect(found).toBeTruthy();
    expect(found.body).toContain('Due');
  });

  it('does not deliver a reminder that is not due yet', async () => {
    const remindAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await client.request('POST', '/api/records/reminders', {
      token: user.token,
      body: { title: 'Future reminder', remindAt },
    });

    await runReminderSweep();

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find(
      (n: { title: string }) => n.title === 'Future reminder',
    );
    expect(found).toBeUndefined();
  });
});

describe('the birthday check', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'birthdays@example.com', displayName: 'Birthdays' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  function todayAsBirthday(yearsAgo: number): string {
    const today = new Date();
    return `${today.getUTCFullYear() - yearsAgo}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  }

  it("notifies once on a member's birthday, then never again this year", async () => {
    const created = await client.request('POST', '/api/records/members', {
      token: user.token,
      body: { name: 'Hazel', birthday: todayAsBirthday(21) },
    });
    const memberId = created.body.data.id;

    const delivered = await runBirthdayCheck();
    expect(delivered).toBeGreaterThanOrEqual(1);

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find((n: { kind: string }) => n.kind === 'birthday.annual');
    expect(found).toBeTruthy();
    expect(found.title).toBe("Hazel's birthday is today!");
    expect(found.link).toBe('/calendar');

    const record = await client.request('GET', `/api/records/members/${memberId}`, { token: user.token });
    expect(record.body.data.lastBirthdayNotifiedYear).toBe(new Date().getUTCFullYear());

    const countBefore = list.body.data.notifications.filter((n: { kind: string }) => n.kind === 'birthday.annual').length;
    await runBirthdayCheck();
    const listAfter = await client.request('GET', '/api/notifications', { token: user.token });
    const countAfter = listAfter.body.data.notifications.filter(
      (n: { kind: string }) => n.kind === 'birthday.annual',
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it('leaves a member whose birthday is not today alone', async () => {
    const notToday = new Date();
    notToday.setUTCDate(notToday.getUTCDate() + 3);
    await client.request('POST', '/api/records/members', {
      token: user.token,
      body: {
        name: 'Juniper',
        birthday: `1995-${String(notToday.getUTCMonth() + 1).padStart(2, '0')}-${String(notToday.getUTCDate()).padStart(2, '0')}`,
      },
    });

    await runBirthdayCheck();

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find(
      (n: { title: string }) => n.title === "Juniper's birthday is today!",
    );
    expect(found).toBeUndefined();
  });
});

describe('the scheduled note sweep', () => {
  let client: TestClient;
  let user: { token: string; userId: string };

  beforeAll(async () => {
    client = await createTestApp();
    user = await registerUser(client, { email: 'scheduled-notes@example.com', displayName: 'Scheduled Notes' });
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('reveals a due note and notifies once, then never again', async () => {
    const remindAt = new Date(Date.now() - 60_000).toISOString();
    const created = await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { toMemberIds: [], body: 'a surprise, now due', remindAt },
    });
    const noteId = created.body.data.id;

    const delivered = await runScheduledNoteSweep();
    expect(delivered).toBeGreaterThanOrEqual(1);

    const revealed = await client.request('GET', `/api/records/memberNotes/${noteId}`, { token: user.token });
    expect(revealed.status).toBe(200);
    expect(revealed.body.data.remindSent).toBe(true);

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find((n: { kind: string }) => n.kind === 'note.received');
    expect(found).toBeTruthy();
    expect(found.title).toBe('Someone left you a note');

    const countBefore = list.body.data.notifications.filter((n: { kind: string }) => n.kind === 'note.received').length;
    await runScheduledNoteSweep();
    const listAfter = await client.request('GET', '/api/notifications', { token: user.token });
    const countAfter = listAfter.body.data.notifications.filter(
      (n: { kind: string }) => n.kind === 'note.received',
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it('notifies immediately for a note with no reveal time, through the create route instead of the sweep', async () => {
    await client.request('POST', '/api/records/memberNotes', {
      token: user.token,
      body: { toMemberIds: [], body: 'right away' },
    });

    const list = await client.request('GET', '/api/notifications', { token: user.token });
    const found = list.body.data.notifications.find(
      (n: { kind: string; title: string }) => n.kind === 'note.received' && n.title === 'Someone left you a note',
    );
    expect(found).toBeTruthy();
  });
});
