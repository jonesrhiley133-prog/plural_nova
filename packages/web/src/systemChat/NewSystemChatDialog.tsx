import { useMemo, useState } from 'react';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { createSystemThread } from '../core/systemChat.js';
import { Avatar, Button } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Dialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Starting a new In-Sys Chat: pick one alter for a direct chat, or several
 * for a group. This always picks from the roster already on this account —
 * the same members Fronting and Quick Front show — never the external
 * Friends list Messages' new-conversation dialog picks from.
 */
interface NewSystemChatDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

export function NewSystemChatDialog({ open, onClose, onCreated }: NewSystemChatDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} title="New chat">
      <SystemPicker onCreated={onCreated} />
    </Dialog>
  );
}

function SystemPicker({ onCreated }: { onCreated: (threadId: string) => void }): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const members = useCollection('members');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = members.items.filter((member) => member['archived'] !== true);
    if (!needle) return list;
    return list.filter((member) => String(member['name'] ?? '').toLowerCase().includes(needle));
  }, [members.items, query]);

  const toggle = (id: string): void => {
    setSelected((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  };

  const start = async (): Promise<void> => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const thread = await createSystemThread({
        kind: selected.length === 1 ? 'direct' : 'group',
        participantMemberIds: selected,
      });
      onCreated(thread.id);
    } catch (cause) {
      toast.fromError(cause, 'Could not start that chat');
    } finally {
      setBusy(false);
    }
  };

  if (members.items.length === 0 && !members.loading) {
    return (
      <EmptyState
        icon="member"
        title={term('No {{members}} yet')}
        body={term('Add someone to the roster first, then start a chat with them here.')}
      />
    );
  }

  return (
    <div className="stack">
      <SearchField value={query} onChange={setQuery} placeholder={term('Search {{members}}')} />
      <div className="chat-picker-list">
        {filtered.map((member) => {
          const isSelected = selected.includes(member.id);
          const fronting = member['frontStatus'] === 'front';
          return (
            <button
              key={member.id}
              type="button"
              className="chat-picker-row"
              aria-pressed={isSelected}
              onClick={() => toggle(member.id)}
            >
              <span className="chat-picker-row__avatar">
                <Avatar
                  name={String(member['name'])}
                  src={(member['avatarUrl'] as string) ?? null}
                  color={(member['color'] as string) ?? null}
                  size={38}
                  round
                  ring={fronting}
                />
              </span>
              <span className="chat-picker-row__body">
                <span className="chat-picker-row__name">
                  {String(member['name'])}
                  {member['chatPrefix'] ? <span className="chat-picker-row__prefix">{String(member['chatPrefix'])}</span> : null}
                </span>
                {fronting ? <span className="tiny" style={{ color: 'var(--positive)' }}>Fronting</span> : null}
              </span>
              <span className="chat-picker-row__check" aria-hidden="true">
                {isSelected ? <Icon name="check" size={16} /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="row row--between">
        <span className="tiny faint">
          {selected.length === 0
            ? 'Choose one for a direct chat, or several for a group.'
            : selected.length === 1
              ? 'Starting a direct chat.'
              : `Starting a group of ${selected.length}.`}
        </span>
        <Button variant="primary" disabled={selected.length === 0} loading={busy} onClick={() => void start()}>
          Start chat
        </Button>
      </div>
    </div>
  );
}
