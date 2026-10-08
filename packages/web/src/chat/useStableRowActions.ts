import { useMemo, useRef } from 'react';
import type { ChatAttachmentLike } from './ChatAttachmentView.js';

export interface RowActions<TMessage> {
  onReact: (messageId: string, emoji: string) => void;
  onRetry: (message: TMessage) => void;
  onReply: (message: TMessage) => void;
  onForward: (message: TMessage) => void;
  onCopy: (message: TMessage) => void;
  onDelete: (message: TMessage) => void;
  onOpenAttachment: (attachment: ChatAttachmentLike) => void;
}

/**
 * Returns the same object identity for the life of the component, whose
 * methods always call through to whatever was passed in on the latest
 * render. A message row wrapped in `React.memo` only re-renders when a prop
 * actually changes — these actions close over things like `useDialog()`'s
 * `show`/`hide` (recreated every render by design, unrelated to this file),
 * so without this indirection every row would still re-render whenever the
 * conversation view re-renders for any reason, memo or not.
 */
export function useStableRowActions<TMessage>(actions: RowActions<TMessage>): RowActions<TMessage> {
  const latest = useRef(actions);
  latest.current = actions;

  return useMemo<RowActions<TMessage>>(
    () => ({
      onReact: (messageId, emoji) => latest.current.onReact(messageId, emoji),
      onRetry: (message) => latest.current.onRetry(message),
      onReply: (message) => latest.current.onReply(message),
      onForward: (message) => latest.current.onForward(message),
      onCopy: (message) => latest.current.onCopy(message),
      onDelete: (message) => latest.current.onDelete(message),
      onOpenAttachment: (attachment) => latest.current.onOpenAttachment(attachment),
    }),
    [],
  );
}
