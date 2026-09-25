import { Router } from 'express';
import { newId, now, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { auth, requireAuth, requireSystemMode } from '../auth/middleware.js';
import { rateLimit } from '../http/rateLimit.js';
import { getDb } from '../db/index.js';
import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
  type Scope,
} from '../db/repository.js';
import { updateUser } from '../auth/users.js';
import {
  createSystem,
  ensureActiveSystem,
  getSystem,
  listSystems,
  refreshMemberCount,
} from '../services/systems.js';
import { historyPhrases, recordHistory } from '../services/history.js';
import { notify } from '../services/notifications.js';
import { publish } from '../realtime/hub.js';
import { checkAchievements } from '../services/achievements.js';
import { migrateLegacyCustomFields } from '../services/customFieldMigration.js';

/**
 * System-level operations: the system profile itself, internal chat, the
 * bulletin board and polls. These share a rule that the generic CRUD layer
 * cannot express on its own — they are internal to one account and must never
 * be reachable from a public surface — so they live together here.
 */

export const systemRouter: Router = Router();
systemRouter.use(requireAuth);

// — System profile ——————————————————————————————————————————

systemRouter.get(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const { system } = ensureActiveSystem(context.user);
    ok(res, {
      system,
      systems: listSystems(context.user.id),
      memberCount: context.scope.systemId
        ? refreshMemberCount(context.user.id, context.scope.systemId)
        : 0,
    });
  }),
);

systemRouter.post(
  '/',
  handler((req, res) => {
    const context = auth(req);
    const body = req.body as { name?: string; description?: string; systemType?: string };
    const system = createSystem(context.user, body);
    ok(res, { system }, 201);
  }),
);

systemRouter.patch(
  '/:id',
  handler((req, res) => {
    const context = auth(req);
    const id = String(req.params['id']);
    const existing = getSystem(context.user.id, id);
    if (!existing) throw notFound('That system');

    const body = req.body as Record<string, unknown>;
    const allowed = [
      'name', 'pronouns', 'description', 'systemType', 'avatarUrl', 'bannerUrl',
      'avatarFocus', 'bannerFocus', 'accent', 'terminology', 'privacy', 'archived',
    ];
    const assignments: string[] = ['"updatedAt" = ?', '"version" = "version" + 1'];
    const params: unknown[] = [now()];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      assignments.push(`"${key}" = ?`);
      const value = body[key];
      params.push(
        ['terminology', 'privacy', 'avatarFocus', 'bannerFocus'].includes(key)
          ? value === null
            ? null
            : JSON.stringify(value)
          : key === 'archived'
            ? value
              ? 1
              : 0
            : value,
      );
    }

    getDb()
      .prepare(`UPDATE "systems" SET ${assignments.join(', ')} WHERE "id" = ? AND "userId" = ?`)
      .run(...params, id, context.user.id);

    recordHistory(context.scope, {
      eventType: 'system.updated',
      summary: historyPhrases.settingChanged('The system profile'),
      entityType: 'systems',
      entityId: id,
    });
    ok(res, { system: getSystem(context.user.id, id) });
  }),
);

systemRouter.post(
  '/:id/activate',
  handler((req, res) => {
    const context = auth(req);
    const id = String(req.params['id']);
    if (!getSystem(context.user.id, id)) throw notFound('That system');
    const user = updateUser(context.user.id, { activeSystemId: id, activeMemberId: null });
    ok(res, { activeSystemId: user.activeSystemId });
  }),
);

// — Profile select ——————————————————————————————————————————

/**
 * Switching the active member changes the default attribution for new records.
 * It is not the same as who is fronting and it is not a second account — the
 * three are kept separate on purpose.
 */
systemRouter.post(
  '/active-member',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const { memberId, pin } = req.body as { memberId?: string | null; pin?: string };

    if (!memberId) {
      const user = updateUser(context.user.id, { activeMemberId: null });
      ok(res, { activeMemberId: user.activeMemberId });
      return;
    }

    const member = getRecord('members', context.scope, memberId);
    if (!member) throw notFound('That member');

    const pinHash = member['pinHash'] as string | null;
    if (pinHash && context.settings.privacy.requireProfilePins) {
      const { verifySecret } = await import('../auth/passwords.js');
      const [salt = '', hash = ''] = pinHash.split(':');
      if (!(await verifySecret(pin ?? '', { hash, salt }))) {
        throw badRequest('That PIN is not right.');
      }
    }

    const user = updateUser(context.user.id, { activeMemberId: memberId });
    ok(res, { activeMemberId: user.activeMemberId, member });
  }),
);

systemRouter.post(
  '/members/:id/pin',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const { pin } = req.body as { pin?: string };
    const member = getRecord('members', context.scope, String(req.params['id']));
    if (!member) throw notFound('That member');

    if (!pin) {
      updateRecord('members', context.scope, member.id, { pinHash: '' });
      ok(res, { configured: false });
      return;
    }
    if (pin.length < 4) throw badRequest('Choose a PIN of at least 4 characters.');

    const { hashSecret } = await import('../auth/passwords.js');
    const hashed = await hashSecret(pin);
    updateRecord('members', context.scope, member.id, { pinHash: `${hashed.salt}:${hashed.hash}` });
    ok(res, { configured: true });
  }),
);

// — System chat —————————————————————————————————————————————
//
// Threads replaced the old single shared room with named channels (see the
// boot-time backfill in db/index.ts): a thread is either `system` (the one
// default, everyone), `group` (a named subset of members) or `direct` (one
// other member). There is exactly one `system`-kind thread per account,
// auto-created the first time it is needed.

const systemChatSendLimiter = rateLimit({
  max: 60,
  windowMs: 60_000,
  message: 'Sending too many messages. Slow down for a moment.',
});

function resolveMembers(
  scope: Scope,
  ids: string[],
): Record<string, unknown>[] {
  return ids
    .map((id) => getRecord('members', scope, id))
    .filter((member): member is StoredRecord => Boolean(member))
    .map((member) => ({
      id: member.id,
      name: member['name'],
      color: member['color'],
      icon: member['icon'],
      chatPrefix: member['chatPrefix'],
    }));
}

function withParticipants(
  scope: Scope,
  thread: StoredRecord,
): Record<string, unknown> {
  const ids = (thread['participantMemberIds'] as string[]) ?? [];
  return {
    ...thread,
    participants: resolveMembers(scope, ids),
    unread: Boolean(
      thread['lastMessageAt'] &&
        (!thread['lastReadAt'] || (thread['lastReadAt'] as string) < (thread['lastMessageAt'] as string)),
    ),
  };
}

function ensureDefaultThread(scope: Scope): StoredRecord {
  const existing = listRecords('systemChatThreads', scope, { limit: 1, filters: { kind: 'system' } }).items[0];
  if (existing) return existing;
  return createRecord(
    'systemChatThreads',
    scope,
    {
      kind: 'system',
      name: 'General',
      participantMemberIds: [],
      pinned: false,
      muted: false,
      archived: false,
      settings: null,
    },
    { visibility: 'system' },
  );
}

systemRouter.get(
  '/chat/threads',
  handler((req, res) => {
    const context = requireSystemMode(req);
    ensureDefaultThread(context.scope);
    const threads = listRecords('systemChatThreads', context.scope, { limit: 200 })
      .items.filter((thread) => thread['archived'] !== true)
      .sort((a, b) => {
        const pinnedDiff = Number(b['pinned'] === true) - Number(a['pinned'] === true);
        if (pinnedDiff !== 0) return pinnedDiff;
        return String(b['lastMessageAt'] ?? '').localeCompare(String(a['lastMessageAt'] ?? ''));
      })
      .map((thread) => withParticipants(context.scope, thread));
    ok(res, { threads });
  }),
);

/** A group or direct thread — `system` kind is reserved for the one default. */
systemRouter.post(
  '/chat/threads',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const body = req.body as { kind?: 'group' | 'direct'; name?: string; participantMemberIds?: string[] };
    const kind = body.kind === 'direct' ? 'direct' : 'group';
    const participantMemberIds = [...new Set(body.participantMemberIds ?? [])];
    if (participantMemberIds.length === 0) throw badRequest('Choose at least one member.');
    if (kind === 'direct' && participantMemberIds.length !== 1) {
      throw badRequest('A direct chat is with exactly one other member.');
    }

    const participants = resolveMembers(context.scope, participantMemberIds);
    if (participants.length !== participantMemberIds.length) throw notFound('One of those members');

    // Reuse an existing thread with the exact same participants rather than
    // spawning a duplicate every time the same pair or group starts a chat.
    const key = participantMemberIds.slice().sort().join(',');
    const existing = listRecords('systemChatThreads', context.scope, { limit: 200, filters: { kind } }).items.find(
      (thread) => ((thread['participantMemberIds'] as string[]) ?? []).slice().sort().join(',') === key,
    );
    if (existing) {
      ok(res, { thread: withParticipants(context.scope, existing) });
      return;
    }

    const defaultName =
      kind === 'direct'
        ? String(participants[0]?.['name'] ?? 'Direct message')
        : participants.map((member) => member['name']).join(', ').slice(0, 120);

    const thread = createRecord(
      'systemChatThreads',
      context.scope,
      {
        kind,
        name: body.name?.trim() || defaultName,
        participantMemberIds,
        pinned: false,
        muted: false,
        archived: false,
        settings: null,
      },
      { visibility: 'system' },
    );
    publish(context.user.id, { type: 'systemChat.thread.new', threadId: thread.id });
    ok(res, { thread: withParticipants(context.scope, thread) }, 201);
  }),
);

systemRouter.get(
  '/chat/threads/:threadId/messages',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const threadId = String(req.params['threadId']);
    const thread = getRecord('systemChatThreads', context.scope, threadId);
    if (!thread) throw notFound('That conversation');

    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 100)));
    const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
    const result = listRecords('systemChatMessages', context.scope, {
      limit,
      filters: { threadId },
      sortField: 'sentAt',
      sortDir: 'desc',
      ...(before ? { range: { field: 'sentAt', to: before } } : {}),
    });

    // Fetched newest-first for the limit, then reversed so the caller always
    // gets OLD → NEW and can append at the bottom.
    ok(res, {
      threadId,
      thread: withParticipants(context.scope, thread),
      messages: [...result.items].reverse(),
      hasMore: result.items.length === limit,
    });
  }),
);

systemRouter.post(
  '/chat/threads/:threadId/messages',
  systemChatSendLimiter,
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const threadId = String(req.params['threadId']);
    const thread = getRecord('systemChatThreads', context.scope, threadId);
    if (!thread) throw notFound('That conversation');

    const body = req.body as {
      body?: string;
      memberId?: string | null;
      replyToId?: string | null;
      attachmentIds?: string[];
      forwardedFrom?: Record<string, unknown> | null;
    };
    const text = body.body?.trim() ?? '';
    if (!text && (body.attachmentIds?.length ?? 0) === 0) throw badRequest('Write something first.');

    const message = createRecord(
      'systemChatMessages',
      context.scope,
      {
        body: text,
        sentAt: now(),
        threadId,
        replyToId: body.replyToId ?? null,
        attachmentIds: body.attachmentIds ?? [],
        reactions: null,
        forwardedFrom: body.forwardedFrom ?? null,
        edited: false,
      },
      { memberId: body.memberId ?? context.user.activeMemberId, visibility: 'system' },
    );

    const preview = text.slice(0, 120) || 'Sent an attachment';
    updateRecord('systemChatThreads', context.scope, threadId, {
      lastMessageAt: message['sentAt'] as string,
      lastMessagePreview: preview,
    });

    publish(context.user.id, { type: 'systemChat.new', threadId, messageId: message.id });
    if (thread['muted'] !== true) {
      await notify({
        userId: context.user.id,
        category: 'systemChat',
        kind: 'systemChat.new',
        title: `New message in ${String(thread['name'] ?? 'system chat')}`,
        body: preview,
        link: `/chat/system/${threadId}`,
        ...(body.memberId ? { actorMemberId: body.memberId } : {}),
      });
    }
    ok(res, message, 201);
  }),
);

systemRouter.post(
  '/chat/threads/:threadId/read',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const threadId = String(req.params['threadId']);
    if (!getRecord('systemChatThreads', context.scope, threadId)) throw notFound('That conversation');
    updateRecord('systemChatThreads', context.scope, threadId, { lastReadAt: now() });
    ok(res, { read: true });
  }),
);

systemRouter.post(
  '/chat/messages/:id/reactions',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const { emoji, memberId } = req.body as { emoji?: string; memberId?: string };
    const message = getRecord('systemChatMessages', context.scope, String(req.params['id']));
    if (!message) throw notFound('That message');

    const reactions = { ...((message['reactions'] as Record<string, string[]>) ?? {}) };
    const key = (emoji ?? '★').slice(0, 16);
    const who = memberId ?? context.user.activeMemberId ?? 'system';
    const current = new Set(reactions[key] ?? []);
    if (current.has(who)) current.delete(who);
    else current.add(who);
    if (current.size === 0) delete reactions[key];
    else reactions[key] = [...current];

    const updated = updateRecord('systemChatMessages', context.scope, message.id, { reactions });
    const threadId = message['threadId'] as string | null;
    if (threadId) publish(context.user.id, { type: 'reaction.new', threadId, messageId: message.id, kind: 'system' });
    ok(res, updated);
  }),
);

/** Copies a message into one or more other threads, tagged with where it came from. */
systemRouter.post(
  '/chat/messages/:id/forward',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const original = getRecord('systemChatMessages', context.scope, String(req.params['id']));
    if (!original) throw notFound('That message');
    const { threadIds } = req.body as { threadIds?: string[] };
    if (!threadIds?.length) throw badRequest('Choose at least one conversation to forward to.');

    const sourceMember = original['memberId'] ? getRecord('members', context.scope, String(original['memberId'])) : null;
    const forwarded: StoredRecord[] = [];
    for (const threadId of threadIds) {
      if (!getRecord('systemChatThreads', context.scope, threadId)) continue;
      const preview = String(original['body'] ?? '').slice(0, 120) || 'Sent an attachment';
      const message = createRecord(
        'systemChatMessages',
        context.scope,
        {
          body: String(original['body'] ?? ''),
          sentAt: now(),
          threadId,
          replyToId: null,
          attachmentIds: original['attachmentIds'] ?? [],
          reactions: null,
          edited: false,
          forwardedFrom: {
            kind: 'system',
            threadId: original['threadId'] ?? null,
            messageId: original.id,
            senderLabel: (sourceMember?.['name'] as string) ?? 'Someone',
          },
        },
        { memberId: context.user.activeMemberId, visibility: 'system' },
      );
      updateRecord('systemChatThreads', context.scope, threadId, { lastMessageAt: message['sentAt'] as string, lastMessagePreview: preview });
      publish(context.user.id, { type: 'systemChat.new', threadId, messageId: message.id });
      forwarded.push(message);
    }
    if (forwarded.length === 0) throw notFound('Those conversations');
    ok(res, { forwarded }, 201);
  }),
);

// — Polls ———————————————————————————————————————————————————

interface PollOption {
  id: string;
  label: string;
}

systemRouter.get(
  '/polls',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const polls = listRecords('polls', context.scope, { limit: 100 }).items;
    const votes = listRecords('pollVotes', context.scope, { limit: 500 }).items;
    const members = listRecords('members', context.scope, { limit: 500 }).items;
    const memberNames = new Map(members.map((m) => [m.id, m['name'] as string]));

    ok(res, {
      polls: polls.map((poll) => withResults(poll, votes, memberNames)),
    });
  }),
);

/**
 * Tallies a poll. An anonymous poll returns counts only — the voter ids are
 * never included in the response, not hidden by the client.
 */
function withResults(
  poll: StoredRecord,
  votes: StoredRecord[],
  memberNames: Map<string, string>,
): Record<string, unknown> {
  const options = (poll['options'] as PollOption[]) ?? [];
  const mine = votes.filter((vote) => vote['pollId'] === poll.id);
  const anonymous = poll['anonymous'] === true;

  const tally = options.map((option) => {
    const forOption = mine.filter((vote) => ((vote['optionIds'] as string[]) ?? []).includes(option.id));
    return {
      ...option,
      count: forOption.length,
      voters: anonymous
        ? []
        : forOption.map((vote) => ({
            memberId: vote['memberId'],
            name: memberNames.get(String(vote['memberId'])) ?? 'Someone',
            comment: vote['comment'],
          })),
    };
  });

  const total = mine.length;
  return {
    ...poll,
    results: tally.map((option) => ({ ...option, share: total > 0 ? option.count / total : 0 })),
    totalVotes: total,
    isClosed:
      poll['closed'] === true ||
      (typeof poll['closesAt'] === 'string' && poll['closesAt'] !== '' && poll['closesAt'] < now()),
  };
}

systemRouter.post(
  '/polls/:id/vote',
  handler(async (req, res) => {
    const context = requireSystemMode(req);
    const poll = getRecord('polls', context.scope, String(req.params['id']));
    if (!poll) throw notFound('That poll');
    if (poll['closed'] === true) throw conflict('That poll is closed.');
    if (typeof poll['closesAt'] === 'string' && poll['closesAt'] && poll['closesAt'] < now()) {
      throw conflict('That poll has closed.');
    }

    const { optionIds, memberId, comment } = req.body as {
      optionIds?: string[];
      memberId?: string;
      comment?: string;
    };
    const options = (poll['options'] as PollOption[]) ?? [];
    const valid = (optionIds ?? []).filter((id) => options.some((option) => option.id === id));
    if (valid.length === 0) throw badRequest('Choose at least one option.');
    if (poll['multipleChoice'] !== true && valid.length > 1) {
      throw badRequest('This poll takes a single answer.');
    }

    const voter = memberId ?? context.user.activeMemberId ?? null;
    const existing = listRecords('pollVotes', context.scope, {
      limit: 500,
      filters: { pollId: poll.id },
    }).items.find((vote) => (vote['memberId'] ?? null) === voter);

    const vote = existing
      ? updateRecord('pollVotes', context.scope, existing.id, {
          optionIds: valid,
          comment: comment ?? '',
        })
      : createRecord(
          'pollVotes',
          context.scope,
          { pollId: poll.id, optionIds: valid, comment: comment ?? '' },
          { memberId: voter, visibility: 'system' },
        );

    publish(context.user.id, { type: 'poll.updated', pollId: poll.id });
    await notify({
      userId: context.user.id,
      category: 'polls',
      kind: 'poll.voted',
      title: 'A vote was cast',
      body: String(poll['title'] ?? ''),
      link: '/polls',
    });
    await checkAchievements(context.scope);

    const votes = listRecords('pollVotes', context.scope, { limit: 500 }).items;
    const members = listRecords('members', context.scope, { limit: 500 }).items;
    ok(res, {
      vote,
      poll: withResults(poll, votes, new Map(members.map((m) => [m.id, m['name'] as string]))),
    });
  }),
);

systemRouter.post(
  '/polls/:id/close',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const poll = getRecord('polls', context.scope, String(req.params['id']));
    if (!poll) throw notFound('That poll');
    const updated = updateRecord('polls', context.scope, poll.id, { closed: true });
    publish(context.user.id, { type: 'poll.updated', pollId: poll.id });
    ok(res, updated);
  }),
);

// — Trash ———————————————————————————————————————————————————

/** Everything soft-deleted in the last 30 days, so a mistake is recoverable. */
systemRouter.get(
  '/trash',
  handler((req, res) => {
    const context = auth(req);
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const collections = [
      'members', 'journalEntries', 'notes', 'tasks', 'calendarEvents', 'mediaItems',
      'frontEvents', 'contacts', 'stories', 'characters', 'fics', 'resources',
      'dictionaryTerms', 'bulletinPosts', 'polls',
    ];

    const items: Record<string, unknown>[] = [];
    for (const name of collections) {
      const collection = requireCollection(name);
      const rows = listRecords(name, context.scope, { includeDeleted: true, limit: 200 }).items;
      for (const row of rows) {
        if (!row.deletedAt || row.deletedAt < cutoff) continue;
        items.push({
          collection: name,
          collectionLabel: collection.label,
          id: row.id,
          title: row[collection.titleField] ?? 'Untitled',
          deletedAt: row.deletedAt,
          restorableUntil: new Date(new Date(row.deletedAt).getTime() + 30 * 86_400_000).toISOString(),
        });
      }
    }

    items.sort((a, b) => String(b['deletedAt']).localeCompare(String(a['deletedAt'])));
    ok(res, { items, retentionDays: 30 });
  }),
);

systemRouter.post(
  '/members/:id/archive',
  handler((req, res) => {
    const context = requireSystemMode(req);
    const member = getRecord('members', context.scope, String(req.params['id']));
    if (!member) throw notFound('That member');
    const archived = member['archived'] !== true;
    const updated = updateRecord('members', context.scope, member.id, { archived });
    recordHistory(context.scope, {
      eventType: archived ? 'member.archived' : 'member.unarchived',
      summary: `${member['name']} was ${archived ? 'archived' : 'restored to the roster'}`,
      entityType: 'members',
      entityId: member.id,
      memberId: member.id,
    });
    ok(res, updated);
  }),
);

/**
 * Safe to call every time a screen that needs shared custom fields mounts:
 * it only ever does something the first time, for an account that still has
 * the old per-member shape and nothing migrated yet.
 */
systemRouter.post(
  '/custom-fields/migrate',
  handler((req, res) => {
    const context = requireSystemMode(req);
    ok(res, migrateLegacyCustomFields(context.scope));
  }),
);

systemRouter.delete(
  '/:id',
  handler((req, res) => {
    const context = auth(req);
    const id = String(req.params['id']);
    const systems = listSystems(context.user.id);
    if (systems.length <= 1) {
      throw badRequest('This is your only system. Delete the account instead if that is what you mean.');
    }
    if (req.query['confirm'] !== 'delete') {
      throw badRequest('Add ?confirm=delete to remove this system and everything in it.');
    }

    getDb()
      .prepare('UPDATE "systems" SET "deletedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "userId" = ?')
      .run(now(), now(), id, context.user.id);
    if (context.user.activeSystemId === id) {
      const next = systems.find((system) => system['id'] !== id);
      updateUser(context.user.id, { activeSystemId: (next?.['id'] as string) ?? null });
    }
    ok(res, { deleted: true });
  }),
);

export { newId, deleteRecord };
