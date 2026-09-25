import { useEffect, useMemo, useState } from 'react';
import { api, messageFor } from '../core/api.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { createSystemThread, startDirectMessage, type ChatKind } from '../core/chat.js';
import { Avatar, Button, Chip } from '../ui/primitives.js';
import { SearchField, TextField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Dialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Starting a new conversation.
 *
 * System chat picks from the roster already on this account — search, avatar,
 * fronting status, multi-select for a group. Direct messages pick from
 * friends already made on the social side, since a dm to a stranger needs
 * their handle first and that flow already exists on the Friends screen.
 */
interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  kind: ChatKind;
  onCreated: (kind: ChatKind, threadId: string) => void;
}

export function NewChatDialog({ open, onClose, kind, onCreated }: NewChatDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} title={kind === 'system' ? 'New chat' : 'New direct message'}>
      {kind === 'system' ? <SystemPicker onCreated={onCreated} /> : <DirectPicker onCreated={onCreated} />}
    </Dialog>
  );
}

function SystemPicker({
  onCreated,
}: {
  onCreated: (kind: ChatKind, threadId: string) => void;
}): JSX.Element {
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
      onCreated('system', thread.id);
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
                  icon={(member['icon'] as string) ?? null}
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

function DirectPicker({
  onCreated,
}: {
  onCreated: (kind: ChatKind, threadId: string) => void;
}): JSX.Element {
  const toast = useToast();
  const [friends, setFriends] = useState<Record<string, unknown>[] | null>(null);
  const [query, setQuery] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ friends: Record<string, unknown>[] }>('/api/social/friends')
      .then((result) => setFriends(result.friends))
      .catch(() => setFriends([]));
  }, []);

  const filtered = (friends ?? []).filter((friend) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return String(friend['displayName'] ?? '').toLowerCase().includes(needle);
  });

  const startWith = async (userId: string): Promise<void> => {
    setBusy(userId);
    try {
      const thread = await startDirectMessage(userId);
      onCreated('dm', thread.id);
    } catch (cause) {
      toast.fromError(cause, 'Could not start that conversation');
    } finally {
      setBusy(null);
    }
  };

  const startWithHandle = async (): Promise<void> => {
    const value = handle.trim().replace(/^@/, '');
    if (!value) return;
    setBusy('handle');
    setError(null);
    try {
      const thread = await startDirectMessage(value);
      onCreated('dm', thread.id);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      {friends && friends.length > 0 ? (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Search friends" />
          <div className="chat-picker-list">
            {filtered.map((friend) => (
              <button
                key={String(friend['userId'])}
                type="button"
                className="chat-picker-row"
                disabled={busy !== null}
                onClick={() => void startWith(String(friend['userId']))}
              >
                <span className="chat-picker-row__avatar">
                  <Avatar
                    name={String(friend['displayName'] ?? 'Someone')}
                    src={(friend['avatarUrl'] as string) ?? null}
                    color={(friend['accent'] as string) ?? null}
                    size={38}
                    round
                  />
                </span>
                <span className="chat-picker-row__body">
                  <span className="chat-picker-row__name">{String(friend['displayName'] ?? 'Someone')}</span>
                  {friend['handle'] ? <span className="tiny faint">@{String(friend['handle'])}</span> : null}
                </span>
                {busy === friend['userId'] ? <Icon name="refresh" size={16} /> : <Chip>Message</Chip>}
              </button>
            ))}
            {filtered.length === 0 ? <p className="small faint">No friends match that search.</p> : null}
          </div>
        </>
      ) : friends === null ? null : (
        <EmptyState icon="friend" title="No friends yet" body="Add a friend from the Friends screen, or message someone by handle below." />
      )}

      <div className="chat-picker-divider">
        <span>or by handle</span>
      </div>
      <form
        className="row row--nowrap"
        onSubmit={(event) => {
          event.preventDefault();
          void startWithHandle();
        }}
      >
        <TextField
          label="Their handle"
          value={handle}
          onChange={setHandle}
          placeholder="handle"
          {...(error ? { error } : {})}
        />
        <Button variant="secondary" type="submit" loading={busy === 'handle'} disabled={!handle.trim()}>
          Message
        </Button>
      </form>
    </div>
  );
}
