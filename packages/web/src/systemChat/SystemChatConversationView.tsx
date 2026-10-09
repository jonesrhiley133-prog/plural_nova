import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { readableTextOn, resolveChatAppearance } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import {
  useSystemChatConversation,
  useSystemChatThreads,
  uploadSystemChatAttachment,
  sideForSequence,
  type MessageSide,
  type SystemChatMessage,
} from '../core/systemChat.js';
import { Avatar, AvatarStack, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { SystemChatMessageRow } from './SystemChatMessageRow.js';
import { type MentionMap } from '../ui/Markdown.js';
import { type ChatAttachmentLike } from '../chat/ChatAttachmentView.js';
import { ForwardDialog, type ForwardCandidate } from '../chat/ForwardDialog.js';
import { useVirtualizedChat } from '../chat/useVirtualizedChat.js';
import { ChatComposer, type ComposerEditTarget, type ComposerReplyTarget } from '../chat/ChatComposer.js';
import { useStableRowActions } from '../chat/useStableRowActions.js';
import { SendAsStrip } from './SendAsStrip.js';
import { SystemChatInfoDialog } from './SystemChatInfoDialog.js';
import { ChatIcon, readChatIcon } from './ChatIcon.js';

/**
 * One open In-Sys Chat conversation: header, history, composer. The header
 * avatar/title reflect this thread's counterpart, not the active chatter —
 * that only decides which threads are listed and who "mine" means below.
 */
interface SystemChatConversationViewProps {
  threadId: string;
  viewerMemberId: string | null;
  onBack: () => void;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface ConversationRow {
  message: SystemChatMessage;
  showDayHeading: boolean;
  /** The message's permanent position, never who sent it — see `sideForSequence`. */
  side: MessageSide;
  quoted: SystemChatMessage | null;
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
  actions: ReturnType<typeof useStableRowActions<SystemChatMessage>>;
  onQuoteClick: ((id: string) => void) | undefined;
}): JSX.Element {
  const { message, showDayHeading, side, quoted } = row;
  return (
    <>
      {showDayHeading ? <div className="chat-day-heading">{dayLabel}</div> : null}
      <SystemChatMessageRow
        message={message}
        side={side}
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

export function SystemChatConversationView({ threadId, viewerMemberId, onBack }: SystemChatConversationViewProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const { settings } = useAuth();
  const members = useCollection('members');
  const conversation = useSystemChatConversation(threadId, viewerMemberId);
  const { threads: allThreads } = useSystemChatThreads();

  const [replyTo, setReplyTo] = useState<SystemChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<SystemChatMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [lightbox, setLightbox] = useState<ChatAttachmentLike | null>(null);
  const forwardDialog = useDialog<SystemChatMessage>();
  const deleteDialog = useDialog<SystemChatMessage>();

  const messagesByOldestFirst = conversation.messages;
  // Every row now always shows its full avatar/name/timestamp header (no
  // collapsing for a repeated sender), so the average row is a bit taller
  // than the old mixed collapsed/full-row estimate.
  const { scrollRef, virtualizer, userScrolledUp, handleScroll, scrollToBottom, scrollToId } = useVirtualizedChat(
    messagesByOldestFirst,
    { estimateSize: 84 },
  );

  useEffect(() => {
    setReplyTo(null);
    setEditingMessage(null);
    userScrolledUp.current = false;
  }, [threadId, viewerMemberId, userScrolledUp]);

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

  const byId = useMemo(() => new Map(messagesByOldestFirst.map((message) => [message.id, message])), [messagesByOldestFirst]);

  // Day headings depend on the previous message in the full, oldest-first
  // order — computed once here, over every message, rather than from
  // whatever the virtualizer currently has mounted, which is only ever a
  // scrolled-to slice of the conversation. Unlike the old bubble layout,
  // there is no sender-grouping to track alongside it: strict alternation
  // means two messages from the same sender can never land adjacent and
  // same-sided, so every message always shows its own avatar and name.
  const rows = useMemo<ConversationRow[]>(() => {
    let lastDay = '';
    return messagesByOldestFirst.map((message) => {
      const day = dayKey(message.sentAt);
      const showDayHeading = day !== lastDay;
      lastDay = day;
      return {
        message,
        showDayHeading,
        side: sideForSequence(message.sequence),
        quoted: message.replyToId ? byId.get(message.replyToId) ?? null : null,
      };
    });
  }, [messagesByOldestFirst, byId]);

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

  const rowActions = useStableRowActions<SystemChatMessage>({
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
    ? {
        id: replyTo.id,
        body: replyTo.body,
        // Purely a cosmetic "yourself" label on the reply preview — unrelated
        // to alignment, which never depends on who's currently sending as whom.
        isMine: Boolean(conversation.sendAsMemberId) && replyTo.sender?.id === conversation.sendAsMemberId,
        senderName: replyTo.sender?.name ?? null,
      }
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
  const isGroupLike = thread?.kind === 'group' || thread?.kind === 'system';
  const chatIcon = thread ? readChatIcon(thread.settings) : null;

  const appearance = resolveChatAppearance(settings.chatAppearance, thread?.settings ?? null);
  const appearanceStyle = {
    ...(appearance.wallpaper ? { '--chat-wallpaper': appearance.wallpaper } : {}),
    ...(appearance.bubbleMine
      ? { '--chat-bubble-mine': appearance.bubbleMine, '--chat-bubble-mine-text': readableTextOn(appearance.bubbleMine) }
      : {}),
    ...(appearance.bubbleTheirs ? { '--chat-bubble-theirs': appearance.bubbleTheirs } : {}),
  } as never;

  const forwardCandidates: ForwardCandidate[] = allThreads.map((candidate) => {
    const candidateGroupLike = candidate.kind === 'group' || candidate.kind === 'system';
    return {
      id: candidate.id,
      title: candidate.title,
      avatarUrl: candidate.person?.avatarUrl,
      color: candidate.person?.color ?? (candidateGroupLike ? 'var(--accent)' : null),
      icon: candidateGroupLike ? 'group' : candidate.person?.icon,
      isGroupLike: candidateGroupLike,
    };
  });

  return (
    <div className="chat-conversation" style={appearanceStyle} data-spacing={appearance.spacing}>
      <header className="chat-conversation__header">
        <IconButton icon="chevronLeft" label="Back to conversations" variant="ghost" className="chat-conversation__back" onClick={onBack} />
        {chatIcon ? (
          <ChatIcon icon={chatIcon} size={34} />
        ) : isGroupLike ? (
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
          {isGroupLike ? (
            <span className="chat-conversation__status">
              {(thread?.participants.length ?? 0) || 'Everyone'} {thread?.kind === 'system' ? '· whole system' : ''}
            </span>
          ) : null}
        </div>
        <IconButton icon="info" label="Conversation info" variant="ghost" onClick={() => setInfoOpen(true)} />
      </header>

      <div className="chat-conversation__messages" ref={scrollRef} onScroll={handleScroll}>
        {rows.length === 0 ? (
          <EmptyState icon="chat" title="Say hello" body="Nothing here yet — the first message starts the conversation." />
        ) : (
          <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]!;
              // A send still in flight never commits to a side — it would
              // only be a guess, and could visibly flip once the server
              // assigns the real sequence. See `sideForSequence`.
              const unsettled = Boolean(row.message.pending || row.message.failed);
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  id={`chat-message-${row.message.id}`}
                  className={`chat-feed-row chat-feed-row--${unsettled ? 'pending' : row.side}`}
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
        uploadAttachment={uploadSystemChatAttachment}
        sending={conversation.sending}
      />

      <SendAsStrip members={members.items} value={conversation.sendAsMemberId} onChange={conversation.setSendAsMemberId} />

      {thread ? (
        <SystemChatInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} thread={thread} onChanged={conversation.refreshThread} />
      ) : null}

      <ForwardDialog
        open={forwardDialog.open}
        onClose={forwardDialog.hide}
        candidates={forwardCandidates}
        excludeThreadId={threadId}
        // `ForwardDialog` is shared with Messages (DMs), whose "You"/sender-name
        // quote preview reads `isMine` — System Chat has no such notion on the
        // message itself, so this always shows the real sender's name instead.
        message={forwardDialog.value ? { ...forwardDialog.value, isMine: false } : null}
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
