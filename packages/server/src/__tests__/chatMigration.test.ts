import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';
import { getDb, migrate } from '../db/index.js';

/**
 * The old System Chat was one shared room per system with named channels
 * rather than real threads. This proves the boot-time backfill turns
 * pre-existing channel-tagged messages into real `systemChatThreads` rows
 * without losing or duplicating anything, and that running it twice is safe.
 */
describe('system chat thread backfill', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());

  it('turns pre-existing channel-based messages into real threads on migration', async () => {
    const account = await registerUser(client, { email: 'backfill@example.com' });
    const db = getDb();
    const timestamp = new Date().toISOString();

    // Simulate rows written before threads existed: a channel string, no threadId.
    const insert = db.prepare(
      `INSERT INTO systemChatMessages
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          body, sentAt, replyToId, channel, reactions, attachmentIds, edited, threadId, forwardedFrom)
       VALUES (@id, @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          @body, @timestamp, NULL, @channel, NULL, '[]', 0, NULL, NULL)`,
    );
    insert.run({
      id: 'msg_legacy1',
      userId: account.userId,
      systemId: account.systemId,
      timestamp,
      body: 'hello from before threads existed',
      channel: 'general',
    });
    insert.run({
      id: 'msg_legacy2',
      userId: account.userId,
      systemId: account.systemId,
      timestamp,
      body: 'a second, different channel',
      channel: 'lounge',
    });
    // A channel of null (predates the column even existing) should fall back to "general".
    insert.run({
      id: 'msg_legacy3',
      userId: account.userId,
      systemId: account.systemId,
      timestamp,
      body: 'no channel at all',
      channel: null,
    });

    const result = migrate(db);
    expect(result.backfilledChatThreads).toBeGreaterThanOrEqual(3);

    const threads = db
      .prepare(`SELECT * FROM systemChatThreads WHERE systemId = ? AND deletedAt IS NULL`)
      .all(account.systemId) as { id: string; name: string; kind: string }[];
    const general = threads.find((t) => t.name === 'general');
    const lounge = threads.find((t) => t.name === 'lounge');
    expect(general).toBeTruthy();
    expect(lounge).toBeTruthy();
    expect(general?.kind).toBe('system');
    expect(lounge?.kind).toBe('system');

    const messages = db
      .prepare(`SELECT id, threadId FROM systemChatMessages WHERE id IN ('msg_legacy1', 'msg_legacy2', 'msg_legacy3')`)
      .all() as { id: string; threadId: string | null }[];
    const threadIdFor = Object.fromEntries(messages.map((m) => [m.id, m.threadId]));
    expect(threadIdFor['msg_legacy1']).toBe(general?.id);
    expect(threadIdFor['msg_legacy2']).toBe(lounge?.id);
    // The null-channel message joins "general" too, same as a live send with no channel would.
    expect(threadIdFor['msg_legacy3']).toBe(general?.id);

    // Idempotent: nothing left to backfill, so a second run creates no duplicates.
    const second = migrate(db);
    expect(second.backfilledChatThreads).toBe(0);
    const threadsAfter = db
      .prepare(`SELECT id FROM systemChatThreads WHERE systemId = ? AND deletedAt IS NULL`)
      .all(account.systemId);
    expect(threadsAfter.length).toBe(threads.length);
  });

  it('leaves a message already on a thread untouched', async () => {
    const account = await registerUser(client, { email: 'already-threaded@example.com' });
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO systemChatThreads
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          kind, name, participantMemberIds, lastMessageAt, lastMessagePreview, lastReadAt,
          pinned, muted, archived, settings)
       VALUES ('sct_manual', @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          'group', 'Just us', '[]', NULL, NULL, NULL, 0, 0, 0, NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp });

    db.prepare(
      `INSERT INTO systemChatMessages
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          body, sentAt, replyToId, channel, reactions, attachmentIds, edited, threadId, forwardedFrom)
       VALUES ('msg_already', @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          'already on a real thread', @timestamp, NULL, NULL, NULL, '[]', 0, 'sct_manual', NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp });

    migrate(db);

    const row = db.prepare(`SELECT threadId FROM systemChatMessages WHERE id = 'msg_already'`).get() as {
      threadId: string;
    };
    expect(row.threadId).toBe('sct_manual');
  });
});

/**
 * Direct/group threads used to store only the participants a member picked,
 * not the member who picked them — see routes/system.ts's active-chatter
 * filter for why that has to change. This proves the boot-time backfill adds
 * back every sender its own messages already prove belonged in the thread.
 */
describe('thread participant backfill', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());

  it('adds a message sender missing from participantMemberIds', async () => {
    const account = await registerUser(client, { email: 'participant-backfill@example.com' });
    const db = getDb();
    const timestamp = new Date().toISOString();

    // Simulates a direct thread created before the creator was included in
    // participantMemberIds: only the other member ("mem_corvid") is listed,
    // even though "mem_ash" started it and has sent a message.
    db.prepare(
      `INSERT INTO systemChatThreads
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          kind, name, participantMemberIds, lastMessageAt, lastMessagePreview, lastReadAt,
          pinned, muted, archived, settings)
       VALUES ('sct_pre_fix', @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          'direct', 'Corvid', '["mem_corvid"]', @timestamp, 'hi', NULL, 0, 0, 0, NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp });

    db.prepare(
      `INSERT INTO systemChatMessages
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          body, sentAt, replyToId, channel, reactions, attachmentIds, edited, threadId, forwardedFrom)
       VALUES ('msg_pre_fix', @userId, @systemId, 'mem_ash', 'system', @timestamp, @timestamp, NULL, 1,
          'hi', @timestamp, NULL, NULL, NULL, '[]', 0, 'sct_pre_fix', NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp });

    const result = migrate(db);
    expect(result.backfilledThreadParticipants).toBeGreaterThanOrEqual(1);

    const thread = db.prepare(`SELECT participantMemberIds FROM systemChatThreads WHERE id = 'sct_pre_fix'`).get() as {
      participantMemberIds: string;
    };
    expect(JSON.parse(thread.participantMemberIds).sort()).toEqual(['mem_ash', 'mem_corvid']);

    // Idempotent: everyone the messages name is already listed, so nothing changes.
    const second = migrate(db);
    expect(second.backfilledThreadParticipants).toBe(0);
  });

  it('leaves a thread with no messages yet untouched', async () => {
    const account = await registerUser(client, { email: 'empty-thread-backfill@example.com' });
    const db = getDb();
    const timestamp = new Date().toISOString();

    db.prepare(
      `INSERT INTO systemChatThreads
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          kind, name, participantMemberIds, lastMessageAt, lastMessagePreview, lastReadAt,
          pinned, muted, archived, settings)
       VALUES ('sct_empty', @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          'direct', 'Juniper', '["mem_juniper"]', NULL, NULL, NULL, 0, 0, 0, NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp });

    migrate(db);

    const thread = db.prepare(`SELECT participantMemberIds FROM systemChatThreads WHERE id = 'sct_empty'`).get() as {
      participantMemberIds: string;
    };
    expect(JSON.parse(thread.participantMemberIds)).toEqual(['mem_juniper']);
  });
});

/**
 * `systemChatMessages.sequence` is new — every row written before it existed
 * defaults to 0, same as any other column added to an existing table. This
 * proves the boot-time backfill turns that into each thread's real send
 * order, seeds the counter so a live send afterward continues from the
 * right number, and that running it twice adds nothing extra.
 */
describe('system chat message sequence backfill', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());

  it('assigns 1, 2, 3... in sentAt order and seeds the counter for the next live send', async () => {
    const account = await registerUser(client, { email: 'sequence-backfill@example.com' });
    const db = getDb();
    const base = Date.parse('2026-01-01T00:00:00.000Z');

    db.prepare(
      `INSERT INTO systemChatThreads
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          kind, name, participantMemberIds, lastMessageAt, lastMessagePreview, lastReadAt,
          pinned, muted, archived, settings)
       VALUES ('sct_seq_backfill', @userId, @systemId, NULL, 'private', @timestamp, @timestamp, NULL, 1,
          'group', 'Pre-sequence group', '[]', @timestamp, 'hi', NULL, 0, 0, 0, NULL)`,
    ).run({ userId: account.userId, systemId: account.systemId, timestamp: new Date(base).toISOString() });

    // Inserted out of chronological order on purpose — sentAt, not insert
    // order, is what the backfill goes by, same as a live send already does.
    const insert = db.prepare(
      `INSERT INTO systemChatMessages
         (id, userId, systemId, memberId, visibility, createdAt, updatedAt, deletedAt, version,
          body, sentAt, replyToId, channel, reactions, attachmentIds, edited, threadId, forwardedFrom)
       VALUES (@id, @userId, @systemId, NULL, 'system', @timestamp, @timestamp, NULL, 1,
          @body, @timestamp, NULL, NULL, NULL, '[]', 0, 'sct_seq_backfill', NULL)`,
    );
    insert.run({ id: 'msg_seq_c', userId: account.userId, systemId: account.systemId, body: 'third', timestamp: new Date(base + 2000).toISOString() });
    insert.run({ id: 'msg_seq_a', userId: account.userId, systemId: account.systemId, body: 'first', timestamp: new Date(base).toISOString() });
    insert.run({ id: 'msg_seq_b', userId: account.userId, systemId: account.systemId, body: 'second', timestamp: new Date(base + 1000).toISOString() });

    const result = migrate(db);
    expect(result.backfilledChatSequence).toBe(3);

    const rows = db
      .prepare(`SELECT id, sequence FROM systemChatMessages WHERE threadId = 'sct_seq_backfill' ORDER BY sentAt ASC`)
      .all() as { id: string; sequence: number }[];
    expect(rows.map((r) => r.id)).toEqual(['msg_seq_a', 'msg_seq_b', 'msg_seq_c']);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);

    const threadRow = db.prepare(`SELECT nextSequence FROM threads WHERE id = 'sct_seq_backfill'`).get() as
      | { nextSequence: number }
      | undefined;
    expect(threadRow?.nextSequence).toBe(4);

    // Idempotent: nothing left sitting at the default, so nothing to redo.
    const second = migrate(db);
    expect(second.backfilledChatSequence).toBe(0);

    // The real proof: a live send through the actual route continues the
    // count from where the backfill left it, rather than starting over.
    const sent = await client.request('POST', '/api/system/chat/threads/sct_seq_backfill/messages', {
      token: account.token,
      body: { body: 'fourth, sent live' },
    });
    expect(sent.body.data.sequence).toBe(4);
  });
});
