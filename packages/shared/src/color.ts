/**
 * Colour space conversions for the colour picker.
 *
 * `themes.ts` already has hex parsing, mixing and contrast math for the theme
 * engine itself; this is the piece that engine never needed — turning a point
 * on a saturation/value square and a position on a hue slider back into the
 * hex string everything else in the app already speaks. Kept separate and
 * pure so it can be tested as arithmetic, not as a rendered picker.
 */

import { parseHex, toHex } from './themes.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  l: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = v - c;

  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function hsvToHsl({ h, s, v }: Hsv): Hsl {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h, s: sl, l };
}

export function hslToHsv({ h, s, l }: Hsl): Hsv {
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return { h, s: sv, v };
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv);
  return toHex(r, g, b);
}

/** `rgb(r, g, b)` in, hex out — or null for anything that is not that shape. */
export function parseRgbString(input: string): Rgb | null {
  const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(input.trim());
  if (!match) return null;
  const [, r, g, b] = match.map(Number) as [number, number, number, number];
  if ([r, g, b].some((c) => c > 255)) return null;
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
}

/** `hsl(h, s%, l%)` in, hex out — or null for anything that is not that shape. */
export function parseHslString(input: string): string | null {
  const match = /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?/i.exec(input.trim());
  if (!match) return null;
  const [, h, s, l] = match.map(Number) as [number, number, number, number];
  return hsvToHex(hslToHsv({ h: clamp(h, 0, 360), s: clamp(s, 0, 100) / 100, l: clamp(l, 0, 100) / 100 }));
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function formatHsl(hsl: Hsl): string {
  return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
}
