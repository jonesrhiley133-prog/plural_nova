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
