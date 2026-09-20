import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { AppError } from '../http/errors.js';
import { handler, ok } from '../http/respond.js';

/**
 * Distributing the Android app.
 *
 * PluralNova is self-hosted and there is no store in the middle, so the server
 * that runs it is also the thing that hands out the APK and tells an installed
 * copy when a newer one exists. Nothing here is required — a server with no
 * published build simply answers "nothing to install", and the web app hides
 * the download.
 *
 * Publish with `android/tools/publish.sh`, which writes both files.
 */
/** Metadata, mounted under `/api/app`. */
export const appRouter: Router = Router();

/** The file itself, mounted at `/app` so a browser link is a plain file URL. */
export const appDownloadRouter: Router = Router();

const RELEASE_DIR = join(config.dataDir, 'releases');
const APK = join(RELEASE_DIR, 'pluralnova.apk');
const MANIFEST = join(RELEASE_DIR, 'android.json');
const DOWNLOAD_PATH = '/app/pluralnova.apk';

interface ReleaseManifest {
  versionCode: number;
  versionName: string;
  notes?: string;
}

export interface AndroidRelease extends ReleaseManifest {
  size: number;
  sha256: string;
  url: string;
  publishedAt: string;
}

/**
 * Hashing a release on every check would read the whole file each time, so the
 * result is kept until the file changes underneath it.
 */
let cached: { key: string; release: AndroidRelease } | null = null;

function readRelease(): AndroidRelease | null {
  if (!existsSync(APK) || !existsSync(MANIFEST)) return null;

  const stats = statSync(APK);
  const key = `${stats.size}:${stats.mtimeMs}`;
  if (cached?.key === key) return cached.release;

  let manifest: ReleaseManifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as ReleaseManifest;
  } catch {
    console.warn('[pluralnova] releases/android.json is not readable JSON; ignoring it');
    return null;
  }

  if (!Number.isInteger(manifest.versionCode) || !manifest.versionName) {
    console.warn('[pluralnova] releases/android.json needs a versionCode and a versionName');
    return null;
  }

  const release: AndroidRelease = {
    versionCode: manifest.versionCode,
    versionName: manifest.versionName,
    ...(manifest.notes ? { notes: manifest.notes } : {}),
    size: stats.size,
    sha256: createHash('sha256').update(readFileSync(APK)).digest('hex'),
    url: DOWNLOAD_PATH,
    publishedAt: stats.mtime.toISOString(),
  };

  cached = { key, release };
  return release;
}

/**
 * Unauthenticated on purpose: this is how somebody gets the app onto a phone in
 * the first place, before they have signed in anywhere. It exposes the version
 * of a server that already serves its own web client publicly.
 */
appRouter.get(
  '/android',
  handler((_req, res) => {
    ok(res, { release: readRelease() });
  }),
);

appDownloadRouter.get(
  '/pluralnova.apk',
  handler((_req, res) => {
    const release = readRelease();
    if (!release) {
      throw new AppError('not_found', 'No Android build has been published on this server.');
    }

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', String(release.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pluralnova-${release.versionName}.apk"`,
    );
    // The file changes name-in-place on each publish, so it must not be cached.
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(APK).pipe(res);
  }),
);
