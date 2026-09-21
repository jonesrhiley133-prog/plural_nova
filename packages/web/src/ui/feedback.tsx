import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon, iconOr, type IconName } from './Icon.js';
import { Button } from './primitives.js';

/**
 * States other than "here is the content".
 *
 * Every module gets an empty state that says what would be here and offers the
 * action that puts it there, a skeleton that matches the shape of what is
 * loading, and an error that names what failed and offers a way forward. None
 * of these are optional — a blank screen is the failure this file exists to
 * prevent.
 */

export function EmptyState({
  title,
  body,
  icon = 'sparkle',
  action,
  secondaryAction,
}: {
  title: string;
  body?: string;
  icon?: IconName | string;
  action?: { label: string; run: () => void };
  secondaryAction?: { label: string; run: () => void };
}): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state__glyph">
        <Icon name={iconOr(String(icon), 'sparkle')} size={30} />
      </span>
      <p className="empty-state__title">{title}</p>
      {body ? <p className="empty-state__body">{body}</p> : null}
      {action || secondaryAction ? (
        <div className="empty-state__actions">
          {action ? (
            <Button variant="primary" onClick={action.run}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button variant="ghost" onClick={secondaryAction.run}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Skeleton({
  height = 16,
  width = '100%',
  radius,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
}): JSX.Element {
  return (
    <span
      className="skeleton"
      style={{
        display: 'block',
        height: typeof height === 'number' ? `${height}px` : height,
        width: typeof width === 'number' ? `${width}px` : width,
        ...(radius ? { borderRadius: `${radius}px` } : {}),
      }}
      aria-hidden="true"
    />
  );
}

/** A placeholder shaped like the rows it is standing in for. */
export function SkeletonList({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="row row--nowrap" style={{ padding: 'var(--space-3) 0' }}>
          <Skeleton height={38} width={38} radius={10} />
          <div className="stack stack--tight" style={{ flex: 1 }}>
            <Skeleton height={13} width={`${55 + ((index * 13) % 35)}%`} />
            <Skeleton height={11} width={`${30 + ((index * 17) % 25)}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div className="grid" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={132} radius={10} />
      ))}
    </div>
  );
}

export function ErrorPanel({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  detail,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  detail?: string;
}): JSX.Element {
  return (
    <div className="error-panel" role="alert">
      <div className="error-panel__title">
        <Icon name="warning" size={16} /> {title}
      </div>
      <p className="error-panel__body">{message}</p>
      {detail ? (
        <details>
          <summary className="tiny faint" style={{ cursor: 'pointer' }}>
            Technical details
          </summary>
          <pre className="tiny faint" style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--space-2)' }}>
            {detail}
          </pre>
        </details>
      ) : null}
      {onRetry ? (
        <div>
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Chooses between loading, error, empty and content so every list makes the
 * same four decisions the same way.
 */
export function AsyncContent<T>({
  loading,
  error,
  items,
  onRetry,
  empty,
  skeleton,
  children,
}: {
  loading: boolean;
  error?: string | null;
  items: T[];
  onRetry?: () => void;
  empty: { title: string; body?: string; icon?: string; action?: { label: string; run: () => void } };
  skeleton?: ReactNode;
  children: (items: T[]) => ReactNode;
}): JSX.Element {
  if (loading && items.length === 0) {
    return <>{skeleton ?? <SkeletonList />}</>;
  }
  if (error && items.length === 0) {
    return <ErrorPanel message={error} {...(onRetry ? { onRetry } : {})} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title={empty.title}
        {...(empty.body ? { body: empty.body } : {})}
        {...(empty.icon ? { icon: empty.icon } : {})}
        {...(empty.action ? { action: empty.action } : {})}
      />
    );
  }
  return (
    <>
      {error ? (
        <p className="tiny faint" style={{ marginBottom: 'var(--space-2)' }}>
          {error}
        </p>
      ) : null}
      {children(items)}
    </>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Shown instead of the whole app when a screen throws. */
  label?: string;
  onReset?: () => void;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * Catches a render failure and shows a readable panel instead of a white page.
 * The error is logged for anyone with the console open, not shown as a stack.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[pluralnova] render failed:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <ErrorPanel
          title={this.props.label ? `${this.props.label} could not be shown` : 'This screen could not be shown'}
          message="Your data is safe — nothing was changed. Try again, or go back and come in another way."
          detail={`${error.name}: ${error.message}`}
          onRetry={this.reset}
          retryLabel="Try again"
        />
      </div>
    );
  }
}

/** A short line that names what is loading rather than showing a bare spinner. */
export function LoadingLine({ label }: { label: string }): JSX.Element {
  return (
    <p className="row small muted" role="status" aria-live="polite">
      <span className="button__spinner" style={{ color: 'var(--accent)' }} aria-hidden="true" />
      {label}
    </p>
  );
}

/** For data the app describes rather than diagnoses. */
export function DescriptiveNote({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="tiny faint" style={{ lineHeight: 'var(--leading-relaxed)', maxWidth: '68ch' }}>
      <Icon name="info" size={12} /> {children}
    </p>
  );
}
