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

/**
 * An entry logged with more than one emotion at once is still one row —
 * `emotionId`/`category` hold the first, `emotionIds`/`categories` hold the
 * full set. Every reader that breaks emotions down (here) or displays them
 * individually (the daily summary) has to count or show each one, not just
 * the row's own first pick, or logging several together would silently
 * undercount exactly the emotions a person went out of their way to name.
 */
describe('emotions logged together in one entry', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('counts every emotion in a multi-emotion entry, not only its first', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: {
        emotionId: 'joy.happy',
        emotionIds: ['joy.happy', 'fear.nervous'],
        category: 'joy',
        categories: ['joy', 'fear'],
        intensity: 3,
        recordedAt: new Date().toISOString(),
      },
    });
    // A plain, single-emotion entry for comparison.
    await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: { emotionId: 'joy.happy', category: 'joy', intensity: 4, recordedAt: new Date().toISOString() },
    });

    const stats = await client.request('GET', '/api/stats/emotions', headers);

    expect(stats.status).toBe(200);
    // One entry, kept as one entry — this total is "how many times you logged", not "how many words".
    expect(stats.body.data.total).toBe(2);
    const byEmotion = new Map(stats.body.data.topEmotions.map((e: { key: string; count: number }) => [e.key, e.count]));
    expect(byEmotion.get('joy.happy')).toBe(2);
    expect(byEmotion.get('fear.nervous')).toBe(1);
    const byFamily = new Map(stats.body.data.families.map((f: { key: string; count: number }) => [f.key, f.count]));
    expect(byFamily.get('joy')).toBe(2);
    expect(byFamily.get('fear')).toBe(1);
  });

  it('shows a multi-emotion entry as one chip per emotion in the daily summary', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const recordedAt = new Date().toISOString();
    const created = await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: {
        emotionId: 'joy.happy',
        emotionIds: ['joy.happy', 'fear.nervous'],
        category: 'joy',
        categories: ['joy', 'fear'],
        intensity: 3,
        recordedAt,
      },
    });

    const today = recordedAt.slice(0, 10);
    const day = await client.request('GET', `/api/stats/day/${today}`, headers);

    expect(day.status).toBe(200);
    const rowsForEntry = day.body.data.emotions.filter((e: { id: string }) => e.id === created.body.data.id);
    expect(rowsForEntry).toHaveLength(2);
    expect(rowsForEntry.map((e: { emotionId: string }) => e.emotionId).sort()).toEqual(['fear.nervous', 'joy.happy']);
    expect(rowsForEntry.every((e: { emotion: { name: string } | null }) => e.emotion !== null)).toBe(true);
  });

  it('reads an entry from before emotionIds existed as its one emotionId', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    // No emotionIds/categories at all — the shape every pre-migration row has.
    await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: { emotionId: 'joy.happy', category: 'joy', intensity: 3, recordedAt: new Date().toISOString() },
    });

    const stats = await client.request('GET', '/api/stats/emotions', headers);
    const byEmotion = new Map(stats.body.data.topEmotions.map((e: { key: string; count: number }) => [e.key, e.count]));
    expect(byEmotion.get('joy.happy')).toBe(1);
  });
});

/**
 * The Mood & Emotions redesign's Constellation and mood-level breakdown:
 * per-emotion intensity and co-occurrence stay sourced from `emotionEntries`
 * (unchanged), but the mood-to-emotion link can only come from
 * `feelingEntries`, since that is the one collection where a mood and its
 * emotions share a row.
 */
describe('Constellation and mood-emotion link stats', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it("gives each top emotion its own average intensity, not the whole log's blended one", async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (const intensity of [5, 5]) {
      await client.request('POST', '/api/records/emotionEntries', {
        ...headers,
        body: { emotionId: 'joy.happy', category: 'joy', intensity, recordedAt: new Date().toISOString() },
      });
    }
    await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: { emotionId: 'fear.nervous', category: 'fear', intensity: 1, recordedAt: new Date().toISOString() },
    });

    const stats = await client.request('GET', '/api/stats/emotions', headers);
    const byEmotion = new Map(
      stats.body.data.topEmotions.map((e: { key: string; averageIntensity: number }) => [e.key, e.averageIntensity]),
    );
    expect(byEmotion.get('joy.happy')).toBe(5);
    expect(byEmotion.get('fear.nervous')).toBe(1);
  });

  it('counts how often two emotions were logged in the same entry', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/emotionEntries', {
      ...headers,
      body: {
        emotionId: 'joy.happy',
        emotionIds: ['joy.happy', 'calm.relaxed'],
        category: 'joy',
        categories: ['joy', 'calm'],
        intensity: 3,
        recordedAt: new Date().toISOString(),
      },
    });

    const stats = await client.request('GET', '/api/stats/emotions', headers);
    const pair = stats.body.data.coOccurrence.find(
      (p: { a: string; b: string }) => [p.a, p.b].includes('joy.happy') && [p.a, p.b].includes('calm.relaxed'),
    );
    expect(pair).toBeDefined();
    expect(pair.count).toBe(1);
  });

  it('withholds the mood-emotion breakdown until a mood band has at least three check-ins', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (const mood of [85, 90]) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood, emotionIds: ['joy.happy'], recordedAt: new Date().toISOString() },
      });
    }
    const withTwo = await client.request('GET', '/api/stats/emotions', headers);
    expect(withTwo.body.data.moodLinks).toBeNull();

    await client.request('POST', '/api/records/feelingEntries', {
      ...headers,
      body: { mood: 88, emotionIds: ['joy.happy'], recordedAt: new Date().toISOString() },
    });
    const withThree = await client.request('GET', '/api/stats/emotions', headers);
    const high = withThree.body.data.moodLinks.find((band: { band: string }) => band.band === 'high');
    expect(high.checkIns).toBe(3);
    expect(high.topEmotions[0].key).toBe('joy.happy');
  });

  it('keeps an excludeFromInsights check-in out of the mood-emotion breakdown', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (let i = 0; i < 3; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 10, emotionIds: ['sadness.sad'], recordedAt: new Date().toISOString() },
      });
    }
    await client.request('POST', '/api/records/feelingEntries', {
      ...headers,
      body: { mood: 10, emotionIds: ['anger.furious'], recordedAt: new Date().toISOString(), excludeFromInsights: true },
    });

    const stats = await client.request('GET', '/api/stats/emotions', headers);
    const low = stats.body.data.moodLinks.find((band: { band: string }) => band.band === 'low');
    expect(low.checkIns).toBe(3);
    expect(low.topEmotions.some((e: { key: string }) => e.key === 'anger.furious')).toBe(false);
  });
});

describe('mood variance, stdev and streak on the overview', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('scores spread on the 0-100 line the check-in slider uses, not the legacy 1-10 one', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    // Every score identical — zero spread either way.
    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/moodEntries', {
        ...headers,
        body: { label: 'steady', score: 5, recordedAt: new Date().toISOString() },
      });
    }

    const overview = await client.request('GET', '/api/stats/overview', headers);
    expect(overview.body.data.mood.variance).toBe(0);
    expect(overview.body.data.mood.stdev).toBe(0);
    expect(overview.body.data.mood.streak).toBeGreaterThanOrEqual(1);
  });
});

/**
 * The Wellbeing Snapshot: each axis is one collection's own latest row,
 * independently scaled onto 0-100 — never blended across collections, and
 * never range-limited by `days`, since "what's the most recent thing known"
 * is a different question than "what happened in this window."
 */
describe('the Wellbeing Snapshot and energy signals', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('scales every axis from its own collection onto 0-100, and averages only the axes that have a value', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/wellnessEntries', {
      ...headers,
      body: { energy: 10, stress: 1, comfort: 10, socialBattery: 10, focus: 10, recordedAt: new Date().toISOString() },
    });
    await client.request('POST', '/api/records/sleepEntries', {
      ...headers,
      body: { startedAt: new Date().toISOString(), quality: 5 },
    });
    await client.request('POST', '/api/records/feelingEntries', {
      ...headers,
      body: { mood: 80, recordedAt: new Date().toISOString() },
    });

    const overview = await client.request('GET', '/api/stats/overview', headers);
    const byKey = new Map(
      overview.body.data.snapshot.axes.map((axis: { key: string; percent: number | null }) => [axis.key, axis.percent]),
    );

    expect(byKey.get('mood')).toBe(80);
    expect(byKey.get('energy')).toBe(100);
    expect(byKey.get('stress')).toBe(0);
    expect(byKey.get('comfort')).toBe(100);
    expect(byKey.get('socialBattery')).toBe(100);
    expect(byKey.get('sleep')).toBe(100);
    expect(byKey.get('focus')).toBe(100);
    // (80 + 100 + 0 + 100 + 100 + 100 + 100) / 7, rounded.
    expect(overview.body.data.snapshot.overall).toBe(83);
  });

  it('falls back to the legacy mood score, scaled by 10, before any feelingEntries row exists', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/moodEntries', {
      ...headers,
      body: { label: 'Good', score: 7, recordedAt: new Date().toISOString() },
    });

    const overview = await client.request('GET', '/api/stats/overview', headers);
    const mood = overview.body.data.snapshot.axes.find((axis: { key: string }) => axis.key === 'mood');
    expect(mood.percent).toBe(70);
  });

  it('leaves an axis out rather than guessing, when nothing has been logged for it', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const overview = await client.request('GET', '/api/stats/overview', headers);
    expect(overview.body.data.snapshot.axes.every((axis: { percent: number | null }) => axis.percent === null)).toBe(true);
    expect(overview.body.data.snapshot.overall).toBeNull();
  });

  it('lists the latest reading from each energy source, newest first, without blending them', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    function isoAt(daysAgo: number): string {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString();
    }

    await client.request('POST', '/api/records/wellnessEntries', {
      ...headers,
      body: { energy: 5, recordedAt: isoAt(2) },
    });
    await client.request('POST', '/api/records/fitnessEntries', {
      ...headers,
      body: { activity: 'run', energyAfter: 4, performedAt: isoAt(0) },
    });

    const overview = await client.request('GET', '/api/stats/overview', headers);
    const signals = overview.body.data.energySignals;

    expect(signals).toHaveLength(2);
    // Newest first: the fitness log (today) ahead of the wellness check-in (2 days ago).
    expect(signals[0].source).toBe('fitness');
    expect(signals[0].percent).toBe(75); // 4 of 1-5.
    expect(signals[1].source).toBe('wellness');
    expect(signals[1].percent).toBe(44); // 5 of 1-10, rounded.
  });
});

/**
 * /stats/cycle: cycles are derived, not stored — the gap between one logged
 * "start" and the next — and a symptom's phase is whichever phase was most
 * recently named as of the day it was logged, carried forward the same way
 * Cycle.tsx's own "Your phases" list already treats `phase` as free text set
 * on whichever days the user bothers to fill it in.
 */
describe('cycle-to-cycle comparison and symptom-by-phase stats', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  function dateAgo(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().slice(0, 10);
  }

  it('closes a cycle at the next start, averaging only the entries inside it', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(40), eventType: 'start' },
    });
    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(35), eventType: 'none', energy: 8, discomfort: 2 },
    });
    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(30), eventType: 'none', energy: 6, discomfort: 0 },
    });
    // The next start closes the first cycle and opens a second, still-open one.
    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(12), eventType: 'start' },
    });

    const stats = await client.request('GET', '/api/stats/cycle', headers);

    expect(stats.status).toBe(200);
    expect(stats.body.data.cycleCount).toBe(2);
    const [first, second] = stats.body.data.cycles;
    expect(first.startDate).toBe(dateAgo(40));
    expect(first.endDate).toBe(dateAgo(12));
    expect(first.lengthDays).toBe(28);
    expect(first.averageEnergy).toBe(7);
    expect(first.averageDiscomfort).toBe(1);
    expect(second.startDate).toBe(dateAgo(12));
    expect(second.endDate).toBeNull();
    expect(second.lengthDays).toBeNull();
    expect(stats.body.data.averageLengthDays).toBe(28);
  });

  it("carries a symptom's phase forward from whichever phase was most recently named", async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(20), phase: 'Luteal', eventType: 'none' },
    });
    await client.request('POST', '/api/records/cycleEntries', {
      ...headers,
      body: { entryDate: dateAgo(10), phase: 'Period', eventType: 'start' },
    });
    // Between the two dated phases — still Luteal as of this day.
    await client.request('POST', '/api/records/symptomEntries', {
      ...headers,
      body: { name: 'Fatigue', category: 'physical', intensity: 3, recordedAt: `${dateAgo(15)}T12:00:00.000Z` },
    });
    // After the Period entry.
    await client.request('POST', '/api/records/symptomEntries', {
      ...headers,
      body: { name: 'Cramps', category: 'physical', intensity: 4, recordedAt: `${dateAgo(5)}T12:00:00.000Z` },
    });

    const stats = await client.request('GET', '/api/stats/cycle', headers);
    const byPhase = new Map(
      stats.body.data.symptomsByPhase.map((entry: { phase: string; count: number }) => [entry.phase, entry.count]),
    );
    expect(byPhase.get('Luteal')).toBe(1);
    expect(byPhase.get('Period')).toBe(1);
  });

  it('returns empty, honest structures rather than guessing when nothing is logged', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const stats = await client.request('GET', '/api/stats/cycle', headers);
    expect(stats.body.data.cycles).toEqual([]);
    expect(stats.body.data.cycleCount).toBe(0);
    expect(stats.body.data.averageLengthDays).toBeNull();
    expect(stats.body.data.symptomsByPhase).toEqual([]);
  });
});
