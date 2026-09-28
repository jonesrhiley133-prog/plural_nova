import { IconButton } from '../ui/primitives.js';
import { Icon, type IconName } from '../ui/Icon.js';

/**
 * Structural, not imported from either chat feature: `SystemChatAttachment`
 * (core/systemChat.ts) and `MessageAttachment` (core/messages.ts) both already
 * shape-match this, so either can be passed straight in with no coupling
 * between the two features' data layers.
 */
export interface ChatAttachmentLike {
  id: string;
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  sizeBytes: number;
  title: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const DOC_ICON: IconName = 'note';

/** One attachment as it renders inside a sent message bubble. */
export function ChatAttachmentView({ attachment, onOpen }: { attachment: ChatAttachmentLike; onOpen?: () => void }): JSX.Element {
  if (attachment.mediaType === 'image') {
    return (
      <button type="button" className="chat-attachment chat-attachment--image" onClick={onOpen}>
        <img src={attachment.url} alt={attachment.title || 'Image'} loading="lazy" />
      </button>
    );
  }
  if (attachment.mediaType === 'video') {
    return (
      <div className="chat-attachment chat-attachment--video">
        <video src={attachment.url} controls preload="metadata" />
      </div>
    );
  }
  if (attachment.mediaType === 'audio') {
    return (
      <div className="chat-attachment chat-attachment--audio">
        <audio src={attachment.url} controls />
      </div>
    );
  }
  return (
    <a
      className="chat-attachment chat-attachment--document"
      href={attachment.url}
      download={attachment.title || undefined}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name={DOC_ICON} size={22} />
      <span className="chat-attachment__doc-body">
        <span className="chat-attachment__doc-title truncate">{attachment.title || 'File'}</span>
        <span className="chat-attachment__doc-size">{formatBytes(attachment.sizeBytes)}</span>
      </span>
      <Icon name="download" size={16} />
    </a>
  );
}

/** An attachment already uploaded but not sent yet, shown above the composer with a way to drop it. */
export function PendingAttachmentChip({ attachment, onRemove }: { attachment: ChatAttachmentLike; onRemove: () => void }): JSX.Element {
  const icon: IconName = attachment.mediaType === 'video' ? 'video' : attachment.mediaType === 'audio' ? 'mic' : DOC_ICON;
  return (
    <div className="chat-pending-attachment">
      {attachment.mediaType === 'image' ? (
        <img src={attachment.url} alt="" />
      ) : (
        <span className="chat-pending-attachment__icon">
          <Icon name={icon} size={18} />
        </span>
      )}
      <IconButton
        icon="close"
        label={`Remove ${attachment.title || 'attachment'}`}
        size="sm"
        variant="ghost"
        className="chat-pending-attachment__remove"
        onClick={onRemove}
      />
    </div>
  );
}
