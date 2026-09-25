import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './primitives.js';
import { Icon, type IconName } from './Icon.js';

/**
 * Lets a form rendered inside a dialog put its own save action in the header
 * instead of the footer, without every dialog caller having to wire it up by
 * hand. Nothing outside a `Dialog` provides this, so a form used inline on a
 * page (no context to reach) falls back to its own footer unchanged.
 */
const DialogHeaderActionsContext = createContext<((node: ReactNode) => void) | null>(null);

/** Returns whether it actually took over — a caller with no dialog to reach still needs its own footer. */
export function useDialogHeaderActions(node: ReactNode): boolean {
  const setActions = useContext(DialogHeaderActionsContext);
  useEffect(() => {
    if (!setActions) return;
    setActions(node);
    return () => setActions(null);
  }, [setActions, node]);
  return setActions !== null;
}

/**
 * Dialogs.
 *
 * One component serves both shapes: a bottom sheet on a phone, a centred panel
 * on a wider screen. It traps focus, restores it on close, closes on Escape and
 * on a backdrop press, and locks the page behind it — the behaviour a dialog
 * has to have to be usable with a keyboard or a screen reader.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Covers the whole viewport instead of floating a panel over the page — for a
   *  view that wants to be the only thing on screen, like a now-playing player. */
  fullscreen?: boolean;
  /** Prevents closing by backdrop or Escape, for a step that must be answered. */
  dismissible?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  fullscreen,
  dismissible = true,
}: DialogProps): JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);

  /*
   * Callers pass `onClose` as an inline arrow, so its identity changes on every
   * render. Held in a ref, it stays current for the key handler without being a
   * dependency of the effect below — which matters more than it sounds: an
   * effect that re-ran on each render would tear down and re-run its focus
   * setup between keystrokes, pulling the caret out of whatever field someone
   * was typing in after the first character.
   */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';

    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;

      // Focus stays inside the dialog: tabbing past the last control returns to
      // the first rather than wandering into the page underneath.
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      window.scrollTo({ top: scrollY });
      previouslyFocused.current?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className={`overlay${fullscreen ? ' overlay--fullscreen' : ''}`}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`dialog${wide ? ' dialog--wide' : ''}${fullscreen ? ' dialog--fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="dialog__handle" aria-hidden="true" />
        <div className="dialog__header">
          <div>
            <h2 className="dialog__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="card__subtitle" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <div className="dialog__header-actions">
            {headerActions}
            {dismissible ? <IconButton icon="close" label="Close" variant="ghost" size="sm" onClick={onClose} /> : null}
          </div>
        </div>
        <div className="dialog__body">
          <DialogHeaderActionsContext.Provider value={setHeaderActions}>
            {children}
          </DialogHeaderActionsContext.Provider>
        </div>
        {footer ? <div className="dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Destructive confirmation.
 *
 * Says what will happen and whether it can be undone. For the few operations
 * that really cannot be — deleting a system, an account, a backup — it also
 * asks for the word to be typed, so the action cannot be reached by reflex.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  tone = 'danger',
  typeToConfirm,
  recoverable = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  typeToConfirm?: string;
  recoverable?: boolean;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
    }
  }, [open]);

  const confirm = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.');
    } finally {
      setWorking(false);
    }
  }, [onConfirm, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button variant={tone} onClick={confirm} disabled={!ready} loading={working}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="prose" style={{ marginBottom: 'var(--space-3)' }}>
        {body}
      </p>
      <p className="tiny faint">
        {recoverable
          ? 'This moves to the trash and can be restored for 30 days.'
          : 'This cannot be undone.'}
      </p>
      {typeToConfirm ? (
        <div className="field" style={{ marginTop: 'var(--space-4)' }}>
          <label className="field__label" htmlFor="confirm-word">
            Type {typeToConfirm} to confirm
          </label>
          <input
            id="confirm-word"
            className="input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
      ) : null}
      {error ? (
        <p className="field__error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/** Drives a dialog's open state and the record it is editing. */
export function useDialog<T = true>(): {
  open: boolean;
  value: T | null;
  show: (value?: T) => void;
  hide: () => void;
} {
  const [value, setValue] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  return {
    open,
    value,
    show: (next?: T) => {
      setValue((next ?? null) as T | null);
      setOpen(true);
    },
    hide: () => {
      setOpen(false);
      // Cleared after the close animation so the content does not blank first.
      window.setTimeout(() => setValue(null), 220);
    },
  };
}

// ── Action menu ─────────────────────────────────────────────────────────────

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
  tone?: 'danger';
}

export interface ActionMenuPosition {
  open: boolean;
  x: number;
  y: number;
  /** Anchored from the near edge so the menu opens toward the middle of the
   *  screen instead of running off it near an edge or corner. */
  fromRight: boolean;
  fromBottom: boolean;
}

const CLOSED_POSITION: ActionMenuPosition = { open: false, x: 0, y: 0, fromRight: false, fromBottom: false };

/** Drives an `ActionMenu`'s open state and screen position from whatever triggered it. */
export function useActionMenu(): {
  position: ActionMenuPosition;
  openFrom: (event: { clientX: number; clientY: number }) => void;
  close: () => void;
} {
  const [position, setPosition] = useState<ActionMenuPosition>(CLOSED_POSITION);

  return {
    position,
    openFrom: (event) => {
      const fromRight = event.clientX > window.innerWidth / 2;
      const fromBottom = event.clientY > window.innerHeight / 2;
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

/**
 * A small context menu anchored to a point rather than an element — a
 * long-press or right-click has a location, not a trigger button to measure.
 */
export function ActionMenu({
  position,
  onClose,
  items,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  items: ActionMenuItem[];
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
    <div className="action-menu" role="menu" style={style} ref={ref}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={item.tone === 'danger' ? 'action-menu__item action-menu__item--danger' : 'action-menu__item'}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
