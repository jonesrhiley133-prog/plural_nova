import { Avatar } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import type { ChatMessage } from '../core/chat.js';

/**
 * One message. Grouping (whether to repeat the avatar/name) and the quoted
 * reply preview are the caller's job — this only ever renders what it is
 * handed, so a conversation and a forward preview can share it.
 */
interface MessageBubbleProps {
  message: ChatMessage;
  showAvatar: boolean;
  showName: boolean;
  quotedMessage: ChatMessage | null;
  timeLabel: string;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onQuoteClick?: () => void;
}

export function MessageBubble({
  message,
  showAvatar,
  showName,
  quotedMessage,
  timeLabel,
  onReact,
  onRetry,
  onQuoteClick,
}: MessageBubbleProps): JSX.Element {
  const reactionEntries = Object.entries(message.reactions).filter(([, ids]) => ids.length > 0);

  return (
    <div className={`chat-message ${message.isMine ? 'chat-message--mine' : 'chat-message--theirs'}`}>
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

        <div className="chat-bubble">
          <p className="chat-bubble__text">{message.body}</p>
          <span className="chat-bubble__meta">
            {message.kind === 'dm' ? (
              <Icon name={message.encrypted ? 'lock' : 'unlock'} size={9} label={message.encrypted ? 'Encrypted' : 'Not encrypted'} />
            ) : null}
            <span className="chat-bubble__time">{timeLabel}</span>
          </span>
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
    </div>
  );
}
