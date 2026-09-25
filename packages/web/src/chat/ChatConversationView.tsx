import { useEffect, useRef, useState } from 'react';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useChatConversation, type ChatKind, type ChatMessage } from '../core/chat.js';
import { Avatar, AvatarStack, Button, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { MessageBubble } from './MessageBubble.js';
import { SendAsStrip } from './SendAsStrip.js';
import { ChatInfoDialog } from './ChatInfoDialog.js';
import { ForwardDialog } from './ForwardDialog.js';

/**
 * One open conversation: header, the message history, and the composer.
 * Text-only for now — media, voice and the message action menu (reply,
 * react, forward, delete) land in the next pass; this already carries the
 * data for replies/reactions/forwards so that pass only adds interaction.
 */
interface ChatConversationViewProps {
  kind: ChatKind;
  threadId: string;
  viewerMemberId: string | null;
  onBack: () => void;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function ChatConversationView({
  kind,
  threadId,
  viewerMemberId,
  onBack,
}: ChatConversationViewProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const members = useCollection('members', { enabled: kind === 'system' });
  const conversation = useChatConversation(kind, threadId, viewerMemberId);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [asMemberId, setAsMemberId] = useState<string | null>(viewerMemberId);
  const [infoOpen, setInfoOpen] = useState(false);
  const forwardDialog = useDialog<ChatMessage>();
  const deleteDialog = useDialog<ChatMessage>();

  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    setAsMemberId(viewerMemberId);
    setReplyTo(null);
    setDraft('');
    userScrolledUp.current = false;
  }, [threadId, viewerMemberId]);

  useEffect(() => {
    if (userScrolledUp.current) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.messages.length]);

  useEffect(() => {
    conversation.markRead();
  }, [conversation]);

  const messagesByOldestFirst = conversation.messages;
  const byId = new Map(messagesByOldestFirst.map((message) => [message.id, message]));

  const scrollToMessage = (id: string): void => {
    const element = document.getElementById(`chat-message-${id}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('chat-message--highlight');
    window.setTimeout(() => element.classList.remove('chat-message--highlight'), 1200);
  };

  const send = async (): Promise<void> => {
    const text = draft;
    if (!text.trim()) return;
    setDraft('');
    const options = { replyToId: replyTo?.id ?? null, asMemberId };
    setReplyTo(null);
    await conversation.send(text, options);
  };

  const react = (messageId: string, emoji: string): void => {
    void conversation.react(messageId, emoji).catch((cause: unknown) => toast.fromError(cause, 'That reaction did not go through'));
  };

  const copy = (message: ChatMessage): void => {
    void navigator.clipboard
      .writeText(message.body)
      .then(() => toast.success('Copied'))
      .catch(() => toast.fromError(new Error('Copy failed'), 'Could not copy that message'));
  };

  if (conversation.loading && !conversation.thread) {
    return (
      <div className="chat-conversation">
        <div className="chat-conversation__loading">
          <SkeletonList rows={6} />
        </div>
      </div>
    );
  }

  if (conversation.error && !conversation.thread) {
    return (
      <div className="chat-conversation">
        <ErrorPanel message={conversation.error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const thread = conversation.thread;
  const isGroupLike = thread?.subKind === 'group' || thread?.subKind === 'system';

  return (
    <div className="chat-conversation">
      <header className="chat-conversation__header">
        <IconButton icon="chevronLeft" label="Back to conversations" variant="ghost" className="chat-conversation__back" onClick={onBack} />
        {isGroupLike ? (
          <AvatarStack
            people={(thread?.participants ?? []).map((person) => ({
              name: person.name,
              src: person.avatarUrl,
              color: person.color,
              icon: person.icon,
            }))}
            size={30}
          />
        ) : (
          <Avatar
            name={thread?.title ?? '?'}
            src={thread?.person?.avatarUrl ?? null}
            color={thread?.person?.color ?? null}
            icon={thread?.person?.icon ?? null}
            size={34}
            round
          />
        )}
        <div className="chat-conversation__title">
          <span className="chat-conversation__name">{thread?.title}</span>
          {kind === 'dm' ? (
            <span className="chat-conversation__status">
              {!conversation.cryptoSupported
                ? ''
                : conversation.encryptionReady
                  ? 'End-to-end encrypted'
                  : 'Not encrypted yet'}
            </span>
          ) : isGroupLike ? (
            <span className="chat-conversation__status">{(thread?.participants.length ?? 0) || 'Everyone'} {thread?.subKind === 'system' ? '· whole system' : ''}</span>
          ) : null}
        </div>
        <IconButton icon="info" label="Conversation info" variant="ghost" onClick={() => setInfoOpen(true)} />
      </header>

      <div
        className="chat-conversation__messages"
        onScroll={(event) => {
          const target = event.currentTarget;
          userScrolledUp.current = target.scrollTop + target.clientHeight < target.scrollHeight - 80;
        }}
      >
        {messagesByOldestFirst.length === 0 ? (
          <EmptyState icon="chat" title="Say hello" body="Nothing here yet — the first message starts the conversation." />
        ) : (
          (() => {
            let lastDay = '';
            let lastSenderKey = '';
            return messagesByOldestFirst.map((message) => {
              const day = dayKey(message.sentAt);
              const senderKey = `${message.isMine}:${message.sender?.id ?? ''}`;
              const showDayHeading = day !== lastDay;
              const showAvatar = showDayHeading || senderKey !== lastSenderKey;
              const showName = kind === 'system' && showAvatar && !message.isMine;
              lastDay = day;
              lastSenderKey = senderKey;
              const quoted = message.replyToId ? byId.get(message.replyToId) ?? null : null;

              return (
                <div key={message.id} id={`chat-message-${message.id}`}>
                  {showDayHeading ? <div className="chat-day-heading">{dates.date(message.sentAt)}</div> : null}
                  <MessageBubble
                    message={message}
                    showAvatar={showAvatar}
                    showName={showName}
                    quotedMessage={quoted}
                    timeLabel={dates.time(message.sentAt)}
                    onReact={(emoji) => react(message.id, emoji)}
                    onRetry={() => void conversation.retry(message)}
                    onReply={() => setReplyTo(message)}
                    onForward={() => forwardDialog.show(message)}
                    onCopy={() => copy(message)}
                    onDelete={() => deleteDialog.show(message)}
                    onQuoteClick={quoted ? () => scrollToMessage(quoted.id) : undefined}
                  />
                </div>
              );
            });
          })()
        )}
        <div ref={bottomRef} />
      </div>

      {replyTo ? (
        <div className="chat-reply-preview">
          <div className="chat-reply-preview__body">
            <span className="chat-reply-preview__author">
              Replying to {replyTo.sender?.name ?? (replyTo.isMine ? 'yourself' : thread?.title ?? 'them')}
            </span>
            <span className="truncate">{replyTo.body}</span>
          </div>
          <IconButton icon="close" label="Cancel reply" variant="ghost" size="sm" onClick={() => setReplyTo(null)} />
        </div>
      ) : null}

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="input chat-composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          autoComplete="off"
        />
        <Button variant="primary" type="submit" aria-label="Send" disabled={!draft.trim()} loading={conversation.sending}>
          <Icon name="send" size={17} />
        </Button>
      </form>

      {kind === 'system' ? (
        <SendAsStrip members={members.items} value={asMemberId} onChange={setAsMemberId} />
      ) : null}

      {thread ? (
        <ChatInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} thread={thread} onChanged={conversation.refreshThread} />
      ) : null}

      <ForwardDialog
        open={forwardDialog.open}
        onClose={forwardDialog.hide}
        kind={kind}
        excludeThreadId={threadId}
        message={forwardDialog.value}
        onForward={(targetThreadIds) => conversation.forward(forwardDialog.value!.id, targetThreadIds)}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        onConfirm={async () => {
          if (!deleteDialog.value) return;
          await conversation.remove(deleteDialog.value.id);
        }}
        title="Delete this message?"
        body="It will be removed for everyone in this conversation."
        recoverable={false}
      />
    </div>
  );
}
