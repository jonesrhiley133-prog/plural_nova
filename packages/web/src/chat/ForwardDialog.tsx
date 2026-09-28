import { useState } from 'react';
import { useToast } from '../core/toast.js';
import { Avatar, Button } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Dialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import type { ChatBubbleMessage } from './MessageBubble.js';

/**
 * Structural, like `ChatBubbleMessage` — a forward target is just enough of a
 * thread to draw a picker row. Each feature's conversation view fetches its
 * own thread list (`useSystemChatThreads`/`useMessageThreads`) and maps it to
 * this shape, so forwarding never has to know which feature it is running in
 * or call a hook of its own.
 */
export interface ForwardCandidate {
  id: string;
  title: string;
  avatarUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  isGroupLike?: boolean;
}

interface ForwardDialogProps {
  open: boolean;
  onClose: () => void;
  candidates: ForwardCandidate[];
  excludeThreadId: string;
  message: ChatBubbleMessage | null;
  onForward: (targetThreadIds: string[]) => Promise<void>;
}

export function ForwardDialog({ open, onClose, candidates, excludeThreadId, message, onForward }: ForwardDialogProps): JSX.Element {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const targets = candidates.filter((thread) => thread.id !== excludeThreadId);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? targets.filter((thread) => thread.title.toLowerCase().includes(needle)) : targets;

  const toggle = (id: string): void => {
    setSelected((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  };

  const send = async (): Promise<void> => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await onForward(selected);
      toast.success(selected.length === 1 ? 'Forwarded' : `Forwarded to ${selected.length} chats`);
      setSelected([]);
      setQuery('');
      onClose();
    } catch (cause) {
      toast.fromError(cause, 'Could not forward that message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Forward message">
      <div className="stack">
        {message ? (
          <div className="chat-message__quote" style={{ cursor: 'default' }}>
            <span className="chat-message__quote-author">{message.sender?.name ?? (message.isMine ? 'You' : 'Them')}</span>
            <span className="chat-message__quote-body truncate">
              {message.attachments.length > 0 && !message.body ? 'Attachment' : message.body}
            </span>
          </div>
        ) : null}

        {targets.length === 0 ? (
          <EmptyState
            icon="forward"
            title="No other chats yet"
            body="Start another conversation first, then you can forward this into it."
          />
        ) : (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search conversations" />
            <div className="chat-picker-list">
              {filtered.map((thread) => {
                const isSelected = selected.includes(thread.id);
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className="chat-picker-row"
                    aria-pressed={isSelected}
                    onClick={() => toggle(thread.id)}
                  >
                    <span className="chat-picker-row__avatar">
                      <Avatar
                        name={thread.title || '?'}
                        src={thread.avatarUrl ?? null}
                        color={thread.color ?? (thread.isGroupLike ? 'var(--accent)' : null)}
                        icon={thread.isGroupLike ? 'group' : (thread.icon ?? null)}
                        size={38}
                        round
                      />
                    </span>
                    <span className="chat-picker-row__body">
                      <span className="chat-picker-row__name">{thread.title || 'Untitled'}</span>
                    </span>
                    <span className="chat-picker-row__check" aria-hidden="true">
                      {isSelected ? <Icon name="check" size={16} /> : null}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 ? <p className="small faint">No conversations match that search.</p> : null}
            </div>
            <div className="row row--between">
              <span className="tiny faint">
                {selected.length === 0 ? 'Choose one or more conversations.' : `Forwarding to ${selected.length}.`}
              </span>
              <Button variant="primary" disabled={selected.length === 0} loading={busy} onClick={() => void send()}>
                Forward
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
