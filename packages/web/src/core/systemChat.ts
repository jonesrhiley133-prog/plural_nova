import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId, type StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from './api.js';
import { realtime } from './realtime.js';
import { useCollection } from './data.js';
import { useActiveMemberId } from './auth.js';
// A local copy of `ui/Markdown.tsx`'s `MentionMap` shape rather than an
// import from it — `core/` is the data layer and never reaches into `ui/`,
// even for a type-only, one-line shape like this one.
type MentionMap = Record<string, { name: string }>;

/**
 * In-Sys Chat: alter-to-alter conversation, entirely internal to the account.
 *
 * This is a genuinely separate data layer from Messages (see messages.ts),
 * not a shared one branching on a "kind" — different server collections
 * (systemChatThreads/systemChatMessages vs. conversations/messages),
 * different identity (members, never accounts), never encrypted. Nothing
 * here imports, or is imported by, messages.ts; they share only the visual
 * language their components render with.
 */

export type SystemThreadKind = 'system' | 'group' | 'direct';

export interface SystemChatPerson {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  avatarUrl?: string | null;
  prefix?: string | null;
}

export interface SystemChatForwardInfo {
  threadId: string | null;
  messageId: string;
  senderLabel: string;
}

export interface SystemChatThreadSummary {
  id: string;
  kind: SystemThreadKind;
  title: string;
  /** The one other party, for a direct thread. */
  person: SystemChatPerson | null;
  /** Everyone else in it, for a group or the whole-system thread. */
  participants: SystemChatPerson[];
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unread: boolean;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  settings: Record<string, unknown>;
  raw: StoredRecord;
}

export interface SystemChatAttachment {
  id: string;
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  sizeBytes: number;
  title: string;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface SystemChatMessage {
  id: string;
  threadId: string;
  body: string;
  sentAt: string;
  sender: SystemChatPerson | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  attachments: SystemChatAttachment[];
  forwardedFrom: SystemChatForwardInfo | null;
  /**
   * This message's permanent position in the thread, assigned once by the
   * server and never renumbered — the single source of truth for which side
   * it renders on (see `sideForSequence` below). `0` on an optimistic send
   * that hasn't been confirmed yet, which is never a real sequence (the
   * server starts every thread at `1`) and must never be fed to
   * `sideForSequence`; check `pending`/`failed` first.
   */
  sequence: number;
  edited: boolean;
  /** Content redacted in place by a delete — the slot stays, so nothing after it shifts side. */
  removed: boolean;
  clientId?: string;
  pending?: boolean;
  failed?: string;
}

export type MessageSide = 'left' | 'right';

/**
 * Where a message sits in the conversation, derived purely from its position
 * in the thread's permanent sequence — never sender, fronting state, viewer,
 * or how many messages happen to be loaded right now. Message 1 is always
 * left, 2 always right, 3 always left... for the life of the conversation,
 * regardless of who sent what or how it's paginated.
 */
export function sideForSequence(sequence: number): MessageSide {
  return (sequence - 1) % 2 === 0 ? 'left' : 'right';
}

/**
 * Who is currently using the app — the account's "active profile"
 * (`ProfileSelect.tsx`, `useActiveMemberId`), under the name this feature
 * knows it by. It decides which In-Sys Chat threads are even visible (the
 * server filters `GET /api/system/chat/threads` by it) and whose avatar the
 * header shows — never who a given message is sent as, which is its own,
 * separate, per-thread choice (see `sendAsMemberId` below).
 */
export function useActiveChatterId(): string | null {
  return useActiveMemberId();
}

function personFromMember(member: Record<string, unknown> | null | undefined): SystemChatPerson | null {
  if (!member) return null;
  return {
    id: String(member['id']),
    name: String(member['name'] ?? 'Someone'),
    color: (member['color'] as string) ?? null,
    icon: (member['icon'] as string) ?? null,
    avatarUrl: (member['avatarUrl'] as string) ?? null,
    prefix: (member['chatPrefix'] as string) ?? null,
  };
}

function toReactions(raw: unknown): Record<string, string[]> {
  return raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : {};
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document']);

function toAttachments(raw: unknown): SystemChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: String(item['id'] ?? ''),
      url: String(item['url'] ?? ''),
      mediaType: (MEDIA_TYPES.has(String(item['mediaType'])) ? item['mediaType'] : 'document') as SystemChatAttachment['mediaType'],
      mimeType: String(item['mimeType'] ?? ''),
      sizeBytes: Number(item['sizeBytes'] ?? 0),
      title: String(item['title'] ?? ''),
      durationSeconds: item['durationSeconds'] != null ? Number(item['durationSeconds']) : null,
      width: item['width'] != null ? Number(item['width']) : null,
      height: item['height'] != null ? Number(item['height']) : null,
    }))
    .filter((attachment) => attachment.url);
}

/**
 * Oldest first. Confirmed messages sort by their real, permanent `sequence`
 * — never by `sentAt`, which is only a display timestamp and was never the
 * thing guaranteeing order. An optimistic send has no real sequence yet, so
 * it always sorts after every confirmed message (it can only ever be the
 * newest thing in the conversation); among themselves, pending/failed sends
 * fall back to when they were created.
 */
function compareForDisplay(a: SystemChatMessage, b: SystemChatMessage): number {
  const aConfirmed = !a.pending && !a.failed;
  const bConfirmed = !b.pending && !b.failed;
  if (aConfirmed && bConfirmed) return a.sequence - b.sequence;
  if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1;
  return Date.parse(a.sentAt) - Date.parse(b.sentAt);
}

function toForwardedFrom(raw: unknown): SystemChatForwardInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!value['messageId']) return null;
  return {
    threadId: (value['threadId'] as string) ?? null,
    messageId: String(value['messageId']),
    senderLabel: String(value['senderLabel'] ?? 'Someone'),
  };
}

function threadSummary(thread: Record<string, unknown>): SystemChatThreadSummary {
  const participants = ((thread['participants'] as Record<string, unknown>[]) ?? [])
    .map(personFromMember)
    .filter((person): person is SystemChatPerson => Boolean(person));
  const kind = (thread['kind'] as SystemThreadKind) ?? 'system';
  return {
    id: String(thread['id']),
    kind,
    title: String(thread['name'] ?? 'System chat'),
    person: kind === 'direct' ? (participants[0] ?? null) : null,
    participants,
    lastMessageAt: (thread['lastMessageAt'] as string) ?? null,
    lastMessagePreview: String(thread['lastMessagePreview'] ?? ''),
    unread: thread['unread'] === true,
    unreadCount: thread['unread'] === true ? 1 : 0,
    pinned: thread['pinned'] === true,
    muted: thread['muted'] === true,
    archived: thread['archived'] === true,
    settings: (thread['settings'] as Record<string, unknown>) ?? {},
    raw: thread as StoredRecord,
  };
}

/** The list side of In-Sys Chat's home screen: every thread the active chatter can see, refreshed live. */
export function useSystemChatThreads(): {
  threads: SystemChatThreadSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  // The server filters `/chat/threads` by the active chatter, so a switch
  // has to re-fetch here too — otherwise an already-open home screen would
  // keep showing whoever's list it loaded with until the next unrelated
  // realtime event happened to fire.
  const activeChatterId = useActiveChatterId();
  const [threads, setThreads] = useState<SystemChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ threads: Record<string, unknown>[] }>('/api/system/chat/threads');
      setThreads(result.threads.map(threadSummary));
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'systemChat.new' || event.type === 'systemChat.thread.new') void load();
      if (event.type === 'record.changed' && (event.collection === 'systemChatMessages' || event.collection === 'systemChatThreads')) void load();
      if (event.type === 'reaction.new' && event.kind === 'system') void load();
    });
  }, [load, activeChatterId]);

  return { threads, loading, error, reload: load };
}

interface SystemChatConversationState {
  thread: SystemChatThreadSummary | null;
  messages: SystemChatMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  /** Whether the thread has messages older than what's currently loaded. */
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  /**
   * Who "mine" means in this open thread: whichever alter is chosen to send
   * as, defaulting to the active chatter but movable by the composer's "send
   * as" strip for as long as this thread stays open, resetting on opening a
   * different one. Deliberately independent of `useActiveChatterId()` above —
   * composing as someone else here never changes which threads are listed.
   */
  sendAsMemberId: string | null;
  /** `@[m:id]`/`@[g:id]` → live name, server-resolved — see `Markdown.tsx`'s `MentionMap`. `@[u:id]` never resolves here; system chat has no second account. */
  mentions: MentionMap;
}

export interface SendOptions {
  replyToId?: string | null;
  forwardedFrom?: SystemChatForwardInfo | null;
  attachments?: SystemChatAttachment[];
  /** Reuse a previous attempt's id instead of minting a new one — how `retry()` avoids sending a second, server-dedup-defeating copy of the same message. */
  clientId?: string;
}

/** One open In-Sys Chat conversation: loading, live updates, sending, reacting and forwarding. */
export function useSystemChatConversation(
  threadId: string | null,
  viewerMemberId: string | null,
): SystemChatConversationState & {
  send: (text: string, options?: SendOptions) => Promise<void>;
  retry: (message: SystemChatMessage) => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  forward: (messageId: string, targetThreadIds: string[]) => Promise<void>;
  edit: (messageId: string, text: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  markRead: () => void;
  refreshThread: () => Promise<void>;
  loadOlder: () => Promise<void>;
  setSendAsMemberId: (memberId: string | null) => void;
} {
  const members = useCollection('members');

  const [thread, setThread] = useState<SystemChatThreadSummary | null>(null);
  const [rawMessages, setRawMessages] = useState<Record<string, unknown>[]>([]);
  const [mentions, setMentions] = useState<MentionMap>({});
  /** Optimistic sends, kept only until the real row (same clientId) comes back from a reload. */
  const [pending, setPending] = useState<SystemChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [sendAsMemberId, setSendAsMemberId] = useState<string | null>(viewerMemberId);
  useEffect(() => {
    setSendAsMemberId(viewerMemberId);
  }, [threadId, viewerMemberId]);

  const memberFor = useCallback(
    (memberId: string | null | undefined): SystemChatPerson | null =>
      memberId ? personFromMember(members.items.find((member) => member.id === memberId)) : null,
    [members.items],
  );

  const normalize = useCallback(
    (raw: Record<string, unknown>, currentThread: SystemChatThreadSummary | null): SystemChatMessage => {
      const senderMemberId = (raw['memberId'] as string | null) ?? null;
      const sender = memberFor(senderMemberId) ?? (currentThread?.kind === 'direct' ? currentThread.person : null);
      return {
        id: String(raw['id']),
        threadId: String(raw['threadId'] ?? threadId),
        body: String(raw['body'] ?? ''),
        sentAt: String(raw['sentAt']),
        sender,
        replyToId: (raw['replyToId'] as string) ?? null,
        reactions: toReactions(raw['reactions']),
        attachments: toAttachments(raw['attachments']),
        forwardedFrom: toForwardedFrom(raw['forwardedFrom']),
        sequence: Number(raw['sequence'] ?? 0),
        edited: raw['edited'] === true,
        removed: raw['removed'] === true,
        clientId: (raw['clientId'] as string) ?? undefined,
      };
    },
    [threadId, memberFor],
  );

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await api.get<{
        messages: Record<string, unknown>[];
        thread: Record<string, unknown>;
        mentions: MentionMap;
        hasMore: boolean;
      }>(`/api/system/chat/threads/${threadId}/messages`, { limit: 150 });
      setThread(threadSummary(result.thread));
      setRawMessages(result.messages);
      setMentions(result.mentions);
      setHasMoreOlder(result.hasMore);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  /**
   * Fetches the latest page and merges it into what's already loaded, rather
   * than replacing it the way `load()` does — used by the ambient realtime
   * and focus/visibility paths below, where a full replace would silently
   * discard any older history the user had already scrolled up and loaded
   * via `loadOlder()`. Never touches `hasMoreOlder`: this fetch answers "is
   * there more than a page in the thread," not "has pagination reached the
   * beginning yet," which only `loadOlder()` itself can correctly advance.
   */
  const mergeLatest = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await api.get<{
        messages: Record<string, unknown>[];
        thread: Record<string, unknown>;
        mentions: MentionMap;
      }>(`/api/system/chat/threads/${threadId}/messages`, { limit: 150 });
      setThread(threadSummary(result.thread));
      setMentions((current) => ({ ...current, ...result.mentions }));
      setRawMessages((current) => {
        const latestById = new Map(result.messages.map((message) => [String(message['id']), message]));
        const merged = current.map((message) => latestById.get(String(message['id'])) ?? message);
        const currentIds = new Set(current.map((message) => String(message['id'])));
        const appended = result.messages.filter((message) => !currentIds.has(String(message['id'])));
        return [...merged, ...appended];
      });
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    }
  }, [threadId]);

  const loadOlder = useCallback(async () => {
    if (!threadId || loadingOlder || !hasMoreOlder || rawMessages.length === 0) return;
    const oldestSequence = rawMessages[0]?.['sequence'];
    if (oldestSequence == null) return;
    setLoadingOlder(true);
    try {
      const result = await api.get<{ messages: Record<string, unknown>[]; hasMore: boolean }>(
        `/api/system/chat/threads/${threadId}/messages`,
        { limit: 100, before: oldestSequence as number },
      );
      setRawMessages((current) => [...result.messages, ...current]);
      setHasMoreOlder(result.hasMore);
    } catch {
      // Left as-is: hasMoreOlder stays true, so scrolling near the top again
      // simply retries rather than needing a dedicated error/retry affordance.
    } finally {
      setLoadingOlder(false);
    }
  }, [threadId, loadingOlder, hasMoreOlder, rawMessages]);

  // Memoized for the same reason as the Messages equivalent in
  // core/messages.ts: a composer keystroke is local state in the component
  // calling this hook, and shouldn't re-map and re-sort every message in the
  // thread on every key.
  const normalizedMessages = useMemo(() => {
    const list = rawMessages.map((message) => normalize(message, thread));
    const confirmedClientIds = new Set(list.map((message) => message.clientId).filter(Boolean));
    const stillPending = pending.filter((message) => !confirmedClientIds.has(message.clientId));
    return [...list, ...stillPending].sort(compareForDisplay);
  }, [rawMessages, pending, normalize, thread]);

  // Confirmed optimistic sends are only ever hidden by the filter above, not
  // actually dropped from `pending` — so a later action on the real message
  // (deleting it, say) would remove it from `rawMessages` and un-hide its
  // now-stale "Sending…" ghost. This is what actually retires it.
  useEffect(() => {
    const confirmedClientIds = new Set(rawMessages.map((message) => message['clientId']).filter(Boolean));
    setPending((current) => {
      const next = current.filter((message) => !confirmedClientIds.has(message.clientId));
      return next.length === current.length ? current : next;
    });
  }, [rawMessages]);

  useEffect(() => {
    setRawMessages([]);
    setPending([]);
    setThread(null);
    setHasMoreOlder(false);
    setLoading(true);
    void load();
  }, [load]);

  // These two paths use `mergeLatest()`, never `load()` — once the user has
  // scrolled up and loaded older history via `loadOlder()`, a plain reload
  // would silently replace the whole array with just the newest page again,
  // discarding everything older that was already on screen.
  useEffect(
    () =>
      realtime.on((event) => {
        if (!threadId) return;
        if (event.type === 'systemChat.new' && event.threadId === threadId) void mergeLatest();
        // The generic record event carries no threadId, so this reloads on any
        // system chat message deletion rather than just this thread's — an
        // infrequent action, and mergeLatest() is cheap and idempotent either way.
        if (event.type === 'record.changed' && event.collection === 'systemChatMessages') void mergeLatest();
        if (event.type === 'reaction.new' && event.kind === 'system' && event.threadId === threadId) void mergeLatest();
      }),
    [threadId, mergeLatest],
  );

  // A safety net for a conversation left open in a backgrounded tab: realtime
  // events are best-effort, so this re-fetches whenever the tab becomes
  // visible or focused again rather than requiring a reload to see what
  // arrived while it wasn't being watched.
  useEffect(() => {
    const onFocusOrVisible = (): void => {
      if (document.visibilityState === 'hidden') return;
      void mergeLatest();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [mergeLatest]);

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const body = text.trim();
      if ((!body && (options.attachments?.length ?? 0) === 0) || !threadId) return;
      const clientId = options.clientId ?? newId('cli').slice(4);
      const optimistic: SystemChatMessage = {
        id: `pending-${clientId}`,
        threadId,
        body,
        sentAt: new Date().toISOString(),
        sender: memberFor(sendAsMemberId),
        replyToId: options.replyToId ?? null,
        reactions: {},
        attachments: options.attachments ?? [],
        forwardedFrom: options.forwardedFrom ?? null,
        // Never a real sequence (the server starts a thread at 1) — stays
        // pending, so nothing ever reads this for alignment.
        sequence: 0,
        edited: false,
        removed: false,
        clientId,
        pending: true,
      };
      setPending((current) => [...current, optimistic]);
      setSending(true);

      try {
        await api.post(`/api/system/chat/threads/${threadId}/messages`, {
          body,
          clientId,
          memberId: sendAsMemberId,
          replyToId: options.replyToId ?? null,
          attachmentIds: (options.attachments ?? []).map((attachment) => attachment.id),
          forwardedFrom: options.forwardedFrom ?? null,
        });
        await load();
      } catch (cause) {
        setPending((current) =>
          current.map((message) => (message.clientId === clientId ? { ...message, pending: false, failed: messageFor(cause) } : message)),
        );
      } finally {
        setSending(false);
      }
    },
    [threadId, sendAsMemberId, memberFor, load],
  );

  const retry = useCallback(
    async (message: SystemChatMessage) => {
      setPending((current) => current.filter((candidate) => candidate.clientId !== message.clientId));
      await send(message.body, {
        replyToId: message.replyToId,
        forwardedFrom: message.forwardedFrom,
        attachments: message.attachments,
        // Reuses the original attempt's id — if that send actually reached
        // the server the first time and only the response was lost, this
        // resolves back to the message already stored instead of the server
        // seeing a brand-new clientId and creating a duplicate.
        clientId: message.clientId,
      });
    },
    [send],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      const result = await api.post<{ reactions: Record<string, string[]> }>(
        `/api/system/chat/messages/${messageId}/reactions`,
        { emoji, memberId: viewerMemberId },
      );
      setRawMessages((current) =>
        current.map((message) => (String(message['id']) === messageId ? { ...message, reactions: result.reactions } : message)),
      );
    },
    [viewerMemberId],
  );

  const forward = useCallback(async (messageId: string, targetThreadIds: string[]) => {
    await api.post(`/api/system/chat/messages/${messageId}/forward`, { threadIds: targetThreadIds });
  }, []);

  const edit = useCallback(async (messageId: string, text: string) => {
    const body = text.trim();
    await api.patch(`/api/system/chat/messages/${messageId}`, { body });
    setRawMessages((current) =>
      current.map((message) => (String(message['id']) === messageId ? { ...message, body, edited: true } : message)),
    );
  }, []);

  const remove = useCallback(async (messageId: string) => {
    // Redacts in place rather than deleting the row — the message's slot,
    // and so its side, must stay exactly where it was.
    const updated = await api.delete<Record<string, unknown>>(`/api/system/chat/messages/${messageId}`);
    setRawMessages((current) =>
      current.map((message) => (String(message['id']) === messageId ? { ...message, ...updated } : message)),
    );
    setPending((current) => current.filter((message) => message.id !== messageId));
  }, []);

  const markedRead = useRef<string | null>(null);
  const markRead = useCallback(() => {
    if (!threadId || !thread?.unread) return;
    if (markedRead.current === threadId) return;
    markedRead.current = threadId;
    void api.post(`/api/system/chat/threads/${threadId}/read`).catch(() => {
      markedRead.current = null;
    });
  }, [threadId, thread?.unread]);

  return {
    thread,
    messages: normalizedMessages,
    loading,
    error,
    sending,
    hasMoreOlder,
    loadingOlder,
    sendAsMemberId,
    setSendAsMemberId,
    mentions,
    send,
    retry,
    react,
    refreshThread: load,
    loadOlder,
    forward,
    edit,
    remove,
    markRead,
  };
}

/**
 * Uploads a file or a recorded voice clip and returns the attachment object a
 * message carries. Goes through the same `/api/media/upload` endpoint (and so
 * the same media library) as the rest of the app — a photo sent in chat is a
 * media item like any other, not a second, chat-only copy of the concept.
 */
export async function uploadSystemChatAttachment(file: File | Blob, filename: string): Promise<SystemChatAttachment> {
  const contentType = file.type || 'application/octet-stream';
  const result = await api.post<{ id: string; url: string; mediaType: string; sizeBytes: number; title: string }>(
    '/api/media/upload',
    undefined,
    {
      raw: {
        body: file,
        contentType,
        headers: { 'x-file-name': encodeURIComponent(filename).slice(0, 180) },
      },
      timeoutMs: 120_000,
    },
  );
  return {
    id: result.id,
    url: result.url,
    mediaType: (MEDIA_TYPES.has(result.mediaType) ? result.mediaType : 'document') as SystemChatAttachment['mediaType'],
    mimeType: contentType,
    sizeBytes: result.sizeBytes,
    title: result.title,
  };
}

/** Creates (or reuses) a group/direct system chat thread for the given members. */
export async function createSystemThread(input: {
  kind: 'group' | 'direct';
  name?: string;
  participantMemberIds: string[];
}): Promise<SystemChatThreadSummary> {
  const result = await api.post<{ thread: Record<string, unknown> }>('/api/system/chat/threads', input);
  return threadSummary(result.thread);
}

/** Pin, mute, archive, rename and per-conversation appearance all go through this. */
export async function updateSystemChatThread(
  id: string,
  patch: { pinned?: boolean; muted?: boolean; archived?: boolean; settings?: Record<string, unknown>; name?: string },
): Promise<void> {
  await api.patch(`/api/records/systemChatThreads/${id}`, patch);
}

export async function deleteSystemChatThread(id: string): Promise<void> {
  await api.delete(`/api/records/systemChatThreads/${id}`);
}
