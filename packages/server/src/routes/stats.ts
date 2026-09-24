import { Router } from 'express';
import {
  average,
  bucketByDay,
  bucketByHour,
  bucketByMonth,
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
        byDay: bucketByDay(
          sleep.map((s) => ({ at: String(s['startedAt']), value: Number(s['durationMinutes'] ?? 0) })),
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

    ok(res, {
      date,
      fronting: fronts.map((event) => ({
        ...event,
        minutes: eventMinutes(event),
        memberName: event.memberId ? ((byId.get(event.memberId)?.['name'] as string) ?? null) : null,
      })),
      moods: inRange('moodEntries', 'recordedAt'),
      emotions: inRange('emotionEntries', 'recordedAt').map((entry) => ({
        ...entry,
        emotion: getEmotion(String(entry['emotionId'])) ?? null,
      })),
      sensations: inRange('bodySensations', 'recordedAt'),
      journal: inRange('journalEntries', 'entryDate'),
      notes: listRecords('notes', context.scope, { limit: 50, range: { field: 'createdAt', from, to } }).items,
      tasks: listRecords('tasks', context.scope, { limit: 100, range: { field: 'dueAt', from, to } }).items,
      completedTasks: listRecords('tasks', context.scope, {
        limit: 100,
        range: { field: 'completedAt', from, to },
      }).items,
      events: inRange('calendarEvents', 'startsAt'),
      sleep: inRange('sleepEntries', 'startedAt', 20),
      wellness: inRange('wellnessEntries', 'recordedAt', 20),
      fitness: inRange('fitnessEntries', 'performedAt', 50),
      locations: inRange('locationEntries', 'visitedAt', 50),
      shifts: inRange('workShifts', 'startsAt', 20),
    });
  }),
);

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

    const minutesOf = (shift: Record<string, unknown>): number => {
      if (!shift['endsAt']) return 0;
      const span =
        (new Date(String(shift['endsAt'])).getTime() - new Date(String(shift['startsAt'])).getTime()) / 60000;
      return Math.max(0, Math.round(span - Number(shift['breakMinutes'] ?? 0)));
    };

    const totalMinutes = shifts.reduce((sum, shift) => sum + minutesOf(shift), 0);

    ok(res, {
      weeks,
      shiftCount: shifts.length,
      totalMinutes,
      averageShiftMinutes: shifts.length ? Math.round(totalMinutes / shifts.length) : 0,
      byDay: bucketByDay(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
        Math.min(weeks * 7, 90),
      ),
      byWeekday: bucketByWeekday(
        shifts.map((shift) => ({ at: String(shift['startsAt']), value: minutesOf(shift) })),
      ),
      workplaces: workplaces.map((workplace) => ({
        id: workplace.id,
        name: workplace['name'],
        minutes: shifts
          .filter((shift) => shift['workplaceId'] === workplace.id)
          .reduce((sum, shift) => sum + minutesOf(shift), 0),
      })),
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
