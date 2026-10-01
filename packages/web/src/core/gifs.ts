import { api } from './api.js';

/**
 * GIF search for the chat composer. A thin client over `/api/gifs/*` — see
 * `packages/server/src/services/gifs.ts` for why this is a server proxy
 * (Tenor never sees who is searching) and why a pick is fetched through the
 * server too rather than linked to Tenor's CDN directly (so a sent GIF is a
 * normal, self-hosted attachment, like any other).
 */

export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  url: string;
  width: number;
  height: number;
}

interface GifSearchResponse {
  gifs: GifResult[];
  /** False when this server has no Tenor key configured — not an error. */
  available: boolean;
}

export function searchGifs(query: string, limit = 30): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>('/api/gifs/search', { q: query, limit });
}

export function featuredGifs(limit = 30): Promise<GifSearchResponse> {
  return api.get<GifSearchResponse>('/api/gifs/featured', { limit });
}

export interface FetchedGif {
  id: string;
  url: string;
  mediaType: 'image';
  mimeType: string;
  sizeBytes: number;
  title: string;
}

/** Downloads a chosen result server-side and stores it as a normal upload. */
export async function fetchGifAsAttachment(gif: GifResult): Promise<FetchedGif> {
  const result = await api.post<{ id: string; url: string; sizeBytes: number; title: string }>('/api/gifs/fetch', {
    url: gif.url,
    title: gif.title,
  });
  return { id: result.id, url: result.url, mediaType: 'image', mimeType: 'image/gif', sizeBytes: result.sizeBytes, title: result.title };
}
