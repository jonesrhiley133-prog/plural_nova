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

describe('overview: body sensations and sleep', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('ranks sensation words and regions, and averages intensity', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (const [sensation, region, intensity] of [
      ['tightness', 'chest', 4],
      ['tightness', 'chest', 2],
      ['tingling', 'hands', 3],
    ] as const) {
      await client.request('POST', '/api/records/bodySensations', {
        ...headers,
        body: { sensation, region, intensity, recordedAt: new Date().toISOString() },
      });
    }

    const overview = await client.request('GET', '/api/stats/overview', headers);

    expect(overview.body.data.sensations.entries).toBe(3);
    expect(overview.body.data.sensations.averageIntensity).toBe(3);
    expect(overview.body.data.sensations.topSensations[0]).toEqual({ key: 'tightness', count: 2 });
    expect(overview.body.data.sensations.topRegions[0]).toEqual({ key: 'chest', count: 2 });
  });

  it('counts parasomnia nights and averages sleep latency, leaving unset fields at zero', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/sleepEntries', {
      ...headers,
      body: {
        startedAt: new Date().toISOString(),
        durationMinutes: 420,
        latencyMinutes: 20,
        nightmares: true,
      },
    });
    await client.request('POST', '/api/records/sleepEntries', {
      ...headers,
      body: { startedAt: new Date().toISOString(), durationMinutes: 400, latencyMinutes: 10 },
    });

    const overview = await client.request('GET', '/api/stats/overview', headers);

    expect(overview.body.data.sleep.averageLatencyMinutes).toBe(15);
    expect(overview.body.data.sleep.nightmareNights).toBe(1);
    expect(overview.body.data.sleep.sleepwalkingNights).toBe(0);
  });
});

describe('finances: income by category', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('breaks income down by category the same way spending already is', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/transactions', {
      ...headers,
      body: { description: 'Paycheck', amount: 2000, kind: 'income', category: 'Salary', occurredAt: new Date().toISOString() },
    });
    await client.request('POST', '/api/records/transactions', {
      ...headers,
      body: { description: 'Side gig', amount: 300, kind: 'income', category: 'Freelance', occurredAt: new Date().toISOString() },
    });

    const stats = await client.request('GET', '/api/stats/finances', headers);

    expect(stats.body.data.incomeByCategory).toEqual(
      expect.arrayContaining([
        { category: 'Salary', amount: 2000 },
        { category: 'Freelance', amount: 300 },
      ]),
    );
  });
});

describe('work: earnings from a workplace\'s hourly rate', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  function shiftIso(hoursAgo: number): string {
    return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  }

  it('turns worked hours into pay when a single currency is in play', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const workplace = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'Cafe', hourlyRate: 20, currency: 'USD' },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: {
        workplaceId: workplace.body.data.id,
        startsAt: shiftIso(4),
        endsAt: shiftIso(0),
      },
    });

    const stats = await client.request('GET', '/api/stats/work', headers);

    expect(stats.body.data.earnings).toBe(80);
    expect(stats.body.data.earningsCurrency).toBe('USD');
    expect(stats.body.data.workplaces[0].earnings).toBe(80);
  });

  it('withholds a combined total rather than add two different currencies together', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const usd = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'US job', hourlyRate: 20, currency: 'USD' },
    });
    const gbp = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'UK job', hourlyRate: 15, currency: 'GBP' },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: { workplaceId: usd.body.data.id, startsAt: shiftIso(2), endsAt: shiftIso(0) },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: { workplaceId: gbp.body.data.id, startsAt: shiftIso(2), endsAt: shiftIso(0) },
    });

    const stats = await client.request('GET', '/api/stats/work', headers);

    expect(stats.body.data.earnings).toBeNull();
    expect(stats.body.data.earningsCurrency).toBeNull();
    expect(stats.body.data.workplaces.find((w: { name: string }) => w.name === 'US job').earnings).toBe(40);
    expect(stats.body.data.workplaces.find((w: { name: string }) => w.name === 'UK job').earnings).toBe(30);
  });

  it('leaves earnings null when no workplace has a rate set', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const workplace = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'Volunteer spot' },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: { workplaceId: workplace.body.data.id, startsAt: shiftIso(2), endsAt: shiftIso(0) },
    });

    const stats = await client.request('GET', '/api/stats/work', headers);

    expect(stats.body.data.earnings).toBeNull();
    expect(stats.body.data.workplaces[0].earnings).toBeNull();
  });

  it('uses a shift\'s own rate override instead of the workplace rate', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const workplace = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'Cafe', hourlyRate: 20, currency: 'USD' },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: {
        workplaceId: workplace.body.data.id,
        startsAt: shiftIso(4),
        endsAt: shiftIso(0),
        wageOverride: 30,
      },
    });

    const stats = await client.request('GET', '/api/stats/work', headers);

    // 4 hours at the 30/hr override, not the workplace's usual 20/hr.
    expect(stats.body.data.workplaces[0].earnings).toBe(120);
    expect(stats.body.data.earnings).toBe(120);
  });

  it('breaks hours and earnings down by week and month alongside the existing day view', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const workplace = await client.request('POST', '/api/records/workplaces', {
      ...headers,
      body: { name: 'Cafe', hourlyRate: 20, currency: 'USD' },
    });
    await client.request('POST', '/api/records/workShifts', {
      ...headers,
      body: { workplaceId: workplace.body.data.id, startsAt: shiftIso(4), endsAt: shiftIso(0) },
    });

    const stats = await client.request('GET', '/api/stats/work?weeks=8', headers);

    expect(Array.isArray(stats.body.data.byWeek)).toBe(true);
    expect(Array.isArray(stats.body.data.byMonth)).toBe(true);
    expect(stats.body.data.byWeek.reduce((sum: number, b: { value: number }) => sum + b.value, 0)).toBe(240);
    expect(stats.body.data.earningsByMonth.reduce((sum: number, b: { value: number }) => sum + b.value, 0)).toBe(
      80,
    );
  });
});
