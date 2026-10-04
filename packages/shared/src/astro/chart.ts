import {
  ASPECTS, PLANET_IDS, SIGN_NAMES, aspectBetween, ascendantOf, degreeInSign, houseOf, isRetrograde,
  longitudeOf, midheavenOf, signIndexOf, signOf, type AspectDef, type PlanetId, type SignName,
} from './ephemeris.js';
import { signInfo, sunSignFor, type Element, type Modality } from './signs.js';

export interface AstroInput {
  /** `YYYY-MM-DD`. */
  birthday?: string | null;
  /** `HH:MM`, local time at the birthplace. */
  birthTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Hours from UTC at the time and place of birth (including daylight saving), e.g. -5 or 5.5. */
  utcOffset?: number | null;
}

/**
 * How much the input supports:
 * - `none`    no usable birthday
 * - `basic`   birthday only → Sun sign plus any slow placement that cannot have changed sign that day
 * - `planets` birthday + time + UTC offset → exact planet positions, no rising/houses
 * - `full`    plus latitude/longitude → ascendant, houses, full natal chart
 */
export type ChartLevel = 'none' | 'basic' | 'planets' | 'full';

export interface Placement {
  id: PlanetId;
  /** `null` when the sign cannot be stated without more birth data. */
  sign: SignName | null;
  longitude: number | null;
  degree: number | null;
  house: number | null;
  retrograde: boolean;
}

export interface ChartAspect {
  a: PlanetId | 'ascendant';
  b: PlanetId | 'ascendant';
  aspect: AspectDef;
  orb: number;
}

export interface AstroProfile {
  level: ChartLevel;
  sun: SignName | null;
  element: Element | null;
  modality: Modality | null;
  moon: SignName | null;
  rising: SignName | null;
  placements: Placement[];
  ascendant: number | null;
  midheaven: number | null;
  houseCusps: { house: number; sign: SignName; longitude: number }[];
  aspects: ChartAspect[];
  elementCounts: Record<Element, number>;
  modalityCounts: Record<Modality, number>;
  /** What is missing for the next level, in plain words — never guessed around. */
  unlockPrompt: string | null;
}

export const RISING_PROMPT = 'Add your birth time and birthplace to unlock your Rising Sign and complete birth chart.';

export function parseBirthday(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function birthInstant(input: AstroInput): Date | null {
  const b = parseBirthday(input.birthday);
  const time = /^(\d{1,2}):(\d{2})/.exec(input.birthTime ?? '');
  if (!b || !time || input.utcOffset === null || input.utcOffset === undefined) return null;
  const local = Date.UTC(b.y, b.m - 1, b.d, Number(time[1]), Number(time[2]));
  return new Date(local - input.utcOffset * 3_600_000);
}

const emptyCounts = <K extends string>(keys: K[]): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export function buildProfile(input: AstroInput): AstroProfile {
  const b = parseBirthday(input.birthday);
  const elementCounts = emptyCounts<Element>(['Fire', 'Earth', 'Air', 'Water']);
  const modalityCounts = emptyCounts<Modality>(['Cardinal', 'Fixed', 'Mutable']);
  const base: AstroProfile = {
    level: 'none', sun: null, element: null, modality: null, moon: null, rising: null,
    placements: [], ascendant: null, midheaven: null, houseCusps: [], aspects: [],
    elementCounts, modalityCounts, unlockPrompt: 'Add a birthday to unlock your Sun sign and zodiac profile.',
  };
  if (!b) return base;

  const instant = birthInstant(input);
  const hasPlace = typeof input.latitude === 'number' && typeof input.longitude === 'number';
  const sun = sunSignFor(b.m, b.d);
  const info = signInfo(sun);
  const placements: Placement[] = [];
  let level: ChartLevel = 'basic';
  let ascendant: number | null = null;
  let midheaven: number | null = null;

  if (instant) {
    level = 'planets';
    if (hasPlace) {
      const place = { latitude: input.latitude as number, longitude: input.longitude as number };
      ascendant = ascendantOf(instant, place);
      midheaven = midheavenOf(instant, place);
      level = 'full';
    }
    for (const id of PLANET_IDS) {
      const lon = longitudeOf(id, instant);
      placements.push({
        id, sign: signOf(lon), longitude: lon, degree: degreeInSign(lon),
        house: ascendant === null ? null : houseOf(lon, ascendant),
        retrograde: isRetrograde(id, instant),
      });
    }
  } else {
    // Birthday only: a body's sign is only stated if it cannot have changed during that UTC day.
    const start = new Date(Date.UTC(b.y, b.m - 1, b.d, 0, 0));
    const end = new Date(Date.UTC(b.y, b.m - 1, b.d, 23, 59));
    for (const id of PLANET_IDS) {
      const s0 = signIndexOf(longitudeOf(id, start));
      const s1 = signIndexOf(longitudeOf(id, end));
      // The Sun's sign comes from the zodiac dates themselves, so it is always stated.
      const certain = id === 'sun' || s0 === s1;
      placements.push({
        id, sign: id === 'sun' ? sun : certain ? SIGN_NAMES[s0]! : null,
        longitude: null, degree: null, house: null, retrograde: false,
      });
    }
  }

  const sunPlacement = placements.find((p) => p.id === 'sun');
  if (sunPlacement && instant) sunPlacement.sign = signOf(sunPlacement.longitude as number);
  const sunSign = sunPlacement?.sign ?? sun;

  const countable: (SignName | null)[] = [...placements.filter((p) => !['northNode', 'chiron'].includes(p.id)).map((p) => p.sign)];
  if (ascendant !== null) countable.push(signOf(ascendant));
  for (const sign of countable) {
    if (!sign) continue;
    const meta = signInfo(sign);
    elementCounts[meta.element] += 1;
    modalityCounts[meta.modality] += 1;
  }

  const aspects: ChartAspect[] = [];
  if (instant) {
    const points: { id: PlanetId | 'ascendant'; lon: number }[] = placements.map((p) => ({ id: p.id, lon: p.longitude as number }));
    if (ascendant !== null) points.push({ id: 'ascendant', lon: ascendant });
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]!;
        const c = points[j]!;
        if (a.id === 'northNode' && c.id === 'chiron') continue;
        const scale = a.id === 'sun' || a.id === 'moon' || c.id === 'sun' || c.id === 'moon' ? 1 : 0.75;
        const hit = aspectBetween(a.lon, c.lon, scale);
        if (hit) aspects.push({ a: a.id, b: c.id, aspect: hit.aspect, orb: hit.orb });
      }
    }
    aspects.sort((x, y) => x.orb - y.orb);
  }

  const unlockPrompt =
    level === 'basic' ? RISING_PROMPT
      : level === 'planets' ? 'Add a birthplace (latitude and longitude) to unlock your Rising Sign and houses.'
        : null;

  return {
    level,
    sun: sunSign,
    element: info.element,
    modality: info.modality,
    moon: placements.find((p) => p.id === 'moon')?.sign ?? null,
    rising: ascendant === null ? null : signOf(ascendant),
    placements,
    ascendant,
    midheaven,
    houseCusps: ascendant === null ? [] : Array.from({ length: 12 }, (_, i) => {
      const lon = (ascendant! + i * 30) % 360;
      return { house: i + 1, sign: signOf(lon), longitude: lon };
    }),
    aspects,
    elementCounts,
    modalityCounts,
    unlockPrompt,
  };
}

export { ASPECTS };
