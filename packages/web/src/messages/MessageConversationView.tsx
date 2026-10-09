import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { readableTextOn, resolveChatAppearance } from '@pluralnova/shared';
import { useAuth, useSystemMode } from '../core/auth.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import {
  useMessageConversation,
  useMessageThreads,
  uploadMessageAttachment,
  type Message,
} from '../core/messages.js';
import { Avatar, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { MessageBubble } from '../chat/MessageBubble.js';
import { type MentionMap } from '../ui/Markdown.js';
import { type ChatAttachmentLike } from '../chat/ChatAttachmentView.js';
import { ForwardDialog, type ForwardCandidate } from '../chat/ForwardDialog.js';
import { useVirtualizedChat } from '../chat/useVirtualizedChat.js';
import { ChatComposer, type ComposerEditTarget, type ComposerReplyTarget } from '../chat/ChatComposer.js';
import { useStableRowActions } from '../chat/useStableRowActions.js';
import { MessagesInfoDialog } from './MessagesInfoDialog.js';
import { SpeakingAsSwitcher } from './SpeakingAsSwitcher.js';

/**
 * One open Messages conversation: header, history, composer — every DM is a
 * 1:1 with a friend today, so the header always shows that one person, never
 * an alter or a switcher. `data-kind="dm"` on the root is what gives this
 * screen its own accent via the shared `chat.css` rules.
 */
interface MessageConversationViewProps {
  threadId: string;
  speakingAsMemberId: string | null;
  onBack: () => void;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface ConversationRow {
  message: Message;
  showDayHeading: boolean;
  showAvatar: boolean;
  quoted: Message | null;
}

const MessageRow = memo(function MessageRow({
  row,
  dayLabel,
  timeLabel,
  mentions,
  actions,
  onQuoteClick,
}: {
  row: ConversationRow;
  dayLabel: string;
  timeLabel: string;
  mentions: MentionMap;
  actions: ReturnType<typeof useStableRowActions<Message>>;
  onQuoteClick: ((id: string) => void) | undefined;
}): JSX.Element {
  const { message, showDayHeading, showAvatar, quoted } = row;
  return (
    <>
      {showDayHeading ? <div className="chat-day-heading">{dayLabel}</div> : null}
      <MessageBubble
        message={message}
        showAvatar={showAvatar}
        showName={false}
        quotedMessage={quoted}
        timeLabel={timeLabel}
        mentions={mentions}
        onReact={(emoji) => actions.onReact(message.id, emoji)}
        onRetry={() => actions.onRetry(message)}
        onReply={() => actions.onReply(message)}
        onForward={() => actions.onForward(message)}
        onCopy={() => actions.onCopy(message)}
        onEdit={() => actions.onEdit(message)}
        onDelete={() => actions.onDelete(message)}
        onOpenAttachment={actions.onOpenAttachment}
        onQuoteClick={quoted && onQuoteClick ? () => onQuoteClick(quoted.id) : undefined}
      />
    </>
  );
});

export function MessageConversationView({ threadId, speakingAsMemberId, onBack }: MessageConversationViewProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const { settings, user } = useAuth();
  // Starts as the account's active profile, then follows fronting (or a
  // manual pick) via SpeakingAsSwitcher — see its own doc comment for why
  // this stays local to this one conversation rather than reassigning the
  // active profile itself.
  const [speakerId, setSpeakerId] = useState<string | null>(speakingAsMemberId);
  const isSystem = useSystemMode();
  const conversation = useMessageConversation(threadId, speakerId);
  const { threads: allThreads } = useMessageThreads();

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [lightbox, setLightbox] = useState<ChatAttachmentLike | null>(null);
  const forwardDialog = useDialog<Message>();
  const deleteDialog = useDialog<Message>();

  const messagesByOldestFirst = conversation.messages;
  const { scrollRef, virtualizer, userScrolledUp, handleScroll, scrollToBottom, scrollToId } = useVirtualizedChat(
    messagesByOldestFirst,
    { estimateSize: 76 },
  );

  useEffect(() => {
    setReplyTo(null);
    setEditingMessage(null);
    userScrolledUp.current = false;
  }, [threadId, userScrolledUp]);

  useEffect(() => {
    if (userScrolledUp.current) return;
    scrollToBottom();
  }, [messagesByOldestFirst.length, userScrolledUp, scrollToBottom]);

  useEffect(() => {
    conversation.markRead();
    // `conversation` itself is a fresh object every render; `markRead` is
    // individually stable (wrapped in its own `useCallback`), so depending on
    // it directly is what keeps this from re-running on every render instead
    // of only when there is actually something new to mark read.
  }, [conversation.markRead]);

  const myUserId = user?.id ?? null;
  const byId = useMemo(() => new Map(messagesByOldestFirst.map((message) => [message.id, message])), [messagesByOldestFirst]);

  // Grouping (day headings, whether to repeat an avatar) depends on the
  // previous message in the full, oldest-first order — computed once here,
  // over every message, rather than from whatever the virtualizer currently
  // has mounted, which is only ever a scrolled-to slice of the conversation.
  // `readStatus` is folded into `message` here too, so a row only gets a new
  // message object when its own data changes — not a fresh `{ ...message }`
  // spread built on every render of this component.
  const rows = useMemo<ConversationRow[]>(() => {
    let lastDay = '';
    let lastSenderKey = '';
    return messagesByOldestFirst.map((message) => {
      const day = dayKey(message.sentAt);
      const senderKey = `${message.isMine}:${message.sender?.id ?? ''}`;
      const showDayHeading = day !== lastDay;
      const showAvatar = showDayHeading || senderKey !== lastSenderKey;
      lastDay = day;
      lastSenderKey = senderKey;
      // `readBy` is seeded with the sender's own id when a message is
      // created, so "read" means someone besides the sender shows up in it —
      // not merely a non-empty list.
      const readStatus: 'read' | 'sent' | undefined = message.isMine
        ? message.readBy.some((id) => id !== myUserId)
          ? 'read'
          : 'sent'
        : undefined;
      return {
        message: readStatus ? { ...message, readStatus } : message,
        showDayHeading,
        showAvatar,
        quoted: message.replyToId ? byId.get(message.replyToId) ?? null : null,
      };
    });
  }, [messagesByOldestFirst, byId, myUserId]);

  const scrollToMessage = useCallback(
    (id: string): void => {
      scrollToId(id);
      // The target row may not exist yet — jumping the scroll position only
      // brings it into the virtualizer's rendered window; it mounts on the
      // next render, which this briefly waits out before smooth-scrolling the
      // last bit and applying the highlight, same as before virtualization.
      window.setTimeout(() => {
        const element = document.getElementById(`chat-message-${id}`);
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('chat-message--highlight');
        window.setTimeout(() => element.classList.remove('chat-message--highlight'), 1200);
      }, 50);
    },
    [scrollToId],
  );

  const rowActions = useStableRowActions<Message>({
    onReact: (messageId, emoji) => {
      void conversation.react(messageId, emoji).catch((cause: unknown) => toast.fromError(cause, 'That reaction did not go through'));
    },
    onRetry: (message) => void conversation.retry(message),
    onReply: (message) => setReplyTo(message),
    onForward: (message) => forwardDialog.show(message),
    onCopy: (message) => {
      void navigator.clipboard
        .writeText(message.body)
        .then(() => toast.success('Copied'))
        .catch(() => toast.fromError(new Error('Copy failed'), 'Could not copy that message'));
    },
    onEdit: (message) => setEditingMessage(message),
    onDelete: (message) => deleteDialog.show(message),
    onOpenAttachment: (attachment) => {
      if (attachment.mediaType === 'image') setLightbox(attachment);
    },
  });

  const replyTarget: ComposerReplyTarget | null = replyTo
    ? { id: replyTo.id, body: replyTo.body, isMine: replyTo.isMine, senderName: replyTo.sender?.name ?? null }
    : null;
  const editTarget: ComposerEditTarget | null = editingMessage
    ? { id: editingMessage.id, body: editingMessage.body }
    : null;

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

  const appearance = resolveChatAppearance(settings.messagesAppearance, thread?.settings ?? null);
  const appearanceStyle = {
    ...(appearance.wallpaper ? { '--chat-wallpaper': appearance.wallpaper } : {}),
    ...(appearance.bubbleMine
      ? { '--chat-bubble-mine': appearance.bubbleMine, '--chat-bubble-mine-text': readableTextOn(appearance.bubbleMine) }
      : {}),
    ...(appearance.bubbleTheirs ? { '--chat-bubble-theirs': appearance.bubbleTheirs } : {}),
  } as never;

  const forwardCandidates: ForwardCandidate[] = allThreads.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    avatarUrl: candidate.person?.avatarUrl,
    color: candidate.person?.color,
    icon: candidate.person?.icon,
  }));

  return (
    <div className="chat-conversation" style={appearanceStyle} data-spacing={appearance.spacing} data-kind="dm">
      <header className="chat-conversation__header">
        <IconButton icon="chevronLeft" label="Back to conversations" variant="ghost" className="chat-conversation__back" onClick={onBack} />
        <Avatar
          name={thread?.title ?? '?'}
          src={thread?.person?.avatarUrl ?? null}
          color={thread?.person?.color ?? null}
          icon={thread?.person?.icon ?? null}
          size={34}
          round
        />
        <div className="chat-conversation__title">
          <span className="chat-conversation__name">{thread?.title}</span>
          <span className="chat-conversation__status">{conversation.theirTyping ? 'Typing…' : ''}</span>
        </div>
        <IconButton icon="info" label="Conversation info" variant="ghost" onClick={() => setInfoOpen(true)} />
      </header>

      {isSystem ? <SpeakingAsSwitcher fallbackMemberId={speakingAsMemberId} onChange={setSpeakerId} /> : null}

      <div className="chat-conversation__messages" ref={scrollRef} onScroll={handleScroll}>
        {rows.length === 0 ? (
          <EmptyState icon="chat" title="Say hello" body="Nothing here yet — the first message starts the conversation." />
        ) : (
          <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  id={`chat-message-${row.message.id}`}
                  className={`chat-message-row ${row.message.isMine ? 'chat-message-row--mine' : 'chat-message-row--theirs'}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    paddingBottom: 2,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <MessageRow
                    row={row}
                    dayLabel={dates.date(row.message.sentAt)}
                    timeLabel={dates.time(row.message.sentAt)}
                    mentions={conversation.mentions}
                    actions={rowActions}
                    onQuoteClick={scrollToMessage}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ChatComposer
        replyTo={replyTarget}
        onCancelReply={() => setReplyTo(null)}
        onSend={(text, options) => conversation.send(text, options)}
        editing={editTarget}
        onCancelEdit={() => setEditingMessage(null)}
        onEditSubmit={(messageId, text) => conversation.edit(messageId, text)}
        onTyping={conversation.sendTyping}
        uploadAttachment={uploadMessageAttachment}
        sending={conversation.sending}
      />

      {thread ? (
        <MessagesInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} thread={thread} onChanged={conversation.refreshThread} />
      ) : null}

      <ForwardDialog
        open={forwardDialog.open}
        onClose={forwardDialog.hide}
        candidates={forwardCandidates}
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

      <Dialog open={lightbox !== null} onClose={() => setLightbox(null)} title={lightbox?.title || 'Image'} fullscreen>
        {lightbox ? <img className="chat-lightbox__image" src={lightbox.url} alt={lightbox.title || 'Image'} /> : null}
      </Dialog>
    </div>
  );
}
