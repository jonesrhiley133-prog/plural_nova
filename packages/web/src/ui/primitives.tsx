import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon, iconOr, type IconName } from './Icon.js';

/**
 * The primitive layer.
 *
 * Small, unopinionated pieces that carry the design system's decisions so no
 * screen has to restate them. Anything that appears on more than one page
 * belongs here.
 */

// ── Button ──────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    block,
    icon,
    iconRight,
    loading,
    children,
    className = '',
    disabled,
    ...props
  },
  ref,
) {
  const classes = [
    'button',
    `button--${variant}`,
    size !== 'md' ? `button--${size}` : '',
    block ? 'button--block' : '',
    !children ? 'button--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
      {!loading && icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 15 : 17} /> : null}
    </button>
  );
});

/** An icon-only button. The label is required — it is the only description. */
export function IconButton({
  icon,
  label,
  ...props
}: Omit<ButtonProps, 'icon' | 'children'> & { icon: IconName; label: string }): JSX.Element {
  return (
    <Button {...props} aria-label={label} title={label}>
      <Icon name={icon} size={props.size === 'sm' ? 15 : 18} />
    </Button>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  raised?: boolean;
  interactive?: boolean;
}

export function Card({
  title,
  subtitle,
  actions,
  flush,
  raised,
  interactive,
  children,
  className = '',
  ...props
}: CardProps): JSX.Element {
  const classes = [
    'card',
    flush ? 'card--flush' : '',
    raised ? 'card--raised' : '',
    interactive ? 'card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {title || actions ? (
        <div className="card__header" style={flush ? { padding: 'var(--space-4)', marginBottom: 0 } : undefined}>
          <div>
            {title ? <div className="card__title">{title}</div> : null}
            {subtitle ? <div className="card__subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="row row--nowrap">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function SectionHeading({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="section-heading">
      <h2 className="section-heading__label">{label}</h2>
      {action}
    </div>
  );
}

// ── Chip ────────────────────────────────────────────────────────────────────

export function Chip({
  children,
  accent,
  selected,
  onClick,
  color,
  title,
}: {
  children: ReactNode;
  accent?: boolean;
  selected?: boolean;
  onClick?: () => void;
  color?: string | null;
  title?: string;
}): JSX.Element {
  const classes = ['chip', accent ? 'chip--accent' : '', onClick ? 'chip--interactive' : '']
    .filter(Boolean)
    .join(' ');

  const style = color
    ? ({
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        color,
      } as const)
    : undefined;

  if (!onClick) {
    return (
      <span className={classes} data-selected={selected} style={style} title={title}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      data-selected={selected}
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      title={title}
    >
      {children}
    </button>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * A status never relies on colour alone: the glyph and the word carry it, and
 * the colour is reinforcement.
 */
export function Status({
  label,
  color,
  glyph,
}: {
  label: string;
  color?: string | null;
  glyph?: string;
}): JSX.Element {
  return (
    <span className="status" style={color ? { color } : undefined}>
      {glyph ? (
        <span className="status__glyph" aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      {label}
    </span>
  );
}

export function Badge({ count, label }: { count: number; label?: string }): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span className="badge" aria-label={label ?? `${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Dot({ label }: { label: string }): JSX.Element {
  return <span className="badge badge--dot" role="status" aria-label={label} />;
}

// ── Avatar ──────────────────────────────────────────────────────────────────

export interface AvatarProps {
  name: string;
  src?: string | null;
  color?: string | null;
  icon?: string | null;
  size?: number;
  round?: boolean;
  ring?: boolean;
  /** Percentage focal point, so a cropped portrait keeps the face in frame. */
  focus?: { x: number; y: number } | null;
}

export function Avatar({
  name,
  src,
  color,
  icon,
  size = 40,
  round,
  ring,
  focus,
}: AvatarProps): JSX.Element {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <span
      className={`avatar${round ? ' avatar--round' : ''}`}
      style={
        {
          '--avatar-size': `${size}px`,
          '--member-color': color ?? 'var(--accent)',
          '--focal-x': `${focus?.x ?? 50}%`,
          '--focal-y': `${focus?.y ?? 50}%`,
          ...(color ? { color } : {}),
        } as never
      }
      title={name}
    >
      {src ? (
        <img className="avatar__image" src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{icon || initials || '·'}</span>
      )}
      {ring ? <span className="avatar__ring" /> : null}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: AvatarProps[];
  max?: number;
  size?: number;
}): JSX.Element {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((person, index) => (
        <Avatar key={`${person.name}-${index}`} {...person} size={size} round />
      ))}
      {extra > 0 ? (
        <span
          className="avatar avatar--round"
          style={{ '--avatar-size': `${size}px`, marginLeft: -10 } as never}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

// ── Stats and meters ────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}): JSX.Element {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {detail ? <div className="stat__detail">{detail}</div> : null}
    </div>
  );
}

export function Meter({
  value,
  max = 1,
  color,
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  label: string;
}): JSX.Element {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className="meter"
      role="meter"
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="meter__fill"
        style={{ width: `${share * 100}%`, ...(color ? { ['--meter-color' as never]: color } : {}) }}
      />
    </div>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface ListRowProps {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
}

export function ListRow({ title, meta, leading, trailing, onClick }: ListRowProps): JSX.Element {
  const content = (
    <>
      {leading}
      <span className="list-row__body">
        <span className="list-row__title">{title}</span>
        {meta ? <span className="list-row__meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="list-row__trailing">{trailing}</span> : null}
    </>
  );

  if (!onClick) {
    return <div className="list-row">{content}</div>;
  }
  return (
    <button type="button" className="list-row" onClick={onClick}>
      {content}
    </button>
  );
}

export function ModuleIcon({ name, size = 18 }: { name: string; size?: number }): JSX.Element {
  return <Icon name={iconOr(name)} size={size} />;
}
