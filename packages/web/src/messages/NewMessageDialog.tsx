import { useEffect, useState } from 'react';
import { api, messageFor } from '../core/api.js';
import { useToast } from '../core/toast.js';
import { startDirectMessage } from '../core/messages.js';
import { Avatar, Button, Chip } from '../ui/primitives.js';
import { SearchField, TextField } from '../ui/forms.js';
import { EmptyState } from '../ui/feedback.js';
import { Dialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Starting a new Messages conversation: pick from friends already made on
 * the social side, or reach someone by handle — never the internal member
 * roster In-Sys Chat's new-chat dialog picks from.
 */
interface NewMessageDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

export function NewMessageDialog({ open, onClose, onCreated }: NewMessageDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} title="New direct message">
      <DirectPicker onCreated={onCreated} />
    </Dialog>
  );
}

function DirectPicker({ onCreated }: { onCreated: (threadId: string) => void }): JSX.Element {
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
      onCreated(thread.id);
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
      onCreated(thread.id);
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
