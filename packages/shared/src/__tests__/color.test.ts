import { describe, expect, it } from 'vitest';
import {
  formatHsl,
  formatRgb,
  hexToHsv,
  hslToHsv,
  hsvToHex,
  hsvToHsl,
  hsvToRgb,
  parseHslString,
  parseRgbString,
  rgbToHsv,
} from '../color.js';

/**
 * The colour picker draws a saturation/value square and a hue slider and has
 * to turn a point on each back into the same hex string every other colour
 * field in the app already stores. Getting that conversion wrong would not
 * crash anything — it would just save the wrong colour, quietly, which is
 * why the round trips are checked as arithmetic rather than trusted by eye.
 */
describe('colour conversions', () => {
  const cases: Array<[string, { r: number; g: number; b: number }]> = [
    ['#ffffff', { r: 255, g: 255, b: 255 }],
    ['#000000', { r: 0, g: 0, b: 0 }],
    ['#ff0000', { r: 255, g: 0, b: 0 }],
    ['#00ff00', { r: 0, g: 255, b: 0 }],
    ['#0000ff', { r: 0, g: 0, b: 255 }],
    ['#7aa2f7', { r: 122, g: 162, b: 247 }],
    ['#a78bfa', { r: 167, g: 139, b: 250 }],
  ];

  it('round-trips hex -> hsv -> hex without drift', () => {
    for (const [hex] of cases) {
      const hsv = hexToHsv(hex);
      expect(hsv).not.toBeNull();
      expect(hsvToHex(hsv!)).toBe(hex);
    }
  });

  it('round-trips hex -> hsv -> rgb back to the original channels', () => {
    for (const [hex, rgb] of cases) {
      const hsv = hexToHsv(hex)!;
      expect(hsvToRgb(hsv)).toEqual(rgb);
    }
  });

  it('round-trips hsv -> hsl -> hsv within rounding', () => {
    for (const [hex] of cases) {
      const hsv = hexToHsv(hex)!;
      const back = hslToHsv(hsvToHsl(hsv));
      expect(back.h).toBeCloseTo(hsv.h, 3);
      expect(back.s).toBeCloseTo(hsv.s, 3);
      expect(back.v).toBeCloseTo(hsv.v, 3);
    }
  });

  it('agrees with the known HSV of primary red', () => {
    // 100% saturated, 100% value, hue 0 — the textbook case, checked exactly
    // rather than only round-tripped, so a systematic error in the formula
    // could not pass by cancelling itself out.
    const hsv = hexToHsv('#ff0000')!;
    expect(hsv.h).toBeCloseTo(0, 3);
    expect(hsv.s).toBeCloseTo(1, 3);
    expect(hsv.v).toBeCloseTo(1, 3);
  });

  it('agrees with the known HSV of a mid grey', () => {
    // Zero saturation: hue is undefined territory, but the formula must not
    // produce NaN or something wildly out of range.
    const hsv = hexToHsv('#808080')!;
    expect(hsv.s).toBeCloseTo(0, 2);
    expect(Number.isFinite(hsv.h)).toBe(true);
  });

  it('returns null for anything that is not a hex colour', () => {
    expect(hexToHsv('not a colour')).toBeNull();
    expect(hexToHsv('')).toBeNull();
  });

  it('parses an rgb() string typed by hand', () => {
    expect(parseRgbString('rgb(122, 162, 247)')).toEqual({ r: 122, g: 162, b: 247 });
    expect(parseRgbString('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('refuses an rgb() string with a channel out of range', () => {
    expect(parseRgbString('rgb(999, 0, 0)')).toBeNull();
  });

  it('refuses text that merely mentions rgb', () => {
    expect(parseRgbString('background: rgb')).toBeNull();
    expect(parseRgbString('#7aa2f7')).toBeNull();
  });

  it('parses an hsl() string and returns the equivalent hex', () => {
    // Pure blue: hsl(240, 100%, 50%) is #0000ff exactly, so this is checked
    // against a known value rather than only round-tripped.
    expect(parseHslString('hsl(240, 100%, 50%)')).toBe('#0000ff');
  });

  it('formats rgb and hsl the way a person would type them', () => {
    expect(formatRgb({ r: 122, g: 162, b: 247 })).toBe('rgb(122, 162, 247)');
    expect(formatHsl(rgbToHsv({ r: 0, g: 0, b: 255 }) && hsvToHsl(rgbToHsv({ r: 0, g: 0, b: 255 })))).toBe(
      'hsl(240, 100%, 50%)',
    );
  });
});
