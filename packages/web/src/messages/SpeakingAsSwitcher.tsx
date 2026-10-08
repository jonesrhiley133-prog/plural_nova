import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useFronting } from '../core/fronting.js';
import { api, messageFor } from '../core/api.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import { TextField } from '../ui/forms.js';
import { Dialog, useActionMenu, type ActionMenuPosition } from '../ui/overlays.js';
import type { ContextualCardSubject } from '../ui/ContextualCard.js';

/**
 * Who a Direct Message is sent as — read from fronting, not the account-wide
 * active profile `ActiveChatterSwitcher` controls. Opening a conversation
 * auto-picks the one alter currently fronting; several co-fronting prompts
 * once rather than guessing; nobody fronting leaves the existing active
 * profile alone. A PIN-protected pick (auto or manual) is verified against
 * that one member only (`/members/:id/verify-pin`) — unlike
 * `ActiveChatterSwitcher`'s `setActiveMember`, confirming it here never
 * reassigns the account's active profile, since this choice applies to the
 * next message in this one conversation, never anywhere else.
 *
 * Candidates are shaped like a `ContextualCardSubject` — the same picture/
 * name/pronouns/fronting-status data that card already shows — even though
 * the list itself, and its positioning (`useActionMenu`, the exact math
 * `ContextualCard` also anchors from), are their own small component: a
 * single subject with actions doesn't fit a list of alters to choose from.
 */

function subjectFor(member: StoredRecord, frontingIds: Set<string>): ContextualCardSubject {
  return {
    id: member.id,
    name: String(member['name'] ?? ''),
    avatarUrl: (member['avatarUrl'] as string) ?? null,
    color: (member['color'] as string) ?? null,
    icon: (member['icon'] as string) ?? null,
    pronouns: (member['pronouns'] as string) ?? null,
    frontStatusLabel: frontingIds.has(member.id) ? 'Fronting' : null,
  };
}

function SpeakerOption({
  subject,
  locked,
  current,
  onPick,
}: {
  subject: ContextualCardSubject;
  locked: boolean;
  current: boolean;
  onPick: () => void;
}): JSX.Element {
  return (
    <button type="button" role="menuitem" className="chatter-popover__option" aria-current={current} onClick={onPick}>
      <Avatar name={subject.name} src={subject.avatarUrl ?? null} color={subject.color ?? null} size={30} round />
      <span className="truncate">
        {subject.name}
        {subject.frontStatusLabel ? <span className="tiny muted"> · {subject.frontStatusLabel}</span> : null}
      </span>
      {locked ? <Icon name="lock" size={12} label="PIN protected" /> : null}
      {current ? <Icon name="check" size={15} /> : null}
    </button>
  );
}

export function SpeakingAsSwitcher({
  fallbackMemberId,
  onChange,
}: {
  fallbackMemberId: string | null;
  onChange: (memberId: string | null) => void;
}): JSX.Element {
  const { settings } = useAuth();
  const toast = useToast();
  const fronting = useFronting();
  const members = useCollection('members', { filter: (member) => member['archived'] !== true });

  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [multiFrontOpen, setMultiFrontOpen] = useState(false);
  const [pinFor, setPinFor] = useState<StoredRecord | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const decided = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menu = useActionMenu();

  const frontingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of fronting.state.active) {
      if (event.memberId) ids.add(event.memberId);
      for (const co of event.coFronters) ids.add(co.id);
    }
    return ids;
  }, [fronting.state.active]);

  const frontingMembers = useMemo(
    () => members.items.filter((member) => frontingIds.has(member.id)),
    [members.items, frontingIds],
  );

  const effectiveId = overrideId ?? fallbackMemberId;

  useEffect(() => {
    onChange(effectiveId);
  }, [effectiveId, onChange]);

  const apply = (member: StoredRecord | null): void => {
    setOverrideId(member?.id ?? null);
    setPinFor(null);
    setPin('');
    menu.close();
    setMultiFrontOpen(false);
  };

  const pick = (member: StoredRecord | null): void => {
    const needsPin = Boolean(member?.['pinHash']) && settings.privacy.requireProfilePins;
    if (needsPin && member) {
      setPin('');
      setError(null);
      setPinFor(member);
      return;
    }
    apply(member);
  };

  const confirmPin = async (): Promise<void> => {
    if (!pinFor) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/system/members/${pinFor.id}/verify-pin`, { pin });
      apply(pinFor);
    } catch (cause) {
      setError(messageFor(cause));
      toast.fromError(cause, 'That PIN did not check out');
    } finally {
      setBusy(false);
    }
  };

  // Decided once per mount — opening a conversation asks "who is this from"
  // exactly once, the same way the once-per-day fronting ritual decides
  // whether to show itself, rather than re-guessing every time fronting
  // changes while the conversation stays open.
  useEffect(() => {
    // Gated on `loadedAt`, not `loading`: a freshly mounted collection
    // reports `loading: false` with zero items for one tick before its own
    // fetch has even started — indistinguishable from "really nobody's
    // fronting" if read too early (the same footgun `FrontingRitual` guards
    // against for the same reason).
    if (decided.current || fronting.loading || members.loadedAt === 0) return;
    decided.current = true;
    if (frontingMembers.length === 1) pick(frontingMembers[0]!);
    else if (frontingMembers.length > 1) setMultiFrontOpen(true);
    // Zero fronting: leave the existing active-profile fallback as is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fronting.loading, members.loadedAt, frontingMembers]);

  const currentMember = members.items.find((member) => member.id === effectiveId) ?? null;
  const rest = members.items.filter((member) => !frontingIds.has(member.id));

  return (
    <>
      <button
        type="button"
        className="chat-conversation__speaker"
        ref={triggerRef}
        onClick={(event) => menu.openFrom(event)}
        aria-haspopup="true"
        aria-label={`Sending this message as ${currentMember ? String(currentMember['name']) : 'the system'}. Tap to switch.`}
      >
        <Avatar
          name={currentMember ? String(currentMember['name']) : 'System'}
          src={currentMember ? ((currentMember['avatarUrl'] as string) ?? null) : null}
          color={currentMember ? ((currentMember['color'] as string) ?? null) : null}
          icon={currentMember ? ((currentMember['icon'] as string) ?? null) : 'system'}
          size={22}
          round
        />
        <span>Sending as {currentMember ? String(currentMember['name']) : 'the system'}</span>
        <Icon name="chevronDown" size={13} />
      </button>

      <SpeakerPopover position={menu.position} onClose={menu.close}>
        {frontingMembers.length > 0 ? (
          <>
            <div className="chatter-popover__title">Fronting</div>
            {frontingMembers.map((member) => (
              <SpeakerOption
                key={member.id}
                subject={subjectFor(member, frontingIds)}
                locked={Boolean(member['pinHash'])}
                current={member.id === effectiveId}
                onPick={() => {
                  menu.close();
                  pick(member);
                }}
              />
            ))}
            <div className="chatter-popover__title">Everyone else</div>
          </>
        ) : null}
        {rest.map((member) => (
          <SpeakerOption
            key={member.id}
            subject={subjectFor(member, frontingIds)}
            locked={Boolean(member['pinHash'])}
            current={member.id === effectiveId}
            onPick={() => {
              menu.close();
              pick(member);
            }}
          />
        ))}
      </SpeakerPopover>

      <Dialog
        open={multiFrontOpen}
        onClose={() => setMultiFrontOpen(false)}
        title="Who's sending this?"
      >
        <p className="small muted" style={{ marginBottom: 'var(--space-3)' }}>
          More than one of you is fronting right now.
        </p>
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          {frontingMembers.map((member) => (
            <SpeakerOption
              key={member.id}
              subject={subjectFor(member, frontingIds)}
              locked={Boolean(member['pinHash'])}
              current={member.id === effectiveId}
              onPick={() => pick(member)}
            />
          ))}
        </div>
      </Dialog>

      <Dialog
        open={pinFor !== null}
        onClose={() => setPinFor(null)}
        title={`Enter ${String(pinFor?.['name'] ?? '')}’s PIN`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPinFor(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void confirmPin()} disabled={pin.length < 4}>
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

function SpeakerPopover({
  position,
  onClose,
  children,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  children: React.ReactNode;
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
      {children}
    </div>,
    document.body,
  );
}
