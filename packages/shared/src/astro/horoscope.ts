import type { SignName } from './ephemeris.js';
import { SIGN_NAMES, ingressesBetween, moonEventsBetween, signOf, longitudeOf } from './ephemeris.js';
import type { AstroProfile } from './chart.js';
import { HOUSES, signInfo, type Element } from './signs.js';
import {
  addDays, cap, noonOf, skyAt, skyEventsBetween, startOfUtcDay, transitsFor,
  type SkyEvent, type Transit,
} from './sky.js';

// ── Deterministic randomness: the same alter + day always reads the same ─────

export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)]!;
const clamp = (n: number, lo = 12, hi = 96): number => Math.max(lo, Math.min(hi, Math.round(n)));

export const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

// ── Text pools ───────────────────────────────────────────────────────────────

const MOON_THEME: Record<SignName, { theme: string; emotional: string }> = {
  Aries: { theme: 'Taking the first step', emotional: 'Impulse + courage' },
  Taurus: { theme: 'Comfort and steadiness', emotional: 'Grounding + sensory ease' },
  Gemini: { theme: 'Curiosity and conversation', emotional: 'Restless thoughts + wit' },
  Cancer: { theme: 'Home, softness and care', emotional: 'Tenderness + memory' },
  Leo: { theme: 'Self-expression and joy', emotional: 'Warmth + pride' },
  Virgo: { theme: 'Tidying the details', emotional: 'Analysis + self-care' },
  Libra: { theme: 'Balance and connection', emotional: 'Harmony + indecision' },
  Scorpio: { theme: 'Depth and honesty', emotional: 'Intensity + privacy' },
  Sagittarius: { theme: 'Perspective and adventure', emotional: 'Optimism + restlessness' },
  Capricorn: { theme: 'Structure and quiet progress', emotional: 'Seriousness + resolve' },
  Aquarius: { theme: 'Space, friends and new ideas', emotional: 'Detachment + originality' },
  Pisces: { theme: 'Recharging and dreaming', emotional: 'Sensitivity + creativity' },
};

type Pool = Record<Element, readonly string[]>;
const POOLS: Record<'relationships' | 'social' | 'creativity' | 'productivity' | 'challenges' | 'opportunities' | 'prompts' | 'activities' | 'messages', Pool> = {
  relationships: {
    Fire: ['Say what you appreciate out loud — warmth travels well today.', 'Give yourself room to communicate honestly, without rushing to win.'],
    Earth: ['Small, dependable gestures say more than grand ones today.', 'Steady presence is a gift; let someone lean on it, or lean on theirs.'],
    Air: ['Conversation is the doorway — ask one curious question and really listen.', 'Share an idea with someone you trust and see what bounces back.'],
    Water: ['Feelings are close to the surface; gentle honesty will land best.', 'Check in softly with someone — you may be reading more than is said.'],
  },
  social: {
    Fire: ['Social energy runs lively; pick the gathering that excites you.', 'You may want company with a spark — or a game and some laughter.'],
    Earth: ['Cosy, familiar company suits you more than a crowd.', 'A shared meal or simple activity is the ideal social shape.'],
    Air: ['Chatty and curious — messages and group threads feel easy.', 'Variety helps: a few short, bright interactions beat one long one.'],
    Water: ['Your social battery may need a gentle pace; one or two close people are plenty.', 'Quiet connection beats noisy company today.'],
  },
  creativity: {
    Fire: ['Start something bold without editing yourself first.', 'Performance, colour and play are favoured themes.'],
    Earth: ['Hands-on making — texture, craft, cooking — feels rewarding.', 'Finish a small piece rather than starting a big one.'],
    Air: ['Brainstorm, write, remix — ideas want to be connected.', 'Collect inspiration and let it sit before shaping it.'],
    Water: ['Dreamy, emotional material is a rich vein — music, poetry, drifting.', 'Let the mood choose the medium.'],
  },
  productivity: {
    Fire: ['Short, motivated bursts will do better than a long grind.', 'Tackle the thing you have been avoiding while momentum is up.'],
    Earth: ['Methodical, step-by-step work is rewarded; make a simple list.', 'Routine is your friend — keep the plan modest and doable.'],
    Air: ['Planning, emails and research flow; protect your focus from tab-hopping.', 'Batch similar small tasks together.'],
    Water: ['Work with your rhythm; leave buffers and avoid over-scheduling.', 'Tasks that feel meaningful will go further than ones that do not.'],
  },
  challenges: {
    Fire: ['Impatience may flare; pause before reacting.', 'It is easy to overcommit — choose one thing.'],
    Earth: ['Resisting a change that might help is the usual trap.', 'Be wary of letting routine harden into rut.'],
    Air: ['Overthinking can crowd out the simple answer.', 'Scattered attention may blur priorities.'],
    Water: ['Absorbing others\' moods is likely; keep your own edges.', 'Feelings may swell larger than the situation; give them time.'],
  },
  opportunities: {
    Fire: ['A chance to lead or to try the thing you have been postponing.', 'Honest enthusiasm can open a door.'],
    Earth: ['Practical progress on something long-term.', 'A reliable person or resource may be closer than you think.'],
    Air: ['A useful conversation or a clever new angle.', 'Learning something small could pay off.'],
    Water: ['Intuition may point somewhere helpful; note what you notice.', 'An act of care could deepen a bond.'],
  },
  prompts: {
    Fire: ['What would I start today if I trusted myself fully?', 'Where am I holding back my real voice?'],
    Earth: ['What small habit is quietly supporting me?', 'What do I need in order to feel safe and rested?'],
    Air: ['What thought keeps repeating, and is it true?', 'Who would I like to talk to, and about what?'],
    Water: ['What am I actually feeling beneath the first feeling?', 'What do I need to release, gently?'],
  },
  activities: {
    Fire: ['Take a brisk walk or dance to one favourite song.', 'Try a short creative sprint — ten minutes, no judging.'],
    Earth: ['Tidy one small space or cook something comforting.', 'Spend ten minutes outside noticing textures.'],
    Air: ['Write a few lines in a journal or message a friend.', 'Read or listen to something that sparks curiosity.'],
    Water: ['Take a warm drink and a quiet break; sketch or listen to music.', 'Journal a few feelings without fixing them.'],
  },
  messages: {
    Fire: ['Your spark is allowed to be warm without being loud.', 'Courage today can be as small as one honest sentence.'],
    Earth: ['Slow and steady is still moving.', 'You are allowed to build things gently.'],
    Air: ['Curiosity is a kind of kindness toward yourself.', 'Not every thought needs an answer today.'],
    Water: ['Your sensitivity is information, not a flaw.', 'Rest is part of the story too.'],
  },
};

const ELEMENT_WEIGHTS: Record<Element, { mental: number; emotional: number; social: number; creative: number; physical: number; reflective: number }> = {
  Fire: { mental: 55, emotional: 55, social: 72, creative: 72, physical: 78, reflective: 38 },
  Earth: { mental: 58, emotional: 45, social: 48, creative: 52, physical: 70, reflective: 55 },
  Air: { mental: 80, emotional: 42, social: 76, creative: 66, physical: 52, reflective: 48 },
  Water: { mental: 48, emotional: 82, social: 44, creative: 74, physical: 42, reflective: 78 },
};

export const ENERGY_KEYS = ['mental', 'emotional', 'social', 'creative', 'physical', 'reflective'] as const;
export type EnergyKey = (typeof ENERGY_KEYS)[number];
export const ENERGY_META: Record<EnergyKey, { emoji: string; label: string; description: string }> = {
  mental: { emoji: '🧠', label: 'Mental', description: 'Focus, thoughtfulness, mental activity' },
  emotional: { emoji: '❤️', label: 'Emotional', description: 'Emotional intensity and sensitivity' },
  social: { emoji: '🗣️', label: 'Social', description: 'Desire for interaction' },
  creative: { emoji: '🎨', label: 'Creative', description: 'Creativity and inspiration' },
  physical: { emoji: '🏃', label: 'Physical', description: 'General activity and energy' },
  reflective: { emoji: '🔮', label: 'Reflective', description: 'Introspection and self-reflection' },
};

// ── Daily ────────────────────────────────────────────────────────────────────

export interface DailyReading {
  date: string;
  headline: string;
  theme: string;
  energy: number;
  energies: Record<EnergyKey, number>;
  emotionalFocus: string;
  emotions: string;
  relationships: string;
  social: string;
  creativity: string;
  productivity: string;
  challenges: string;
  opportunities: string;
  focus: string;
  activity: string;
  prompt: string;
  cosmicMessage: string;
  moon: { phase: string; emoji: string; sign: SignName; illumination: number };
  sunSign: SignName;
  transits: string[];
  personalTransits: Transit[];
}

export interface ReaderKey {
  /** Stable id (e.g. the member id) so a different alter gets a different reading. */
  id: string;
}

export function dailyReading(profile: AstroProfile, reader: ReaderKey, date: Date): DailyReading {
  const sky = skyAt(date);
  const key = dateKey(startOfUtcDay(date));
  const r = rng(hashSeed(`${reader.id}|${key}|daily`));
  const moonSign = sky.moon.sign;
  const moonInfo = signInfo(moonSign);
  const el = moonInfo.element;
  const sunEl = profile.element;

  let energy = 50 + (sky.moon.illumination - 0.5) * 18 + (r() - 0.5) * 24;
  if (sunEl) {
    if (sunEl === el) energy += 8;
    else if ((sunEl === 'Fire' && el === 'Air') || (sunEl === 'Air' && el === 'Fire') || (sunEl === 'Earth' && el === 'Water') || (sunEl === 'Water' && el === 'Earth')) energy += 4;
    else energy -= 2;
  }
  if (profile.moon === moonSign) energy += 4;

  const energies = Object.fromEntries(
    ENERGY_KEYS.map((k) => [k, clamp(ELEMENT_WEIGHTS[el][k] + (r() - 0.5) * 28 + (k === 'reflective' && sky.moon.illumination < 0.25 ? 8 : 0))]),
  ) as Record<EnergyKey, number>;

  const personal = transitsFor(profile, date);
  const transits = skyEventsBetween(startOfUtcDay(date), addDays(startOfUtcDay(date), 1)).map((e) => e.title);
  const retros = sky.planets.filter((p) => p.retrograde && ['mercury', 'venus', 'mars'].includes(p.id)).map((p) => `${cap(p.id)} retrograde in ${p.sign}`);
  transits.unshift(`Moon in ${moonSign}`, `Sun in ${sky.sunSign}`, ...retros);

  const theme = MOON_THEME[moonSign];
  const moonLine = profile.moon === moonSign ? ' The Moon is passing through your own natal Moon sign, which traditionally highlights emotional familiarity.' : '';

  return {
    date: key,
    headline: theme.theme,
    theme: theme.theme,
    energy: clamp(energy, 20, 95),
    energies,
    emotionalFocus: theme.emotional,
    emotions: `With the Moon in ${moonSign}, the traditional emotional tone is ${moonInfo.keywords.join(', ')}.${moonLine}`,
    relationships: pick(POOLS.relationships[el], r),
    social: pick(POOLS.social[el], r),
    creativity: pick(POOLS.creativity[el], r),
    productivity: pick(POOLS.productivity[el], r),
    challenges: pick(POOLS.challenges[el], r),
    opportunities: pick(POOLS.opportunities[el], r),
    focus: `${theme.theme.split(' and ')[0]} — one thing at a time.`,
    activity: pick(POOLS.activities[el], r),
    prompt: pick(POOLS.prompts[el], r),
    cosmicMessage: pick(POOLS.messages[el], r),
    moon: { phase: sky.moon.phase.name, emoji: sky.moon.phase.emoji, sign: moonSign, illumination: sky.moon.illumination },
    sunSign: sky.sunSign,
    transits,
    personalTransits: personal,
  };
}

// ── Weekly ───────────────────────────────────────────────────────────────────

export interface WeeklyReading {
  start: string;
  days: { date: string; weekday: string; moon: string; emoji: string; theme: string; energy: number; important: boolean }[];
  events: SkyEvent[];
  emotional: string;
  relationships: string;
  important: string[];
}

export function weekStart(date: Date): Date {
  const day = startOfUtcDay(date);
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

export function weeklyReading(profile: AstroProfile, reader: ReaderKey, date: Date): WeeklyReading {
  const start = weekStart(date);
  const events = skyEventsBetween(start, addDays(start, 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const daily = dailyReading(profile, reader, d);
    const hasEvent = events.some((e) => dateKey(e.date) === dateKey(d) && (e.kind === 'moon' || e.kind === 'sun'));
    return {
      date: daily.date,
      weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      moon: `${daily.moon.phase} in ${daily.moon.sign}`,
      emoji: daily.moon.emoji,
      theme: daily.theme,
      energy: daily.energy,
      important: hasEvent,
    };
  });
  const midSky = skyAt(addDays(start, 3));
  const el = signInfo(midSky.moon.sign).element;
  const r = rng(hashSeed(`${reader.id}|${dateKey(start)}|weekly`));
  return {
    start: dateKey(start),
    days,
    events,
    emotional: `The week's Moon travels through ${[...new Set(days.map((d) => d.moon.split(' in ')[1]))].join(', ')}. ${pick(POOLS.prompts[el], r)}`,
    relationships: pick(POOLS.relationships[el], r),
    important: days.filter((d) => d.important).map((d) => `${d.weekday} — ${events.filter((e) => dateKey(e.date) === d.date).map((e) => e.title).join(', ')}`),
  };
}

// ── Monthly ──────────────────────────────────────────────────────────────────

export interface MonthlyReading {
  month: string;
  theme: string;
  sunSigns: SignName[];
  transits: SkyEvent[];
  moonPhases: SkyEvent[];
  relationships: string;
  creativity: string;
  schoolWork: string;
  growth: string;
  importantDates: { date: string; title: string }[];
}

export function monthlyReading(profile: AstroProfile, reader: ReaderKey, year: number, month: number): MonthlyReading {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const events = skyEventsBetween(start, end);
  const mid = skyAt(new Date(Date.UTC(year, month - 1, 15)));
  const info = signInfo(mid.sunSign);
  const r = rng(hashSeed(`${reader.id}|${year}-${month}|monthly`));
  const el = info.element;
  const sunSigns = [...new Set([signOf(longitudeOf('sun', noonOf(start))), signOf(longitudeOf('sun', noonOf(addDays(end, -1))))])] as SignName[];
  return {
    month: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    theme: `${info.keywords[0]![0]!.toUpperCase()}${info.keywords[0]!.slice(1)} season: ${info.summary}`,
    sunSigns,
    transits: events.filter((e) => e.kind !== 'moon'),
    moonPhases: events.filter((e) => e.kind === 'moon'),
    relationships: pick(POOLS.relationships[el], r),
    creativity: pick(POOLS.creativity[el], r),
    schoolWork: pick(POOLS.productivity[el], r),
    growth: `${pick(POOLS.prompts[el], r)} ${profile.sun ? `For a ${profile.sun} Sun, ${info.name} season sits in house ${((SIGN_NAMES.indexOf(info.name) - SIGN_NAMES.indexOf(profile.rising ?? profile.sun) + 12) % 12) + 1} (${HOUSES[((SIGN_NAMES.indexOf(info.name) - SIGN_NAMES.indexOf(profile.rising ?? profile.sun) + 12) % 12)]!.theme}).` : ''}`,
    importantDates: events.filter((e) => e.kind === 'moon' && /New|Full/.test(e.title) || e.kind === 'sun').map((e) => ({ date: dateKey(e.date), title: e.title })),
  };
}

// ── Yearly ───────────────────────────────────────────────────────────────────

export interface YearlyReading {
  year: number;
  themes: string[];
  slowTransits: { planet: string; sign: SignName; house: number; houseTheme: string; text: string }[];
  relationships: string;
  growthPeriods: { sign: SignName; range: string }[];
  reflectionPeriods: { sign: SignName; range: string }[];
  events: SkyEvent[];
}

export function yearlyReading(profile: AstroProfile, reader: ReaderKey, year: number): YearlyReading {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const base = profile.rising ?? profile.sun ?? 'Aries';
  const baseIdx = SIGN_NAMES.indexOf(base);
  const mid = skyAt(new Date(Date.UTC(year, 5, 30)));
  const r = rng(hashSeed(`${reader.id}|${year}|yearly`));
  const slow = (['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const).map((p) => {
    const sky = mid.planets.find((x) => x.id === p)!;
    const house = ((SIGN_NAMES.indexOf(sky.sign) - baseIdx + 12) % 12) + 1;
    const flavour = p === 'jupiter' ? 'growth and opportunity' : p === 'saturn' ? 'structure and long-term lessons' : p === 'uranus' ? 'change and surprise' : p === 'neptune' ? 'dreams and idealism' : 'deep transformation';
    return {
      planet: cap(p), sign: sky.sign, house, houseTheme: HOUSES[house - 1]!.theme,
      text: `${cap(p)} moves through ${sky.sign} — traditionally ${flavour} — and falls in your ${HOUSES[house - 1]!.name} (${HOUSES[house - 1]!.theme}).`,
    };
  });
  const sunEl = signInfo(base).element;
  const growth: YearlyReading['growthPeriods'] = [];
  const reflect: YearlyReading['reflectionPeriods'] = [];
  const ingresses = ingressesBetween('sun', addDays(start, -40), addDays(end, 40));
  const fmt = (d: Date): string => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const transitOf = (sign: SignName): string => {
    const k = ingresses.findIndex((x) => x.sign === sign && x.date >= start);
    const entry = ingresses[k];
    return entry ? `${fmt(entry.date)} – ${fmt(ingresses[k + 1]?.date ?? addDays(entry.date, 30))}` : '';
  };
  for (const sign of SIGN_NAMES) {
    const d = Math.abs(SIGN_NAMES.indexOf(sign) - baseIdx) % 12;
    if (d === 4 || d === 8 || d === 0) growth.push({ sign, range: transitOf(sign) });
    if (d === 6 || d === 11 || d === 1) reflect.push({ sign, range: transitOf(sign) });
  }
  return {
    year,
    themes: [
      `Your ${base} chart emphasis meets a year of ${slow[0]!.planet} in ${slow[0]!.sign} and ${slow[1]!.planet} in ${slow[1]!.sign}.`,
      `${sunEl} themes — ${signInfo(base).keywords.join(', ')} — are traditionally your natural home ground.`,
      pick(POOLS.prompts[sunEl], r),
    ],
    slowTransits: slow,
    relationships: pick(POOLS.relationships[sunEl], r),
    growthPeriods: growth,
    reflectionPeriods: reflect,
    events: skyEventsBetween(start, end).filter((e) => e.kind !== 'moon' || /New|Full/.test(e.title)),
  };
}

export { moonEventsBetween };
