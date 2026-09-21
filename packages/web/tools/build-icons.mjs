/**
 * Writes every icon the manifest and index.html reference.
 *
 * Run with `npm run icons -w @pluralnova/web` after changing `icon-art.mjs`.
 * The output is committed: the app should build on a clean checkout without
 * this step, and a reviewer should be able to see the icons in a diff.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appIcon, badgeIcon, maskableIcon, shortcutIcon, SHORTCUTS } from './icon-art.mjs';
import { render, toPng, toSvg } from './raster.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function writePng(art, name, size) {
  writeFileSync(join(OUT, `${name}.png`), toPng(render(art, size), size));
  return `${name}.png (${size}px)`;
}

function writeSvg(art, name, label) {
  writeFileSync(join(OUT, `${name}.svg`), toSvg(art, label));
  return `${name}.svg`;
}

mkdirSync(OUT, { recursive: true });

const written = [];
const app = appIcon();
const maskable = maskableIcon();

written.push(writeSvg(app, 'icon', 'PluralNova'));
written.push(writeSvg(maskable, 'maskable', 'PluralNova'));
// 180 is the Apple touch icon; 192 and 512 are what Chrome wants to install.
for (const size of [180, 192, 512]) written.push(writePng(app, `icon-${size}`, size));
for (const size of [192, 512]) written.push(writePng(maskable, `maskable-${size}`, size));
written.push(writePng(badgeIcon(), 'badge', 96));

for (const name of SHORTCUTS) {
  const art = shortcutIcon(name);
  written.push(writeSvg(art, `shortcut-${name}`, name));
  written.push(writePng(art, `shortcut-${name}`, 96));
}

console.log(`Wrote ${written.length} icons to public/icons:`);
for (const line of written) console.log(`  ${line}`);
