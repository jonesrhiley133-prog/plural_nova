import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * The day-summary insights are plain arithmetic — an average from the last
 * two weeks next to today's own number — but the windowing (excluding the
 * viewed day from its own baseline) and the minimum-sample gate are exactly
 * the kind of off-by-one and over-confidence bugs that are invisible by
 * reading and obvious in a test.
 */
describe('daily insights', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  function isoAt(daysAgo: number, hour = 12): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  it('compares today against a two-week baseline that excludes today itself', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    // A fortnight of baseline mood entries averaging 5.
    for (const score of [4, 5, 6, 5, 5]) {
      await client.request('POST', '/api/records/moodEntries', {
        ...headers,
        body: { label: 'baseline', score, recordedAt: isoAt(7) },
      });
    }
    // Today's own entry, well above that baseline.
    await client.request('POST', '/api/records/moodEntries', {
      ...headers,
      body: { label: 'today', score: 9, recordedAt: isoAt(0) },
    });

    const today = new Date().toISOString().slice(0, 10);
    const day = await client.request('GET', `/api/stats/day/${today}`, headers);

    expect(day.status).toBe(200);
    expect(day.body.data.insights.mood).toEqual({ today: 9, baseline: 5 });
  });

  it('withholds a comparison until the baseline has at least three entries', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    // Only two baseline entries — not enough to say what is usual.
    await client.request('POST', '/api/records/moodEntries', {
      ...headers,
      body: { label: 'baseline', score: 5, recordedAt: isoAt(3) },
    });
    await client.request('POST', '/api/records/moodEntries', {
      ...headers,
      body: { label: 'baseline', score: 5, recordedAt: isoAt(5) },
    });
    await client.request('POST', '/api/records/moodEntries', {
      ...headers,
      body: { label: 'today', score: 9, recordedAt: isoAt(0) },
    });

    const today = new Date().toISOString().slice(0, 10);
    const day = await client.request('GET', `/api/stats/day/${today}`, headers);

    expect(day.body.data.insights.mood).toBeNull();
  });

  it('counts the journal streak through the viewed day', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (let daysAgo = 0; daysAgo < 4; daysAgo += 1) {
      await client.request('POST', '/api/records/journalEntries', {
        ...headers,
        body: { title: `Day ${daysAgo}`, body: 'Entry.', entryDate: isoAt(daysAgo) },
      });
    }
    // A gap two days further back should not be bridged.
    await client.request('POST', '/api/records/journalEntries', {
      ...headers,
      body: { title: 'Old', body: 'Older entry.', entryDate: isoAt(6) },
    });

    const today = new Date().toISOString().slice(0, 10);
    const day = await client.request('GET', `/api/stats/day/${today}`, headers);

    expect(day.body.data.insights.journalStreak).toBe(4);
  });
});
