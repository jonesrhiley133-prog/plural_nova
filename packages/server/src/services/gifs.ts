import { config } from '../config.js';
import { ProviderUnavailable } from './providers.js';

/**
 * GIF search, via Tenor.
 *
 * Optional, the same way Firebase push is: with no key configured this is
 * simply unavailable rather than broken, and nothing else in chat depends on
 * it. The search itself is proxied through the server rather than called
 * from the browser so Tenor never sees who is searching — only the GIF
 * someone actually sends is fetched, and `routes/gifs.ts` brings even that
 * in through the server rather than linking to Tenor's CDN directly.
 */

export interface GifResult {
  id: string;
  title: string;
  /** A small preview to render in the picker grid. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** The full-resolution file a pick actually downloads and sends. */
  url: string;
  width: number;
  height: number;
}

export function gifsAvailable(): boolean {
  return config.tenorApiKey !== '';
}

const TENOR_BASE = 'https://tenor.googleapis.com/v2';
const CLIENT_KEY = 'pluralnova';
const FETCH_TIMEOUT_MS = 8000;

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
}

interface TenorResult {
  id: string;
  content_description?: string;
  media_formats?: Record<string, TenorMediaFormat>;
}

interface TenorResponse {
  results?: TenorResult[];
}

async function tenorGet(path: string, params: Record<string, string>): Promise<TenorResponse> {
  if (!gifsAvailable()) throw new ProviderUnavailable('tenor', 'GIF search is not set up on this server.');

  const url = new URL(`${TENOR_BASE}${path}`);
  url.searchParams.set('key', config.tenorApiKey);
  url.searchParams.set('client_key', CLIENT_KEY);
  url.searchParams.set('media_filter', 'gif,tinygif');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (response.status === 429) {
      throw new ProviderUnavailable('tenor', 'Tenor is rate limiting us. Try again shortly.');
    }
    if (!response.ok) {
      throw new ProviderUnavailable('tenor', `Tenor answered with ${response.status}.`);
    }
    return (await response.json()) as TenorResponse;
  } catch (error) {
    if (error instanceof ProviderUnavailable) throw error;
    const reason = (error as Error).name === 'AbortError' ? 'took too long to answer' : 'could not be reached';
    throw new ProviderUnavailable('tenor', `Tenor ${reason}.`);
  } finally {
    clearTimeout(timer);
  }
}

function toGifResult(row: TenorResult): GifResult | null {
  const full = row.media_formats?.['gif'];
  const preview = row.media_formats?.['tinygif'] ?? full;
  if (!full || !preview) return null;
  return {
    id: row.id,
    title: row.content_description ?? '',
    previewUrl: preview.url,
    previewWidth: preview.dims[0],
    previewHeight: preview.dims[1],
    url: full.url,
    width: full.dims[0],
    height: full.dims[1],
  };
}

export async function searchGifs(query: string, limit: number): Promise<GifResult[]> {
  const capped = Math.min(50, Math.max(1, limit));
  const data = await tenorGet('/search', { q: query, limit: String(capped) });
  return (data.results ?? []).map(toGifResult).filter((item): item is GifResult => item !== null);
}

export async function featuredGifs(limit: number): Promise<GifResult[]> {
  const capped = Math.min(50, Math.max(1, limit));
  const data = await tenorGet('/featured', { limit: String(capped) });
  return (data.results ?? []).map(toGifResult).filter((item): item is GifResult => item !== null);
}

/** Tenor serves media from a handful of its own subdomains; anything else is refused before the server fetches it. */
export function isTenorMediaUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'tenor.com' || host.endsWith('.tenor.com');
  } catch {
    return false;
  }
}
