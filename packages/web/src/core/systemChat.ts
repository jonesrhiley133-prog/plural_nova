import { useCallback, useEffect, useRef, useState } from 'react';
import { newId, type StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from './api.js';
import { realtime } from './realtime.js';
import { useCollection } from './data.js';
import { useActiveMemberId } from './auth.js';

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
  isMine: boolean;
  sender: SystemChatPerson | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  attachments: SystemChatAttachment[];
  forwardedFrom: SystemChatForwardInfo | null;
  sequence: number;
  clientId?: string;
  pending?: boolean;
  failed?: string;
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

/** Oldest first, by when a message (or an optimistic send) actually happened; `sequence` only breaks a tie. */
function compareBySentAt(a: SystemChatMessage, b: SystemChatMessage): number {
  const bySentAt = Date.parse(a.sentAt) - Date.parse(b.sentAt);
  return bySentAt !== 0 ? bySentAt : a.sequence - b.sequence;
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
  /**
   * Who "mine" means in this open thread: whichever alter is chosen to send
   * as, defaulting to the active chatter but movable by the composer's "send
   * as" strip for as long as this thread stays open, resetting on opening a
   * different one. Deliberately independent of `useActiveChatterId()` above —
   * composing as someone else here never changes which threads are listed.
   */
  sendAsMemberId: string | null;
}

export interface SendOptions {
  replyToId?: string | null;
  forwardedFrom?: SystemChatForwardInfo | null;
  attachments?: SystemChatAttachment[];
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
  remove: (messageId: string) => Promise<void>;
  markRead: () => void;
  refreshThread: () => Promise<void>;
  setSendAsMemberId: (memberId: string | null) => void;
} {
  const members = useCollection('members');

  const [thread, setThread] = useState<SystemChatThreadSummary | null>(null);
  const [rawMessages, setRawMessages] = useState<Record<string, unknown>[]>([]);
  /** Optimistic sends, kept only until the real row (same clientId) comes back from a reload. */
  const [pending, setPending] = useState<SystemChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
      const isMine = Boolean(sendAsMemberId) && senderMemberId === sendAsMemberId;
      const sender = memberFor(senderMemberId) ?? (currentThread?.kind === 'direct' ? currentThread.person : null);
      return {
        id: String(raw['id']),
        threadId: String(raw['threadId'] ?? threadId),
        body: String(raw['body'] ?? ''),
        sentAt: String(raw['sentAt']),
        isMine,
        sender,
        replyToId: (raw['replyToId'] as string) ?? null,
        reactions: toReactions(raw['reactions']),
        attachments: toAttachments(raw['attachments']),
        forwardedFrom: toForwardedFrom(raw['forwardedFrom']),
        sequence: Number(raw['sequence'] ?? 0),
        clientId: (raw['clientId'] as string) ?? undefined,
      };
    },
    [threadId, memberFor, sendAsMemberId],
  );

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await api.get<{ messages: Record<string, unknown>[]; thread: Record<string, unknown> }>(
        `/api/system/chat/threads/${threadId}/messages`,
        { limit: 150 },
      );
      setThread(threadSummary(result.thread));
      setRawMessages(result.messages);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const normalizedMessages = (() => {
    const list = rawMessages.map((message) => normalize(message, thread));
    const confirmedClientIds = new Set(list.map((message) => message.clientId).filter(Boolean));
    const stillPending = pending.filter((message) => !confirmedClientIds.has(message.clientId));
    return [...list, ...stillPending].sort(compareBySentAt);
  })();

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
    setLoading(true);
    void load();
  }, [load]);

  useEffect(
    () =>
      realtime.on((event) => {
        if (!threadId) return;
        if (event.type === 'systemChat.new' && event.threadId === threadId) void load();
        // The generic record event carries no threadId, so this reloads on any
        // system chat message deletion rather than just this thread's — an
        // infrequent action, and load() is cheap and idempotent either way.
        if (event.type === 'record.changed' && event.collection === 'systemChatMessages') void load();
        if (event.type === 'reaction.new' && event.kind === 'system' && event.threadId === threadId) void load();
      }),
    [threadId, load],
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const body = text.trim();
      if ((!body && (options.attachments?.length ?? 0) === 0) || !threadId) return;
      const clientId = newId('cli').slice(4);
      const optimistic: SystemChatMessage = {
        id: `pending-${clientId}`,
        threadId,
        body,
        sentAt: new Date().toISOString(),
        isMine: true,
        sender: memberFor(sendAsMemberId),
        replyToId: options.replyToId ?? null,
        reactions: {},
        attachments: options.attachments ?? [],
        forwardedFrom: options.forwardedFrom ?? null,
        sequence: Number.MAX_SAFE_INTEGER,
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

  const remove = useCallback(async (messageId: string) => {
    await api.delete(`/api/records/systemChatMessages/${messageId}`);
    setRawMessages((current) => current.filter((message) => String(message['id']) !== messageId));
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
    sendAsMemberId,
    setSendAsMemberId,
    send,
    retry,
    react,
    refreshThread: load,
    forward,
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
