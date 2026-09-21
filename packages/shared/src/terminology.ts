/**
 * Terminology.
 *
 * Systems do not share a vocabulary, and PluralNova should not hand one out.
 * Every user-facing string that would otherwise hard-code "alter" or "fronting"
 * instead carries a token — `{{member}}`, `{{Members}}`, `{{fronting}}` — which
 * is resolved at render time against the account's chosen words.
 *
 * Four token forms are recognised per term:
 *   {{member}}   singular, lower case
 *   {{Member}}   singular, capitalised
 *   {{members}}  plural, lower case
 *   {{Members}}  plural, capitalised
 */

export interface TermDef {
  key: string;
  label: string;
  one: string;
  other: string;
  hint?: string;
  /** Common alternatives offered as one-tap choices in settings. */
  suggestions?: readonly string[][];
}

export const TERMS: readonly TermDef[] = [
  {
    key: 'member',
    label: 'A person in the system',
    one: 'member',
    other: 'members',
    hint: 'Used everywhere a single person in the system is referred to.',
    suggestions: [
      ['member', 'members'],
      ['alter', 'alters'],
      ['headmate', 'headmates'],
      ['part', 'parts'],
      ['resident', 'residents'],
      ['starling', 'starlings'],
    ],
  },
  {
    key: 'system',
    label: 'The group as a whole',
    one: 'system',
    other: 'systems',
    suggestions: [
      ['system', 'systems'],
      ['collective', 'collectives'],
      ['constellation', 'constellations'],
      ['household', 'households'],
      ['crew', 'crews'],
    ],
  },
  {
    key: 'fronting',
    label: 'Being out / in control',
    one: 'fronting',
    other: 'fronting',
    suggestions: [
      ['fronting', 'fronting'],
      ['hosting', 'hosting'],
      ['being out', 'being out'],
      ['driving', 'driving'],
      ['piloting', 'piloting'],
    ],
  },
  {
    key: 'front',
    label: 'The front position',
    one: 'front',
    other: 'fronts',
    suggestions: [
      ['front', 'fronts'],
      ['current', 'currents'],
      ['the wheel', 'the wheel'],
      ['orbit', 'orbits'],
    ],
  },
  {
    key: 'cofronter',
    label: 'Someone fronting alongside',
    one: 'co-fronter',
    other: 'co-fronters',
    suggestions: [
      ['co-fronter', 'co-fronters'],
      ['co-host', 'co-hosts'],
      ['companion', 'companions'],
    ],
  },
  {
    key: 'subsystem',
    label: 'A group inside the system',
    one: 'subsystem',
    other: 'subsystems',
    suggestions: [
      ['subsystem', 'subsystems'],
      ['cluster', 'clusters'],
      ['branch', 'branches'],
      ['wing', 'wings'],
    ],
  },
  {
    key: 'headspace',
    label: 'The inner world',
    one: 'headspace',
    other: 'headspaces',
    suggestions: [
      ['headspace', 'headspaces'],
      ['inner world', 'inner worlds'],
      ['innerscape', 'innerscapes'],
      ['the house', 'the houses'],
    ],
  },
  {
    key: 'journal',
    label: 'Journal',
    one: 'journal',
    other: 'journals',
    suggestions: [
      ['journal', 'journals'],
      ['log', 'logs'],
      ['diary', 'diaries'],
      ['record', 'records'],
    ],
  },
  {
    key: 'switch',
    label: 'Changing who is fronting',
    one: 'switch',
    other: 'switches',
    suggestions: [
      ['switch', 'switches'],
      ['change', 'changes'],
      ['handover', 'handovers'],
      ['transition', 'transitions'],
    ],
  },
  {
    key: 'host',
    label: 'The most frequent fronter',
    one: 'host',
    other: 'hosts',
    suggestions: [
      ['host', 'hosts'],
      ['main', 'mains'],
      ['anchor', 'anchors'],
    ],
  },
];

export type TermOverrides = Record<string, { one?: string; other?: string }>;
export type Terminology = Record<string, { one: string; other: string }>;

const TERMS_BY_KEY = new Map(TERMS.map((t) => [t.key, t]));

/**
 * Tokens are authored against a term's default English forms, so `{{switches}}`
 * has to resolve to the `switch` term even though its plural is not the key
 * plus an "s". This maps every default plural back to its key.
 */
const KEY_BY_DEFAULT_PLURAL = new Map(TERMS.map((t) => [t.other.toLowerCase(), t.key]));

export function defaultTerminology(): Terminology {
  const out: Terminology = {};
  for (const term of TERMS) out[term.key] = { one: term.one, other: term.other };
  return out;
}

/** Overrides are merged over the defaults, so a partial override is always safe. */
export function resolveTerminology(overrides: TermOverrides | null | undefined): Terminology {
  const base = defaultTerminology();
  if (!overrides) return base;
  for (const [key, value] of Object.entries(overrides)) {
    const fallback = TERMS_BY_KEY.get(key);
    if (!fallback) continue;
    const one = value?.one?.trim() || fallback.one;
    const other = value?.other?.trim() || fallback.other || one;
    base[key] = { one, other };
  }
  return base;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Replaces terminology tokens in `text`. Unknown tokens are returned unchanged
 * rather than blanked, so a typo shows up as a visible token instead of a hole.
 */
export function applyTerminology(text: string, terms: Terminology): string {
  if (!text.includes('{{')) return text;
  return text.replace(TOKEN, (match, raw: string) => {
    const resolved = resolveToken(raw, terms);
    return resolved ?? match;
  });
}

function resolveToken(raw: string, terms: Terminology): string | null {
  const capitalised = raw[0] === raw[0]?.toUpperCase();
  const lower = raw.toLowerCase();

  const exact = terms[lower];
  if (exact) return capitalised ? capitalise(exact.one) : exact.one;

  // Plural form, by the term's own default plural first, then by dropping an "s".
  const byPlural = KEY_BY_DEFAULT_PLURAL.get(lower);
  const singular = (byPlural && terms[byPlural]) ?? (lower.endsWith('s') ? terms[lower.slice(0, -1)] : undefined);
  if (singular) return capitalised ? capitalise(singular.other) : singular.other;

  return null;
}

/** Every token form the catalogue and the UI may legally use. */
export function knownTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const term of TERMS) {
    tokens.add(term.key.toLowerCase());
    tokens.add(term.other.toLowerCase());
    tokens.add(`${term.key.toLowerCase()}s`);
  }
  return tokens;
}

/** Every token a string uses — lets tests assert that nothing references a dead term. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => (m[1] ?? '').toLowerCase());
}

export function termLabel(key: string): string {
  return TERMS_BY_KEY.get(key)?.label ?? key;
}
