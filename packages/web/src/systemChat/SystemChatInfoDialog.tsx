import { useEffect, useState } from 'react';
import { resolveChatAppearance, type ChatAppearance } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useToast } from '../core/toast.js';
import { updateSystemChatThread, type SystemChatThreadSummary } from '../core/systemChat.js';
import { Avatar, Button, SegmentedControl } from '../ui/primitives.js';
import { ColorField, SwitchRow, TextField } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';

/**
 * Who an In-Sys Chat thread is with/between, the handful of settings that
 * apply to the whole thing rather than to one message, and how it looks.
 * Appearance falls back to `settings.chatAppearance` — In-Sys Chat's own
 * account-wide default, entirely separate from Messages' `messagesAppearance`.
 */
interface SystemChatInfoDialogProps {
  open: boolean;
  onClose: () => void;
  thread: SystemChatThreadSummary;
  onChanged: () => void;
}

const SPACING_OPTIONS = [
  { value: 'cozy' as const, label: 'Cozy' },
  { value: 'compact' as const, label: 'Compact' },
];

export function SystemChatInfoDialog({ open, onClose, thread, onChanged }: SystemChatInfoDialogProps): JSX.Element {
  const toast = useToast();
  const { settings, saveSettings } = useAuth();
  const [name, setName] = useState(thread.title);
  const [busy, setBusy] = useState(false);
  const canRename = thread.kind !== 'direct';

  useEffect(() => {
    setName(thread.title);
  }, [thread.id, thread.title]);

  const save = async (patch: Parameters<typeof updateSystemChatThread>[1]): Promise<void> => {
    setBusy(true);
    try {
      await updateSystemChatThread(thread.id, patch);
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
      await updateSystemChatThread(thread.id, { settings: rest });
      onChanged();
      toast.success('This look is now the default for every In-Sys Chat conversation.');
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
              void save({ name: name.trim() });
            }}
          >
            <TextField label="Name" value={name} onChange={setName} />
            <Button variant="secondary" type="submit" loading={busy} disabled={!name.trim() || name.trim() === thread.title}>
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
