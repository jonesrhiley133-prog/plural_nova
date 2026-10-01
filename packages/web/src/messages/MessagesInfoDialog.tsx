import { useState } from 'react';
import { resolveChatAppearance, type ChatAppearance } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useToast } from '../core/toast.js';
import { updateMessageThread, type MessageThreadSummary } from '../core/messages.js';
import { Avatar, Button, SegmentedControl } from '../ui/primitives.js';
import { ColorField, SwitchRow } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';

/**
 * The handful of settings that apply to a whole Messages conversation, and
 * how it looks. Appearance falls back to `settings.messagesAppearance` —
 * Messages' own account-wide default, entirely separate from In-Sys Chat's
 * `chatAppearance`. There is no rename here: every Messages conversation
 * today is a 1:1 with a friend, so its title is just their name.
 */
interface MessagesInfoDialogProps {
  open: boolean;
  onClose: () => void;
  thread: MessageThreadSummary;
  onChanged: () => void;
}

const SPACING_OPTIONS = [
  { value: 'cozy' as const, label: 'Cozy' },
  { value: 'compact' as const, label: 'Compact' },
];

export function MessagesInfoDialog({ open, onClose, thread, onChanged }: MessagesInfoDialogProps): JSX.Element {
  const toast = useToast();
  const { settings, saveSettings } = useAuth();
  const [busy, setBusy] = useState(false);

  const save = async (patch: Parameters<typeof updateMessageThread>[1]): Promise<void> => {
    setBusy(true);
    try {
      await updateMessageThread(thread.id, patch);
      onChanged();
    } catch (cause) {
      toast.fromError(cause, 'Could not update this conversation');
    } finally {
      setBusy(false);
    }
  };

  const hasOwnAppearance = Boolean(thread.settings['appearance']);
  const appearance = resolveChatAppearance(settings.messagesAppearance, thread.settings);

  const setAppearance = (patch: Partial<ChatAppearance>): Promise<void> =>
    save({ settings: { ...thread.settings, appearance: { ...appearance, ...patch } } });

  const resetAppearance = (): Promise<void> => {
    const { appearance: _dropped, ...rest } = thread.settings;
    return save({ settings: rest });
  };

  const useAppearanceEverywhere = async (): Promise<void> => {
    setBusy(true);
    try {
      await saveSettings({ messagesAppearance: appearance });
      const { appearance: _dropped, ...rest } = thread.settings;
      await updateMessageThread(thread.id, { settings: rest });
      onChanged();
      toast.success('This look is now the default for every Messages conversation.');
    } catch (cause) {
      toast.fromError(cause, 'Could not save that as your default');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Conversation info">
      <div className="stack">
        {thread.person ? (
          <div className="chat-info__people">
            <div className="chat-info__person">
              <Avatar name={thread.person.name} src={thread.person.avatarUrl ?? null} color={thread.person.color} icon={thread.person.icon} size={40} round />
              <span>{thread.person.name}</span>
            </div>
          </div>
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
