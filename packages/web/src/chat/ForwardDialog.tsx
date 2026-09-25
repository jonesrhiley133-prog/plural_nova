import { useState } from 'react';
import { useChatThreads, type ChatKind, type ChatMessage } from '../core/chat.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Dialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Forwarding is scoped to conversations of the same kind as the message being
 * forwarded — a system message can only reach other system threads, a dm only
 * other dms. Both backends send a forward differently under the hood
 * (`useChatConversation.forward` already knows which), so this only needs to
 * offer valid targets, not care how the send happens.
 */
interface ForwardDialogProps {
  open: boolean;
  onClose: () => void;
  kind: ChatKind;
  excludeThreadId: string;
  message: ChatMessage | null;
  onForward: (targetThreadIds: string[]) => Promise<void>;
}

export function ForwardDialog({ open, onClose, kind, excludeThreadId, message, onForward }: ForwardDialogProps): JSX.Element {
  const toast = useToast();
  const { threads } = useChatThreads(kind);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const candidates = threads.filter((thread) => thread.id !== excludeThreadId);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? candidates.filter((thread) => thread.title.toLowerCase().includes(needle)) : candidates;

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

        {candidates.length === 0 ? (
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
                const isGroupLike = thread.subKind === 'group' || thread.subKind === 'system';
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
                        src={thread.person?.avatarUrl ?? null}
                        color={thread.person?.color ?? (isGroupLike ? 'var(--accent)' : null)}
                        icon={isGroupLike ? 'group' : thread.person?.icon ?? null}
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
