import express, { type Express } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { errorMiddleware, notFoundMiddleware } from './http/respond.js';
import { optionalAuth } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { appDownloadRouter, appRouter } from './routes/app.js';
import { recordsRouter } from './routes/records.js';
import { metaRouter } from './routes/meta.js';
import { frontingRouter } from './routes/fronting.js';
import { socialRouter } from './routes/social.js';
import { messagesRouter } from './routes/messages.js';
import { notificationsRouter } from './routes/notifications.js';
import { devicesRouter } from './routes/devices.js';
import { dataRouter } from './routes/data.js';
import { syncRouter } from './routes/sync.js';
import { searchRouter } from './routes/search.js';
import { vaultRouter } from './routes/vault.js';
import { statsRouter } from './routes/stats.js';
import { mediaRouter } from './routes/media.js';
import { providersRouter } from './routes/providers.js';
import { systemRouter } from './routes/system.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests (no Origin header) and the configured dev hosts
        // are allowed; everything else is refused rather than reflected back.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: config.maxJsonBytes }));
  app.use(optionalAuth);

  app.use('/api', metaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/records', recordsRouter);
  app.use('/api/fronting', frontingRouter);
  app.use('/api/social', socialRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/providers', providersRouter);

  app.use('/api/app', appRouter);

  app.use('/api', notFoundMiddleware);
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '365d', immutable: true }));
  app.use('/app', appDownloadRouter);

  // The built client is served from the same origin when it exists, so the PWA
  // installs, the service worker registers at the root scope, and deep links
  // resolve to the app rather than to a 404.
  if (config.serveWeb && existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        maxAge: '7d',
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.sendFile(join(config.webDist, 'index.html'));
    });
  }

  app.use(errorMiddleware);
  return app;
}
