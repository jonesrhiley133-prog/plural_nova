import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, Button } from './primitives.js';
import { DetailFacts } from './detailParts.js';
import { FlagImageRow, type FlagImageItem } from './FlagImage.js';
import type { ActionMenuPosition } from './overlays.js';

/**
 * A quick "who is this" popover — a lighter-weight alternative to navigating
 * to a full profile, for the places a request like a feed or a member grid
 * wants a peek rather than a page change. Positioned exactly the way
 * `useActionMenu`/`ActionMenu` already anchor a click-triggered panel
 * (`overlays.tsx`), just carrying a subject's data instead of a fixed list of
 * menu items.
 */

export interface ContextualCardSubject {
  id: string;
  name: string;
  avatarUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  pronouns?: string | null;
  frontStatusLabel?: string | null;
  flags?: FlagImageItem[];
}

export interface ContextualCardAction {
  key: string;
  label: string;
  onSelect: () => void;
}

const CLOSED_POSITION: ActionMenuPosition = { open: false, x: 0, y: 0, fromRight: false, fromBottom: false };

/** Drives a `ContextualCard`'s open state, position and subject from whatever triggered it. */
export function useContextualCard<T extends ContextualCardSubject>(): {
  position: ActionMenuPosition;
  subject: T | null;
  openFrom: (event: { clientX: number; clientY: number }, subject: T) => void;
  close: () => void;
} {
  const [position, setPosition] = useState<ActionMenuPosition>(CLOSED_POSITION);
  const [subject, setSubject] = useState<T | null>(null);

  return {
    position,
    subject,
    openFrom: (event, nextSubject) => {
      // Same edge-aware anchoring `useActionMenu` uses: anchored from
      // whichever edge is nearer, so the card opens toward the middle of the
      // screen instead of running off it near an edge or corner.
      const fromRight = event.clientX > window.innerWidth / 2;
      const fromBottom = event.clientY > window.innerHeight / 2;
      setSubject(nextSubject);
      setPosition({
        open: true,
        x: fromRight ? window.innerWidth - event.clientX : event.clientX,
        y: fromBottom ? window.innerHeight - event.clientY : event.clientY,
        fromRight,
        fromBottom,
      });
    },
    close: () => setPosition(CLOSED_POSITION),
  };
}

export function ContextualCard({
  position,
  subject,
  actions = [],
  onClose,
}: {
  position: ActionMenuPosition;
  subject: ContextualCardSubject | null;
  actions?: ContextualCardAction[];
  onClose: () => void;
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

  if (!position.open || !subject) return null;

  const style = {
    position: 'fixed' as const,
    [position.fromRight ? 'right' : 'left']: position.x,
    [position.fromBottom ? 'bottom' : 'top']: position.y,
  };

  return createPortal(
    <div className="contextual-card" role="dialog" aria-label={subject.name} style={style} ref={ref}>
      <div className="contextual-card__header">
        <Avatar
          name={subject.name}
          src={subject.avatarUrl ?? null}
          color={subject.color ?? null}
          icon={subject.icon ?? null}
          size={48}
          round
        />
        <div style={{ minWidth: 0 }}>
          <div className="contextual-card__name">{subject.name}</div>
          {subject.pronouns ? <div className="small muted">{subject.pronouns}</div> : null}
        </div>
      </div>

      <DetailFacts facts={[['Fronting', subject.frontStatusLabel ?? null]]} />

      {subject.flags && subject.flags.length > 0 ? (
        <FlagImageRow flags={subject.flags} width={28} className="contextual-card__flags" />
      ) : null}

      {actions.length > 0 ? (
        <div className="contextual-card__actions">
          {actions.map((action) => (
            <Button
              key={action.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                action.onSelect();
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
