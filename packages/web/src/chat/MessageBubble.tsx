import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, IconButton } from '../ui/primitives.js';
import { ActionMenu, useActionMenu, type ActionMenuItem, type ActionMenuPosition } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { ChatAttachmentView, type ChatAttachmentLike } from './ChatAttachmentView.js';

/** Common reactions, in the order most chat apps settle on. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * Structural, not imported from either chat feature — `SystemChatMessage`
 * (core/systemChat.ts) and `Message` (core/messages.ts) both already
 * shape-match this.
 */
export interface ChatBubbleMessage {
  id: string;
  body: string;
  isMine: boolean;
  sender: { name: string; avatarUrl?: string | null; color?: string | null; icon?: string | null; prefix?: string | null } | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  attachments: ChatAttachmentLike[];
  forwardedFrom: { senderLabel: string } | null;
  /** Only ever set on a message this account sent — absent entirely where read receipts don't exist, such as System Chat. */
  readStatus?: 'sent' | 'read';
  pending?: boolean;
  failed?: string;
}

/**
 * One message. Grouping (whether to repeat the avatar/name) and the quoted
 * reply preview are the caller's job — this only ever renders what it is
 * handed, so a conversation and a forward preview can share it.
 *
 * Contextual actions (reply, react, forward, copy, delete) open from a small
 * "…" button — always visible, so a keyboard or touch user can reach every
 * action a right-click or long-press would also open.
 */
interface MessageBubbleProps {
  message: ChatBubbleMessage;
  showAvatar: boolean;
  showName: boolean;
  quotedMessage: ChatBubbleMessage | null;
  timeLabel: string;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onOpenAttachment: (attachment: ChatAttachmentLike) => void;
  onQuoteClick?: () => void;
}

function MessageBubbleImpl({
  message,
  showAvatar,
  showName,
  quotedMessage,
  timeLabel,
  onReact,
  onRetry,
  onReply,
  onForward,
  onCopy,
  onDelete,
  onOpenAttachment,
  onQuoteClick,
}: MessageBubbleProps): JSX.Element {
  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);
  const menu = useActionMenu();
  const reactionPicker = useActionMenu();

  const items: ActionMenuItem[] = [
    { key: 'react', label: 'React', icon: 'emoji', onSelect: () => reactionPicker.openFrom(lastOpenEvent(menu.position)) },
    { key: 'reply', label: 'Reply', icon: 'reply', onSelect: onReply },
    { key: 'forward', label: 'Forward', icon: 'forward', onSelect: onForward },
    ...(message.body ? [{ key: 'copy', label: 'Copy text', icon: 'duplicate' as const, onSelect: onCopy }] : []),
    ...(message.isMine
      ? [{ key: 'delete', label: 'Delete', icon: 'trash' as const, tone: 'danger' as const, onSelect: onDelete }]
      : []),
  ];

  return (
    <div
      className={`chat-message ${message.isMine ? 'chat-message--mine' : 'chat-message--theirs'}`}
      onContextMenu={(event) => {
        event.preventDefault();
        menu.openFrom(event);
      }}
    >
      {!message.isMine ? (
        <span className="chat-message__avatar">
          {showAvatar ? (
            <Avatar
              name={message.sender?.name ?? 'Someone'}
              src={message.sender?.avatarUrl ?? null}
              color={message.sender?.color ?? null}
              icon={message.sender?.icon ?? null}
              size={30}
              round
            />
          ) : null}
        </span>
      ) : null}

      <div className="chat-message__column">
        {!message.isMine && showName ? (
          <div className="chat-message__name" style={message.sender?.color ? { color: message.sender.color } : undefined}>
            {message.sender?.prefix ? <span className="chat-message__prefix">{message.sender.prefix}</span> : null}
            {message.sender?.name ?? 'Someone'}
          </div>
        ) : null}

        {message.forwardedFrom ? (
          <div className="chat-message__forwarded">
            <Icon name="forward" size={12} />
            Forwarded from {message.forwardedFrom.senderLabel}
          </div>
        ) : null}

        {quotedMessage ? (
          <button type="button" className="chat-message__quote" onClick={onQuoteClick}>
            <span className="chat-message__quote-author">
              {quotedMessage.sender?.name ?? (quotedMessage.isMine ? 'You' : 'Them')}
            </span>
            <span className="chat-message__quote-body truncate">
              {quotedMessage.attachments.length > 0 && !quotedMessage.body ? 'Attachment' : quotedMessage.body}
            </span>
          </button>
        ) : null}

        <div className="chat-message__bubble-row">
          <div className="chat-bubble">
            {message.attachments.map((attachment) => (
              <ChatAttachmentView key={attachment.id} attachment={attachment} onOpen={() => onOpenAttachment(attachment)} />
            ))}
            {message.body ? <p className="chat-bubble__text">{message.body}</p> : null}
            <span className="chat-bubble__meta">
              <span className="chat-bubble__time">{timeLabel}</span>
              {message.readStatus !== undefined ? (
                <Icon
                  name={message.readStatus === 'read' ? 'checkDouble' : 'check'}
                  size={11}
                  label={message.readStatus === 'read' ? 'Read' : 'Sent'}
                  className={message.readStatus === 'read' ? 'chat-bubble__read chat-bubble__read--read' : 'chat-bubble__read'}
                />
              ) : null}
            </span>
          </div>
          <IconButton
            icon="more"
            label="Message actions"
            variant="ghost"
            size="sm"
            className="chat-message__more"
            onClick={(event) => menu.openFrom(event)}
          />
        </div>

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

      <ActionMenu position={menu.position} onClose={menu.close} items={items} />
      <ReactionPicker
        position={reactionPicker.position}
        onClose={reactionPicker.close}
        onPick={(emoji) => {
          reactionPicker.close();
          onReact(emoji);
        }}
      />
    </div>
  );
}

// Memoized: every message bubble in a conversation otherwise re-renders on
// each composer keystroke, since the composer's draft state lives in the
// same component tree that hands this its props.
export const MessageBubble = memo(MessageBubbleImpl);

/** The reaction menu item has no pointer event of its own — it opens at
 *  wherever the "…" menu already is, rather than requiring a second click. */
function lastOpenEvent(position: ActionMenuPosition): { clientX: number; clientY: number } {
  return {
    clientX: position.fromRight ? window.innerWidth - position.x : position.x,
    clientY: position.fromBottom ? window.innerHeight - position.y : position.y,
  };
}

function ReactionPicker({
  position,
  onClose,
  onPick,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  onPick: (emoji: string) => void;
}): JSX.Element | null {
  // The six quick picks below are a shortcut, not the whole set — "Other"
  // reaches any emoji at all through the device's own emoji keyboard, so a
  // reaction is never limited to this fixed list.
  const [showOther, setShowOther] = useState(false);
  const [other, setOther] = useState('');

  if (!position.open) return null;
  const style = {
    position: 'fixed' as const,
    [position.fromRight ? 'right' : 'left']: position.x,
    [position.fromBottom ? 'bottom' : 'top']: position.y,
  };

  const reset = (): void => {
    setShowOther(false);
    setOther('');
  };
  const submitOther = (): void => {
    const trimmed = other.trim();
    if (trimmed) onPick(trimmed);
    reset();
  };
  const handleClose = (): void => {
    reset();
    onClose();
  };

  return createPortal(
    <div className="reaction-picker" role="menu" style={style}>
      {showOther ? (
        <>
          <input
            className="reaction-picker__input"
            autoFocus
            aria-label="Type any emoji to react with"
            placeholder="Any emoji…"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitOther();
              if (event.key === 'Escape') handleClose();
            }}
          />
          <button type="button" className="reaction-picker__dismiss" aria-label="Add this reaction" onClick={submitOther}>
            <Icon name="check" size={14} />
          </button>
        </>
      ) : (
        <>
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" className="reaction-picker__option" onClick={() => onPick(emoji)}>
              {emoji}
            </button>
          ))}
          <button type="button" className="reaction-picker__option" aria-label="Pick another emoji" onClick={() => setShowOther(true)}>
            <Icon name="plus" size={14} />
          </button>
        </>
      )}
      <button type="button" className="reaction-picker__dismiss" aria-label="Close" onClick={handleClose}>
        <Icon name="close" size={14} />
      </button>
    </div>,
    document.body,
  );
}
