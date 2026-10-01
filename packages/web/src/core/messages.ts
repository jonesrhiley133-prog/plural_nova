import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId, type StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from './api.js';
import { useAuth } from './auth.js';
import { realtime } from './realtime.js';
import {
  DecryptionFailed,
  cryptoAvailable,
  openMessage,
  publishMessageKey,
  sealMessage,
  type KeyPairRecord,
} from './crypto.js';

/**
 * Messages: online, account-to-account conversation.
 *
 * A genuinely separate data layer from In-Sys Chat (see systemChat.ts) — its
 * own server collections (conversations/messages), its own identity (the
 * other party is a PluralNova account, never an alter), end-to-end
 * encrypted. Nothing here imports, or is imported by, systemChat.ts; they
 * share only the visual language their components render with.
 */

export interface MessagePerson {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  avatarUrl?: string | null;
  prefix?: string | null;
}

export interface MessageForwardInfo {
  threadId: string | null;
  messageId: string;
  senderLabel: string;
}

export interface MessageThreadSummary {
  id: string;
  title: string;
  person: MessagePerson | null;
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

export interface MessageAttachment {
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

export interface Message {
  id: string;
  threadId: string;
  body: string;
  sentAt: string;
  isMine: boolean;
  sender: MessagePerson | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  attachments: MessageAttachment[];
  forwardedFrom: MessageForwardInfo | null;
  encrypted: boolean;
  sequence: number;
  clientId?: string;
  pending?: boolean;
  failed?: string;
}

function personFromCounterpart(counterpart: Record<string, unknown> | null | undefined): MessagePerson | null {
  if (!counterpart) return null;
  return {
    id: String(counterpart['userId']),
    name: String(counterpart['displayName'] ?? 'Someone'),
    color: (counterpart['accent'] as string) ?? null,
    icon: null,
    avatarUrl: (counterpart['avatarUrl'] as string) ?? null,
  };
}

function personFromMember(member: Record<string, unknown> | null | undefined): MessagePerson | null {
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

function toAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: String(item['id'] ?? ''),
      url: String(item['url'] ?? ''),
      mediaType: (MEDIA_TYPES.has(String(item['mediaType'])) ? item['mediaType'] : 'document') as MessageAttachment['mediaType'],
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
function compareBySentAt(a: Message, b: Message): number {
  const bySentAt = Date.parse(a.sentAt) - Date.parse(b.sentAt);
  return bySentAt !== 0 ? bySentAt : a.sequence - b.sequence;
}

function toForwardedFrom(raw: unknown): MessageForwardInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!value['messageId']) return null;
  return {
    threadId: (value['threadId'] as string) ?? null,
    messageId: String(value['messageId']),
    senderLabel: String(value['senderLabel'] ?? 'Someone'),
  };
}

function threadSummary(conversation: Record<string, unknown>): MessageThreadSummary {
  const person = personFromCounterpart(conversation['counterpart'] as Record<string, unknown>);
  return {
    id: String(conversation['threadId']),
    title: person?.name ?? String(conversation['title'] ?? 'Direct message'),
    person,
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

/** The list side of the Messages home screen: every conversation and request, refreshed live. */
export function useMessageThreads(): {
  threads: MessageThreadSummary[];
  requests: MessageThreadSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [requests, setRequests] = useState<MessageThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ conversations: Record<string, unknown>[]; requests: Record<string, unknown>[] }>(
        '/api/messages/conversations',
      );
      // Archived is a real state a conversation can be in, not a filter the
      // list endpoint applies — kept out here rather than in the UI.
      setThreads(result.conversations.filter((c) => c['state'] !== 'archived').map(threadSummary));
      setRequests(result.requests.map(threadSummary));
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
      if (event.type === 'message.new' || event.type === 'message.read' || event.type === 'message.deleted') void load();
      if (event.type === 'reaction.new' && event.kind === 'dm') void load();
    });
  }, [load]);

  return { threads, requests, loading, error, reload: load };
}

interface RemoteKey {
  id: string;
  publicKey: string;
}

interface SealedVariant {
  keyId: string;
  body: string;
}

/** A fan-out body is a JSON array of sealed copies; anything else is read as the pre-fan-out single-ciphertext shape. */
function parseVariants(body: string): SealedVariant[] | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) return null;
    const variants = parsed.filter(
      (item): item is SealedVariant =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as SealedVariant).keyId === 'string' &&
        typeof (item as SealedVariant).body === 'string',
    );
    return variants.length > 0 ? variants : null;
  } catch {
    return null;
  }
}

/**
 * Decrypts one stored message body.
 *
 * A message encrypted after the multi-device fix is a JSON array of sealed
 * copies, one per device that might need to read it, each tagged with that
 * device's own key id. A device holding a copy tagged with its own key id is
 * a recipient of the message — decrypting it pairs this device's private key
 * with the sender's public key (`senderKeyId`, resolved through
 * `keyDirectory`, the combined map of the other party's keys and this
 * account's own other devices). A device holding no such copy is the one
 * that sent the message in the first place: every copy was addressed to some
 * other key, so it falls back to any one of them, which it can always open —
 * it holds the private key that sealed it.
 *
 * A plain, non-JSON body predates the fan-out and was sealed once, to
 * whichever key the other party had active at the time; `legacyKey` is that
 * same "first known key" fallback the original single-key code used.
 */
export async function decryptMessageBody(
  body: string,
  senderKeyId: string,
  myPrivateKey: JsonWebKey,
  myActiveKeyId: string | undefined,
  keyDirectory: Map<string, JsonWebKey>,
  legacyKey: JsonWebKey | null,
): Promise<string> {
  const variants = parseVariants(body);
  if (!variants) {
    if (!legacyKey) {
      throw new DecryptionFailed('This message was encrypted to a key this device does not have. It cannot be read here.');
    }
    return openMessage(body, myPrivateKey, legacyKey);
  }

  const mine = myActiveKeyId ? variants.find((variant) => variant.keyId === myActiveKeyId) : undefined;
  const chosen = mine ?? variants[0];
  if (!chosen) throw new DecryptionFailed('This message is not in a format PluralNova can read.');

  // Mine: pair with the sender's key. Not mine (I sent it myself, from a
  // device none of these copies are addressed to): pair with whichever key
  // this particular copy was sealed to — I hold the private half either way.
  const counterpartKeyId = mine ? senderKeyId : chosen.keyId;
  const counterpartKey = keyDirectory.get(counterpartKeyId);
  if (!counterpartKey) {
    throw new DecryptionFailed('This message was encrypted to a key this device does not have. It cannot be read here.');
  }
  return openMessage(chosen.body, myPrivateKey, counterpartKey);
}

interface MessageConversationState {
  thread: MessageThreadSummary | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  /** True once this account's key is loaded and the other side's is known. */
  encryptionReady: boolean;
  cryptoSupported: boolean;
}

export interface SendOptions {
  replyToId?: string | null;
  forwardedFrom?: MessageForwardInfo | null;
  attachments?: MessageAttachment[];
}

/**
 * One open Messages conversation: loading, live updates, sending (sealed
 * end-to-end once both keys are known), reacting and forwarding.
 * `speakingAsMemberId` — the account's current active profile, in System
 * Mode — tags who this side's friend sees they're talking to
 * (`conversations.asMemberId`); it has no in-conversation override the way
 * In-Sys Chat's "send as" strip does, since Messages has no equivalent UI.
 */
export function useMessageConversation(
  threadId: string | null,
  speakingAsMemberId: string | null,
): MessageConversationState & {
  send: (text: string, options?: SendOptions) => Promise<void>;
  retry: (message: Message) => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  forward: (messageId: string, targetThreadIds: string[]) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  markRead: () => void;
  refreshThread: () => Promise<void>;
} {
  const [thread, setThread] = useState<MessageThreadSummary | null>(null);
  const [rawMessages, setRawMessages] = useState<Record<string, unknown>[]>([]);
  /** Optimistic sends, kept only until the real row (same clientId) comes back from a reload. */
  const [pending, setPending] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const myUserId = useAuth().user?.id ?? null;
  const [keyPair, setKeyPair] = useState<KeyPairRecord | null>(null);
  /** The other party's own active keys — gates whether this conversation can encrypt at all. */
  const [theirKeys, setTheirKeys] = useState<RemoteKey[]>([]);
  /** This account's other active devices, so a message sent from one of this account's devices can be read from another. */
  const [myOtherKeys, setMyOtherKeys] = useState<RemoteKey[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [keyAttempt, setKeyAttempt] = useState(0);

  const keyDirectory = useMemo(() => {
    const map = new Map<string, JsonWebKey>();
    for (const key of [...theirKeys, ...myOtherKeys]) {
      try {
        map.set(key.id, JSON.parse(key.publicKey) as JsonWebKey);
      } catch {
        // An unparsable key is the same as no key.
      }
    }
    return map;
  }, [theirKeys, myOtherKeys]);

  const normalize = useCallback(
    (raw: Record<string, unknown>): Message => ({
      id: String(raw['id']),
      threadId: String(raw['threadId'] ?? threadId),
      body: String(raw['body'] ?? ''),
      sentAt: String(raw['sentAt']),
      isMine: raw['isMine'] === true,
      sender: raw['asMember'] ? personFromMember(raw['asMember'] as Record<string, unknown>) : null,
      replyToId: (raw['replyToId'] as string) ?? null,
      reactions: toReactions(raw['reactions']),
      attachments: toAttachments(raw['attachments']),
      forwardedFrom: toForwardedFrom(raw['forwardedFrom']),
      encrypted: raw['encrypted'] === true,
      sequence: Number(raw['sequence'] ?? 0),
      clientId: (raw['clientId'] as string) ?? undefined,
    }),
    [threadId],
  );

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await api.get<{ messages: Record<string, unknown>[]; conversation: Record<string, unknown> }>(
        `/api/messages/threads/${threadId}`,
        { limit: 80 },
      );
      setThread(threadSummary(result.conversation));
      setRawMessages(result.messages);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const normalizedMessages = (() => {
    const list = rawMessages.map((message) => normalize(message));
    const confirmedClientIds = new Set(list.map((message) => message.clientId).filter(Boolean));
    const stillPending = pending.filter((message) => !confirmedClientIds.has(message.clientId));
    return [...list, ...stillPending].sort(compareBySentAt);
  })();

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
    setDecrypted({});
    setThread(null);
    setTheirKeys([]);
    setMyOtherKeys([]);
    setLoading(true);
    void load();
  }, [load]);

  const otherUserId = thread?.person?.id ?? null;

  useEffect(
    () =>
      realtime.on((event) => {
        // Either side of this conversation can publish a new device's key at
        // any time, not just while the thread is open — this account's own
        // other devices, or the other party's. Either way, a conversation
        // already sitting open picks up the new key as a fan-out target
        // without needing a reload to notice it.
        if (event.type === 'messageKey.new' && (event.userId === myUserId || event.userId === otherUserId)) {
          setKeyAttempt((attempt) => attempt + 1);
        }
        if (!threadId) return;
        if (event.type === 'message.new' && event.threadId === threadId) {
          void load();
          if (theirKeys.length === 0) setKeyAttempt((attempt) => attempt + 1);
        }
        if (event.type === 'message.deleted' && event.threadId === threadId) void load();
        if (event.type === 'reaction.new' && event.kind === 'dm' && event.threadId === threadId) void load();
      }),
    [threadId, load, theirKeys, myUserId, otherUserId],
  );

  // Key exchange: publishing is idempotent, so re-confirming this device's
  // own key here (rather than trusting the one published at sign-in to have
  // already landed) costs nothing and closes a race on a very fast first
  // open. Both the other side's keys and this account's own other devices
  // are fetched, since either can hold a copy of a message addressed here —
  // and re-tried whenever a message arrives while the other side still has
  // none on record (they may have just signed in and published one), or
  // whenever either side publishes a key for an additional device while
  // this conversation is already open.
  useEffect(() => {
    if (!cryptoAvailable() || !otherUserId) return;
    let cancelled = false;
    void (async () => {
      const pair = await publishMessageKey();
      if (!pair || cancelled) return;
      setKeyPair(pair);
      const [theirs, mine] = await Promise.all([
        api.get<{ keys: RemoteKey[] }>(`/api/messages/keys/${otherUserId}`).catch(() => null),
        myUserId ? api.get<{ keys: RemoteKey[] }>(`/api/messages/keys/${myUserId}`).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setTheirKeys(theirs?.keys ?? []);
      setMyOtherKeys((mine?.keys ?? []).filter((key) => key.id !== pair.activeKeyId));
    })();
    return () => {
      cancelled = true;
    };
  }, [otherUserId, myUserId, keyAttempt]);

  useEffect(() => {
    if (!keyPair) return;
    const legacyKey = (() => {
      const first = theirKeys[0];
      if (!first) return null;
      try {
        return JSON.parse(first.publicKey) as JsonWebKey;
      } catch {
        return null;
      }
    })();
    if (keyDirectory.size === 0 && !legacyKey) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      // Only ever the server-confirmed rows: an optimistic send already holds
      // its own plaintext and was never sealed to begin with.
      for (const message of rawMessages) {
        const id = String(message['id']);
        if (message['encrypted'] !== true || decrypted[id]) continue;
        try {
          next[id] = await decryptMessageBody(
            String(message['body']),
            String(message['encryptionKeyId'] ?? ''),
            keyPair.privateKeyJwk,
            keyPair.activeKeyId,
            keyDirectory,
            legacyKey,
          );
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
  }, [rawMessages, keyPair, keyDirectory, theirKeys, decrypted]);

  const displayMessages = normalizedMessages.map((message) =>
    message.encrypted && decrypted[message.id] !== undefined ? { ...message, body: decrypted[message.id]! } : message,
  );

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const body = text.trim();
      if ((!body && (options.attachments?.length ?? 0) === 0) || !threadId) return;
      const clientId = newId('cli').slice(4);
      const activeKeyId = keyPair?.activeKeyId;
      // Encryption is gated on the other side having a key, not on this
      // device's own other devices — a message this account's other devices
      // could read but the actual recipient could not would defeat the point
      // of sending it.
      const canEncrypt = Boolean(keyPair && activeKeyId) && theirKeys.length > 0;
      const optimistic: Message = {
        id: `pending-${clientId}`,
        threadId,
        body,
        sentAt: new Date().toISOString(),
        isMine: true,
        sender: null,
        replyToId: options.replyToId ?? null,
        reactions: {},
        attachments: options.attachments ?? [],
        forwardedFrom: options.forwardedFrom ?? null,
        encrypted: canEncrypt,
        sequence: Number.MAX_SAFE_INTEGER,
        clientId,
        pending: true,
      };
      setPending((current) => [...current, optimistic]);
      setSending(true);

      try {
        let payloadBody = body;
        let encrypted = false;
        let encryptionKeyId = '';
        if (canEncrypt && keyPair && activeKeyId) {
          // One sealed copy per device that might need to read this — the
          // other side's devices and this account's own other devices alike
          // — so the conversation stays readable from any of them, not just
          // whichever one last happened to publish a key.
          const variants: SealedVariant[] = [];
          for (const [keyId, publicKey] of keyDirectory) {
            const sealed = await sealMessage(body, keyPair.privateKeyJwk, publicKey);
            variants.push({ keyId, body: sealed.body });
          }
          if (variants.length > 0) {
            payloadBody = JSON.stringify(variants);
            encryptionKeyId = activeKeyId;
            encrypted = true;
          }
        }
        await api.post(`/api/messages/threads/${threadId}`, {
          body: payloadBody,
          clientId,
          encrypted,
          encryptionKeyId,
          replyToId: options.replyToId ?? null,
          // Attachments ride along in the clear even on an encrypted
          // message: the files themselves are plain uploads on this
          // server's disk, so sealing only the caption would be a false
          // promise of privacy the file itself does not keep.
          attachments: options.attachments ?? [],
          forwardedFrom: options.forwardedFrom ?? null,
          asMemberId: speakingAsMemberId,
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
    [threadId, keyPair, keyDirectory, theirKeys, speakingAsMemberId, load],
  );

  const retry = useCallback(
    async (message: Message) => {
      setPending((current) => current.filter((candidate) => candidate.clientId !== message.clientId));
      await send(message.body, {
        replyToId: message.replyToId,
        forwardedFrom: message.forwardedFrom,
        attachments: message.attachments,
      });
    },
    [send],
  );

  const react = useCallback(async (messageId: string, emoji: string) => {
    const result = await api.post<{ reactions: Record<string, string[]> }>(`/api/messages/messages/${messageId}/reactions`, {
      emoji,
    });
    setRawMessages((current) =>
      current.map((message) => (String(message['id']) === messageId ? { ...message, reactions: result.reactions } : message)),
    );
  }, []);

  const forward = useCallback(
    async (messageId: string, targetThreadIds: string[]) => {
      // Ciphertext cannot be forwarded server-side — it is sealed to a
      // different key per thread — so a forward is a normal send per target
      // thread, tagged with where it came from. Uses the already-decrypted
      // body: forwarding the raw stored value would forward ciphertext
      // sealed to a key the target thread cannot open.
      const source = displayMessages.find((message) => message.id === messageId);
      if (!source) return;
      const info: MessageForwardInfo = {
        threadId: source.threadId,
        messageId: source.id,
        senderLabel: source.sender?.name ?? (source.isMine ? 'You' : 'Them'),
      };
      for (const targetThreadId of targetThreadIds) {
        await api.post(`/api/messages/threads/${targetThreadId}`, {
          body: source.body,
          clientId: newId('cli').slice(4),
          attachments: source.attachments,
          forwardedFrom: info,
        });
      }
    },
    [displayMessages],
  );

  const remove = useCallback(async (messageId: string) => {
    await api.delete(`/api/messages/messages/${messageId}`);
    setRawMessages((current) => current.filter((message) => String(message['id']) !== messageId));
    setPending((current) => current.filter((message) => message.id !== messageId));
  }, []);

  const markedRead = useRef<string | null>(null);
  const markRead = useCallback(() => {
    if (!threadId || !thread?.unread) return;
    if (markedRead.current === threadId) return;
    markedRead.current = threadId;
    void api.post(`/api/messages/threads/${threadId}/read`).catch(() => {
      markedRead.current = null;
    });
  }, [threadId, thread?.unread]);

  return {
    thread,
    messages: displayMessages,
    loading,
    error,
    sending,
    encryptionReady: Boolean(keyPair?.activeKeyId) && theirKeys.length > 0,
    cryptoSupported: cryptoAvailable(),
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
 * the same media library) as the rest of the app — a photo sent in a
 * conversation is a media item like any other, not a second, chat-only copy
 * of the concept.
 */
export async function uploadMessageAttachment(file: File | Blob, filename: string): Promise<MessageAttachment> {
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
    mediaType: (MEDIA_TYPES.has(result.mediaType) ? result.mediaType : 'document') as MessageAttachment['mediaType'],
    mimeType: contentType,
    sizeBytes: result.sizeBytes,
    title: result.title,
  };
}

/** Starts (or resumes) a conversation by handle — used by the new-message contact picker. */
export async function startDirectMessage(handle: string): Promise<MessageThreadSummary> {
  const result = await api.post<{ conversation: Record<string, unknown> }>('/api/messages/conversations', { handle });
  return threadSummary(result.conversation);
}

/** Pin, mute, archive, rename and per-conversation appearance all go through this. */
export async function updateMessageThread(
  id: string,
  patch: { pinned?: boolean; muted?: boolean; archived?: boolean; settings?: Record<string, unknown>; title?: string },
): Promise<void> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.archived !== undefined) {
    body['state'] = patch.archived ? 'archived' : 'accepted';
    delete body['archived'];
  }
  await api.patch(`/api/messages/conversations/${id}`, body);
}

/**
 * Removes a conversation from this account's list. Only touches the caller's
 * own side (see the server route) — the other party, the thread and its
 * messages are untouched, and it reappears if the conversation continues.
 */
export async function deleteMessageThread(id: string): Promise<void> {
  await api.delete(`/api/messages/conversations/${id}`);
}
