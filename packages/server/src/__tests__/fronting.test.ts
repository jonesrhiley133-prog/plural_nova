import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('fronting', () => {
  let client: TestClient;
  let token: string;
  let members: { id: string; name: string }[] = [];

  beforeAll(async () => {
    client = await createTestApp();
    const account = await registerUser(client, { email: 'front@example.com' });
    token = account.token;

    for (const name of ['Vega', 'Corvid', 'Juniper']) {
      const result = await client.request('POST', '/api/records/members', {
        token,
        body: { name, pronouns: 'they/them' },
      });
      members.push({ id: result.body.data.id, name });
    }
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  async function clearFront(): Promise<void> {
    await client.request('POST', '/api/fronting/clear', { token, body: {} });
  }

  it('reports an empty front without erroring when nobody is out', async () => {
    await clearFront();
    const result = await client.request('GET', '/api/fronting/current', { token });
    expect(result.status).toBe(200);
    expect(result.body.data.isEmpty).toBe(true);
    expect(result.body.data.active).toEqual([]);
    expect(result.body.data.memberCount).toBe(3);
  });

  it('starts a front and marks the member as fronting', async () => {
    await clearFront();
    const started = await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id, activity: 'errands' },
    });
    expect(started.status).toBe(201);

    const current = await client.request('GET', '/api/fronting/current', { token });
    expect(current.body.data.active).toHaveLength(1);
    expect(current.body.data.fronting[0].name).toBe('Vega');
    expect(current.body.data.fronting[0].frontStatus).toBe('fronting');
  });

  it('supports several members fronting at once', async () => {
    await clearFront();
    await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id, coFronterIds: [members[1]!.id] },
    });

    const current = await client.request('GET', '/api/fronting/current', { token });
    expect(current.body.data.fronting).toHaveLength(2);
    expect(current.body.data.active[0].coFronters).toHaveLength(1);
    expect(current.body.data.active[0].statusType).toBe('cofronting');
  });

  it('adds and removes a co-fronter on an open front', async () => {
    await clearFront();
    const started = await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id },
    });
    const eventId = started.body.data.id;

    await client.request('POST', `/api/fronting/${eventId}/co-fronters`, {
      token,
      body: { memberId: members[2]!.id },
    });
    let current = await client.request('GET', '/api/fronting/current', { token });
    expect(current.body.data.fronting).toHaveLength(2);

    await client.request('DELETE', `/api/fronting/${eventId}/co-fronters/${members[2]!.id}`, { token });
    current = await client.request('GET', '/api/fronting/current', { token });
    expect(current.body.data.fronting).toHaveLength(1);
  });

  it('refuses an identical duplicate front instead of opening two', async () => {
    await clearFront();
    await client.request('POST', '/api/fronting/start', { token, body: { memberId: members[0]!.id } });
    const second = await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id },
    });
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('already marked as fronting');
  });

  it('records a front with nobody named', async () => {
    await clearFront();
    const result = await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: null, unknownFronter: true, note: 'not sure who' },
    });
    expect(result.status).toBe(201);
    expect(result.body.data.unknownFronter).toBe(true);
    expect(result.body.data.memberId).toBeNull();
  });

  it('switches by closing the open front and opening the next in one step', async () => {
    await clearFront();
    await client.request('POST', '/api/fronting/start', { token, body: { memberId: members[0]!.id } });
    const switched = await client.request('POST', '/api/fronting/switch', {
      token,
      body: { memberId: members[1]!.id },
    });
    expect(switched.status).toBe(201);

    const current = await client.request('GET', '/api/fronting/current', { token });
    expect(current.body.data.active).toHaveLength(1);
    expect(current.body.data.fronting[0].name).toBe('Corvid');
  });

  it('computes a duration when a front ends', async () => {
    await clearFront();
    const startedAt = new Date(Date.now() - 90 * 60_000).toISOString();
    await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id, startedAt },
    });
    const ended = await client.request('POST', '/api/fronting/end', { token, body: {} });
    expect(ended.body.data.events[0].durationMinutes).toBeGreaterThanOrEqual(89);
    expect(ended.body.data.events[0].durationMinutes).toBeLessThanOrEqual(91);
  });

  it('keeps an active front across a fresh read of the API', async () => {
    await clearFront();
    await client.request('POST', '/api/fronting/start', { token, body: { memberId: members[2]!.id } });
    const first = await client.request('GET', '/api/fronting/current', { token });
    const second = await client.request('GET', '/api/fronting/current', { token });
    expect(first.body.data.active[0].id).toBe(second.body.data.active[0].id);
    expect(second.body.data.active[0].endedAt).toBeNull();
  });

  it('rejects an edit that would end a front before it started', async () => {
    await clearFront();
    const started = await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id },
    });
    const result = await client.request('PATCH', `/api/fronting/${started.body.data.id}`, {
      token,
      body: { endedAt: new Date(Date.now() - 86_400_000).toISOString() },
    });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain('cannot end before it started');
  });

  it('produces per-member statistics that credit co-fronters', async () => {
    await clearFront();
    const startedAt = new Date(Date.now() - 120 * 60_000).toISOString();
    const endedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    await client.request('POST', '/api/fronting/start', {
      token,
      body: { memberId: members[0]!.id, coFronterIds: [members[1]!.id], startedAt },
    });
    await client.request('POST', '/api/fronting/end', { token, body: { endedAt } });

    const stats = await client.request('GET', '/api/fronting/stats?days=7', { token });
    expect(stats.status).toBe(200);
    const vega = stats.body.data.members.find((m: any) => m.name === 'Vega');
    const corvid = stats.body.data.members.find((m: any) => m.name === 'Corvid');
    expect(vega.minutes).toBeGreaterThan(0);
    expect(corvid.minutes).toBeGreaterThan(0);
    expect(corvid.coFrontEvents).toBeGreaterThan(0);
  });

  it('writes the fronting change into system history', async () => {
    await clearFront();
    await client.request('POST', '/api/fronting/start', { token, body: { memberId: members[0]!.id } });
    const history = await client.request('GET', '/api/records/systemHistory?limit=10', { token });
    const summaries = history.body.data.items.map((row: any) => row.summary);
    expect(summaries.some((s: string) => s.includes('Vega started fronting'))).toBe(true);
  });

  it('hides fronting entirely in Singlet Mode', async () => {
    client.resetLimits();
    const singlet = await registerUser(client, { email: 'singlet@example.com', mode: 'singlet' });
    const result = await client.request('POST', '/api/fronting/start', {
      token: singlet.token,
      body: { memberId: null },
    });
    expect(result.status).toBe(403);
    expect(result.body.error.message).toContain('System Mode');

    const members = await client.request('GET', '/api/records/members', { token: singlet.token });
    expect(members.status).toBe(403);
  });
});
