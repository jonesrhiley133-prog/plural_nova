import {
  PLANET_IDS, SIGN_NAMES, aspectBetween, ingressesBetween, isRetrograde, longitudeOf, moonEventsBetween,
  moonState, retrogradesBetween, signIndexOf, signOf, type Ingress, type MoonEvent, type MoonState,
  type PlanetId, type SignName,
} from './ephemeris.js';
import type { AstroProfile } from './chart.js';
import { signInfo } from './signs.js';

const DAY = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}
/** Noon UTC — a stable "moment of the day" that avoids timezone edge cases. */
export function noonOf(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + 12 * 3_600_000);
}

export interface SkyPlanet {
  id: PlanetId;
  sign: SignName;
  longitude: number;
  retrograde: boolean;
}

export interface Sky {
  date: Date;
  moon: MoonState;
  sunSign: SignName;
  planets: SkyPlanet[];
}

export function skyAt(date: Date): Sky {
  const when = noonOf(date);
  return {
    date: when,
    moon: moonState(when),
    sunSign: signOf(longitudeOf('sun', when)),
    planets: PLANET_IDS.map((id) => {
      const longitude = longitudeOf(id, when);
      return { id, sign: signOf(longitude), longitude, retrograde: isRetrograde(id, when) };
    }),
  };
}

export interface SunTransit {
  current: SignName;
  previous: SignName;
  next: SignName;
  /** When the Sun entered the current sign. */
  since: Date;
  /** When it enters the next one. */
  until: Date;
}

export function sunTransit(date: Date): SunTransit {
  const from = addDays(date, -40);
  const to = addDays(date, 40);
  const list = ingressesBetween('sun', from, to);
  const current = signOf(longitudeOf('sun', noonOf(date)));
  const idx = SIGN_NAMES.indexOf(current);
  const since = [...list].reverse().find((i) => i.date <= date)?.date ?? from;
  const until = list.find((i) => i.date > date)?.date ?? to;
  return {
    current,
    previous: SIGN_NAMES[(idx + 11) % 12]!,
    next: SIGN_NAMES[(idx + 1) % 12]!,
    since,
    until,
  };
}

export interface SkyEvent {
  date: Date;
  kind: 'moon' | 'sun' | 'planet' | 'retrograde';
  icon: string;
  title: string;
  detail: string;
}

/** Everything notable in the sky between two dates, newest-first ordering left to the caller. */
export function skyEventsBetween(start: Date, end: Date): SkyEvent[] {
  const events: SkyEvent[] = [];
  for (const m of moonEventsBetween(start, end)) {
    events.push({
      date: m.date, kind: 'moon', icon: m.emoji, title: `${m.name} in ${m.sign}`,
      detail: moonMeaning(m),
    });
  }
  for (const i of ingressesBetween('sun', start, end)) {
    events.push({ date: i.date, kind: 'sun', icon: signInfo(i.sign).glyph, title: `Sun enters ${i.sign}`, detail: sunIngressMeaning(i.sign) });
  }
  for (const planet of ['mercury', 'venus', 'mars'] as const) {
    for (const i of ingressesBetween(planet, start, end)) {
      events.push({ date: i.date, kind: 'planet', icon: signInfo(i.sign).glyph, title: `${cap(planet)} enters ${i.sign}`, detail: `${cap(planet)} moves from ${i.from} into ${i.sign}, colouring its themes with ${signInfo(i.sign).keywords[0]} energy.` });
    }
  }
  for (const planet of ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const) {
    for (const i of ingressesBetween(planet, start, end)) {
      events.push({ date: i.date, kind: 'planet', icon: '🪐', title: `${cap(planet)} enters ${i.sign}`, detail: `A slow, long-lasting shift: ${cap(planet)} moves from ${i.from} into ${i.sign}.` });
    }
  }
  for (const planet of ['mercury', 'venus', 'mars'] as const) {
    for (const r of retrogradesBetween(planet, start, end)) {
      if (r.start >= start && r.start <= end) events.push({ date: r.start, kind: 'retrograde', icon: '℞', title: `${cap(planet)} stations retrograde`, detail: retroMeaning(planet) });
      if (r.end >= start && r.end <= end) events.push({ date: r.end, kind: 'retrograde', icon: '℞', title: `${cap(planet)} stations direct`, detail: `${cap(planet)} resumes apparent forward motion — traditionally a time to move forward with what was reconsidered.` });
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export const cap = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1).replace(/([A-Z])/g, ' $1');

function retroMeaning(planet: string): string {
  const map: Record<string, string> = {
    mercury: 'Traditionally linked with rechecking plans, messages and details, and with slowing down communication.',
    venus: 'Traditionally linked with revisiting values, relationships and what you find beautiful.',
    mars: 'Traditionally linked with reassessing how you use your drive and where you direct your energy.',
  };
  return map[planet] ?? 'A traditional time for review.';
}

export function sunIngressMeaning(sign: SignName): string {
  const info = signInfo(sign);
  return `The Sun's season in ${sign} traditionally spotlights ${info.keywords.join(', ')} themes: ${info.summary}`;
}

export function moonMeaning(event: Pick<MoonEvent, 'phase' | 'sign'>): string {
  const flavour = signInfo(event.sign).keywords[0];
  const base: Record<MoonEvent['phase'], string> = {
    new: 'New beginnings, quiet intention-setting and planting seeds',
    firstQuarter: 'Decisions, action and pushing through resistance',
    full: 'Culmination, clarity, release and heightened feeling',
    thirdQuarter: 'Letting go, reviewing and clearing space',
  };
  return `${base[event.phase]} — traditionally coloured here by ${event.sign}'s ${flavour} tone.`;
}

// ── Transits against a natal profile ─────────────────────────────────────────

export interface Transit {
  transit: PlanetId;
  natal: PlanetId | 'ascendant';
  label: string;
  tone: string;
  orb: number;
  text: string;
}

const TRANSITERS: PlanetId[] = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/**
 * Transits touching a natal chart. Exact aspects need exact natal degrees (planets level or above);
 * with only a birthday, the Sun transit is described by sign relationship instead.
 */
export function transitsFor(profile: AstroProfile, date: Date): Transit[] {
  const sky = skyAt(date);
  const out: Transit[] = [];
  if (profile.level === 'planets' || profile.level === 'full') {
    const natal = profile.placements.filter((p) => ['sun', 'moon', 'venus', 'mars', 'mercury'].includes(p.id));
    const points = natal.map((p) => ({ id: p.id as PlanetId | 'ascendant', lon: p.longitude as number }));
    if (profile.ascendant !== null) points.push({ id: 'ascendant', lon: profile.ascendant });
    for (const t of TRANSITERS) {
      const tp = sky.planets.find((p) => p.id === t)!;
      for (const n of points) {
        const hit = aspectBetween(tp.longitude, n.lon, 0.5);
        if (!hit) continue;
        const natalName = n.id === 'ascendant' ? 'Ascendant' : cap(n.id);
        out.push({
          transit: t, natal: n.id, orb: hit.orb, tone: hit.aspect.tone,
          label: `Transit ${cap(t)} ${hit.aspect.glyph} natal ${natalName}`,
          text: `${cap(t)} in ${tp.sign} forms ${/^[aeiou]/i.test(hit.aspect.label) ? 'an' : 'a'} ${hit.aspect.label.toLowerCase()} to your natal ${natalName} — traditionally a ${hit.aspect.tone} influence on ${aboutPlanet(n.id)}.`,
        });
      }
    }
    out.sort((a, b) => a.orb - b.orb);
  }
  return out.slice(0, 6);
}

function aboutPlanet(id: PlanetId | 'ascendant'): string {
  const map: Record<string, string> = {
    sun: 'identity and vitality', moon: 'mood and emotional needs', mercury: 'thinking and communication',
    venus: 'affection and values', mars: 'drive and motivation', ascendant: 'how you meet the world',
  };
  return map[id] ?? 'this part of your chart';
}

/** Whole-sign relationship between two signs: 0–6 steps apart. */
export function signDistance(a: SignName, b: SignName): number {
  const d = Math.abs(SIGN_NAMES.indexOf(a) - SIGN_NAMES.indexOf(b)) % 12;
  return d > 6 ? 12 - d : d;
}

export function signRelation(a: SignName, b: SignName): { name: string; tone: 'flowing' | 'supportive' | 'challenging' | 'merging' | 'polarising' | 'adjusting' } {
  switch (signDistance(a, b)) {
    case 0: return { name: 'same sign', tone: 'merging' };
    case 1: return { name: 'neighbouring signs', tone: 'adjusting' };
    case 2: return { name: 'sextile', tone: 'supportive' };
    case 3: return { name: 'square', tone: 'challenging' };
    case 4: return { name: 'trine', tone: 'flowing' };
    case 5: return { name: 'quincunx', tone: 'adjusting' };
    default: return { name: 'opposition', tone: 'polarising' };
  }
}

export { signIndexOf };
