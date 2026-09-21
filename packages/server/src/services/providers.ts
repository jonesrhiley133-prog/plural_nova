/**
 * Music and video providers.
 *
 * PluralNova does not host audio or video and does not scrape it. Each provider
 * is an adapter over a public catalogue API that returns metadata plus whatever
 * the provider itself offers for playback — an official preview stream, or a
 * link out. Adding a licensed provider later means adding one adapter, not
 * rewriting the music section.
 *
 * When an upstream is unreachable the adapter says so plainly and the UI offers
 * a retry; it never pretends to have no results.
 */

export interface ProviderTrack {
  providerTrackId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  /** Official preview clip, when the provider publishes one. */
  previewUrl: string;
  externalUrl: string;
  durationSeconds: number;
  provider: string;
}

export interface ProviderVideo {
  providerVideoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  externalUrl: string;
  durationSeconds: number;
  provider: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  kind: 'music' | 'video';
  /** Whether playback happens in-app or by opening the provider. */
  playback: 'preview' | 'external' | 'none';
  description: string;
  requiresKey: boolean;
  available: boolean;
}

export class ProviderUnavailable extends Error {
  constructor(public readonly provider: string, message: string) {
    super(message);
    this.name = 'ProviderUnavailable';
  }
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, provider: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'PluralNova/1.0' },
    });
    if (response.status === 429) {
      throw new ProviderUnavailable(provider, 'The music service is rate limiting us. Try again shortly.');
    }
    if (!response.ok) {
      throw new ProviderUnavailable(provider, `The music service answered with ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderUnavailable) throw error;
    const reason = (error as Error).name === 'AbortError' ? 'took too long to answer' : 'could not be reached';
    throw new ProviderUnavailable(provider, `The ${provider} service ${reason}. Your library still works offline.`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * iTunes Search — a public, documented catalogue API with official 30-second
 * previews and artwork. No key, no scraping, and the preview URLs are the ones
 * Apple publishes for this purpose.
 */
async function searchITunes(query: string, limit: number): Promise<ProviderTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}`;
  const data = (await fetchJson(url, 'iTunes')) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).map((row) => ({
    providerTrackId: String(row['trackId'] ?? ''),
    title: String(row['trackName'] ?? 'Unknown track'),
    artist: String(row['artistName'] ?? 'Unknown artist'),
    album: String(row['collectionName'] ?? ''),
    artworkUrl: String(row['artworkUrl100'] ?? '').replace('100x100', '400x400'),
    previewUrl: String(row['previewUrl'] ?? ''),
    externalUrl: String(row['trackViewUrl'] ?? ''),
    durationSeconds: Math.round(Number(row['trackTimeMillis'] ?? 0) / 1000),
    provider: 'itunes',
  }));
}

/**
 * A link you already have. Nothing is fetched; the URL is parsed so the title
 * and thumbnail can be filled in from the link itself where the shape is known.
 */
function parseVideoLink(url: string): ProviderVideo {
  const trimmed = url.trim();
  let id = '';
  let provider = 'link';
  let thumbnail = '';

  const youtube = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  const vimeo = trimmed.match(/vimeo\.com\/(\d+)/);

  if (youtube?.[1]) {
    id = youtube[1];
    provider = 'youtube';
    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } else if (vimeo?.[1]) {
    id = vimeo[1];
    provider = 'vimeo';
  }

  let host = 'a link';
  try {
    host = new URL(trimmed).hostname.replace(/^www\./, '');
  } catch {
    // Not a parseable URL; the caller validates before this is stored.
  }

  return {
    providerVideoId: id,
    title: '',
    channel: host,
    thumbnailUrl: thumbnail,
    externalUrl: trimmed,
    durationSeconds: 0,
    provider,
  };
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'itunes',
    label: 'iTunes catalogue',
    kind: 'music',
    playback: 'preview',
    description: 'Search tracks and play the official 30-second previews. No account needed.',
    requiresKey: false,
    available: true,
  },
  {
    id: 'local',
    label: 'Your library',
    kind: 'music',
    playback: 'none',
    description: 'Tracks you added by hand, including ones with no provider behind them.',
    requiresKey: false,
    available: true,
  },
  {
    id: 'link',
    label: 'Video links',
    kind: 'video',
    playback: 'external',
    description: 'Save a link from any provider; PluralNova keeps the collection, the provider plays it.',
    requiresKey: false,
    available: true,
  },
];

export async function searchMusic(
  provider: string,
  query: string,
  limit = 25,
): Promise<ProviderTrack[]> {
  if (!query.trim()) return [];
  switch (provider) {
    case 'itunes':
      return searchITunes(query, Math.min(50, Math.max(1, limit)));
    case 'local':
      return [];
    default:
      throw new ProviderUnavailable(provider, `PluralNova has no adapter for "${provider}".`);
  }
}

export function resolveVideo(url: string): ProviderVideo {
  return parseVideoLink(url);
}
