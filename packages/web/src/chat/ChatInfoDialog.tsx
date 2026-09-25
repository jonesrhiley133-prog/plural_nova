import { useEffect, useState } from 'react';
import type { ChatAppearance } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useToast } from '../core/toast.js';
import { resolveChatAppearance, updateChatThread, type ChatThreadSummary } from '../core/chat.js';
import { Avatar, Button, SegmentedControl } from '../ui/primitives.js';
import { ColorField, SwitchRow, TextField } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';

/**
 * Who a conversation is with/between, the handful of settings that apply to
 * the whole thing rather than to one message (mute, pin, a name), and how it
 * looks. Appearance is stored as `settings.appearance`, one PATCH like any
 * other setting here — a thread with none of its own renders with the
 * account-wide default from `useAuth().settings.chatAppearance` instead.
 */
interface ChatInfoDialogProps {
  open: boolean;
  onClose: () => void;
  thread: ChatThreadSummary;
  onChanged: () => void;
}

const SPACING_OPTIONS = [
  { value: 'cozy' as const, label: 'Cozy' },
  { value: 'compact' as const, label: 'Compact' },
];

export function ChatInfoDialog({ open, onClose, thread, onChanged }: ChatInfoDialogProps): JSX.Element {
  const toast = useToast();
  const { settings, saveSettings } = useAuth();
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

  const hasOwnAppearance = Boolean(thread.settings['appearance']);
  const appearance = resolveChatAppearance(settings.chatAppearance, thread.settings);

  const setAppearance = (patch: Partial<ChatAppearance>): Promise<void> =>
    save({ settings: { ...thread.settings, appearance: { ...appearance, ...patch } } });

  const resetAppearance = (): Promise<void> => {
    const { appearance: _dropped, ...rest } = thread.settings;
    return save({ settings: rest });
  };

  const useAppearanceEverywhere = async (): Promise<void> => {
    setBusy(true);
    try {
      await saveSettings({ chatAppearance: appearance });
      const { appearance: _dropped, ...rest } = thread.settings;
      await updateChatThread(thread.kind, thread.id, { settings: rest });
      onChanged();
      toast.success('This look is now the default for every conversation.');
    } catch (cause) {
      toast.fromError(cause, 'Could not save that as your default');
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

        <p className="chat-info__section-title">Appearance</p>
        <ColorField
          label="Wallpaper"
          value={appearance.wallpaper ?? ''}
          onChange={(value) => void setAppearance({ wallpaper: value || null })}
          hint="Behind the messages in this conversation."
        />
        <ColorField
          label="Your bubble"
          value={appearance.bubbleMine ?? ''}
          onChange={(value) => void setAppearance({ bubbleMine: value || null })}
        />
        <ColorField
          label="Their bubble"
          value={appearance.bubbleTheirs ?? ''}
          onChange={(value) => void setAppearance({ bubbleTheirs: value || null })}
        />
        <div className="field">
          <span className="field__label">Spacing</span>
          <SegmentedControl value={appearance.spacing} onChange={(value) => void setAppearance({ spacing: value })} options={SPACING_OPTIONS} label="Message spacing" />
        </div>
        <div className="row row--between">
          <Button variant="ghost" size="sm" onClick={() => void resetAppearance()} disabled={!hasOwnAppearance || busy}>
            Reset appearance
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void useAppearanceEverywhere()} disabled={busy}>
            Use for all conversations
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
