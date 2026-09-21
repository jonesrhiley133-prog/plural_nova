import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { newId } from '@pluralnova/shared';
import { messageFor } from './api.js';

/**
 * Transient feedback.
 *
 * Confirmations disappear on their own; failures stay until they are dismissed,
 * because a message that says something went wrong is worth reading. Every
 * toast is announced to assistive technology through a live region.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => string;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  /** Shows the message from a thrown value, without ever printing "undefined". */
  fromError: (cause: unknown, fallback?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = newId('tst');
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      if (toast.tone !== 'error') {
        timers.current.set(id, window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      show,
      dismiss,
      success: (title, detail) => show({ tone: 'success', title, ...(detail ? { detail } : {}) }),
      error: (title, detail) => show({ tone: 'error', title, ...(detail ? { detail } : {}) }),
      info: (title, detail) => show({ tone: 'info', title, ...(detail ? { detail } : {}) }),
      fromError: (cause, fallback) =>
        show({ tone: 'error', title: fallback ?? 'That did not work', detail: messageFor(cause) }),
    }),
    [toasts, show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}): JSX.Element {
  const GLYPHS: Record<ToastTone, string> = { success: '✓', error: '!', info: 'i' };

  return (
    <div className="toast-region" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        >
          <span className="toast__glyph" aria-hidden="true">
            {GLYPHS[toast.tone]}
          </span>
          <div className="toast__body">
            <div className="toast__title">{toast.title}</div>
            {toast.detail ? <div className="toast__detail">{toast.detail}</div> : null}
          </div>
          {toast.action ? (
            <button type="button" className="button button--sm button--ghost" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="button button--sm button--ghost button--icon"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
