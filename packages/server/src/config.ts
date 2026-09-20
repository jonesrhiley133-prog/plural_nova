import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Configuration comes from the environment with usable defaults, so a fresh
 * clone runs with `npm start` and no setup file. Anything security-relevant
 * (the session secret, the push keys) is generated once and persisted rather
 * than defaulted to a constant.
 */

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dataDir = resolve(env('PLURALNOVA_DATA_DIR', './data'));

export const config = {
  port: envInt('PORT', 4000),
  host: env('HOST', '0.0.0.0'),
  dataDir,
  databaseFile: resolve(dataDir, env('PLURALNOVA_DB', 'pluralnova.sqlite')),
  uploadsDir: resolve(dataDir, 'uploads'),
  keyFile: resolve(dataDir, 'keys.json'),
  /** Where the built web client lives, when the server is also serving it. */
  webDist: resolve(env('PLURALNOVA_WEB_DIST', '../web/dist')),
  serveWeb: env('PLURALNOVA_SERVE_WEB', 'true') === 'true',
  sessionDays: envInt('PLURALNOVA_SESSION_DAYS', 60),
  /** Upload ceiling per file. Media is stored on disk, not in the database. */
  maxUploadBytes: envInt('PLURALNOVA_MAX_UPLOAD', 25 * 1024 * 1024),
  maxJsonBytes: envInt('PLURALNOVA_MAX_JSON', 64 * 1024 * 1024),
  corsOrigins: env('PLURALNOVA_CORS', 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: process.env['NODE_ENV'] === 'production',
  /** Address mail is sent from. Empty means no transport is configured. */
  mailFrom: env('PLURALNOVA_MAIL_FROM', ''),
  /**
   * With no mail transport and outside production, reset codes come back in the
   * API response so the flow can be completed locally. Never true in production.
   */
  exposeResetCodes:
    process.env['NODE_ENV'] !== 'production' && env('PLURALNOVA_MAIL_FROM', '') === '',
  /** Contact address embedded in push subscriptions, per the web-push spec. */
  pushContact: env('PLURALNOVA_PUSH_CONTACT', 'mailto:notifications@pluralnova.app'),
} as const;

export function ensureDirectories(): void {
  for (const dir of [config.dataDir, config.uploadsDir, dirname(config.databaseFile)]) {
    mkdirSync(dir, { recursive: true });
  }
}
