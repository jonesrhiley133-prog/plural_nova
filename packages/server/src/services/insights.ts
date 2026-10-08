import {
  average,
  averageBy,
  categoriesOf,
  correlation,
  countBy,
  dayKey,
  getEmotionFamily,
  insightConfidence,
  pairByDayOffset,
  topEntries,
  type AppSettings,
  type StoredRecord,
} from '@pluralnova/shared';
import { listRecords } from '../db/repository.js';

/**
 * Pattern cards: one named relationship between two things the account has
 * logged, each a plain sentence with the numbers that produced it. Nothing
 * here is a diagnosis or a cause — it is "what you recorded, next to what
 * else you recorded", the same voice `dayInsights` already uses for a single
 * day, extended across however much history a relationship needs to say
 * anything at all.
 */
export interface PatternCard {
  key: string;
  title: string;
  description: string;
  evidenceCount: number;
  confidence: 'low' | 'moderate' | 'high';
}

type Scope = Parameters<typeof listRecords>[1];
type Row = StoredRecord;

/** Nothing below ever compares groups, or trusts a baseline, with fewer rows than this. */
const MIN_EVIDENCE = 3;

function rangeFrom(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * One mood value per logged moment, drawn from both collections that can
 * carry one: `feelingEntries.mood` as recorded, and any `moodEntries` row
 * that is not itself the legacy copy a check-in already wrote — so a
 * check-in's mood counts once, not twice, while years of mood history logged
 * before `feelingEntries` existed still count at all.
 */
export function dailyMoodSeries(scope: Scope, from: string): { at: string; value: number }[] {
  const feelings = listRecords('feelingEntries', scope, { limit: 2000, range: { field: 'recordedAt', from } }).items;
  const legacyMoodIds = new Set(
    feelings.map((entry) => entry['legacyMoodEntryId']).filter((id): id is string => typeof id === 'string'),
  );
  const moods = listRecords('moodEntries', scope, { limit: 2000, range: { field: 'recordedAt', from } }).items;
  const fromFeelings = feelings.map((entry) => ({ at: String(entry['recordedAt']), value: Number(entry['mood'] ?? 50) }));
  const fromLegacyMoods = moods
    .filter((entry) => !legacyMoodIds.has(entry.id) && Number(entry['score'] ?? 0) > 0)
    .map((entry) => ({ at: String(entry['recordedAt']), value: Number(entry['score']) * 10 }));
  return [...fromFeelings, ...fromLegacyMoods];
}

/**
 * The most recent dated, non-empty `cycleEntries.phase` as of a given day,
 * carried forward — the same as-of lookup `/stats/cycle` and the demo seed
 * already use, rebuilt here rather than imported since each site's starting
 * list of entries is shaped differently.
 */
export function buildPhaseAsOf(cycleEntries: Row[]): (date: string) => string | null {
  const timeline = cycleEntries
    .filter((entry) => typeof entry['phase'] === 'string' && (entry['phase'] as string).trim())
    .map((entry) => ({ date: String(entry['entryDate']), phase: String(entry['phase']) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (date: string): string | null => {
    let found: string | null = null;
    for (const point of timeline) {
      if (point.date > date) break;
      found = point.phase;
    }
    return found;
  };
}

/** Cycle count and average length only — the per-cycle detail lives in `/stats/cycle`. */
export function cycleLengthSummary(cycleEntries: Row[]): { averageLengthDays: number | null; cycleCount: number } {
  const starts = cycleEntries
    .filter((entry) => entry['eventType'] === 'start')
    .map((entry) => String(entry['entryDate']))
    .sort();
  const lengths: number[] = [];
  for (let i = 0; i < starts.length - 1; i += 1) {
    lengths.push(Math.round((Date.parse(`${starts[i + 1]}T00:00:00`) - Date.parse(`${starts[i]}T00:00:00`)) / 86_400_000));
  }
  return { averageLengthDays: lengths.length > 0 ? Math.round(average(lengths)) : null, cycleCount: starts.length };
}

/**
 * The shared shape behind every "average X, grouped by Y" pattern: at least
 * two groups, each with enough rows of its own, reported as the highest
 * against the lowest rather than a full ranking — a card names one contrast,
 * not a leaderboard of every group that qualified.
 */
function rankedPatternFromGroups(
  grouped: Map<string, { average: number; count: number }>,
  labelOf: (key: string) => string,
  phraseFor: (label: string) => string,
  cardKey: string,
  title: string,
  valueLabel: string,
  valueSuffix: string,
): PatternCard | null {
  const groups = [...grouped.entries()]
    .filter(([, stat]) => stat.count >= MIN_EVIDENCE)
    .map(([key, stat]) => ({ label: labelOf(key), average: Math.round(stat.average * 10) / 10, count: stat.count }))
    .sort((a, b) => b.average - a.average);
  if (groups.length < 2) return null;
  const top = groups[0]!;
  const bottom = groups[groups.length - 1]!;
  const evidenceCount = groups.reduce((sum, group) => sum + group.count, 0);
  return {
    key: cardKey,
    title,
    description:
      `Average ${valueLabel} was highest ${phraseFor(top.label)} (${top.average}${valueSuffix}, ${top.count} check-ins) ` +
      `and lowest ${phraseFor(bottom.label)} (${bottom.average}${valueSuffix}, ${bottom.count} check-ins).`,
    evidenceCount,
    confidence: insightConfidence(evidenceCount),
  };
}

const SOCIAL_CONTEXT_LABELS: Record<string, string> = {
  alone: 'alone',
  oneOnOne: 'with one other person',
  smallGroup: 'with a small group',
  crowd: 'in a crowd',
  online: 'online',
};

function moodBySocialContext(feelings: Row[]): PatternCard | null {
  const grouped = averageBy(
    feelings,
    (row) => (row['socialContext'] as string) || null,
    (row) => Number(row['mood'] ?? 50),
  );
  return rankedPatternFromGroups(
    grouped,
    (key) => SOCIAL_CONTEXT_LABELS[key] ?? key,
    (label) => `when ${label}`,
    'mood-by-social-context',
    'Mood and who was around',
    'mood',
    '/100',
  );
}

function moodByActivity(feelings: Row[]): PatternCard | null {
  const grouped = averageBy(
    feelings,
    (row) => String(row['activity'] ?? '').trim() || null,
    (row) => Number(row['mood'] ?? 50),
  );
  return rankedPatternFromGroups(
    grouped,
    (key) => key,
    (label) => `during "${label}"`,
    'mood-by-activity',
    'Mood and activity',
    'mood',
    '/100',
  );
}

function moodByCyclePhase(moodSeries: { at: string; value: number }[], phaseAsOf: (date: string) => string | null): PatternCard | null {
  const grouped = averageBy(
    moodSeries,
    (item) => phaseAsOf(dayKey(item.at)),
    (item) => item.value,
  );
  return rankedPatternFromGroups(
    grouped,
    (key) => key,
    (label) => `during the "${label}" phase`,
    'mood-by-cycle-phase',
    'Mood and cycle phase',
    'mood',
    '/100',
  );
}

/**
 * Deliberately not a leaderboard: who tends to feel worst while fronting is
 * not a useful thing to rank, so members are listed in the system's own
 * order rather than sorted by value, and the sentence names no "highest" or
 * "lowest" — just each member's own number, side by side.
 */
function moodByFrontingMember(feelings: Row[], members: Row[]): PatternCard | null {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of feelings) {
    const mood = Number(row['mood'] ?? 50);
    const present = [row['memberId'], ...((row['frontingMemberIds'] as string[] | undefined) ?? [])].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    for (const id of new Set(present)) {
      const entry = totals.get(id) ?? { sum: 0, count: 0 };
      entry.sum += mood;
      entry.count += 1;
      totals.set(id, entry);
    }
  }
  const parts = members
    .map((member) => ({ name: String(member['name']), stat: totals.get(member.id) }))
    .filter((entry): entry is { name: string; stat: { sum: number; count: number } } => entry.stat !== undefined && entry.stat.count >= MIN_EVIDENCE)
    .map((entry) => `${entry.name} ${Math.round(entry.stat.sum / entry.stat.count)}/100 (${entry.stat.count} check-ins)`);
  if (parts.length < 2) return null;
  const evidenceCount = [...totals.values()].reduce((sum, stat) => sum + stat.count, 0);
  return {
    key: 'mood-by-fronting-member',
    title: 'Mood while fronting',
    description: `Average mood logged while each member was fronting: ${parts.join(', ')}.`,
    evidenceCount,
    confidence: insightConfidence(evidenceCount),
  };
}

/** Sleep quality one night, against mood the following day. */
function moodSleepCorrelation(moodSeries: { at: string; value: number }[], sleep: Row[]): PatternCard | null {
  const sleepSeries = sleep
    .map((entry) => ({ at: String(entry['startedAt']), value: Number(entry['quality'] ?? 0) }))
    .filter((item) => item.value > 0);
  const pairs = pairByDayOffset(sleepSeries, moodSeries, 1);
  const r = correlation(
    pairs.map((pair) => pair.x),
    pairs.map((pair) => pair.y),
  );
  if (r === null || Math.abs(r) < 0.2) return null;
  const direction = r > 0 ? 'tended to be higher' : 'tended to be lower';
  return {
    key: 'mood-sleep-correlation',
    title: 'Mood and the night before’s sleep',
    description:
      `On days after better-rated sleep, mood ${direction} the next day ` +
      `(correlation ${Math.round(r * 100) / 100} of −1 to 1, from ${pairs.length} matched days).`,
    evidenceCount: pairs.length,
    confidence: insightConfidence(pairs.length),
  };
}

/**
 * The shape behind "which sub-category shows up most within each group" —
 * symptoms within a cycle phase, emotion families within a cycle phase.
 * Reports whichever group had the strongest single sub-category by share of
 * that group's own rows, not by raw count, so a phase with more entries
 * overall does not automatically win just for being bigger.
 */
function topWithinGroupPattern(
  rows: { group: string; sub: string | null }[],
  cardKey: string,
  title: string,
  subjectPlural: string,
  groupNoun: string,
  labelOfSub: (key: string) => string,
): PatternCard | null {
  const byGroup = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.sub) continue;
    const list = byGroup.get(row.group) ?? [];
    list.push(row.sub);
    byGroup.set(row.group, list);
  }
  const candidates = [...byGroup.entries()]
    .filter(([, subs]) => subs.length >= MIN_EVIDENCE)
    .map(([group, subs]) => {
      const counts = countBy(subs, (sub) => sub);
      const [top] = topEntries(counts, 1);
      return top ? { group, sub: top.key, count: top.count, total: subs.length, share: top.count / subs.length } : null;
    })
    .filter((item): item is { group: string; sub: string; count: number; total: number; share: number } => item !== null)
    .sort((a, b) => b.share - a.share);
  if (candidates.length === 0) return null;
  const best = candidates[0]!;
  const evidenceCount = [...byGroup.values()].reduce((sum, subs) => sum + subs.length, 0);
  return {
    key: cardKey,
    title,
    description:
      `During the "${best.group}" ${groupNoun}, ${labelOfSub(best.sub)} came up most often among ${subjectPlural} logged then ` +
      `(${best.count} of ${best.total}).`,
    evidenceCount,
    confidence: insightConfidence(evidenceCount),
  };
}

function symptomByCyclePhase(symptoms: Row[], phaseAsOf: (date: string) => string | null): PatternCard | null {
  const rows = symptoms
    .map((entry) => ({ group: phaseAsOf(String(entry['recordedAt'] ?? '').slice(0, 10)), sub: String(entry['name'] ?? '').trim() || null }))
    .filter((row): row is { group: string; sub: string | null } => row.group !== null);
  return topWithinGroupPattern(rows, 'symptom-by-cycle-phase', 'Symptoms and cycle phase', 'symptoms', 'phase', (key) => key);
}

function emotionFamilyByCyclePhase(emotionEntries: Row[], phaseAsOf: (date: string) => string | null): PatternCard | null {
  const rows = emotionEntries.flatMap((entry) => {
    const group = phaseAsOf(String(entry['recordedAt'] ?? '').slice(0, 10));
    if (!group) return [];
    return categoriesOf(entry).map((family) => ({ group, sub: family }));
  });
  return topWithinGroupPattern(
    rows,
    'emotion-family-by-cycle-phase',
    'Emotions and cycle phase',
    'emotions',
    'phase',
    (key) => getEmotionFamily(key)?.label ?? key,
  );
}

/**
 * Every pattern card the account currently has enough evidence for. Each
 * generator reads only what it needs and returns `null` rather than a weak
 * or empty card — the route below just keeps whatever came back.
 */
export function buildPatternCards(scope: Scope, settings: AppSettings, days: number): PatternCard[] {
  const from = rangeFrom(days);
  const feelings = listRecords('feelingEntries', scope, { limit: 2000, range: { field: 'recordedAt', from } }).items;
  const sleep = listRecords('sleepEntries', scope, { limit: 2000, range: { field: 'startedAt', from } }).items;
  const members = listRecords('members', scope, { limit: 500 }).items;
  const moodSeries = dailyMoodSeries(scope, from);

  const cards: (PatternCard | null)[] = [
    moodBySocialContext(feelings),
    moodByActivity(feelings),
    moodByFrontingMember(feelings, members),
    moodSleepCorrelation(moodSeries, sleep),
  ];

  if (settings.cycleEnabled) {
    const cycleEntries = listRecords('cycleEntries', scope, { limit: 2000 }).items;
    const symptoms = listRecords('symptomEntries', scope, { limit: 2000 }).items;
    const emotionEntries = listRecords('emotionEntries', scope, { limit: 2000, range: { field: 'recordedAt', from } }).items;
    const phaseAsOf = buildPhaseAsOf(cycleEntries);
    cards.push(
      moodByCyclePhase(moodSeries, phaseAsOf),
      symptomByCyclePhase(symptoms, phaseAsOf),
      emotionFamilyByCyclePhase(emotionEntries, phaseAsOf),
    );
  }

  return cards.filter((card): card is PatternCard => card !== null);
}
