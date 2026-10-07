import { aspectBetween, type PlanetId, type SignName } from './ephemeris.js';
import type { AstroProfile } from './chart.js';
import { signInfo, type Element } from './signs.js';
import { cap, signRelation } from './sky.js';

/** Words, never numbers: relationships are not Pokémon stats. */
export type Flow = 'flowing' | 'complementary' | 'needs patience';

export interface CompatCategory {
  id: string;
  emoji: string;
  name: string;
  flow: Flow;
  text: string;
}

export interface CompatPair {
  label: string;
  a: string;
  b: string;
  relation: string;
}

export interface SynastryAspect {
  text: string;
  tone: string;
}

export interface CompatResult {
  headline: 'Strong dynamic' | 'Easy flow' | 'Spark and friction' | 'Growth-oriented' | 'Needs patience' | 'Magnetic contrast';
  summary: string;
  pairs: CompatPair[];
  categories: CompatCategory[];
  synastry: SynastryAspect[];
  advanced: boolean;
  advancedPrompt: string | null;
}

const ELEMENT_FIT: Record<Element, Record<Element, Flow>> = {
  Fire: { Fire: 'flowing', Air: 'flowing', Earth: 'needs patience', Water: 'needs patience' },
  Air: { Fire: 'flowing', Air: 'flowing', Earth: 'needs patience', Water: 'complementary' },
  Earth: { Fire: 'needs patience', Air: 'needs patience', Earth: 'flowing', Water: 'flowing' },
  Water: { Fire: 'needs patience', Air: 'complementary', Earth: 'flowing', Water: 'flowing' },
};

const flowOfTone = (tone: string): Flow =>
  tone === 'flowing' || tone === 'supportive' || tone === 'merging' ? 'flowing' : tone === 'challenging' ? 'needs patience' : 'complementary';

const worse = (a: Flow, b: Flow): Flow => {
  const order: Flow[] = ['flowing', 'complementary', 'needs patience'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
};
const score = (f: Flow): number => (f === 'flowing' ? 2 : f === 'complementary' ? 1 : 0);

function flowText(flow: Flow, good: string, mixed: string, hard: string): string {
  return flow === 'flowing' ? good : flow === 'complementary' ? mixed : hard;
}

function pairFlow(a: SignName | null, b: SignName | null): { flow: Flow; relation: string } | null {
  if (!a || !b) return null;
  const rel = signRelation(a, b);
  return { flow: flowOfTone(rel.tone), relation: rel.name };
}

export function compare(me: AstroProfile, other: AstroProfile, names: { me: string; other: string }): CompatResult | null {
  if (!me.sun || !other.sun) return null;
  const sun = pairFlow(me.sun, other.sun)!;
  const moon = pairFlow(me.moon, other.moon);
  const rising = pairFlow(me.rising, other.rising);
  const elFlow = ELEMENT_FIT[signInfo(me.sun).element][signInfo(other.sun).element];
  const modA = signInfo(me.sun).modality;
  const modB = signInfo(other.sun).modality;
  const modFlow: Flow = modA === modB ? 'complementary' : 'flowing';

  const pairs: CompatPair[] = [
    { label: 'Sun ↔ Sun', a: me.sun, b: other.sun, relation: sun.relation },
    ...(moon ? [{ label: 'Moon ↔ Moon', a: me.moon!, b: other.moon!, relation: moon.relation }] : []),
    ...(rising ? [{ label: 'Rising ↔ Rising', a: me.rising!, b: other.rising!, relation: rising.relation }] : []),
    { label: 'Element', a: signInfo(me.sun).element, b: signInfo(other.sun).element, relation: elFlow },
    { label: 'Modality', a: modA, b: modB, relation: modA === modB ? 'shared style' : 'different styles that can balance' },
  ];

  // Cross placements for the richer categories, using whatever is known.
  const venusMars = pairFlow(me.placements.find((p) => p.id === 'venus')?.sign ?? null, other.placements.find((p) => p.id === 'mars')?.sign ?? null);
  const mercury = pairFlow(me.placements.find((p) => p.id === 'mercury')?.sign ?? null, other.placements.find((p) => p.id === 'mercury')?.sign ?? null);
  const sunMoon = pairFlow(me.sun, other.moon) ?? sun;

  const categories: CompatCategory[] = [
    { id: 'emotional', emoji: '❤️', name: 'Emotional Connection', flow: moon?.flow ?? sunMoon.flow,
      text: flowText(moon?.flow ?? sunMoon.flow, 'Feelings tend to be understood quickly between these placements.', 'Emotional styles differ but can balance each other with care.', 'Emotional needs may be expressed differently — patience and naming feelings helps.') },
    { id: 'communication', emoji: '🗣️', name: 'Communication', flow: mercury?.flow ?? worse(sun.flow, 'flowing'),
      text: flowText(mercury?.flow ?? sun.flow, 'Conversation tends to come easily; you may finish each other\'s thoughts.', 'You process and express things in different ways; curiosity bridges it.', 'Communication may require more patience — check what was meant, not just said.') },
    { id: 'friendship', emoji: '🤝', name: 'Friendship', flow: sun.flow,
      text: flowText(sun.flow, 'A natural ease and shared outlook suits friendship.', 'Different strengths can make a well-rounded friendship.', 'Friendship grows through respecting differences.') },
    { id: 'creativity', emoji: '🎨', name: 'Creativity', flow: elFlow,
      text: flowText(elFlow, 'Ideas tend to spark each other.', 'Different creative approaches can complement each other.', 'Creative styles may clash at first, then produce something unexpected.') },
    { id: 'energy', emoji: '🔥', name: 'Energy', flow: venusMars?.flow ?? elFlow,
      text: flowText(venusMars?.flow ?? elFlow, 'Energy levels and pace tend to match.', 'Pace may differ; plan for it.', 'Pacing may differ noticeably — build in room for each.') },
    { id: 'understanding', emoji: '🧠', name: 'Understanding', flow: sunMoon.flow,
      text: flowText(sunMoon.flow, 'There is an intuitive sense of what the other is about.', 'Understanding builds with time and asking.', 'Understanding takes explanation and goodwill.') },
    { id: 'emotionalCompat', emoji: '🌙', name: 'Emotional Compatibility', flow: moon?.flow ?? worse(elFlow, 'flowing'),
      text: moon ? flowText(moon.flow, 'Moon placements support easy emotional rapport.', 'Moon placements balance each other.', 'Moon placements ask for gentle emotional translation.') : 'Add birth times for both to compare Moon signs.' },
  ];

  const synastry: SynastryAspect[] = [];
  const advanced = (me.level === 'planets' || me.level === 'full') && (other.level === 'planets' || other.level === 'full');
  if (advanced) {
    const ids: PlanetId[] = ['sun', 'moon', 'mercury', 'venus', 'mars'];
    for (const x of ids) {
      for (const y of ids) {
        const px = me.placements.find((p) => p.id === x);
        const py = other.placements.find((p) => p.id === y);
        if (!px?.longitude && px?.longitude !== 0) continue;
        if (!py?.longitude && py?.longitude !== 0) continue;
        const hit = aspectBetween(px.longitude, py.longitude, 0.75);
        if (hit) {
          synastry.push({
            tone: hit.aspect.tone,
            text: `${names.me}'s ${cap(x)} ${hit.aspect.glyph} ${names.other}'s ${cap(y)} — ${/^[aeiou]/i.test(hit.aspect.label) ? 'an' : 'a'} ${hit.aspect.label.toLowerCase()} (${hit.orb.toFixed(1)}° orb), traditionally ${hit.aspect.tone}.`,
          });
        }
      }
    }
  }

  const total = categories.reduce((n, c) => n + score(c.flow), 0);
  const hard = categories.filter((c) => c.flow === 'needs patience').length;
  const headline: CompatResult['headline'] =
    total >= 11 ? 'Easy flow' : total >= 8 ? (hard ? 'Strong dynamic' : 'Easy flow') : total >= 6 ? 'Growth-oriented' : sun.relation === 'opposition' ? 'Magnetic contrast' : hard >= 4 ? 'Needs patience' : 'Spark and friction';
  const summaries: Record<CompatResult['headline'], string> = {
    'Strong dynamic': 'Your charts share several complementary placements, while also showing areas where communication may require more patience.',
    'Easy flow': 'Many placements move in the same direction, which traditionally suggests natural ease and shared rhythm.',
    'Growth-oriented': 'This pairing mixes ease and difference; traditionally it is described as one that grows through curiosity and effort.',
    'Magnetic contrast': 'Opposite-style placements can feel both fascinating and frustrating — a classic "seeing yourself in the other" dynamic.',
    'Needs patience': 'Several placements differ in tone. Traditionally, this points to a connection where patience and translation help a lot.',
    'Spark and friction': 'There is a mix of attraction and difference — a lively pairing that benefits from kindness and clear words.',
  };

  return {
    headline,
    summary: `${summaries[headline]} This is a reflective lens, not a verdict on any relationship.`,
    pairs,
    categories,
    synastry: synastry.slice(0, 10),
    advanced,
    advancedPrompt: advanced ? null : 'Add birth time (and offset) for both people to unlock synastry aspects.',
  };
}
