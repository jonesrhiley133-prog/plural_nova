import { Router } from 'express';
import {
  coFrontingPairs,
  eventMinutes,
  formatDuration,
  frontTransitions,
  frontingTotals,
  memberFrontingStats,
  newId,
  now,
  type FrontEventLike,
  type StoredRecord,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { auth, requireAuth, requireSystemMode } from '../auth/middleware.js';
import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
  type Scope,
} from '../db/repository.js';
import { getDb, transaction } from '../db/index.js';
import { historyPhrases, recordHistory } from '../services/history.js';
import { checkAchievements } from '../services/achievements.js';
import { notify } from '../services/notifications.js';
import { publish } from '../realtime/hub.js';

/**
 * Fronting.
 *
 * The model is deliberately not "one member is the fronter". A front event has
 * an optional primary member and any number of co-fronters, several events can
 * be open at once, and "nobody" and "someone, unnamed" are both recordable
 * states. Everything else here follows from that.
 */

export const frontingRouter: Router = Router();
frontingRouter.use(requireAuth);

interface FrontRow extends StoredRecord {
  memberId: string | null;
  coFronterIds: string[];
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
}

function activeEvents(scope: Scope): FrontRow[] {
  return listRecords('frontEvents', scope, {
    filters: { endedAt: null },
    sortField: 'startedAt',
    sortDir: 'desc',
    limit: 50,
  }).items as FrontRow[];
}

function memberName(scope: Scope, memberId: string | null): string {
  if (!memberId) return 'Someone';
  const member = getRecord('members', scope, memberId);
  return (member?.['name'] as string) ?? 'Someone';
}

/** Recalculates a member's fronting totals from their events rather than incrementing. */
function refreshMemberTotals(scope: Scope, memberIds: (string | null)[]): void {
  const unique = [...new Set(memberIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const db = getDb();
  const events = listRecords('frontEvents', scope, { limit: 500, sortField: 'startedAt', sortDir: 'desc' })
    .items as FrontRow[];
  const stats = new Map(memberFrontingStats(events).map((s) => [s.memberId, s]));

  const update = db.prepare(
    `UPDATE "members" SET "frontMinutes" = ?, "frontCount" = ?, "lastFrontedAt" = ?, "updatedAt" = ?
     WHERE "id" = ? AND "userId" = ?`,
  );
  for (const id of unique) {
    const stat = stats.get(id);
    update.run(
      stat?.minutes ?? 0,
      stat?.events ?? 0,
      stat?.lastFrontedAt ?? null,
      now(),
      id,
      scope.userId,
    );
  }
}

function setStatuses(scope: Scope, active: FrontRow[]): void {
  const db = getDb();
  const fronting = new Set<string>();
  const coFronting = new Set<string>();
  for (const event of active) {
    if (event.memberId) fronting.add(event.memberId);
    for (const id of event.coFronterIds ?? []) coFronting.add(id);
  }

  const members = listRecords('members', scope, { limit: 500 }).items;
  const update = db.prepare(
    `UPDATE "members" SET "frontStatus" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?`,
  );
  for (const member of members) {
    const id = member.id;
    const wasDormant = member['isDormant'] === true;
    const next = fronting.has(id)
      ? 'fronting'
      : coFronting.has(id)
        ? 'cofronting'
        : wasDormant
          ? 'dormant'
          : member['frontStatus'] === 'fronting' || member['frontStatus'] === 'cofronting'
            ? 'nearby'
            : (member['frontStatus'] as string) ?? 'nearby';
    if (next !== member['frontStatus']) update.run(next, now(), id, scope.userId);
  }
}

function announce(scope: Scope, systemId: string | null): void {
  publish(scope.userId, { type: 'front.changed', systemId: systemId ?? '' });
}

frontingRouter.get(
  '/current',
  handler((req, res) => {
    const context = auth(req);
    const active = activeEvents(context.scope);
    const memberIds = new Set<string>();
    for (const event of active) {
      if (event.memberId) memberIds.add(event.memberId);
      for (const id of event.coFronterIds ?? []) memberIds.add(id);
    }

    const members = listRecords('members', context.scope, { limit: 500 }).items;
    const byId = new Map(members.map((m) => [m.id, m]));
    const recent = listRecords('frontEvents', context.scope, {
      limit: 12,
      sortField: 'startedAt',
      sortDir: 'desc',
    }).items as FrontRow[];

    ok(res, {
      active: active.map((event) => ({
        ...event,
        minutes: eventMinutes(event as FrontEventLike),
        duration: formatDuration(eventMinutes(event as FrontEventLike)),
        member: event.memberId ? byId.get(event.memberId) ?? null : null,
        coFronters: (event.coFronterIds ?? []).map((id) => byId.get(id)).filter(Boolean),
      })),
      fronting: [...memberIds].map((id) => byId.get(id)).filter(Boolean),
      recent: recent.map((event) => ({
        ...event,
        member: event.memberId ? byId.get(event.memberId) ?? null : null,
      })),
      isEmpty: active.length === 0,
      memberCount: members.length,
    });
  }),
);

/**
 * Starts a front.
 *
 * `endOthers` closes anything already open in the same call, which is what a
 * switch is. Without it, opening a second front alongside an existing one is a
 * legitimate co-front and is allowed — but repeating the identical request is
 * not, so the same member cannot be opened twice by a double tap or a replayed
 * offline operation.
 */
frontingRouter.post(
  '/start',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const body = req.body as {
      memberId?: string | null;
      coFronterIds?: string[];
      startedAt?: string;
      note?: string;
      mood?: string;
      location?: string;
      activity?: string;
      tags?: string[];
      endOthers?: boolean;
      unknownFronter?: boolean;
      clientId?: string;
    };

    const open = activeEvents(context.scope);
    const duplicate = open.find(
      (event) =>
        event.memberId === (body.memberId ?? null) &&
        JSON.stringify([...(event.coFronterIds ?? [])].sort()) ===
          JSON.stringify([...(body.coFronterIds ?? [])].sort()),
    );
    if (duplicate && !body.endOthers) {
      throw conflict(
        `${memberName(context.scope, duplicate.memberId)} is already marked as fronting. End that first, or add a co-fronter instead.`,
      );
    }

    const result = transaction(() => {
      if (body.endOthers) {
        for (const event of open) closeEvent(context.scope, event, body.startedAt ?? now());
      }
      return createRecord(
        'frontEvents',
        context.scope,
        {
          coFronterIds: body.coFronterIds ?? [],
          startedAt: body.startedAt ?? now(),
          endedAt: null,
          activity: body.activity ?? '',
          location: body.location ?? '',
          mood: body.mood ?? '',
          note: body.note ?? '',
          tags: body.tags ?? [],
          statusType: (body.coFronterIds?.length ?? 0) > 0 ? 'cofronting' : 'fronting',
          unknownFronter: body.unknownFronter ?? false,
        },
        {
          ...(body.clientId ? { id: `fev_${body.clientId}` } : {}),
          memberId: body.memberId ?? null,
          visibility: 'system',
        },
      );
    });

    const refreshed = activeEvents(context.scope);
    setStatuses(context.scope, refreshed);
    refreshMemberTotals(context.scope, [body.memberId ?? null, ...(body.coFronterIds ?? [])]);

    const name = body.unknownFronter ? 'Someone' : memberName(context.scope, body.memberId ?? null);
    recordHistory(context.scope, {
      eventType: 'front.started',
      summary: historyPhrases.frontStarted(name),
      entityType: 'frontEvents',
      entityId: result.id,
      memberId: body.memberId ?? null,
    });
    announce(context.scope, context.scope.systemId);
    await notify({
      userId: context.user.id,
      category: 'fronting',
      kind: 'front.started',
      title: `${name} is {{fronting}}`,
      body: body.activity ? `Activity: ${body.activity}` : '',
      link: '/fronting',
    });
    await checkAchievements(context.scope);

    ok(res, result, 201);
  }),
);

function closeEvent(scope: Scope, event: FrontRow, endedAt: string): StoredRecord {
  const minutes = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(event.startedAt).getTime()) / 60000),
  );
  return updateRecord('frontEvents', scope, event.id, {
    endedAt,
    durationMinutes: minutes,
  });
}

frontingRouter.post(
  '/end',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const body = req.body as { eventId?: string; endedAt?: string };
    const endedAt = body.endedAt ?? now();

    const open = activeEvents(context.scope);
    const targets = body.eventId ? open.filter((event) => event.id === body.eventId) : open;
    if (targets.length === 0) throw notFound('An open front');

    const closed = transaction(() => targets.map((event) => closeEvent(context.scope, event, endedAt)));
    const remaining = activeEvents(context.scope);
    setStatuses(context.scope, remaining);
    refreshMemberTotals(
      context.scope,
      targets.flatMap((event) => [event.memberId, ...(event.coFronterIds ?? [])]),
    );

    for (const event of closed) {
      recordHistory(context.scope, {
        eventType: 'front.ended',
        summary: historyPhrases.frontEnded(
          memberName(context.scope, (event['memberId'] as string) ?? null),
          formatDuration((event['durationMinutes'] as number) ?? 0),
        ),
        entityType: 'frontEvents',
        entityId: event.id,
        memberId: (event['memberId'] as string) ?? null,
      });
    }
    announce(context.scope, context.scope.systemId);
    ok(res, { ended: closed.length, events: closed });
  }),
);

/** Ends whoever is out and starts someone else, as one operation. */
frontingRouter.post(
  '/switch',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const body = req.body as {
      memberId?: string | null;
      coFronterIds?: string[];
      at?: string;
      note?: string;
      activity?: string;
      mood?: string;
    };
    const at = body.at ?? now();
    const open = activeEvents(context.scope);

    const started = transaction(() => {
      for (const event of open) closeEvent(context.scope, event, at);
      return createRecord(
        'frontEvents',
        context.scope,
        {
          coFronterIds: body.coFronterIds ?? [],
          startedAt: at,
          endedAt: null,
          note: body.note ?? '',
          activity: body.activity ?? '',
          mood: body.mood ?? '',
          statusType: (body.coFronterIds?.length ?? 0) > 0 ? 'cofronting' : 'fronting',
        },
        { memberId: body.memberId ?? null, visibility: 'system' },
      );
    });

    const refreshed = activeEvents(context.scope);
    setStatuses(context.scope, refreshed);
    refreshMemberTotals(context.scope, [
      body.memberId ?? null,
      ...(body.coFronterIds ?? []),
      ...open.map((event) => event.memberId),
    ]);

    const from = open[0] ? memberName(context.scope, open[0].memberId) : 'Nobody';
    const to = memberName(context.scope, body.memberId ?? null);
    recordHistory(context.scope, {
      eventType: 'front.switched',
      summary: `${from} → ${to}`,
      entityType: 'frontEvents',
      entityId: started.id,
      memberId: body.memberId ?? null,
    });
    announce(context.scope, context.scope.systemId);
    await notify({
      userId: context.user.id,
      category: 'fronting',
      kind: 'front.switched',
      title: `${to} is {{fronting}}`,
      body: `Switched from ${from}.`,
      link: '/fronting',
    });
    ok(res, started, 201);
  }),
);

frontingRouter.post(
  '/clear',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const open = activeEvents(context.scope);
    const at = now();
    transaction(() => {
      for (const event of open) closeEvent(context.scope, event, at);
    });
    setStatuses(context.scope, []);
    refreshMemberTotals(context.scope, open.map((event) => event.memberId));
    recordHistory(context.scope, {
      eventType: 'front.cleared',
      summary: historyPhrases.frontCleared(),
    });
    announce(context.scope, context.scope.systemId);
    ok(res, { cleared: open.length });
  }),
);

/** Adds someone to an open front without disturbing who is already there. */
frontingRouter.post(
  '/:id/co-fronters',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const { memberId } = req.body as { memberId?: string };
    if (!memberId) throw badRequest('Say which member to add.');

    const event = getRecord('frontEvents', context.scope, String(req.params['id'])) as FrontRow | null;
    if (!event) throw notFound('That front');

    const next = [...new Set([...(event.coFronterIds ?? []), memberId])].filter(
      (id) => id !== event.memberId,
    );
    const updated = updateRecord('frontEvents', context.scope, event.id, {
      coFronterIds: next,
      statusType: 'cofronting',
    });
    setStatuses(context.scope, activeEvents(context.scope));
    recordHistory(context.scope, {
      eventType: 'front.cofront',
      summary: historyPhrases.coFrontChanged(
        next.map((id) => memberName(context.scope, id)).join(', ') || 'nobody',
      ),
      entityType: 'frontEvents',
      entityId: event.id,
    });
    announce(context.scope, context.scope.systemId);
    ok(res, updated);
  }),
);

frontingRouter.delete(
  '/:id/co-fronters/:memberId',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const event = getRecord('frontEvents', context.scope, String(req.params['id'])) as FrontRow | null;
    if (!event) throw notFound('That front');
    const next = (event.coFronterIds ?? []).filter((id) => id !== req.params['memberId']);
    const updated = updateRecord('frontEvents', context.scope, event.id, {
      coFronterIds: next,
      statusType: next.length > 0 ? 'cofronting' : 'fronting',
    });
    setStatuses(context.scope, activeEvents(context.scope));
    announce(context.scope, context.scope.systemId);
    ok(res, updated);
  }),
);

/** Edits a historical entry, including reopening one that was closed by mistake. */
frontingRouter.patch(
  '/:id',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const body = req.body as Record<string, unknown>;
    const existing = getRecord('frontEvents', context.scope, String(req.params['id'])) as FrontRow | null;
    if (!existing) throw notFound('That front');

    const startedAt = (body['startedAt'] as string) ?? existing.startedAt;
    const endedAt = body['endedAt'] === null ? null : ((body['endedAt'] as string) ?? existing.endedAt);
    if (endedAt && new Date(endedAt) < new Date(startedAt)) {
      throw badRequest('A front cannot end before it started.');
    }

    const updated = updateRecord('frontEvents', context.scope, existing.id, {
      ...body,
      startedAt,
      endedAt,
      durationMinutes: endedAt
        ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000))
        : null,
    });
    setStatuses(context.scope, activeEvents(context.scope));
    refreshMemberTotals(context.scope, [existing.memberId, (body['memberId'] as string) ?? null]);
    announce(context.scope, context.scope.systemId);
    ok(res, updated);
  }),
);

frontingRouter.delete(
  '/:id',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const removed = deleteRecord('frontEvents', context.scope, String(req.params['id']));
    setStatuses(context.scope, activeEvents(context.scope));
    refreshMemberTotals(context.scope, [(removed['memberId'] as string) ?? null]);
    announce(context.scope, context.scope.systemId);
    ok(res, { deleted: true, id: removed.id });
  }),
);

frontingRouter.get(
  '/timeline',
  handler((req, res) => {
    const context = auth(req);
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
    const events = listRecords('frontEvents', context.scope, {
      limit: 500,
      sortField: 'startedAt',
      sortDir: 'desc',
      ...(from || to ? { range: { field: 'startedAt', ...(from ? { from } : {}), ...(to ? { to } : {}) } } : {}),
    });
    ok(res, events);
  }),
);

frontingRouter.get(
  '/stats',
  handler((req, res) => {
    const context = auth(req);
    const days = Math.min(365, Math.max(1, Number(req.query['days'] ?? 30)));
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const events = listRecords('frontEvents', context.scope, {
      limit: 500,
      range: { field: 'startedAt', from },
      sortField: 'startedAt',
      sortDir: 'desc',
    }).items as unknown as FrontEventLike[];

    const members = listRecords('members', context.scope, { limit: 500 }).items;
    const byId = new Map(members.map((m) => [m.id, m]));
    const perMember = memberFrontingStats(events);

    ok(res, {
      rangeDays: days,
      totals: frontingTotals(events),
      members: perMember.map((stat) => ({
        ...stat,
        name: (byId.get(stat.memberId)?.['name'] as string) ?? 'Unknown',
        color: (byId.get(stat.memberId)?.['color'] as string) ?? null,
      })),
      pairs: coFrontingPairs(events).slice(0, 12).map((pair) => ({
        ...pair,
        aName: (byId.get(pair.a)?.['name'] as string) ?? 'Unknown',
        bName: (byId.get(pair.b)?.['name'] as string) ?? 'Unknown',
      })),
      transitions: frontTransitions(events).slice(0, 12).map((t) => ({
        ...t,
        fromName: t.from ? ((byId.get(t.from)?.['name'] as string) ?? 'Unknown') : 'Nobody',
        toName: t.to ? ((byId.get(t.to)?.['name'] as string) ?? 'Unknown') : 'Nobody',
      })),
      events,
    });
  }),
);

export { newId };
