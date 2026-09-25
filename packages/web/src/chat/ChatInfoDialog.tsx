import { useEffect, useState } from 'react';
import { useToast } from '../core/toast.js';
import { updateChatThread, type ChatThreadSummary } from '../core/chat.js';
import { Avatar, Button } from '../ui/primitives.js';
import { SwitchRow, TextField } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';

/**
 * Who a conversation is with/between, and the handful of settings that apply
 * to the whole thing rather than to one message: mute, pin, and — for a
 * group or the dm's own title — a name. Per-conversation appearance joins
 * this dialog later; the mechanics (one PATCH per kind) are already here.
 */
interface ChatInfoDialogProps {
  open: boolean;
  onClose: () => void;
  thread: ChatThreadSummary;
  onChanged: () => void;
}

export function ChatInfoDialog({ open, onClose, thread, onChanged }: ChatInfoDialogProps): JSX.Element {
  const toast = useToast();
  const [title, setTitle] = useState(thread.title);
  const [busy, setBusy] = useState(false);
  const canRename = thread.subKind !== 'direct';

  useEffect(() => {
    setTitle(thread.title);
  }, [thread.id, thread.title]);

  const save = async (patch: Parameters<typeof updateChatThread>[2]): Promise<void> => {
    setBusy(true);
    try {
      await updateChatThread(thread.kind, thread.id, patch);
      onChanged();
    } catch (cause) {
      toast.fromError(cause, 'Could not update this conversation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Conversation info">
      <div className="stack">
        <div className="chat-info__people">
          {(thread.participants.length > 0 ? thread.participants : thread.person ? [thread.person] : []).map((person) => (
            <div key={person.id} className="chat-info__person">
              <Avatar name={person.name} src={person.avatarUrl ?? null} color={person.color} icon={person.icon} size={40} round />
              <span>
                {person.prefix ? <span className="chat-message__prefix">{person.prefix}</span> : null}
                {person.name}
              </span>
            </div>
          ))}
        </div>

        {canRename ? (
          <form
            className="row row--nowrap"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ title: title.trim() });
            }}
          >
            <TextField label="Name" value={title} onChange={setTitle} />
            <Button variant="secondary" type="submit" loading={busy} disabled={!title.trim() || title.trim() === thread.title}>
              Save
            </Button>
          </form>
        ) : null}

        <SwitchRow
          label="Muted"
          hint="Turns off notifications for this conversation."
          checked={thread.muted}
          onChange={(value) => void save({ muted: value })}
        />
        <SwitchRow label="Pinned" checked={thread.pinned} onChange={(value) => void save({ pinned: value })} />
        <SwitchRow
          label="Archived"
          hint="Moves this conversation out of your main list. It stays reachable and nothing is deleted."
          checked={thread.archived}
          onChange={(value) => void save({ archived: value })}
        />
      </div>
    </Dialog>
  );
}
