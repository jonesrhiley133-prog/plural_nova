import { useCallback, useEffect, useRef, useState } from 'react';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useCollection } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * System chat.
 *
 * Internal conversation, kept entirely inside the account — it is not part of
 * the social layer and it never leaves. Messages read oldest to newest and each
 * one is attributed to whoever wrote it.
 *
 * This talks to the default whole-system thread of the newer, thread-based
 * chat API (see `routes/system.ts`) — one screen showing one conversation,
 * pending the fuller multi-thread rebuild.
 */

const REACTIONS = ['✓', '★', '♡', '◍', '!'];

export default function SystemChat(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();
  const members = useCollection('members');

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [asMemberId, setAsMemberId] = useState<string | null>(activeMemberId);
  const [replyTo, setReplyTo] = useState<StoredRecord | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<{ threads: StoredRecord[] }>('/api/system/chat/threads')
      .then((result) => setThreadId(String(result.threads[0]?.id ?? '')))
      .catch((cause: unknown) => setError(messageFor(cause)));
  }, []);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const result = await api.get<{ messages: StoredRecord[] }>(
        `/api/system/chat/threads/${threadId}/messages`,
        { limit: 150 },
      );
      setMessages(result.messages);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'systemChat.new') void load();
    });
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (): Promise<void> => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setSending(true);
    try {
      await api.post(`/api/system/chat/threads/${threadId}/messages`, {
        body,
        memberId: asMemberId,
        replyToId: replyTo?.id ?? null,
      });
      setDraft('');
      setReplyTo(null);
      await load();
    } catch (cause) {
      toast.fromError(cause, 'That message did not send');
    } finally {
      setSending(false);
    }
  };

  const react = async (message: StoredRecord, emoji: string): Promise<void> => {
    try {
      await api.post(`/api/system/chat/messages/${message.id}/reactions`, { emoji, memberId: asMemberId });
      await load();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  const nameOf = (id: string | null): StoredRecord | undefined =>
    id ? members.items.find((member) => member.id === id) : undefined;

  return (
    <>
      <PageHeader
        title={term('{{System}} chat')}
        description={term('Between the {{members}}, and nowhere else. This never leaves your account.')}
      />

      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : (
        <Card flush style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ maxHeight: '56vh', overflowY: 'auto', padding: 'var(--space-3)' }}>
            {messages.length === 0 ? (
              <EmptyState
                icon="chat"
                title="Nothing here yet"
                body={term('A place for the {{members}} to talk to each other. Nobody outside can see it.')}
              />
            ) : (
              messages.map((message, index) => {
                const author = nameOf((message['memberId'] as string) ?? null);
                const previous = messages[index - 1];
                const sameAuthor = previous && previous['memberId'] === message['memberId'];
                const reactions = (message['reactions'] ?? {}) as Record<string, string[]>;
                const repliedTo = message['replyToId']
                  ? messages.find((candidate) => candidate.id === message['replyToId'])
                  : null;

                return (
                  <div
                    key={message.id}
                    style={{ marginBottom: 'var(--space-3)', marginTop: sameAuthor ? 'calc(var(--space-2) * -1)' : 0 }}
                  >
                    <div className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
                      <span style={{ width: 30, flexShrink: 0 }}>
                        {!sameAuthor ? (
                          <Avatar
                            name={String(author?.['name'] ?? term('The {{system}}'))}
                            src={(author?.['avatarUrl'] as string) ?? null}
                            color={(author?.['color'] as string) ?? null}
                            icon={(author?.['icon'] as string) ?? null}
                            size={30}
                            round
                          />
                        ) : null}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {!sameAuthor ? (
                          <div className="tiny faint" style={{ marginBottom: 2 }}>
                            <strong style={{ color: (author?.['color'] as string) || 'var(--text-muted)' }}>
                              {String(author?.['name'] ?? term('The {{system}}'))}
                            </strong>{' '}
                            · {dates.time(String(message['sentAt']))}
                          </div>
                        ) : null}

                        {repliedTo ? (
                          <div
                            className="tiny faint truncate"
                            style={{ borderLeft: '2px solid var(--border-strong)', paddingLeft: 6, marginBottom: 3 }}
                          >
                            {String(nameOf((repliedTo['memberId'] as string) ?? null)?.['name'] ?? 'Someone')}:{' '}
                            {String(repliedTo['body'])}
                          </div>
                        ) : null}

                        <p className="prose small" style={{ margin: 0 }}>
                          {String(message['body'])}
                        </p>

                        <div className="row" style={{ marginTop: 3 }}>
                          {Object.entries(reactions).map(([emoji, who]) => (
                            <Chip key={emoji} onClick={() => void react(message, emoji)}>
                              {emoji} {who.length}
                            </Chip>
                          ))}
                          <span className="row" style={{ opacity: 0.5 }}>
                            {REACTIONS.filter((emoji) => !reactions[emoji]).slice(0, 3).map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void react(message, emoji)}
                                aria-label={`React with ${emoji}`}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  color: 'var(--text-faint)',
                                  padding: '0 2px',
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                            <IconButton
                              icon="message"
                              label="Reply to this message"
                              variant="ghost"
                              size="sm"
                              onClick={() => setReplyTo(message)}
                            />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottom} />
          </div>
        </Card>
      )}

      {members.items.length > 0 ? (
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          <span className="tiny faint">Writing as</span>
          <Chip selected={asMemberId === null} onClick={() => setAsMemberId(null)}>
            {term('The {{system}}')}
          </Chip>
          {members.items.map((member) => (
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

      {replyTo ? (
        <div className="row row--between" style={{ marginBottom: 'var(--space-2)' }}>
          <span className="tiny faint truncate">Replying to: {String(replyTo['body'])}</span>
          <IconButton icon="close" label="Cancel reply" variant="ghost" size="sm" onClick={() => setReplyTo(null)} />
        </div>
      ) : null}

      <form
        className="row row--nowrap"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          autoComplete="off"
        />
        <Button variant="primary" type="submit" disabled={!draft.trim()} loading={sending} aria-label="Send">
          <Icon name="send" size={17} />
        </Button>
      </form>
    </>
  );
}
