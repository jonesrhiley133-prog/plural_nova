import { useCallback, useEffect, useRef, useState } from 'react';
import { newId, type StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from './api.js';
import { realtime } from './realtime.js';
import { useCollection } from './data.js';
import { useSystemMode } from './auth.js';
import {
  DecryptionFailed,
  cryptoAvailable,
  loadOrCreateKeyPair,
  openMessage,
  sealMessage,
  type KeyPairRecord,
} from './crypto.js';

/**
 * One messaging model for two different backends.
 *
 * System Chat (internal, never encrypted — it never leaves the account) and
 * Direct Messages (cross-account, end-to-end encrypted) stay separate
 * collections on the server for good reason: they cross a real trust
 * boundary or they don't. This is where that difference is absorbed, so
 * every chat screen renders one `ChatThread`/`ChatMessage` shape and calls
 * one `send`/`react`/`forward`, regardless of which conversation it is.
 */

export type ChatKind = 'dm' | 'system';
export type SystemThreadKind = 'system' | 'group' | 'direct';

export interface ChatPerson {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  avatarUrl?: string | null;
  prefix?: string | null;
}

export interface ChatForwardInfo {
  kind: ChatKind;
  threadId: string | null;
  messageId: string;
  senderLabel: string;
}

export interface ChatThreadSummary {
  id: string;
  kind: ChatKind;
  subKind: SystemThreadKind;
  title: string;
  /** The one other party, for a dm or a system "direct" thread. */
  person: ChatPerson | null;
  /** Everyone else in it, for a group or the whole-system thread. */
  participants: ChatPerson[];
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unread: boolean;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  isRequest: boolean;
  settings: Record<string, unknown>;
  raw: StoredRecord;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  kind: ChatKind;
  body: string;
  sentAt: string;
  isMine: boolean;
  sender: ChatPerson | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  attachments: unknown[];
  forwardedFrom: ChatForwardInfo | null;
  encrypted: boolean;
  sequence: number;
  clientId?: string;
  pending?: boolean;
  failed?: string;
}

function personFromMember(member: Record<string, unknown> | null | undefined): ChatPerson | null {
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

function personFromCounterpart(counterpart: Record<string, unknown> | null | undefined): ChatPerson | null {
  if (!counterpart) return null;
  return {
    id: String(counterpart['userId']),
    name: String(counterpart['displayName'] ?? 'Someone'),
    color: (counterpart['accent'] as string) ?? null,
    icon: null,
    avatarUrl: (counterpart['avatarUrl'] as string) ?? null,
  };
}

function toReactions(raw: unknown): Record<string, string[]> {
  return raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : {};
}

function toForwardedFrom(raw: unknown): ChatForwardInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!value['messageId']) return null;
  return {
    kind: value['kind'] === 'system' ? 'system' : 'dm',
    threadId: (value['threadId'] as string) ?? null,
    messageId: String(value['messageId']),
    senderLabel: String(value['senderLabel'] ?? 'Someone'),
  };
}

function dmThreadSummary(conversation: Record<string, unknown>): ChatThreadSummary {
  const person = personFromCounterpart(conversation['counterpart'] as Record<string, unknown>);
  return {
    id: String(conversation['threadId']),
    kind: 'dm',
    subKind: 'direct',
    title: person?.name ?? String(conversation['title'] ?? 'Direct message'),
    person,
    participants: person ? [person] : [],
    lastMessageAt: (conversation['lastMessageAt'] as string) ?? null,
    lastMessagePreview: String(conversation['lastMessagePreview'] ?? ''),
    unread: Number(conversation['unreadCount'] ?? 0) > 0,
    unreadCount: Number(conversation['unreadCount'] ?? 0),
    pinned: conversation['pinned'] === true,
    muted: conversation['muted'] === true,
    archived: conversation['state'] === 'archived',
    isRequest: conversation['state'] === 'request',
    settings: (conversation['settings'] as Record<string, unknown>) ?? {},
    raw: conversation as StoredRecord,
  };
}

function systemThreadSummary(thread: Record<string, unknown>): ChatThreadSummary {
  const participants = ((thread['participants'] as Record<string, unknown>[]) ?? [])
    .map(personFromMember)
    .filter((person): person is ChatPerson => Boolean(person));
  const kind = (thread['kind'] as SystemThreadKind) ?? 'system';
  return {
    id: String(thread['id']),
    kind: 'system',
    subKind: kind,
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
    isRequest: false,
    settings: (thread['settings'] as Record<string, unknown>) ?? {},
    raw: thread as StoredRecord,
  };
}

/** The list side of Chat Home: one kind of conversation, refreshed live. */
export function useChatThreads(kind: ChatKind): {
  threads: ChatThreadSummary[];
  requests: ChatThreadSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [requests, setRequests] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (kind === 'dm') {
        const result = await api.get<{ conversations: Record<string, unknown>[]; requests: Record<string, unknown>[] }>(
          '/api/messages/conversations',
        );
        // Archived is a real state a conversation can be in, not a filter
        // the list endpoint applies — same as system chat already does for
        // its own archived threads, kept out here rather than in the UI.
        setThreads(result.conversations.filter((c) => c['state'] !== 'archived').map(dmThreadSummary));
        setRequests(result.requests.map(dmThreadSummary));
      } else {
        const result = await api.get<{ threads: Record<string, unknown>[] }>('/api/system/chat/threads');
        setThreads(result.threads.map(systemThreadSummary));
        setRequests([]);
      }
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (kind === 'dm' && (event.type === 'message.new' || event.type === 'message.read')) void load();
      if (kind === 'system' && (event.type === 'systemChat.new' || event.type === 'systemChat.thread.new')) {
        void load();
      }
      if (event.type === 'reaction.new' && event.kind === kind) void load();
    });
  }, [kind, load]);

  return { threads, requests, loading, error, reload: load };
}

interface ConversationState {
  thread: ChatThreadSummary | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  /** True once this account's key is loaded and the other side's is known — dm only. */
  encryptionReady: boolean;
  cryptoSupported: boolean;
}

export interface SendOptions {
  replyToId?: string | null;
  forwardedFrom?: ChatForwardInfo | null;
  attachments?: unknown[];
  attachmentIds?: string[];
  /** Which alter this message is from — overrides the conversation's default for dm, and is the sender for system. */
  asMemberId?: string | null;
}

/**
 * One open conversation: loading, live updates, sending (with the DM side
 * sealed end-to-end when both keys are known), reacting and forwarding.
 * `viewerMemberId` is who "mine" means for a system thread, since — unlike a
 * dm — there is no second account to tell the sides apart.
 */
export function useChatConversation(
  kind: ChatKind,
  threadId: string | null,
  viewerMemberId: string | null,
): ConversationState & {
  send: (text: string, options?: SendOptions) => Promise<void>;
  retry: (message: ChatMessage) => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  forward: (messageId: string, targetThreadIds: string[]) => Promise<void>;
  markRead: () => void;
  refreshThread: () => Promise<void>;
} {
  // `members` is a system-only collection: fetching it for a dm only makes
  // sense when the account actually has alters to send as, and doing it
  // unconditionally would 403 for a Singlet Mode account.
  const systemMode = useSystemMode();
  const members = useCollection('members', { enabled: kind === 'system' || systemMode });

  const [thread, setThread] = useState<ChatThreadSummary | null>(null);
  const [rawMessages, setRawMessages] = useState<Record<string, unknown>[]>([]);
  /** Optimistic sends, kept only until the real row (same clientId) comes back from a reload. */
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [keyPair, setKeyPair] = useState<KeyPairRecord | null>(null);
  const [theirKey, setTheirKey] = useState<JsonWebKey | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [keyAttempt, setKeyAttempt] = useState(0);

  const memberFor = useCallback(
    (memberId: string | null | undefined): ChatPerson | null =>
      memberId ? personFromMember(members.items.find((member) => member.id === memberId)) : null,
    [members.items],
  );

  // Depends on `memberFor` (and so on live member data) on purpose: this is
  // recomputed below through `normalizedMessages`, not baked into stored
  // state, so a member's name or colour changing — or simply finishing its
  // own, separate fetch — relabels every message it authored without a
  // network round trip or a fragile "patch the old objects" pass.
  const normalize = useCallback(
    (raw: Record<string, unknown>, currentThread: ChatThreadSummary | null): ChatMessage => {
      const senderMemberId = (raw['senderMemberId'] ?? raw['memberId']) as string | null;
      const isMine =
        kind === 'dm' ? raw['isMine'] === true : Boolean(viewerMemberId) && senderMemberId === viewerMemberId;
      const sender: ChatPerson | null =
        kind === 'dm'
          ? (raw['asMember'] as Record<string, unknown> | null)
            ? personFromMember(raw['asMember'] as Record<string, unknown>)
            : null
          : memberFor(senderMemberId) ?? (currentThread?.subKind === 'direct' ? currentThread.person : null);
      return {
        id: String(raw['id']),
        threadId: String(raw['threadId'] ?? threadId),
        kind,
        body: String(raw['body'] ?? ''),
        sentAt: String(raw['sentAt']),
        isMine,
        sender,
        replyToId: (raw['replyToId'] as string) ?? null,
        reactions: toReactions(raw['reactions']),
        attachments: (raw['attachments'] as unknown[]) ?? (raw['attachmentIds'] as unknown[]) ?? [],
        forwardedFrom: toForwardedFrom(raw['forwardedFrom']),
        encrypted: raw['encrypted'] === true,
        sequence: Number(raw['sequence'] ?? 0),
        clientId: (raw['clientId'] as string) ?? undefined,
      };
    },
    [kind, threadId, memberFor, viewerMemberId],
  );

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      if (kind === 'dm') {
        const result = await api.get<{ messages: Record<string, unknown>[]; conversation: Record<string, unknown> }>(
          `/api/messages/threads/${threadId}`,
          { limit: 80 },
        );
        setThread(dmThreadSummary(result.conversation));
        setRawMessages(result.messages);
      } else {
        const result = await api.get<{ messages: Record<string, unknown>[]; thread: Record<string, unknown> }>(
          `/api/system/chat/threads/${threadId}/messages`,
          { limit: 150 },
        );
        setThread(systemThreadSummary(result.thread));
        setRawMessages(result.messages);
      }
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [kind, threadId]);

  const normalizedMessages = (() => {
    const list = rawMessages.map((message) => normalize(message, thread));
    const confirmedClientIds = new Set(list.map((message) => message.clientId).filter(Boolean));
    const stillPending = pending.filter((message) => !confirmedClientIds.has(message.clientId));
    return [...list, ...stillPending];
  })();

  useEffect(() => {
    setRawMessages([]);
    setPending([]);
    setDecrypted({});
    setThread(null);
    setLoading(true);
    void load();
  }, [load]);

  useEffect(
    () =>
      realtime.on((event) => {
        if (!threadId) return;
        if (kind === 'dm' && event.type === 'message.new' && event.threadId === threadId) {
          void load();
          if (!theirKey) setKeyAttempt((attempt) => attempt + 1);
        }
        if (kind === 'system' && event.type === 'systemChat.new' && event.threadId === threadId) void load();
        if (event.type === 'reaction.new' && event.kind === kind && event.threadId === threadId) void load();
      }),
    [kind, threadId, load, theirKey],
  );

  // DM key exchange: this account's key was published at sign-in; only the
  // other side's is looked up here, and re-tried whenever a message arrives
  // while it is still unknown (they may have just signed in and published one).
  const otherUserId = kind === 'dm' ? thread?.person?.id ?? null : null;
  useEffect(() => {
    if (kind !== 'dm' || !cryptoAvailable() || !otherUserId) return;
    let cancelled = false;
    void (async () => {
      const pair = await loadOrCreateKeyPair();
      if (!pair || cancelled) return;
      setKeyPair(pair);
      const result = await api.get<{ keys: { publicKey: string }[] }>(`/api/messages/keys/${otherUserId}`).catch(() => null);
      const raw = result?.keys[0]?.publicKey;
      if (!raw || cancelled) return;
      try {
        setTheirKey(JSON.parse(raw) as JsonWebKey);
      } catch {
        // An unparsable key is the same as no key.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, otherUserId, keyAttempt]);

  useEffect(() => {
    if (kind !== 'dm' || !keyPair || !theirKey) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      // Only ever the server-confirmed rows: an optimistic send already holds
      // its own plaintext and was never sealed to begin with.
      for (const message of rawMessages) {
        const id = String(message['id']);
        if (message['encrypted'] !== true || decrypted[id]) continue;
        try {
          next[id] = await openMessage(String(message['body']), keyPair.privateKeyJwk, theirKey);
        } catch (cause) {
          next[id] =
            cause instanceof DecryptionFailed ? `[${cause.message}]` : '[This message could not be decrypted on this device.]';
        }
      }
      if (!cancelled && Object.keys(next).length > 0) setDecrypted((current) => ({ ...current, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, rawMessages, keyPair, theirKey, decrypted]);

  const displayMessages = normalizedMessages.map((message) =>
    message.encrypted && decrypted[message.id] !== undefined ? { ...message, body: decrypted[message.id]! } : message,
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const body = text.trim();
      if (!body || !threadId) return;
      const clientId = newId('cli').slice(4);
      const optimistic: ChatMessage = {
        id: `pending-${clientId}`,
        threadId,
        kind,
        body,
        sentAt: new Date().toISOString(),
        isMine: true,
        sender: memberFor(options.asMemberId ?? viewerMemberId),
        replyToId: options.replyToId ?? null,
        reactions: {},
        attachments: options.attachments ?? [],
        forwardedFrom: options.forwardedFrom ?? null,
        encrypted: kind === 'dm' && Boolean(keyPair && theirKey),
        sequence: Number.MAX_SAFE_INTEGER,
        clientId,
        pending: true,
      };
      setPending((current) => [...current, optimistic]);
      setSending(true);

      try {
        if (kind === 'dm') {
          let payloadBody = body;
          let encrypted = false;
          if (keyPair && theirKey) {
            const sealed = await sealMessage(body, keyPair.privateKeyJwk, theirKey);
            payloadBody = sealed.body;
            encrypted = true;
          }
          await api.post(`/api/messages/threads/${threadId}`, {
            body: payloadBody,
            clientId,
            encrypted,
            encryptionKeyId: encrypted ? 'browser' : '',
            replyToId: options.replyToId ?? null,
            forwardedFrom: options.forwardedFrom ?? null,
            ...(options.asMemberId !== undefined ? { asMemberId: options.asMemberId } : {}),
          });
        } else {
          await api.post(`/api/system/chat/threads/${threadId}/messages`, {
            body,
            memberId: options.asMemberId ?? viewerMemberId,
            replyToId: options.replyToId ?? null,
            attachmentIds: options.attachmentIds ?? [],
            forwardedFrom: options.forwardedFrom ?? null,
          });
        }
        await load();
      } catch (cause) {
        setPending((current) =>
          current.map((message) => (message.clientId === clientId ? { ...message, pending: false, failed: messageFor(cause) } : message)),
        );
      } finally {
        setSending(false);
      }
    },
    [kind, threadId, keyPair, theirKey, viewerMemberId, memberFor, load],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
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
      const path =
        kind === 'dm' ? `/api/messages/messages/${messageId}/reactions` : `/api/system/chat/messages/${messageId}/reactions`;
      const body = kind === 'dm' ? { emoji } : { emoji, memberId: viewerMemberId };
      const result = await api.post<{ reactions: Record<string, string[]> }>(path, body);
      setRawMessages((current) =>
        current.map((message) => (String(message['id']) === messageId ? { ...message, reactions: result.reactions } : message)),
      );
    },
    [kind, viewerMemberId],
  );

  const forward = useCallback(
    async (messageId: string, targetThreadIds: string[]) => {
      if (kind === 'system') {
        await api.post(`/api/system/chat/messages/${messageId}/forward`, { threadIds: targetThreadIds });
        return;
      }
      // DMs cannot forward ciphertext server-side — it is sealed to a
      // different key per thread — so a dm forward is a normal send per
      // target thread, tagged with where it came from. Uses the already-
      // decrypted body: forwarding the raw stored value would forward
      // ciphertext sealed to a key the target thread cannot open.
      const source = displayMessages.find((message) => message.id === messageId);
      if (!source) return;
      const info: ChatForwardInfo = {
        kind: 'dm',
        threadId: source.threadId,
        messageId: source.id,
        senderLabel: source.sender?.name ?? (source.isMine ? 'You' : 'Them'),
      };
      for (const targetThreadId of targetThreadIds) {
        await api.post(`/api/messages/threads/${targetThreadId}`, {
          body: source.body,
          clientId: newId('cli').slice(4),
          forwardedFrom: info,
        });
      }
    },
    [kind, displayMessages],
  );

  const markedRead = useRef<string | null>(null);
  const markRead = useCallback(() => {
    if (!threadId || !thread?.unread) return;
    if (markedRead.current === threadId) return;
    markedRead.current = threadId;
    const path = kind === 'dm' ? `/api/messages/threads/${threadId}/read` : `/api/system/chat/threads/${threadId}/read`;
    void api.post(path).catch(() => {
      markedRead.current = null;
    });
  }, [kind, threadId, thread?.unread]);

  return {
    thread,
    messages: displayMessages,
    loading,
    error,
    sending,
    encryptionReady: kind === 'dm' ? Boolean(keyPair && theirKey) : true,
    cryptoSupported: kind === 'dm' ? cryptoAvailable() : true,
    send,
    retry,
    react,
    refreshThread: load,
    forward,
    markRead,
  };
}

/** Starts (or resumes) a dm by handle — used by the new-chat contact picker. */
export async function startDirectMessage(handle: string): Promise<ChatThreadSummary> {
  const result = await api.post<{ conversation: Record<string, unknown> }>('/api/messages/conversations', { handle });
  return dmThreadSummary(result.conversation);
}

/** Creates (or reuses) a group/direct system chat thread for the given members. */
export async function createSystemThread(input: {
  kind: 'group' | 'direct';
  name?: string;
  participantMemberIds: string[];
}): Promise<ChatThreadSummary> {
  const result = await api.post<{ thread: Record<string, unknown> }>('/api/system/chat/threads', input);
  return systemThreadSummary(result.thread);
}

/** Pin, mute, archive and per-conversation appearance all go through this, for either kind. */
export async function updateChatThread(
  kind: ChatKind,
  id: string,
  patch: { pinned?: boolean; muted?: boolean; archived?: boolean; settings?: Record<string, unknown>; title?: string },
): Promise<void> {
  if (kind === 'dm') {
    const body: Record<string, unknown> = { ...patch };
    if (patch.archived !== undefined) {
      body['state'] = patch.archived ? 'archived' : 'accepted';
      delete body['archived'];
    }
    await api.patch(`/api/messages/conversations/${id}`, body);
  } else {
    await api.patch(`/api/records/systemChatThreads/${id}`, patch);
  }
}
