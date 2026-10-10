import { memo } from 'react';
import { plainTextPreview } from '@pluralnova/shared';
import { Avatar, IconButton } from '../ui/primitives.js';
import { ActionMenu, useActionMenu, type ActionMenuItem, type ActionMenuPosition } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { ChatMarkdown, type MentionMap } from '../ui/Markdown.js';
import { ChatAttachmentView, type ChatAttachmentLike } from '../chat/ChatAttachmentView.js';
import { ReactionPicker } from '../chat/MessageBubble.js';
import { type MessageSide, type SystemChatMessage } from '../core/systemChat.js';

/**
 * One System Chat message's content — an open row on the conversation
 * background, never a chat bubble. `side` is the caller's job (derived from
 * `sideForSequence` in core/systemChat.ts — this component never reads
 * `sequence` itself), and every normal message always shows its real
 * sender's avatar, name and timestamp on whichever side it lands; nothing
 * here ever hides or collapses that for a repeated sender, since adjacent
 * same-side messages can't happen under strict alternation.
 *
 * Mirrors `MessageBubble`'s split with its caller: the id and the row-level
 * `chat-feed-row--{side}` alignment class live on the virtualizer's own
 * wrapper div in `SystemChatConversationView.tsx`, not here — this renders
 * only the message content itself.
 */
interface SystemChatMessageRowProps {
  message: SystemChatMessage;
  side: MessageSide;
  quotedMessage: SystemChatMessage | null;
  timeLabel: string;
  mentions?: MentionMap;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenAttachment: (attachment: ChatAttachmentLike) => void;
  onQuoteClick?: () => void;
}

function quoteLabel(quoted: SystemChatMessage): string {
  if (quoted.removed) return 'Message removed';
  if (quoted.attachments.length > 0 && !quoted.body) return 'Attachment';
  return plainTextPreview(quoted.body);
}

function SystemChatMessageRowImpl({
  message,
  side,
  quotedMessage,
  timeLabel,
  mentions,
  onReact,
  onRetry,
  onReply,
  onForward,
  onCopy,
  onEdit,
  onDelete,
  onOpenAttachment,
  onQuoteClick,
}: SystemChatMessageRowProps): JSX.Element {
  const unsettled = Boolean(message.pending || message.failed);
  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);
  const menu = useActionMenu();
  const reactionPicker = useActionMenu();

  if (message.removed) {
    return (
      <div className="chat-feed chat-feed--removed">
        <span className="chat-feed__removed">Message removed</span>
      </div>
    );
  }

  // Nothing meaningful to react to, reply to, or forward until the server
  // has confirmed this message a real id — only retrying a failed send makes
  // sense before then, and that already has its own control below.
  const items: ActionMenuItem[] = unsettled
    ? []
    : [
        { key: 'react', label: 'React', icon: 'emoji', onSelect: () => reactionPicker.openFrom(lastOpenEvent(menu.position)) },
        { key: 'reply', label: 'Reply', icon: 'reply', onSelect: onReply },
        { key: 'forward', label: 'Forward', icon: 'forward', onSelect: onForward },
        ...(message.body ? [{ key: 'copy', label: 'Copy text', icon: 'duplicate' as const, onSelect: onCopy }] : []),
        { key: 'edit', label: 'Edit', icon: 'edit' as const, onSelect: onEdit },
        { key: 'delete', label: 'Delete', icon: 'trash' as const, tone: 'danger' as const, onSelect: onDelete },
      ];

  return (
    <>
      <div
        className={`chat-feed chat-feed--${unsettled ? 'pending' : side}`}
        onContextMenu={(event) => {
          if (unsettled) return;
          event.preventDefault();
          menu.openFrom(event);
        }}
      >
        <span className="chat-feed__avatar">
          <Avatar
            name={message.sender?.name ?? 'Someone'}
            src={message.sender?.avatarUrl ?? null}
            color={message.sender?.color ?? null}
            icon={message.sender?.icon ?? null}
            size={32}
            round
          />
        </span>

        <div className="chat-feed__column">
          <div className="chat-feed__header">
            <span className="chat-feed__name" style={message.sender?.color ? { color: message.sender.color } : undefined}>
              {message.sender?.prefix ? <span className="chat-message__prefix">{message.sender.prefix}</span> : null}
              {message.sender?.name ?? 'Someone'}
            </span>
            <span className="chat-feed__time">{timeLabel}</span>
            {message.edited ? <span className="chat-feed__edited">(edited)</span> : null}
          </div>

          {message.forwardedFrom ? (
            <div className="chat-message__forwarded">
              <Icon name="forward" size={12} />
              Forwarded from {message.forwardedFrom.senderLabel}
            </div>
          ) : null}

          {quotedMessage ? (
            <button type="button" className="chat-message__quote" onClick={onQuoteClick}>
              <span className="chat-message__quote-author">{quotedMessage.sender?.name ?? 'Someone'}</span>
              <span className="chat-message__quote-body truncate">{quoteLabel(quotedMessage)}</span>
            </button>
          ) : null}

          {message.attachments.length > 0 ? (
            <div className="chat-feed__attachments">
              {message.attachments.map((attachment) => (
                <ChatAttachmentView key={attachment.id} attachment={attachment} onOpen={() => onOpenAttachment(attachment)} />
              ))}
            </div>
          ) : null}

          {message.body ? <ChatMarkdown text={message.body} mentions={mentions} className="chat-feed__body" /> : null}

          {reactionEntries.length > 0 ? (
            <div className="chat-message__reactions">
              {reactionEntries.map(([emoji, ids]) => (
                <button key={emoji} type="button" className="chat-reaction-chip" onClick={() => onReact(emoji)}>
                  <span aria-hidden="true">{emoji}</span> {ids.length}
                </button>
              ))}
            </div>
          ) : null}

          {message.failed ? (
            <div className="chat-message__status chat-message__status--failed">
              <span>Not sent — {message.failed}</span>
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : message.pending ? (
            <span className="chat-message__status">Sending…</span>
          ) : null}
        </div>

        {!unsettled ? (
          <IconButton
            icon="more"
            label="Message actions"
            variant="ghost"
            size="sm"
            className="chat-feed__more"
            onClick={(event) => menu.openFrom(event)}
          />
        ) : null}
      </div>

      {!unsettled ? (
        <>
          <ActionMenu position={menu.position} onClose={menu.close} items={items} />
          <ReactionPicker
            position={reactionPicker.position}
            onClose={reactionPicker.close}
            onPick={(emoji) => {
              reactionPicker.close();
              onReact(emoji);
            }}
          />
        </>
      ) : null}
    </>
  );
}

// Memoized for the same reason as `MessageBubble`: a composer keystroke
// shouldn't re-render every row in the conversation.
export const SystemChatMessageRow = memo(SystemChatMessageRowImpl);

function lastOpenEvent(position: ActionMenuPosition): { clientX: number; clientY: number } {
  return {
    clientX: position.fromRight ? window.innerWidth - position.x : position.x,
    clientY: position.fromBottom ? window.innerHeight - position.y : position.y,
  };
}
