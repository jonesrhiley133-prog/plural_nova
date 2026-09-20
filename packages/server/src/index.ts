import { createServer } from 'node:http';
import { APP_VERSION } from '@pluralnova/shared';
import { config, ensureDirectories } from './config.js';
import { migrate, openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { attachRealtime, closeAll } from './realtime/hub.js';
import { ensurePushKeys } from './services/push.js';
import { pruneSessions } from './auth/sessions.js';
import { pruneRateLimits } from './http/rateLimit.js';
import { runReminderSweep } from './services/reminders.js';

ensureDirectories();
const db = openDatabase();
const schema = migrate(db);
ensurePushKeys();

if (schema.addedColumns.length > 0) {
  console.log(`[pluralnova] schema updated: ${schema.addedColumns.length} new column(s)`);
}

const app = createApp();
const server = createServer(app);
attachRealtime(server);

// Housekeeping: expired sessions, stale rate-limit windows, and reminders that
// have come due. One timer rather than three, and it never blocks a request.
const maintenance = setInterval(
  () => {
    try {
      pruneSessions();
      pruneRateLimits();
      void runReminderSweep();
    } catch (error) {
      console.error('[pluralnova] maintenance sweep failed:', error);
    }
  },
  60_000,
);
maintenance.unref();

server.listen(config.port, config.host, () => {
  console.log(`[pluralnova] v${APP_VERSION} listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`[pluralnova] ${signal} received, shutting down`);
  clearInterval(maintenance);
  closeAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
