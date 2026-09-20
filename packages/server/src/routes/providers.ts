import { Router } from 'express';
import { handler, ok } from '../http/respond.js';
import { AppError, badRequest } from '../http/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { PROVIDERS, ProviderUnavailable, resolveVideo, searchMusic } from '../services/providers.js';

export const providersRouter: Router = Router();
providersRouter.use(requireAuth);

providersRouter.get(
  '/',
  handler((_req, res) => {
    ok(res, { providers: PROVIDERS });
  }),
);

providersRouter.get(
  '/music/search',
  handler(async (req, res) => {
    const query = String(req.query['q'] ?? '').trim();
    const provider = String(req.query['provider'] ?? 'itunes');
    if (query.length < 2) {
      ok(res, { tracks: [], provider, query });
      return;
    }
    try {
      const tracks = await searchMusic(provider, query, Number(req.query['limit'] ?? 25));
      ok(res, { tracks, provider, query });
    } catch (error) {
      if (error instanceof ProviderUnavailable) {
        // An unreachable upstream is reported as such, with retry offered —
        // not as an empty result set that looks like "no matches".
        throw new AppError('upstream_unavailable', error.message, { retryable: true });
      }
      throw error;
    }
  }),
);

providersRouter.post(
  '/video/resolve',
  handler((req, res) => {
    const url = String((req.body as { url?: string }).url ?? '').trim();
    if (!url) throw badRequest('Paste a video link first.');
    try {
      new URL(url);
    } catch {
      throw badRequest('That does not look like a link.');
    }
    ok(res, { video: resolveVideo(url) });
  }),
);
