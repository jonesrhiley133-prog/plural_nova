import { Router } from 'express';
import {
  average,
  bucketByDay,
  bucketByHour,
  bucketByMonth,
  bucketByWeek,
  bucketByWeekday,
  countBy,
  currentStreak,
  dayKey,
  eventMinutes,
  getEmotion,
  getEmotionFamily,
  longestStreak,
  memberFrontingStats,
  topEntries,
  trendOf,
  type FrontEventLike,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { auth, requireAuth } from '../auth/middleware.js';
import { listRecords } from '../db/repository.js';

/**
 * Aggregates.
 *
 * Every number here is a count or an average of something the user recorded.
 * Nothing is inferred, scored or diagnosed, and the response carries the ranges
 * it used so the UI can label a chart honestly rather than implying more
 * certainty than the data supports.
 */

export const statsRouter: Router = Router();
statsRouter.use(requireAuth);

function rangeFrom(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

statsRouter.get(
  '/overview',
  handler((req, res) => {
    const context = auth(req);
    const days = Math.min(365, Math.max(7, Number(req.query['days'] ?? 30)));
    const from = rangeFrom(days);

    const fronts = listRecords('frontEvents', context.scope, {
      limit: 500,
      range: { field: 'startedAt', from },
    }).items as unknown as FrontEventLike[];
    const moods = listRecords('moodEntries', context.scope, {
      limit: 500,
      range: { field: 'recordedAt', from },
    }).items;
    const emotions = listRecords('emotionEntries', context.scope, {
      limit: 500,
      range: { field: 'recordedAt', from },
    }).items;
    const sleep = listRecords('sleepEntries', context.scope, {
      limit: 365,
      range: { field: 'startedAt', from },
    }).items;
    const sensations = listRecords('bodySensations', context.scope, {
      limit: 500,
      range: { field: 'recordedAt', from },
    }).items;
    const journal = listRecords('journalEntries', context.scope, {
      limit: 500,
      range: { field: 'entryDate', from },
    }).items;
    const tasks = listRecords('tasks', context.scope, { limit: 500 }).items;

    const moodScores = moods
      .map((m) => Number(m['score'] ?? 0))
      .filter((score) => score > 0);

    ok(res, {
      rangeDays: days,
      fronting: {
        events: fronts.length,
        totalMinutes: fronts.reduce((sum, event) => sum + eventMinutes(event), 0),
        byDay: bucketByDay(
          fronts.map((event) => ({ at: event.startedAt, value: eventMinutes(event) })),
          Math.min(days, 90),
        ),
        byHour: bucketByHour(fronts.map((event) => ({ at: event.startedAt }))),
        byWeekday: bucketByWeekday(fronts.map((event) => ({ at: event.startedAt }))),
        members: memberFrontingStats(fronts).slice(0, 10),
      },
      mood: {
        entries: moods.length,
        average: Math.round(average(moodScores) * 10) / 10,
        trend: trendOf(moodScores),
        byDay: bucketByDay(
          moods.map((m) => ({ at: String(m['recordedAt']), value: Number(m['score'] ?? 0) })),
          Math.min(days, 90),
        ),
      },
      emotions: {
        entries: emotions.length,
        topFamilies: topEntries(countBy(emotions, (e) => String(e['category'] ?? '')), 6).map((entry) => ({
          ...entry,
          label: getEmotionFamily(entry.key)?.label ?? entry.key,
          color: getEmotionFamily(entry.key)?.color ?? null,
        })),
      },
      sleep: {
        entries: sleep.length,
        averageMinutes: Math.round(average(sleep.map((s) => Number(s['durationMinutes'] ?? 0)))),
        averageQuality:
          Math.round(average(sleep.map((s) => Number(s['quality'] ?? 0)).filter((q) => q > 0)) * 10) / 10,
        averageLatencyMinutes: Math.round(
          average(sleep.map((s) => Number(s['latencyMinutes'] ?? 0)).filter((n) => n > 0)),
        ),
        nightmareNights: sleep.filter((s) => s['nightmares'] === true).length,
        sleepwalkingNights: sleep.filter((s) => s['sleepwalking'] === true).length,
        byDay: bucketByDay(
          sleep.map((s) => ({ at: String(s['startedAt']), value: Number(s['durationMinutes'] ?? 0) })),
          Math.min(days, 90),
        ),
      },
      sensations: {
        entries: sensations.length,
        averageIntensity:
          Math.round(average(sensations.map((s) => Number(s['intensity'] ?? 0)).filter((n) => n > 0)) * 10) / 10,
        topSensations: topEntries(countBy(sensations, (s) => String(s['sensation'] ?? '')), 8),
        topRegions: topEntries(countBy(sensations, (s) => String(s['region'] ?? '')), 8),
        byDay: bucketByDay(
          sensations.map((s) => ({ at: String(s['recordedAt']) })),
          Math.min(days, 90),
        ),
      },
      journal: {
        entries: journal.length,
        streak: currentStreak(journal.map((entry) => String(entry['entryDate']))),
        longestStreak: longestStreak(journal.map((entry) => String(entry['entryDate']))),
      },
      tasks: {
        open: tasks.filter((task) => task['completed'] !== true && task['archived'] !== true).length,
        completed: tasks.filter((task) => task['completed'] === true).length,
        overdue: tasks.filter(
          (task) =>
            task['completed'] !== true &&
            typeof task['dueAt'] === 'string' &&
            task['dueAt'] < new Date().toISOString(),
        ).length,
      },
    });
  }),
);

/** Everything recorded on one day, for the daily summary screen. */
statsRouter.get(
  '/day/:date',
  handler((req, res) => {
    const context = auth(req);
    const date = String(req.params['date']).slice(0, 10);
    const from = new Date(`${date}T00:00:00`).toISOString();
    const to = new Date(new Date(`${date}T00:00:00`).getTime() + 86_400_000).toISOString();

    const inRange = (collection: string, field: string, limit = 200) =>
      listRecords(collection, context.scope, { limit, range: { field, from, to } }).items;

    const fronts = inRange('frontEvents', 'startedAt') as unknown as FrontEventLike[];
    const members = listRecords('members', context.scope, { limit: 500 }).items;
    const byId = new Map(members.map((m) => [m.id, m]));

    const moods = inRange('moodEntries', 'recordedAt');
    const emotions = inRange('emotionEntries', 'recordedAt');
    const sensations = inRange('bodySensations', 'recordedAt');
    const journal = inRange('journalEntries', 'entryDate');
    const sleep = inRange('sleepEntries', 'startedAt', 20);

    ok(res, {
      date,
      insights: dayInsights(context.scope, date, from, { moods, emotions, sensations, journal, sleep, fronts }),
      fronting: fronts.map((event) => ({
        ...event,
        minutes: eventMinutes(event),
        memberName: event.memberId ? ((byId.get(event.memberId)?.['name'] as string) ?? null) : null,
      })),
      moods,
      emotions: emotions.map((entry) => ({
        ...entry,
        emotion: getEmotion(String(entry['emotionId'])) ?? null,
      })),
      sensations,
      journal,
      notes: listRecords('notes', context.scope, { limit: 50, range: { field: 'createdAt', from, to } }).items,
      tasks: listRecords('tasks', context.scope, { limit: 100, range: { field: 'dueAt', from, to } }).items,
      completedTasks: listRecords('tasks', context.scope, {
        limit: 100,
        range: { field: 'completedAt', from, to },
      }).items,
      events: inRange('calendarEvents', 'startsAt'),
      sleep,
      wellness: inRange('wellnessEntries', 'recordedAt', 20),
      fitness: inRange('fitnessEntries', 'performedAt', 50),
      locations: inRange('locationEntries', 'visitedAt', 50),
      shifts: inRange('workShifts', 'startsAt', 20),
    });
  }),
);

/**
 * Observations for one day, each a plain comparison against a trailing
 * fortnight ending the day before — never the day itself, so "today" is
 * never folded into its own baseline. A category only appears once the
 * baseline has at least three entries to compare against, so a quiet
 * comparison never gets more confidence than three data points earn it.
 * These are numbers next to other numbers, not conclusions about anyone.
 */
function dayInsights(
  scope: Parameters<typeof listRecords>[1],
  date: string,
  from: string,
  today: {
    moods: ReturnType<typeof listRecords>['items'];
    emotions: ReturnType<typeof listRecords>['items'];
    sensations: ReturnType<typeof listRecords>['items'];
    journal: ReturnType<typeof listRecords>['items'];
    sleep: ReturnType<typeof listRecords>['items'];
    fronts: FrontEventLike[];
  },
): {
  mood: { today: number; baseline: number } | null;
  emotions: { todayCount: number; baselineCountPerDay: number; todayAverage: number; baselineAverage: number } | null;
  sensations: { todayCount: number; baselineCountPerDay: number } | null;
  fronting: { todayMinutes: number; baselineMinutesPerDay: number } | null;
  sleep: { todayMinutes: number; baselineMinutes: number } | null;
  journalStreak: number;
} {
  const baselineDays = 14;
  const baselineTo = from;
  const baselineFrom = new Date(new Date(from).getTime() - baselineDays * 86_400_000).toISOString();
  const baseline = (collection: string, field: string, limit = 500) =>
    listRecords(collection, scope, { limit, range: { field, from: baselineFrom, to: baselineTo } }).items;

  const baselineMoods = baseline('moodEntries', 'recordedAt');
  const baselineEmotions = baseline('emotionEntries', 'recordedAt');
  const baselineSensations = baseline('bodySensations', 'recordedAt');
  const baselineJournal = baseline('journalEntries', 'entryDate');
  const baselineSleep = baseline('sleepEntries', 'startedAt');
  const baselineFronts = baseline('frontEvents', 'startedAt') as unknown as FrontEventLike[];

  const scored = (rows: ReturnType<typeof listRecords>['items'], field: string) =>
    rows.map((row) => Number(row[field] ?? 0)).filter((value) => value > 0);
  const round1 = (value: number): number => Math.round(value * 10) / 10;

  const todayMoodScores = scored(today.moods, 'score');
  const baselineMoodScores = scored(baselineMoods, 'score');
  const mood =
    todayMoodScores.length > 0 && baselineMoodScores.length >= 3
      ? { today: round1(average(todayMoodScores)), baseline: round1(average(baselineMoodScores)) }
      : null;

  const todayIntensities = scored(today.emotions, 'intensity');
  const baselineIntensities = scored(baselineEmotions, 'intensity');
  const emotionsInsight =
    today.emotions.length > 0 && baselineEmotions.length >= 3
      ? {
          todayCount: today.emotions.length,
          baselineCountPerDay: round1(baselineEmotions.length / baselineDays),
          todayAverage: round1(average(todayIntensities)),
          baselineAverage: round1(average(baselineIntensities)),
        }
      : null;

  const sensationsInsight =
    baselineSensations.length >= 3
      ? { todayCount: today.sensations.length, baselineCountPerDay: round1(baselineSensations.length / baselineDays) }
      : null;

  const todayFrontMinutes = today.fronts.reduce((sum, event) => sum + eventMinutes(event), 0);
  const baselineFrontMinutes = baselineFronts.reduce((sum, event) => sum + eventMinutes(event), 0);
  const fronting =
    baselineFronts.length >= 3
      ? { todayMinutes: todayFrontMinutes, baselineMinutesPerDay: Math.round(baselineFrontMinutes / baselineDays) }
      : null;

  const todaySleepMinutes = today.sleep.reduce((sum, entry) => sum + Number(entry['durationMinutes'] ?? 0), 0);
  const baselineSleepMinutes = scored(baselineSleep, 'durationMinutes');
  const sleepInsight =
    today.sleep.length > 0 && baselineSleepMinutes.length >= 3
      ? { todayMinutes: todaySleepMinutes, baselineMinutes: Math.round(average(baselineSleepMinutes)) }
      : null;

  const journalStreak = currentStreak(
    [...baselineJournal, ...today.journal].map((entry) => String(entry['entryDate'])),
    new Date(`${date}T12:00:00`),
  );

  return {
    mood,
    emotions: emotionsInsight,
    sensations: sensationsInsight,
    fronting,
    sleep: sleepInsight,
    journalStreak,
  };
}

/**
 * Emotion insights: which emotions recur, when, and alongside what. Presented
 * as observations about the log, not conclusions about the person.
 */
statsRouter.get(
  '/emotions',
  handler((req, res) => {
    const context = auth(req);
    const days = Math.min(365, Math.max(7, Number(req.query['days'] ?? 90)));
    const entries = listRecords('emotionEntries', context.scope, {
      limit: 500,
      range: { field: 'recordedAt', from: rangeFrom(days) },
    }).items;

    const members = listRecords('members', context.scope, { limit: 500 }).items;
    const memberNames = new Map(members.map((m) => [m.id, m['name'] as string]));
    const intensities = entries.map((entry) => Number(entry['intensity'] ?? 0)).filter((n) => n > 0);

    const byFamily = countBy(entries, (entry) => String(entry['category'] ?? ''));
    const byEmotion = countBy(entries, (entry) => String(entry['emotionId'] ?? ''));
    const byContext = countBy(entries, (entry) => String(entry['context'] ?? '').trim() || null);
    const byActivity = countBy(entries, (entry) => String(entry['activity'] ?? '').trim() || null);
    const byMember = countBy(entries, (entry) => (entry['memberId'] as string) ?? null);

    ok(res, {
      rangeDays: days,
      total: entries.length,
      averageIntensity: Math.round(average(intensities) * 10) / 10,
      intensityTrend: trendOf(intensities),
      topEmotions: topEntries(byEmotion, 12).map((entry) => ({
        ...entry,
        emotion: getEmotion(entry.key) ?? null,
      })),
      families: topEntries(byFamily, 12).map((entry) => ({
        ...entry,
        family: getEmotionFamily(entry.key) ?? null,
      })),
      contexts: topEntries(byContext, 8),
      activities: topEntries(byActivity, 8),
      members: topEntries(byMember, 10).map((entry) => ({
        ...entry,
        name: memberNames.get(entry.key) ?? 'Unattributed',
      })),
      byHour: bucketByHour(entries.map((entry) => ({ at: String(entry['recordedAt']) }))),
      byWeekday: bucketByWeekday(entries.map((entry) => ({ at: String(entry['recordedAt']) }))),
      byDay: bucketByDay(
        entries.map((entry) => ({ at: String(entry['recordedAt']) })),
        Math.min(days, 90),
      ),
    });
  }),
);

statsRouter.get(
  '/finances',
  handler((req, res) => {
    const context = auth(req);
    const months = Math.min(24, Math.max(1, Number(req.query['months'] ?? 6)));
    const from = new Date(Date.now() - months * 31 * 86_400_000).toISOString();

    const transactions = listRecords('transactions', context.scope, {
      limit: 500,
      range: { field: 'occurredAt', from },
    }).items;
    const accounts = listRecords('financeAccounts', context.scope, { limit: 100 }).items;
    const budgets = listRecords('budgets', context.scope, { limit: 100 }).items;

    const income = transactions.filter((t) => Number(t['amount']) > 0);
    const spending = transactions.filter((t) => Number(t['amount']) < 0);
    const thisMonth = dayKey(new Date()).slice(0, 7);

    const balances = accounts.map((account) => {
      const opening = Number(account['openingBalance'] ?? 0);
      const movement = transactions
        .filter((t) => t['accountId'] === account.id)
        .reduce((sum, t) => sum + Number(t['amount'] ?? 0), 0);
      return { accountId: account.id, name: account['name'], balance: opening + movement };
    });

    const spendingByCategory = new Map<string, number>();
    for (const transaction of spending) {
      const key = String(transaction['category'] ?? 'Uncategorised');
      spendingByCategory.set(key, (spendingByCategory.get(key) ?? 0) + Math.abs(Number(transaction['amount'])));
    }

    const incomeByCategory = new Map<string, number>();
    for (const transaction of income) {
      const key = String(transaction['category'] ?? 'Uncategorised');
      incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + Number(transaction['amount']));
    }

    ok(res, {
      months,
      balances,
      totalBalance: balances.reduce((sum, b) => sum + b.balance, 0),
      incomeTotal: income.reduce((sum, t) => sum + Number(t['amount']), 0),
      spendingTotal: spending.reduce((sum, t) => sum + Math.abs(Number(t['amount'])), 0),
      byMonth: bucketByMonth(
        transactions.map((t) => ({ at: String(t['occurredAt']), value: Number(t['amount'] ?? 0) })),
        months,
      ),
      byCategory: [...spendingByCategory.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      incomeByCategory: [...incomeByCategory.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      budgets: budgets.map((budget) => {
        const spent = spending
          .filter(
            (t) =>
              String(t['category']) === String(budget['category']) &&
              String(t['occurredAt']).slice(0, 7) === thisMonth,
          )
          .reduce((sum, t) => sum + Math.abs(Number(t['amount'])), 0);
        const limit = Number(budget['limitAmount'] ?? 0);
        return {
          id: budget.id,
          category: budget['category'],
          limit,
          spent,
          remaining: limit - spent,
          share: limit > 0 ? spent / limit : 0,
        };
      }),
    });
  }),
);

statsRouter.get(
  '/work',
  handler((req, res) => {
    const context = auth(req);
    const weeks = Math.min(52, Math.max(1, Number(req.query['weeks'] ?? 8)));
    const from = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();

    const shifts = listRecords('workShifts', context.scope, {
      limit: 500,
      range: { field: 'startsAt', from },
    }).items;
    const tasks = listRecords('workTasks', context.scope, { limit: 500 }).items;
    const workplaces = listRecords('workplaces', context.scope, { limit: 50 }).items;
    const workplaceById = new Map(workplaces.map((workplace) => [workplace.id, workplace]));

    const minutesOf = (shift: Record<string, unknown>): number => {
      if (!shift['endsAt']) return 0;
      const span =
        (new Date(String(shift['endsAt'])).getTime() - new Date(String(shift['startsAt'])).getTime()) / 60000;
      return Math.max(0, Math.round(span - Number(shift['breakMinutes'] ?? 0)));
    };

    /*
     * A shift's own rate wins when it was given one — a differential or an
     * overtime rate for that day — otherwise it falls back to whatever the
     * workplace normally pays. Either way this is an estimate: PluralNova has
     * no way to know about tax, tips, or a rate that changed mid-shift.
     */
    const rateOf = (shift: Record<string, unknown>): { rate: number; currency: string } | null => {
      const workplace = workplaceById.get(String(shift['workplaceId'] ?? ''));
      const override = Number(shift['wageOverride'] ?? 0);
      const rate = override > 0 ? override : Number(workplace?.['hourlyRate'] ?? 0);
      if (rate <= 0) return null;
      return { rate, currency: String(workplace?.['currency'] || 'USD') };
    };

    const earningsOf = (shift: Record<string, unknown>): number | null => {
      const found = rateOf(shift);
      return found ? Math.round((minutesOf(shift) / 60) * found.rate * 100) / 100 : null;
    };

    const totalMinutes = shifts.reduce((sum, shift) => sum + minutesOf(shift), 0);

    /*
     * A workplace's own hourly rate turns logged hours into pay, but summing
     * across workplaces — or shifts — that pay in different currencies would
     * add pounds to dollars. Each workplace's own estimated earnings are
     * always shown; the combined total and the earnings-over-time buckets
     * below are only ever offered when every paid shift shares a currency.
     */
    const workplaceStats = workplaces.map((workplace) => {
      const own = shifts.filter((shift) => shift['workplaceId'] === workplace.id);
      const minutes = own.reduce((sum, shift) => sum + minutesOf(shift), 0);
      const rate = Number(workplace['hourlyRate'] ?? 0);
      const currency = String(workplace['currency'] || 'USD');
      // Summed per shift, not (total minutes × workplace rate), so a shift's
      // own override actually changes what it contributes here too.
      const earningsFromShifts = own.reduce((sum, shift) => sum + (earningsOf(shift) ?? 0), 0);
      const anyRate = rate > 0 || own.some((shift) => Number(shift['wageOverride'] ?? 0) > 0);
      return {
        id: workplace.id,
        name: workplace['name'],
        minutes,
        earnings: anyRate ? Math.round(earningsFromShifts * 100) / 100 : null,
        currency: anyRate ? currency : null,
      };
    });
    const currencies = new Set(
      shifts.map((shift) => rateOf(shift)?.currency).filter((currency): currency is string => Boolean(currency)),
    );
    const singleCurrency = currencies.size === 1 ? [...currencies][0]! : null;
    const paidShifts = singleCurrency ? shifts.filter((shift) => rateOf(shift) !== null) : [];
    const months = Math.max(1, Math.ceil(weeks / 4.345));

    ok(res, {
      weeks,
      shiftCount: shifts.length,
      totalMinutes,
      averageShiftMinutes: shifts.length ? Math.round(totalMinutes / shifts.length) : 0,
      earnings: singleCurrency
        ? Math.round(workplaceStats.reduce((sum, w) => sum + (w.earnings ?? 0), 0) * 100) / 100
        : null,
      earningsCurrency: singleCurrency,
      byDay: bucketByDay(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
        Math.min(weeks * 7, 90),
      ),
      byWeek: bucketByWeek(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
        weeks,
      ),
      byMonth: bucketByMonth(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
        months,
      ),
      byWeekday: bucketByWeekday(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
      ),
      earningsByDay: singleCurrency
        ? bucketByDay(
            paidShifts.map((shift) => ({ at: String(shift['startsAt']), value: earningsOf(shift) ?? 0 })),
            Math.min(weeks * 7, 90),
          )
        : null,
      earningsByWeek: singleCurrency
        ? bucketByWeek(
            paidShifts.map((shift) => ({ at: String(shift['startsAt']), value: earningsOf(shift) ?? 0 })),
            weeks,
          )
        : null,
      earningsByMonth: singleCurrency
        ? bucketByMonth(
            paidShifts.map((shift) => ({ at: String(shift['startsAt']), value: earningsOf(shift) ?? 0 })),
            months,
          )
        : null,
      workplaces: workplaceStats,
      tasks: {
        open: tasks.filter((task) => task['completed'] !== true).length,
        completed: tasks.filter((task) => task['completed'] === true).length,
      },
    });
  }),
);

statsRouter.get(
  '/fitness',
  handler((req, res) => {
    const context = auth(req);
    const days = Math.min(365, Math.max(7, Number(req.query['days'] ?? 30)));
    const entries = listRecords('fitnessEntries', context.scope, {
      limit: 500,
      range: { field: 'performedAt', from: rangeFrom(days) },
    }).items;

    ok(res, {
      rangeDays: days,
      sessions: entries.length,
      totalMinutes: entries.reduce((sum, entry) => sum + Number(entry['durationMinutes'] ?? 0), 0),
      totalDistanceKm:
        Math.round(entries.reduce((sum, entry) => sum + Number(entry['distanceKm'] ?? 0), 0) * 10) / 10,
      totalSteps: entries.reduce((sum, entry) => sum + Number(entry['steps'] ?? 0), 0),
      byDay: bucketByDay(
        entries.map((entry) => ({ at: String(entry['performedAt']), value: Number(entry['durationMinutes'] ?? 0) })),
        Math.min(days, 90),
      ),
      activities: topEntries(countBy(entries, (entry) => String(entry['activity'] ?? '')), 8),
      streak: currentStreak(entries.map((entry) => String(entry['performedAt']))),
    });
  }),
);

/** The activity timeline: system history plus the writes that produced it. */
statsRouter.get(
  '/activity',
  handler((req, res) => {
    const context = auth(req);
    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 60)));
    const memberId = typeof req.query['memberId'] === 'string' ? req.query['memberId'] : undefined;
    const eventType = typeof req.query['eventType'] === 'string' ? req.query['eventType'] : undefined;
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;

    const history = listRecords('systemHistory', context.scope, {
      limit,
      sortField: 'occurredAt',
      sortDir: 'desc',
      ...(memberId ? { memberId } : {}),
      filters: { ...(eventType ? { eventType } : {}), ...(category ? { category } : {}) },
      ...(from ? { range: { field: 'occurredAt', from } } : {}),
    });

    const types = listRecords('systemHistory', context.scope, { limit: 500 }).items;
    ok(res, {
      ...history,
      eventTypes: topEntries(countBy(types, (row) => String(row['eventType'] ?? '')), 30),
      categories: topEntries(countBy(types, (row) => String(row['category'] ?? 'other')), 9),
    });
  }),
);
