import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * Cross-feature relationships. Most of these tests exist to prove the
 * evidence gate actually gates — a pattern with one weak group, or a cycle
 * signal with tracking off, should never appear — and that the one
 * deliberately-unranked card (mood by fronting member) really does stay
 * unranked rather than drifting into "highest"/"lowest" language over time.
 */

function isoAt(daysAgo: number, hour = 12): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dateAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

describe('insights: patterns', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('compares mood across social contexts once each has enough check-ins', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 20, socialContext: 'alone', recordedAt: isoAt(i + 1) },
      });
    }
    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 80, socialContext: 'smallGroup', recordedAt: isoAt(i + 10) },
      });
    }

    const res = await client.request('GET', '/api/insights/patterns', headers);
    expect(res.status).toBe(200);
    const card = res.body.data.patterns.find((p: { key: string }) => p.key === 'mood-by-social-context');
    expect(card).toBeTruthy();
    expect(card.description).toContain('80/100');
    expect(card.description).toContain('20/100');
    expect(card.evidenceCount).toBe(8);
  });

  it('withholds a pattern until a second group also clears the evidence floor', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 50, socialContext: 'alone', recordedAt: isoAt(i + 1) },
      });
    }
    // Only two check-ins in a second context — not enough to say anything by.
    for (let i = 0; i < 2; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 90, socialContext: 'crowd', recordedAt: isoAt(i + 10) },
      });
    }

    const res = await client.request('GET', '/api/insights/patterns', headers);
    expect(res.body.data.patterns.some((p: { key: string }) => p.key === 'mood-by-social-context')).toBe(false);
  });

  it('lists mood while fronting by member without ranking language', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };
    const alex = await client.request('POST', '/api/records/members', { ...headers, body: { name: 'Alex' } });
    const bay = await client.request('POST', '/api/records/members', { ...headers, body: { name: 'Bay' } });

    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 30, memberId: alex.body.data.id, recordedAt: isoAt(i + 1) },
      });
    }
    for (let i = 0; i < 4; i += 1) {
      await client.request('POST', '/api/records/feelingEntries', {
        ...headers,
        body: { mood: 70, memberId: bay.body.data.id, recordedAt: isoAt(i + 10) },
      });
    }

    const res = await client.request('GET', '/api/insights/patterns', headers);
    const card = res.body.data.patterns.find((p: { key: string }) => p.key === 'mood-by-fronting-member');
    expect(card).toBeTruthy();
    expect(card.description).toContain('Alex 30/100 (4 check-ins)');
    expect(card.description).toContain('Bay 70/100 (4 check-ins)');
    expect(card.description).not.toMatch(/highest|lowest|most|least|top|worst|best/i);
  });

  it('finds a mood/sleep correlation across matched days', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    for (const n of [1, 2, 3, 4, 5]) {
      await client.request('POST', '/api/records/sleepEntries', {
        ...headers,
        body: { startedAt: isoAt(n + 1, 23), quality: n },
      });
      await client.request('POST', '/api/records/moodEntries', {
        ...headers,
        body: { label: 'x', score: n * 2, recordedAt: isoAt(n, 9) },
      });
    }

    const res = await client.request('GET', '/api/insights/patterns', headers);
    const card = res.body.data.patterns.find((p: { key: string }) => p.key === 'mood-sleep-correlation');
    expect(card).toBeTruthy();
    expect(card.description).toContain('correlation 1');
    expect(card.evidenceCount).toBe(5);
  });

  it('keeps every cycle-phase pattern out while cycle tracking is off, even with matching data logged', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(20), phase: 'Follicular' } });
    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(10), phase: 'Luteal' } });
    for (const d of [19, 18, 17]) {
      await client.request('POST', '/api/records/feelingEntries', { ...headers, body: { mood: 30, recordedAt: isoAt(d) } });
    }
    for (const d of [9, 8, 7]) {
      await client.request('POST', '/api/records/feelingEntries', { ...headers, body: { mood: 80, recordedAt: isoAt(d) } });
    }

    const before = await client.request('GET', '/api/insights/patterns', headers);
    const keys = before.body.data.patterns.map((p: { key: string }) => p.key);
    expect(keys).not.toContain('mood-by-cycle-phase');
    expect(keys).not.toContain('symptom-by-cycle-phase');
    expect(keys).not.toContain('emotion-family-by-cycle-phase');

    await client.request('PUT', '/api/auth/settings', { ...headers, body: { cycleEnabled: true } });
    const after = await client.request('GET', '/api/insights/patterns', headers);
    const phaseCard = after.body.data.patterns.find((p: { key: string }) => p.key === 'mood-by-cycle-phase');
    expect(phaseCard).toBeTruthy();
    expect(phaseCard.description).toContain('Follicular');
    expect(phaseCard.description).toContain('Luteal');
  });

  it('names the symptom and emotion family most distinct to a cycle phase, once tracking is on', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };
    await client.request('PUT', '/api/auth/settings', { ...headers, body: { cycleEnabled: true } });
    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(10), phase: 'Luteal' } });

    for (const d of [9, 8, 7]) {
      await client.request('POST', '/api/records/symptomEntries', { ...headers, body: { name: 'Cramps', recordedAt: isoAt(d) } });
      await client.request('POST', '/api/records/emotionEntries', {
        ...headers,
        body: { emotionId: 'sadness.gloomy', category: 'testFamily', intensity: 3, recordedAt: isoAt(d) },
      });
    }

    const res = await client.request('GET', '/api/insights/patterns', headers);
    const symptomCard = res.body.data.patterns.find((p: { key: string }) => p.key === 'symptom-by-cycle-phase');
    expect(symptomCard.description).toContain('Luteal');
    expect(symptomCard.description).toContain('Cramps');
    expect(symptomCard.description).toContain('(3 of 3)');

    const familyCard = res.body.data.patterns.find((p: { key: string }) => p.key === 'emotion-family-by-cycle-phase');
    expect(familyCard.description).toContain('Luteal');
    expect(familyCard.description).toContain('testFamily');
  });
});

describe('insights: story', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('reuses the day comparison, and adds a symptom count and cycle phase', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };
    const today = new Date().toISOString().slice(0, 10);

    // Baseline mood so `insights.mood` is populated the same way `/stats/day` already proves.
    for (const score of [4, 5, 6]) {
      await client.request('POST', '/api/records/moodEntries', { ...headers, body: { label: 'baseline', score, recordedAt: isoAt(5) } });
    }
    await client.request('POST', '/api/records/moodEntries', { ...headers, body: { label: 'today', score: 9, recordedAt: isoAt(0) } });

    // A fortnight of symptoms, plus two logged today.
    for (const d of [3, 5, 7]) {
      await client.request('POST', '/api/records/symptomEntries', { ...headers, body: { name: 'Headache', recordedAt: isoAt(d) } });
    }
    await client.request('POST', '/api/records/symptomEntries', { ...headers, body: { name: 'Headache', recordedAt: isoAt(0) } });
    await client.request('POST', '/api/records/symptomEntries', { ...headers, body: { name: 'Nausea', recordedAt: isoAt(0, 11) } });

    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(5), phase: 'Luteal' } });

    const off = await client.request('GET', `/api/insights/story?date=${today}`, headers);
    expect(off.status).toBe(200);
    expect(off.body.data.insights.mood).toEqual({ today: 9, baseline: 5 });
    expect(off.body.data.symptoms).toEqual({ todayCount: 2, baselineCountPerDay: Math.round((3 / 14) * 10) / 10 });
    expect(off.body.data.cyclePhase).toBeNull();

    await client.request('PUT', '/api/auth/settings', { ...headers, body: { cycleEnabled: true } });
    const on = await client.request('GET', `/api/insights/story?date=${today}`, headers);
    expect(on.body.data.cyclePhase).toBe('Luteal');
  });

  it('withholds the symptom comparison until the baseline has enough days in it', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };
    const today = new Date().toISOString().slice(0, 10);

    await client.request('POST', '/api/records/symptomEntries', { ...headers, body: { name: 'Headache', recordedAt: isoAt(3) } });
    const res = await client.request('GET', `/api/insights/story?date=${today}`, headers);
    expect(res.body.data.symptoms).toBeNull();
  });
});

describe('insights: landscape', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('reports mood and sleep statistics, the top emotion family, and the steadier of the two areas', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    let day = 1;
    for (const mood of [40, 50, 60, 70, 80]) {
      await client.request('POST', '/api/records/feelingEntries', { ...headers, body: { mood, recordedAt: isoAt(day) } });
      day += 1;
    }
    day = 1;
    for (const minutes of [300, 330, 360, 390, 420]) {
      await client.request('POST', '/api/records/sleepEntries', { ...headers, body: { startedAt: isoAt(day, 23), durationMinutes: minutes } });
      day += 1;
    }
    for (const category of ['joy', 'joy', 'joy', 'anger']) {
      await client.request('POST', '/api/records/emotionEntries', { ...headers, body: { emotionId: 'x', category, intensity: 3, recordedAt: isoAt(1) } });
    }

    const res = await client.request('GET', '/api/insights/landscape', headers);
    expect(res.status).toBe(200);
    expect(res.body.data.mood).toEqual({ average: 60, median: 60, variance: 200, stdev: 14.1, count: 5 });
    expect(res.body.data.sleep.averageMinutes).toBe(360);
    expect(res.body.data.sleep.count).toBe(5);
    expect(res.body.data.topEmotionFamily).toMatchObject({ key: 'joy', count: 3 });
    expect(res.body.data.steadiestArea).toBe('sleep');
    expect(res.body.data.cycle).toBeNull();
  });

  it('reports a cycle length summary once cycle tracking is on', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };
    await client.request('PUT', '/api/auth/settings', { ...headers, body: { cycleEnabled: true } });
    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(30), eventType: 'start' } });
    await client.request('POST', '/api/records/cycleEntries', { ...headers, body: { entryDate: dateAgo(2), eventType: 'start' } });

    const res = await client.request('GET', '/api/insights/landscape', headers);
    expect(res.body.data.cycle).toEqual({ averageLengthDays: 28, cycleCount: 2 });
  });
});
