import { Router } from 'express';
import {
  average,
  categoriesOf,
  countBy,
  dayKey,
  getEmotionFamily,
  median,
  stdev,
  topEntries,
  variance,
  type FrontEventLike,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { listRecords } from '../db/repository.js';
import { dayInsights } from './stats.js';
import { buildPatternCards, buildPhaseAsOf, cycleLengthSummary, dailyMoodSeries } from '../services/insights.js';

/**
 * Cross-feature relationships. Everything here either compares groups that
 * already exist (a cycle phase, who was around, who was fronting) or two
 * series against each other (sleep and the next day's mood) — nothing is
 * inferred beyond plain averages, a Pearson correlation, and the same
 * small-sample gating `dayInsights` already uses. See `services/insights.ts`
 * for how each pattern is built.
 */

export const insightsRouter: Router = Router();
insightsRouter.use(requireAuth);

const MIN_EVIDENCE = 3;

function rangeFrom(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

insightsRouter.get(
  '/patterns',
  handler((req, res) => {
    const context = auth(req);
    const days = Math.min(730, Math.max(30, Number(req.query['days'] ?? 180)));
    ok(res, { rangeDays: days, patterns: buildPatternCards(context.scope, context.settings, days) });
  }),
);

/**
 * One day, told as a paragraph: the same baseline comparisons the Daily
 * Summary already shows for that day, plus whichever cycle phase was in
 * effect and how today's symptom count compares to the last fortnight —
 * the two signals that did not exist before this redesign. The client
 * composes the sentences; this just gathers the numbers.
 */
insightsRouter.get(
  '/story',
  handler((req, res) => {
    const context = auth(req);
    const date = typeof req.query['date'] === 'string' ? req.query['date'].slice(0, 10) : dayKey(new Date());
    const from = new Date(`${date}T00:00:00`).toISOString();
    const to = new Date(new Date(`${date}T00:00:00`).getTime() + 86_400_000).toISOString();
    const inRange = (collection: string, field: string, limit = 200) =>
      listRecords(collection, context.scope, { limit, range: { field, from, to } }).items;

    const insights = dayInsights(context.scope, date, from, {
      moods: inRange('moodEntries', 'recordedAt'),
      emotions: inRange('emotionEntries', 'recordedAt'),
      sensations: inRange('bodySensations', 'recordedAt'),
      journal: inRange('journalEntries', 'entryDate'),
      sleep: inRange('sleepEntries', 'startedAt', 20),
      fronts: inRange('frontEvents', 'startedAt') as unknown as FrontEventLike[],
    });

    const baselineDays = 14;
    const baselineFrom = new Date(new Date(from).getTime() - baselineDays * 86_400_000).toISOString();
    const todaySymptoms = inRange('symptomEntries', 'recordedAt', 100);
    const baselineSymptoms = listRecords('symptomEntries', context.scope, {
      limit: 500,
      range: { field: 'recordedAt', from: baselineFrom, to: from },
    }).items;
    const symptoms =
      baselineSymptoms.length >= MIN_EVIDENCE
        ? { todayCount: todaySymptoms.length, baselineCountPerDay: Math.round((baselineSymptoms.length / baselineDays) * 10) / 10 }
        : null;

    let cyclePhase: string | null = null;
    if (context.settings.cycleEnabled) {
      const cycleEntries = listRecords('cycleEntries', context.scope, { limit: 2000 }).items;
      cyclePhase = buildPhaseAsOf(cycleEntries)(date);
    }

    ok(res, { date, insights, symptoms, cyclePhase });
  }),
);

/**
 * The long view: nothing here is windowed by a user-chosen range, because
 * the point is the account's own usual — computed fresh on every call, kept
 * nowhere.
 */
insightsRouter.get(
  '/landscape',
  handler((req, res) => {
    const context = auth(req);
    const days = 730;
    const from = rangeFrom(days);

    const moodValues = dailyMoodSeries(context.scope, from).map((item) => item.value);
    const sleep = listRecords('sleepEntries', context.scope, { limit: 2000, range: { field: 'startedAt', from } }).items;
    const sleepMinutes = sleep.map((entry) => Number(entry['durationMinutes'] ?? 0)).filter((n) => n > 0);
    const sleepQuality = sleep.map((entry) => Number(entry['quality'] ?? 0)).filter((n) => n > 0);
    const emotionEntries = listRecords('emotionEntries', context.scope, { limit: 2000, range: { field: 'recordedAt', from } }).items;

    const mood =
      moodValues.length >= MIN_EVIDENCE
        ? {
            average: Math.round(average(moodValues) * 10) / 10,
            median: Math.round(median(moodValues) * 10) / 10,
            variance: Math.round(variance(moodValues) * 10) / 10,
            stdev: Math.round(stdev(moodValues) * 10) / 10,
            count: moodValues.length,
          }
        : null;

    const sleepStats =
      sleepMinutes.length >= MIN_EVIDENCE
        ? {
            averageMinutes: Math.round(average(sleepMinutes)),
            averageQuality: sleepQuality.length > 0 ? Math.round(average(sleepQuality) * 10) / 10 : null,
            stdevMinutes: Math.round(stdev(sleepMinutes)),
            count: sleepMinutes.length,
          }
        : null;

    const familyCounts = countBy(emotionEntries.flatMap((entry) => categoriesOf(entry)), (category) => category || null);
    const [topFamily] = topEntries(familyCounts, 1);
    const topEmotionFamily = topFamily
      ? {
          key: topFamily.key,
          label: getEmotionFamily(topFamily.key)?.label ?? topFamily.key,
          color: getEmotionFamily(topFamily.key)?.color ?? null,
          count: topFamily.count,
        }
      : null;

    let cycle: { averageLengthDays: number | null; cycleCount: number } | null = null;
    if (context.settings.cycleEnabled) {
      const cycleEntries = listRecords('cycleEntries', context.scope, { limit: 2000 }).items;
      cycle = cycleLengthSummary(cycleEntries);
    }

    // Coefficient of variation — stdev as a share of the average — puts a
    // 0-100 mood scale and a minutes-long sleep duration on the same unitless
    // footing, so "steadier" can mean something across two different scales.
    const steadiestArea =
      mood && sleepStats && mood.average > 0 && sleepStats.averageMinutes > 0
        ? mood.stdev / mood.average <= sleepStats.stdevMinutes / sleepStats.averageMinutes
          ? 'mood'
          : 'sleep'
        : null;

    ok(res, { rangeDays: days, mood, sleep: sleepStats, topEmotionFamily, cycle, steadiestArea });
  }),
);
