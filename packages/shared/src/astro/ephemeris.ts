/**
 * Low-precision astronomy for PluralNova's Astro section.
 *
 * Positions use Paul Schlyter's well-known low-precision orbital elements
 * (good to roughly a degree for the planets, a few tenths for Sun and Moon),
 * which is plenty for sign placement and reflective use — and nothing here
 * should be read as a professional ephemeris. Chiron is a rough two-body
 * approximation and is labelled as such in the UI.
 */

export const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;
export type SignName = (typeof SIGN_NAMES)[number];

export const PLANET_IDS = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'northNode', 'chiron',
] as const;
export type PlanetId = (typeof PLANET_IDS)[number];

const RAD = Math.PI / 180;
const norm = (deg: number): number => ((deg % 360) + 360) % 360;
const sinD = (d: number): number => Math.sin(d * RAD);
const cosD = (d: number): number => Math.cos(d * RAD);

export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

export function signIndexOf(longitude: number): number {
  return Math.floor(norm(longitude) / 30);
}
export function signOf(longitude: number): SignName {
  return SIGN_NAMES[signIndexOf(longitude)]!;
}
export function degreeInSign(longitude: number): number {
  return norm(longitude) % 30;
}

interface Elements {
  N: number; i: number; w: number; a: number; e: number; M: number;
}

function elementsFor(id: string, d: number): Elements {
  switch (id) {
    case 'mercury':
      return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
    case 'venus':
      return { N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
    case 'mars':
      return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
    case 'jupiter':
      return { N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d };
    case 'saturn':
      return { N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d };
    case 'uranus':
      return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d };
    case 'neptune':
      return { N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d };
    case 'chiron':
      // Rough two-body approximation (perihelion early 1996, period ~50.4 y).
      return { N: 209.3, i: 6.93, w: 339.5, a: 13.7, e: 0.383, M: ((d + 2451543.5 - 2450130) * 360) / (50.4 * 365.25) };
    default:
      throw new Error(`No elements for ${id}`);
  }
}

function solveKepler(M: number, e: number): number {
  let E = M + (e / RAD) * sinD(M) * (1 + e * cosD(M));
  for (let n = 0; n < 6; n += 1) {
    E -= (E - (e / RAD) * sinD(E) - M) / (1 - e * cosD(E));
  }
  return E;
}

function orbitPosition(el: Elements): { x: number; y: number; z: number; r: number; v: number } {
  const E = solveKepler(norm(el.M), el.e);
  const xv = el.a * (cosD(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sinD(E);
  const v = norm(Math.atan2(yv, xv) / RAD);
  const r = Math.hypot(xv, yv);
  const vw = v + el.w;
  return {
    x: r * (cosD(el.N) * cosD(vw) - sinD(el.N) * sinD(vw) * cosD(el.i)),
    y: r * (sinD(el.N) * cosD(vw) + cosD(el.N) * sinD(vw) * cosD(el.i)),
    z: r * sinD(vw) * sinD(el.i),
    r,
    v,
  };
}

function sunState(d: number): { lon: number; r: number; x: number; y: number } {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = 356.047 + 0.9856002585 * d;
  const { v, r } = orbitPosition({ N: 0, i: 0, w, a: 1, e, M });
  const lon = norm(v + w);
  return { lon, r, x: r * cosD(lon), y: r * sinD(lon) };
}

function moonLongitude(d: number): number {
  const N = 125.1228 - 0.0529538083 * d;
  const w = 318.0634 + 0.1643573223 * d;
  const M = 115.3654 + 13.0649929509 * d;
  const incl = 5.1454;
  const pos = orbitPosition({ N, i: incl, w, a: 60.2666, e: 0.0549, M });
  const vw = pos.v + w;
  const lonRaw = norm(Math.atan2(sinD(N) * cosD(vw) + cosD(N) * sinD(vw) * cosD(incl), cosD(N) * cosD(vw) - sinD(N) * sinD(vw) * cosD(incl)) / RAD);
  const Ms = 356.047 + 0.9856002585 * d;
  const Ls = Ms + 282.9404 + 4.70935e-5 * d;
  const Lm = M + w + N;
  const D = Lm - Ls;
  const F = Lm - N;
  const perturbation =
    -1.274 * sinD(M - 2 * D) + 0.658 * sinD(2 * D) - 0.186 * sinD(Ms) - 0.059 * sinD(2 * M - 2 * D) -
    0.057 * sinD(M - 2 * D + Ms) + 0.053 * sinD(M + 2 * D) + 0.046 * sinD(2 * D - Ms) + 0.041 * sinD(M - Ms) -
    0.035 * sinD(D) - 0.031 * sinD(M + Ms) - 0.015 * sinD(2 * F - 2 * D) + 0.011 * sinD(M - 4 * D);
  return norm(lonRaw + perturbation);
}

function plutoLongitude(d: number): number {
  const S = 50.03 + 0.033459652 * d;
  const P = 238.95 + 0.003968789 * d;
  return norm(
    238.9508 + 0.00400703 * d - 19.799 * sinD(P) + 19.848 * cosD(P) + 0.897 * sinD(2 * P) - 4.956 * cosD(2 * P) +
      0.61 * sinD(3 * P) + 1.211 * cosD(3 * P) - 0.341 * sinD(4 * P) - 0.19 * cosD(4 * P) + 0.128 * sinD(5 * P) -
      0.034 * cosD(5 * P) - 0.038 * sinD(6 * P) + 0.031 * cosD(6 * P) + 0.02 * sinD(S - P) - 0.01 * cosD(S - P),
  );
}

/** Ecliptic longitude (0–360°, tropical zodiac) of a body at a moment. */
export function longitudeOf(id: PlanetId, date: Date): number {
  const d = julianDay(date) - 2_451_543.5;
  switch (id) {
    case 'sun': return sunState(d).lon;
    case 'moon': return moonLongitude(d);
    case 'pluto': return plutoLongitude(d);
    case 'northNode': return norm(125.0445 - 0.0529538083 * d);
    default: {
      const sun = sunState(d);
      const p = orbitPosition(elementsFor(id, d));
      return norm(Math.atan2(p.y + sun.y, p.x + sun.x) / RAD);
    }
  }
}

/** True when the body appears to move backwards against the zodiac around that moment. */
export function isRetrograde(id: PlanetId, date: Date): boolean {
  if (id === 'sun' || id === 'moon' || id === 'northNode') return false;
  const before = longitudeOf(id, new Date(date.getTime() - 43_200_000));
  const after = longitudeOf(id, new Date(date.getTime() + 43_200_000));
  const delta = ((after - before + 540) % 360) - 180;
  return delta < 0;
}

// ── Ascendant and houses ─────────────────────────────────────────────────────

export interface BirthLocation {
  latitude: number;
  longitude: number;
}

function ramcOf(date: Date, place: BirthLocation): number {
  const gmst = norm(280.46061837 + 360.98564736629 * (julianDay(date) - 2_451_545));
  return norm(gmst + place.longitude);
}

export function ascendantOf(date: Date, place: BirthLocation): number {
  const ramc = ramcOf(date, place);
  const eps = 23.4393;
  return norm(Math.atan2(cosD(ramc), -(sinD(ramc) * cosD(eps) + Math.tan(place.latitude * RAD) * sinD(eps))) / RAD);
}

export function midheavenOf(date: Date, place: BirthLocation): number {
  const ramc = ramcOf(date, place);
  return norm(Math.atan2(sinD(ramc), cosD(ramc) * cosD(23.4393)) / RAD);
}

/** Equal houses: each is 30° starting at the ascendant. */
export function houseOf(longitude: number, ascendant: number): number {
  return Math.floor(norm(longitude - ascendant) / 30) + 1;
}

// ── Aspects ──────────────────────────────────────────────────────────────────

export const ASPECTS = [
  { id: 'conjunction', label: 'Conjunction', angle: 0, orb: 8, glyph: '☌', tone: 'merging' },
  { id: 'sextile', label: 'Sextile', angle: 60, orb: 4, glyph: '⚹', tone: 'supportive' },
  { id: 'square', label: 'Square', angle: 90, orb: 6, glyph: '□', tone: 'challenging' },
  { id: 'trine', label: 'Trine', angle: 120, orb: 6, glyph: '△', tone: 'flowing' },
  { id: 'opposition', label: 'Opposition', angle: 180, orb: 8, glyph: '☍', tone: 'polarising' },
] as const;
export type AspectDef = (typeof ASPECTS)[number];

export function aspectBetween(a: number, b: number, orbScale = 1): { aspect: AspectDef; orb: number } | null {
  const separation = Math.abs(((a - b + 540) % 360) - 180);
  const angle = 180 - separation;
  for (const aspect of ASPECTS) {
    const orb = Math.abs(angle - aspect.angle);
    if (orb <= aspect.orb * orbScale) return { aspect, orb };
  }
  return null;
}

// ── Moon phases ──────────────────────────────────────────────────────────────

export const PHASES = [
  { id: 'new', name: 'New Moon', emoji: '🌑' },
  { id: 'waxingCrescent', name: 'Waxing Crescent', emoji: '🌒' },
  { id: 'firstQuarter', name: 'First Quarter', emoji: '🌓' },
  { id: 'waxingGibbous', name: 'Waxing Gibbous', emoji: '🌔' },
  { id: 'full', name: 'Full Moon', emoji: '🌕' },
  { id: 'waningGibbous', name: 'Waning Gibbous', emoji: '🌖' },
  { id: 'thirdQuarter', name: 'Third Quarter', emoji: '🌗' },
  { id: 'waningCrescent', name: 'Waning Crescent', emoji: '🌘' },
] as const;
export type PhaseId = (typeof PHASES)[number]['id'];

export interface MoonState {
  elongation: number;
  illumination: number;
  phase: (typeof PHASES)[number];
  sign: SignName;
  longitude: number;
}

export function moonState(date: Date): MoonState {
  const moon = longitudeOf('moon', date);
  const sun = longitudeOf('sun', date);
  const elongation = norm(moon - sun);
  const index = Math.floor(((elongation + 22.5) % 360) / 45);
  return {
    elongation,
    illumination: (1 - cosD(elongation)) / 2,
    phase: PHASES[index]!,
    sign: signOf(moon),
    longitude: moon,
  };
}

export interface MoonEvent {
  date: Date;
  phase: 'new' | 'firstQuarter' | 'full' | 'thirdQuarter';
  name: string;
  emoji: string;
  sign: SignName;
}

const MAJOR_PHASES: { angle: number; phase: MoonEvent['phase'] }[] = [
  { angle: 0, phase: 'new' },
  { angle: 90, phase: 'firstQuarter' },
  { angle: 180, phase: 'full' },
  { angle: 270, phase: 'thirdQuarter' },
];

/** The four principal phases between two moments, found by bisecting the sun–moon angle. */
export function moonEventsBetween(start: Date, end: Date): MoonEvent[] {
  const events: MoonEvent[] = [];
  const step = 6 * 3_600_000;
  let prev = start.getTime();
  let prevElong = moonState(new Date(prev)).elongation;
  for (let t = prev + step; t <= end.getTime() + step; t += step) {
    const elong = moonState(new Date(t)).elongation;
    for (const { angle, phase } of MAJOR_PHASES) {
      const crossed = angle === 0 ? elong < prevElong : prevElong < angle && elong >= angle;
      if (!crossed) continue;
      let lo = prev;
      let hi = t;
      for (let n = 0; n < 24; n += 1) {
        const mid = (lo + hi) / 2;
        const e = moonState(new Date(mid)).elongation;
        const before = angle === 0 ? e > 180 : e < angle;
        if (before) lo = mid;
        else hi = mid;
      }
      const when = new Date(hi);
      if (when >= start && when <= end) {
        const meta = PHASES.find((p) => p.id === phase)!;
        events.push({ date: when, phase, name: meta.name, emoji: meta.emoji, sign: signOf(longitudeOf('moon', when)) });
      }
    }
    prev = t;
    prevElong = elong;
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── Ingresses and retrograde periods ─────────────────────────────────────────

export interface Ingress {
  date: Date;
  planet: PlanetId;
  sign: SignName;
  from: SignName;
}

/** Moments a body enters a new sign between two dates (daily scan, then bisected). */
export function ingressesBetween(planet: PlanetId, start: Date, end: Date): Ingress[] {
  const result: Ingress[] = [];
  const step = 86_400_000;
  let prev = start.getTime();
  let prevSign = signIndexOf(longitudeOf(planet, new Date(prev)));
  for (let t = prev + step; t <= end.getTime() + step; t += step) {
    const sign = signIndexOf(longitudeOf(planet, new Date(t)));
    if (sign !== prevSign) {
      let lo = prev;
      let hi = t;
      for (let n = 0; n < 20; n += 1) {
        const mid = (lo + hi) / 2;
        if (signIndexOf(longitudeOf(planet, new Date(mid))) === prevSign) lo = mid;
        else hi = mid;
      }
      if (hi <= end.getTime()) {
        result.push({ date: new Date(hi), planet, sign: SIGN_NAMES[sign]!, from: SIGN_NAMES[prevSign]! });
      }
    }
    prev = t;
    prevSign = sign;
  }
  return result;
}

export interface RetrogradePeriod {
  planet: PlanetId;
  start: Date;
  end: Date;
}

/** Retrograde stretches (to the day) for a planet that overlap the window. */
export function retrogradesBetween(planet: PlanetId, start: Date, end: Date): RetrogradePeriod[] {
  const out: RetrogradePeriod[] = [];
  const day = 86_400_000;
  // Look a little either side so a stretch already underway is captured whole.
  const from = start.getTime() - 120 * day;
  const to = end.getTime() + 120 * day;
  let open: number | null = null;
  for (let t = from; t <= to; t += day) {
    const retro = isRetrograde(planet, new Date(t));
    if (retro && open === null) open = t;
    if (!retro && open !== null) {
      if (t > start.getTime() && open < end.getTime()) out.push({ planet, start: new Date(open), end: new Date(t) });
      open = null;
    }
  }
  return out;
}
