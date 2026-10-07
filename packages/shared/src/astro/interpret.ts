import type { Placement } from './chart.js';
import type { PlanetId, SignName } from './ephemeris.js';
import { HOUSES, TOPICS, planetInfo, signInfo, type Topic } from './signs.js';
import { cap } from './sky.js';

export interface PlacementReading {
  title: string;
  represents: string;
  inSign: string;
  houseText: string | null;
  topics: { topic: Topic; text: string }[];
  note: string | null;
}

/** Planet → Sign → House → Meaning, in the framing of traditional astrology. */
export function interpretPlacement(id: PlanetId, sign: SignName, house: number | null, retrograde = false): PlacementReading {
  const planet = planetInfo(id);
  const info = signInfo(sign);
  const label = id === 'northNode' ? 'North Node' : cap(id);
  return {
    title: `${label} in ${sign}`,
    represents: `${planet.name} represents ${planet.represents}.`,
    inSign: `In ${sign}: this placement is traditionally associated with ${info.keywords.join(', ')} expression. ${info.summary}`,
    houseText: house ? `In the ${HOUSES[house - 1]!.name}: it traditionally colours ${HOUSES[house - 1]!.theme}.` : null,
    topics: TOPICS.map((topic) => ({ topic, text: `${planet.lens[topic]} ${info.topics[topic]}.` })),
    note: retrograde ? `${planet.name} was retrograde at birth — traditionally read as a more inward or reflective expression of its themes.` : null,
  };
}

export function interpretFromPlacement(p: Placement): PlacementReading | null {
  return p.sign ? interpretPlacement(p.id, p.sign, p.house, p.retrograde) : null;
}
