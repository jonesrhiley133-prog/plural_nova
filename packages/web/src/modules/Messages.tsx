import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { newId } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useCollection } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useSystemMode } from '../core/auth.js';
import { decrementBadge, refreshBadges } from '../core/badges.js';
import {
  DecryptionFailed,
  cryptoAvailable,
  loadOrCreateKeyPair,
  openMessage,
  sealMessage,
  type KeyPairRecord,
} from '../core/crypto.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { SwitchRow, TextField } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Flux Messages.
 *
 * Messages are ordered by the sequence the server assigned, rendered oldest at
 * the top and newest at the bottom, and appended as they arrive. A send that
 * fails stays on screen as a failed message with a retry rather than
 * disappearing.
 *
 * Encryption is real when both sides have published a key: the body is sealed
 * in the browser and the server stores ciphertext. When the other side has no
 * key, the message goes in the clear and the interface says exactly that.
 */

interface Counterpart {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string;
  accent: string;
}

interface Conversation {
  id: string;
  threadId: string;
  otherUserId: string;
  title: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unreadCount: number;
  state: string;
  muted: boolean;
  pinned: boolean;
  asMemberId: string | null;
  settings: Record<string, unknown> | null;
  counterpart: Counterpart;
}

interface Message {
  id: string;
  threadId: string;
  senderUserId: string;
  senderMemberId: string | null;
  body: string;
  sentAt: string;
  sequence: number;
  encrypted: boolean;
  encryptionKeyId: string;
  clientId: string;
  isMine: boolean;
  asMember: { id: string; name: string; color: string | null; icon: string | null } | null;
  /** Client-side only: a send that has not been accepted yet. */
  pending?: boolean;
  failed?: string;
  plaintext?: string;
}

export default function Messages(): JSX.Element {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const dates = useDateFormat();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ conversations: Conversation[]; requests: Conversation[] }>(
        '/api/messages/conversations',
      );
      setConversations(result.conversations);
      setRequests(result.requests);
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
      if (event.type === 'message.new') void load();
    });
  }, [load]);

  const newChat = useDialog();

  if (threadId) {
    return <Thread threadId={threadId} onBack={() => navigate('/messages')} onChanged={load} />;
  }

  return (
    <>
      <PageHeader
        title="Messages"
        actions={
          <Button variant="primary" icon="plus" onClick={() => newChat.show()}>
            New conversation
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorPanel title={t('error.loadMessages')} message={error} onRetry={() => void load()} />
      ) : conversations.length === 0 && requests.length === 0 ? (
        <Card>
          <EmptyState
            icon="message"
            title="No conversations yet"
            body="Find a system on Constellations and start one, or wait for someone to write."
            action={{ label: 'Find someone', run: () => navigate('/constellations') }}
          />
        </Card>
      ) : (
        <div className="stack">
          {requests.length > 0 ? (
            <Card title="Message requests" subtitle="From systems you are not friends with" flush>
              <div className="list">
                {requests.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    onOpen={() => navigate(`/messages/${conversation.threadId}`)}
                    dates={dates}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <Card flush>
            <div className="list">
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  onOpen={() => navigate(`/messages/${conversation.threadId}`)}
                  dates={dates}
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      <NewConversationDialog
        dialog={newChat}
        onCreated={(id) => {
          void load();
          navigate(`/messages/${id}`);
        }}
      />
    </>
  );
}

function ConversationRow({
  conversation,
  onOpen,
  dates,
}: {
  conversation: Conversation;
  onOpen: () => void;
  dates: ReturnType<typeof useDateFormat>;
}): JSX.Element {
  return (
    <button type="button" className="list-row" onClick={onOpen}>
      <Avatar
        name={conversation.counterpart.displayName}
        src={conversation.counterpart.avatarUrl || null}
        color={conversation.counterpart.accent || null}
        size={40}
        round
      />
      <span className="list-row__body">
        <span className="list-row__title">
          {conversation.counterpart.displayName}
          {conversation.muted ? <span className="faint"> · muted</span> : null}
        </span>
        <span className="list-row__meta truncate">
          {conversation.lastMessagePreview || 'No messages yet'}
        </span>
      </span>
      <span className="list-row__trailing">
        {conversation.lastMessageAt ? (
          <span className="tiny faint">{dates.relative(conversation.lastMessageAt)}</span>
        ) : null}
        {conversation.unreadCount > 0 ? <span className="badge">{conversation.unreadCount}</span> : null}
      </span>
    </button>
  );
}

function Thread({
  threadId,
  onBack,
  onChanged,
}: {
  threadId: string;
  onBack: () => void;
  onChanged: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const systemMode = useSystemMode();
  const members = useCollection('members', { enabled: systemMode });

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [asMemberId, setAsMemberId] = useState<string | null>(null);
  const [keyPair, setKeyPair] = useState<KeyPairRecord | null>(null);
  const [theirKey, setTheirKey] = useState<JsonWebKey | null>(null);
  const settingsDialog = useDialog();

  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const encryptionReady = Boolean(keyPair && theirKey);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{
        messages: Message[];
        conversation: Conversation;
        hasMore: boolean;
      }>(`/api/messages/threads/${threadId}`, { limit: 80 });
      setMessages(result.messages);
      setConversation(result.conversation);
      setAsMemberId(result.conversation.asMemberId ?? null);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mark read on open, and clear the badge without waiting for a refetch.
  // `onChanged` refreshes the conversation list, which hands this view a new
  // `conversation` object — so the thread already marked read is remembered
  // here rather than by object identity, and the request is made once.
  const markedRead = useRef<string | null>(null);
  const notifyChanged = useRef(onChanged);
  useEffect(() => {
    notifyChanged.current = onChanged;
  });

  useEffect(() => {
    if (!conversation || conversation.unreadCount === 0) return;
    if (markedRead.current === threadId) return;
    markedRead.current = threadId;
    const unread = conversation.unreadCount;
    void api.post(`/api/messages/threads/${threadId}/read`).then(() => {
      decrementBadge('messages', unread);
      void refreshBadges();
      notifyChanged.current();
    });
  }, [conversation, threadId]);

  // New messages arrive over the socket and are appended, so the list never
  // re-orders under the reader.
  useEffect(
    () =>
      realtime.on((event) => {
        if (event.type !== 'message.new' || event.threadId !== threadId) return;
        void load();
        if (!theirKey) setKeyAttempt((attempt) => attempt + 1);
      }),
    [threadId, load, theirKey],
  );

  /*
   * Key exchange. This account's key is published at sign-in, so all that is
   * needed here is the other side's.
   *
   * It is looked up again whenever a message arrives while there is still no
   * key: the other system may only just have signed in and published one, and
   * a conversation that stayed in the clear for the rest of the session because
   * of a few seconds' timing would be a bad reason to send plaintext.
   */
  const [keyAttempt, setKeyAttempt] = useState(0);
  const otherUserId = conversation?.otherUserId ?? null;

  useEffect(() => {
    if (!cryptoAvailable() || !otherUserId) return;
    let cancelled = false;

    void (async () => {
      const pair = await loadOrCreateKeyPair();
      if (!pair || cancelled) return;
      setKeyPair(pair);

      const result = await api
        .get<{ keys: { publicKey: string }[] }>(`/api/messages/keys/${otherUserId}`)
        .catch(() => null);
      const raw = result?.keys[0]?.publicKey;
      if (!raw || cancelled) return;
      try {
        setTheirKey(JSON.parse(raw) as JsonWebKey);
      } catch {
        // A key that will not parse is the same as no key, which the header says.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [otherUserId, keyAttempt]);

  // Decrypting happens after render so a long thread does not block paint.
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!keyPair || !theirKey) return;
    let cancelled = false;

    void (async () => {
      const next: Record<string, string> = {};
      for (const message of messages) {
        if (!message.encrypted || decrypted[message.id]) continue;
        try {
          next[message.id] = await openMessage(message.body, keyPair.privateKeyJwk, theirKey);
        } catch (cause) {
          next[message.id] =
            cause instanceof DecryptionFailed
              ? `[${cause.message}]`
              : '[This message could not be decrypted on this device.]';
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setDecrypted((current) => ({ ...current, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, keyPair, theirKey, decrypted]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = useCallback(
    async (text: string, retryOf?: Message) => {
      const body = text.trim();
      if (!body) return;

      const clientId = retryOf?.clientId || newId('cli').slice(4);
      const optimistic: Message = retryOf ?? {
        id: `pending-${clientId}`,
        threadId,
        senderUserId: 'me',
        senderMemberId: asMemberId,
        body,
        plaintext: body,
        sentAt: new Date().toISOString(),
        sequence: Number.MAX_SAFE_INTEGER,
        encrypted: encryptionReady,
        encryptionKeyId: '',
        clientId,
        isMine: true,
        asMember: null,
        pending: true,
      };

      setMessages((current) =>
        retryOf
          ? current.map((message) =>
              message.clientId === clientId
                ? { ...message, pending: true, failed: undefined as never }
                : message,
            )
          : [...current, optimistic],
      );
      setDraft('');
      setSending(true);

      try {
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
          asMemberId,
        });
        await load();
        onChanged();
      } catch (cause) {
        setMessages((current) =>
          current.map((message) =>
            message.clientId === clientId
              ? { ...message, pending: false, failed: messageFor(cause) }
              : message,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [threadId, asMemberId, keyPair, theirKey, encryptionReady, load, onChanged],
  );

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  if (loading) return <SkeletonList rows={6} />;

  if (error) {
    return (
      <>
        <PageHeader title="Messages" />
        <ErrorPanel title={t('error.loadMessages')} message={error} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="row row--nowrap">
          <IconButton icon="chevronLeft" label="Back to messages" variant="ghost" onClick={onBack} />
          <Avatar
            name={conversation?.counterpart.displayName ?? 'Conversation'}
            src={conversation?.counterpart.avatarUrl || null}
            size={36}
            round
          />
          <div>
            <div style={{ fontWeight: 'var(--weight-medium)' }}>
              {conversation?.counterpart.displayName}
            </div>
            <div className="tiny faint">
              {/*
                Three states, not two. A thread whose keys only lined up part
                way through holds messages the server can read, and calling the
                whole thing encrypted would be a padlock over those — which is
                exactly what this feature is built not to do.
              */}
              {!encryptionReady ? (
                <>
                  <Icon name="unlock" size={10} /> {t('social.notEncrypted')}
                </>
              ) : messages.some((message) => !message.encrypted) ? (
                <>
                  <Icon name="lock" size={10} /> {t('social.encryptedFromHere')}
                </>
              ) : (
                <>
                  <Icon name="lock" size={10} /> {t('social.encrypted')}
                </>
              )}
            </div>
          </div>
        </div>
        <IconButton icon="settings" label="Chat settings" variant="ghost" onClick={() => settingsDialog.show()} />
      </div>

      {conversation?.state === 'request' ? (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <p className="small prose">
            {conversation.counterpart.displayName} is not a friend. Accepting moves this into your
            conversations; ignoring it leaves it here.
          </p>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void api.post(`/api/messages/threads/${threadId}/accept`).then(() => {
                  void load();
                  toast.success('Accepted');
                });
              }}
            >
              Accept
            </Button>
          </div>
        </Card>
      ) : null}

      {!encryptionReady && cryptoAvailable() ? (
        <p className="tiny faint" style={{ marginBottom: 'var(--space-3)' }}>
          <Icon name="info" size={11} /> Messages in this conversation are not encrypted — the other
          system has not published a key from a device that supports it. PluralNova will not show a
          padlock it has not earned.
        </p>
      ) : null}

      <Card flush style={{ marginBottom: 'var(--space-4)' }}>
        <div
          ref={scroller}
          style={{ maxHeight: '58vh', overflowY: 'auto', padding: 'var(--space-3)' }}
        >
          {messages.length === 0 ? (
            <EmptyState icon="message" title="No messages yet" body="Say something first." />
          ) : (
            grouped.map(([day, dayMessages]) => (
              <div key={day}>
                <div
                  className="tiny faint"
                  style={{ textAlign: 'center', margin: 'var(--space-3) 0' }}
                >
                  {dates.date(`${day}T12:00:00`)}
                </div>
                {dayMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    text={message.plaintext ?? (message.encrypted ? decrypted[message.id] ?? '…' : message.body)}
                    time={dates.time(message.sentAt)}
                    onRetry={() => void send(message.plaintext ?? message.body, message)}
                  />
                ))}
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>
      </Card>

      {systemMode && members.items.length > 0 ? (
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          <span className="tiny faint">Sending as</span>
          <Chip selected={asMemberId === null} onClick={() => setAsMemberId(null)}>
            The system
          </Chip>
          {members.items.slice(0, 6).map((member) => (
            <Chip
              key={member.id}
              selected={asMemberId === member.id}
              color={(member['color'] as string) ?? null}
              onClick={() => setAsMemberId(member.id)}
            >
              {String(member['name'])}
            </Chip>
          ))}
        </div>
      ) : null}

      <form
        className="row row--nowrap"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('social.messagePlaceholder')}
          aria-label="Message"
          autoComplete="off"
        />
        <Button variant="primary" type="submit" disabled={!draft.trim()} loading={sending} aria-label="Send">
          <Icon name="send" size={17} />
        </Button>
      </form>

      <ChatSettingsDialog
        dialog={settingsDialog}
        conversation={conversation}
        onSaved={() => {
          void load();
          onChanged();
        }}
      />
    </>
  );
}

function MessageBubble({
  message,
  text,
  time,
  onRetry,
}: {
  message: Message;
  text: string;
  time: string;
  onRetry: () => void;
}): JSX.Element {
  const mine = message.isMine;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginBottom: 'var(--space-2)',
      }}
    >
      <div style={{ maxWidth: '78%' }}>
        {message.asMember ? (
          <div className="tiny faint" style={{ textAlign: mine ? 'right' : 'left', marginBottom: 2 }}>
            {message.asMember.name}
          </div>
        ) : null}
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius)',
            background: mine ? 'var(--accent)' : 'var(--surface-sunken)',
            color: mine ? 'var(--accent-text)' : 'var(--text)',
            border: mine ? 'none' : '1px solid var(--border)',
            opacity: message.pending ? 0.6 : 1,
          }}
        >
          <p className="prose small" style={{ margin: 0 }}>
            {text}
          </p>
        </div>
        <div
          className="tiny faint"
          style={{
            textAlign: mine ? 'right' : 'left',
            marginTop: 2,
            display: 'flex',
            gap: 6,
            justifyContent: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {message.failed ? (
            <button
              type="button"
              onClick={onRetry}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--critical)',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              Not sent · tap to try again
            </button>
          ) : (
            <>
              {message.pending ? 'Sending…' : time}
              {message.encrypted ? (
                <Icon name="lock" size={9} label="Encrypted" />
              ) : (
                <Icon name="unlock" size={9} label="Not encrypted" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDay(messages: Message[]): [string, Message[]][] {
  const groups = new Map<string, Message[]>();
  for (const message of messages) {
    const key = message.sentAt.slice(0, 10);
    const bucket = groups.get(key);
    if (bucket) bucket.push(message);
    else groups.set(key, [message]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function NewConversationDialog({
  dialog,
  onCreated,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  onCreated: (threadId: string) => void;
}): JSX.Element {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ conversation: { threadId: string } }>(
        '/api/messages/conversations',
        { handle: handle.trim() },
      );
      dialog.hide();
      setHandle('');
      onCreated(result.conversation.threadId);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="New conversation"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={!handle.trim()} loading={busy}>
            Start
          </Button>
        </>
      }
    >
      <TextField
        label="Their handle"
        value={handle}
        onChange={setHandle}
        placeholder="their-handle"
        hint="Handles come from Constellations profiles."
        {...(error ? { error } : {})}
        autoFocus
      />
    </Dialog>
  );
}

function ChatSettingsDialog({
  dialog,
  conversation,
  onSaved,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  conversation: Conversation | null;
  onSaved: () => void;
}): JSX.Element {
  const toast = useToast();
  const settings = (conversation?.settings ?? {}) as Record<string, boolean>;

  const patch = (body: Record<string, unknown>): void => {
    if (!conversation) return;
    void api
      .patch(`/api/messages/conversations/${conversation.id}`, body)
      .then(() => {
        toast.success('Saved');
        onSaved();
      })
      .catch((cause: unknown) => toast.fromError(cause));
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Chat settings"
      description="These apply to this conversation on your side only."
    >
      <SwitchRow
        label="Notifications"
        hint="Off means no push or in-app alert for this conversation."
        checked={conversation?.muted !== true}
        onChange={(value) => patch({ muted: !value })}
      />
      <SwitchRow
        label="Read receipts"
        hint="When off, the other side is simply not told — never told something untrue."
        checked={settings['readReceipts'] !== false}
        onChange={(value) => patch({ settings: { ...settings, readReceipts: value } })}
      />
      <SwitchRow
        label="Pin to the top"
        checked={conversation?.pinned === true}
        onChange={(value) => patch({ pinned: value })}
      />
      <SwitchRow
        label="Archive"
        hint="Hides it from the list. Nothing is deleted."
        checked={conversation?.state === 'archived'}
        onChange={(value) => patch({ state: value ? 'archived' : 'accepted' })}
      />
    </Dialog>
  );
}
