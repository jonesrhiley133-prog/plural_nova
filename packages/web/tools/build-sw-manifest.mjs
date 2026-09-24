/**
 * Lists every hashed script and stylesheet from the build just produced, so
 * the service worker can precache them by name instead of only learning about
 * one the first time something on the page happens to fetch it. Without this,
 * a route nobody has opened yet — a fresh install going straight to Search,
 * say — has no cached copy of its own code to run once there is no network.
 *
 * Run after `vite build`; reads `dist/assets` and writes `dist/precache-manifest.json`.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const ASSETS = join(DIST, 'assets');

const manifest = readdirSync(ASSETS)
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => `/assets/${name}`)
  .sort();

writeFileSync(join(DIST, 'precache-manifest.json'), JSON.stringify(manifest));
console.log(`Wrote precache manifest with ${manifest.length} files.`);
