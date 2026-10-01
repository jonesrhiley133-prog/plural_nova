import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isTenorMediaUrl } from '../services/gifs.js';
import { createTestApp, registerUser, type TestClient } from './harness.js';

describe('isTenorMediaUrl', () => {
  it('accepts Tenor media hosts', () => {
    expect(isTenorMediaUrl('https://media.tenor.com/abc123.gif')).toBe(true);
    expect(isTenorMediaUrl('https://c.tenor.com/abc123/tenor.gif')).toBe(true);
    expect(isTenorMediaUrl('https://tenor.com/abc123.gif')).toBe(true);
  });

  it('refuses a host that merely contains "tenor" or is a lookalike subdomain', () => {
    expect(isTenorMediaUrl('https://evil.example.com/not-tenor.gif')).toBe(false);
    expect(isTenorMediaUrl('https://tenor.com.evil.example/x.gif')).toBe(false);
    expect(isTenorMediaUrl('https://nottenor.com/x.gif')).toBe(false);
    expect(isTenorMediaUrl('https://faketenor.com.gif')).toBe(false);
  });

  it('refuses anything that is not a parseable URL, rather than throwing', () => {
    expect(isTenorMediaUrl('not a url')).toBe(false);
    expect(isTenorMediaUrl('')).toBe(false);
  });

  it('refuses a request aimed at a local or internal address spoofing the path', () => {
    expect(isTenorMediaUrl('https://169.254.169.254/tenor.com')).toBe(false);
    expect(isTenorMediaUrl('http://localhost/tenor.com.gif')).toBe(false);
  });
});

/**
 * No PLURALNOVA_TENOR_API_KEY is set for the test run, so these exercise the
 * unconfigured path (same shape `providers.ts`'s music search would answer
 * with if iTunes were ever genuinely unreachable) plus the parts that need no
 * live key at all: auth and the SSRF host allowlist on `/fetch`. Actually
 * calling Tenor is no more testable here than `providers.ts`'s iTunes search
 * already is — there is no mocked-network precedent in this suite either.
 */
describe('gif search', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('reports unavailable with no key configured, rather than failing', async () => {
    const account = await registerUser(client);
    const result = await client.request('GET', '/api/gifs/search?q=cat', { token: account.token });
    expect(result.status).toBe(200);
    expect(result.body.data.available).toBe(false);
    expect(result.body.data.gifs).toEqual([]);
  });

  it('reports unavailable on featured too', async () => {
    const account = await registerUser(client);
    const result = await client.request('GET', '/api/gifs/featured', { token: account.token });
    expect(result.status).toBe(200);
    expect(result.body.data.available).toBe(false);
  });

  it('answers an empty query without searching', async () => {
    const account = await registerUser(client);
    const result = await client.request('GET', '/api/gifs/search', { token: account.token });
    expect(result.status).toBe(200);
    expect(result.body.data.gifs).toEqual([]);
  });

  it('requires authentication for search, featured and fetch', async () => {
    const search = await client.request('GET', '/api/gifs/search?q=cat');
    expect(search.status).toBe(401);
    const featured = await client.request('GET', '/api/gifs/featured');
    expect(featured.status).toBe(401);
    const fetchResult = await client.request('POST', '/api/gifs/fetch', { body: { url: 'https://media.tenor.com/x.gif' } });
    expect(fetchResult.status).toBe(401);
  });

  it('refuses to fetch anything at all while unconfigured, even a well-formed Tenor url', async () => {
    const account = await registerUser(client);
    const result = await client.request('POST', '/api/gifs/fetch', {
      token: account.token,
      body: { url: 'https://media.tenor.com/real-looking-path.gif' },
    });
    expect(result.status).toBe(400);
  });

  it('refuses to fetch with no url at all', async () => {
    const account = await registerUser(client);
    const result = await client.request('POST', '/api/gifs/fetch', { token: account.token, body: {} });
    expect(result.status).toBe(400);
  });
});
