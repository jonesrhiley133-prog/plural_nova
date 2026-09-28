import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useAuth, useActiveMemberId } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { messageFor } from '../core/api.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { Dialog, useActionMenu, type ActionMenuPosition } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * The In-Sys Chat header avatar is not decorative — it names whoever the
 * active chatter is, and tapping it is the only way to change that without
 * leaving the conversation list. Switching goes through the same
 * `setActiveMember(memberId, pin?)` call as the full-page Profile Select
 * (`ProfileSelect.tsx`), PIN prompt included, just reached from a small
 * popover here instead of a navigation.
 *
 * `renderTrigger` lets a second entry point (the "no active chatter" notice
 * on the home screen) open the same popover from its own button, without a
 * second copy of the avatar or the switching logic.
 */
export function ActiveChatterSwitcher({
  renderTrigger,
}: {
  renderTrigger?: (props: { onClick: (event: { clientX: number; clientY: number }) => void; activeMember: StoredRecord | null }) => ReactNode;
}): JSX.Element {
  const { setActiveMember, settings } = useAuth();
  const activeMemberId = useActiveMemberId();
  const { term } = useI18n();
  const toast = useToast();
  const members = useCollection('members', { filter: (member) => member['archived'] !== true });
  const menu = useActionMenu();
  const [pinFor, setPinFor] = useState<StoredRecord | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeMember = members.items.find((member) => member.id === activeMemberId) ?? null;
  const systemLabel = term('The {{system}}');

  const choose = async (member: StoredRecord | null, suppliedPin?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setActiveMember(member?.id ?? null, suppliedPin);
      setPinFor(null);
      setPin('');
      menu.close();
    } catch (cause) {
      setError(messageFor(cause));
      toast.fromError(cause, 'Could not switch who you are chatting as');
    } finally {
      setBusy(false);
    }
  };

  const pick = (member: StoredRecord | null): void => {
    const needsPin = Boolean(member?.['pinHash']) && settings.privacy.requireProfilePins;
    if (needsPin && member) {
      setPin('');
      setError(null);
      setPinFor(member);
      return;
    }
    void choose(member);
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ onClick: (event) => menu.openFrom(event), activeMember })
      ) : (
        <button
          type="button"
          className="chatter-switch"
          onClick={(event) => menu.openFrom(event)}
          aria-haspopup="true"
          aria-label={`Currently chatting as ${activeMember ? String(activeMember['name']) : systemLabel}. Tap to switch.`}
        >
          <Avatar
            name={activeMember ? String(activeMember['name']) : systemLabel}
            src={activeMember ? ((activeMember['avatarUrl'] as string) ?? null) : null}
            color={activeMember ? ((activeMember['color'] as string) ?? null) : null}
            icon={activeMember ? ((activeMember['icon'] as string) ?? null) : 'system'}
            size={36}
            round
          />
        </button>
      )}

      <ChatterPopover
        position={menu.position}
        onClose={menu.close}
        members={members.items}
        activeMemberId={activeMemberId}
        systemLabel={systemLabel}
        onPick={pick}
      />

      <Dialog
        open={pinFor !== null}
        onClose={() => setPinFor(null)}
        title={`Enter ${String(pinFor?.['name'] ?? '')}’s PIN`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPinFor(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void choose(pinFor, pin)} disabled={pin.length < 4}>
              Confirm
            </Button>
          </>
        }
      >
        <TextField
          label="PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={setPin}
          autoFocus
          {...(error ? { error } : {})}
        />
      </Dialog>
    </>
  );
}

function ChatterPopover({
  position,
  onClose,
  members,
  activeMemberId,
  systemLabel,
  onPick,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  members: StoredRecord[];
  activeMemberId: string | null;
  systemLabel: string;
  onPick: (member: StoredRecord | null) => void;
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position.open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [position.open, onClose]);

  if (!position.open) return null;

  const style = {
    position: 'fixed' as const,
    [position.fromRight ? 'right' : 'left']: position.x,
    [position.fromBottom ? 'bottom' : 'top']: position.y,
  };

  return createPortal(
    <div className="chatter-popover" role="menu" style={style} ref={ref}>
      <div className="chatter-popover__title">Currently chatting as</div>
      <button
        type="button"
        role="menuitem"
        className="chatter-popover__option"
        aria-current={activeMemberId === null}
        onClick={() => {
          onClose();
          onPick(null);
        }}
      >
        <Avatar name={systemLabel} icon="system" size={30} round />
        <span className="truncate">{systemLabel}</span>
        {activeMemberId === null ? <Icon name="check" size={15} /> : null}
      </button>
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          role="menuitem"
          className="chatter-popover__option"
          aria-current={activeMemberId === member.id}
          onClick={() => {
            onClose();
            onPick(member);
          }}
        >
          <Avatar
            name={String(member['name'])}
            src={(member['avatarUrl'] as string) ?? null}
            color={(member['color'] as string) ?? null}
            icon={(member['icon'] as string) ?? null}
            size={30}
            round
          />
          <span className="truncate">{String(member['name'])}</span>
          {member['pinHash'] ? <Icon name="lock" size={12} label="PIN protected" /> : null}
          {activeMemberId === member.id ? <Icon name="check" size={15} /> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
