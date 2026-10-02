import type { Response } from 'express';
import { Router } from 'express';
import { handler, ok } from '../http/respond.js';
import { AppError, badRequest } from '../http/errors.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { ProviderUnavailable } from '../services/providers.js';
import { featuredGifs, gifsAvailable, isTenorMediaUrl, searchGifs, type GifResult } from '../services/gifs.js';
import { storeUpload } from './media.js';

/**
 * The chat composer's GIF search. Search and "featured" are read-only proxies
 * to Tenor; `/fetch` is the one write — it downloads a chosen result's bytes
 * itself and stores them through the same path `/api/media/upload` uses, so a
 * sent GIF is a normal, self-hosted attachment rather than a live link to
 * Tenor's CDN that would stop working offline or if Tenor ever removed it.
 */
export const gifsRouter: Router = Router();
gifsRouter.use(requireAuth);

/** `available: false` (not an error) is how an unconfigured key reaches the client — same shape Tenor being briefly down would use, since neither is the searcher's fault. */
async function respondWithGifs(res: Response, fetchGifs: () => Promise<GifResult[]>): Promise<void> {
  if (!gifsAvailable()) {
    ok(res, { gifs: [], available: false });
    return;
  }
  try {
    const gifs = await fetchGifs();
    ok(res, { gifs, available: true });
  } catch (error) {
    if (error instanceof ProviderUnavailable) {
      throw new AppError('upstream_unavailable', error.message, { retryable: true });
    }
    throw error;
  }
}

gifsRouter.get(
  '/search',
  handler(async (req, res) => {
    const query = String(req.query['q'] ?? '').trim();
    if (!query) {
      ok(res, { gifs: [], available: gifsAvailable() });
      return;
    }
    await respondWithGifs(res, () => searchGifs(query, Number(req.query['limit'] ?? 30)));
  }),
);

gifsRouter.get(
  '/featured',
  handler(async (req, res) => {
    await respondWithGifs(res, () => featuredGifs(Number(req.query['limit'] ?? 30)));
  }),
);

gifsRouter.post(
  '/fetch',
  handler(async (req, res) => {
    const context = auth(req);
    if (!gifsAvailable()) throw badRequest('GIF search is not set up on this server.');

    const body = req.body as { url?: string; title?: string };
    const url = String(body.url ?? '').trim();
    if (!url) throw badRequest('No GIF was given.');
    // Only Tenor's own media hosts are ever fetched from here — this takes a
    // URL from the client, so without this check it would be an open proxy
    // the server could be made to fetch anything with.
    if (!isTenorMediaUrl(url)) throw badRequest('That is not a GIF PluralNova can fetch.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let buffer: Buffer;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw badRequest('That GIF could not be fetched.');
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw badRequest('That GIF could not be fetched.');
    } finally {
      clearTimeout(timer);
    }

    const stored = await storeUpload(context, buffer, 'image/gif', String(body.title ?? '').trim());
    ok(res, stored, 201);
  }),
);
