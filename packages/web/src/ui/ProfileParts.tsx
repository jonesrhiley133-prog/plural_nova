import type { ReactNode } from 'react';
import { Avatar } from './primitives.js';
import { Dialog } from './overlays.js';
import { Button, Card } from './primitives.js';
import { parseRows } from './LabelledRowsField.js';

/** A compact profile card for a grid: banner strip, picture, name and one line of detail. */
export function ProfileTile({
  name,
  subtitle,
  avatarUrl,
  bannerUrl,
  color,
  icon,
  badge,
  onOpen,
}: {
  name: string;
  subtitle?: ReactNode;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  badge?: ReactNode;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button type="button" className="profile-card-tile" onClick={onOpen} aria-label={`View ${name}`}>
      <span
        className="profile-card-tile__banner"
        style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : color ? { background: `linear-gradient(135deg, ${color}55, transparent)` } : undefined}
      />
      <span className="profile-card-tile__body">
        <Avatar name={name} src={avatarUrl || null} color={color ?? null} icon={icon ?? null} size={52} round />
        <span className="profile-card-tile__text">
          <strong>{name}</strong>
          {subtitle ? <span className="tiny muted" style={{ display: 'block' }}>{subtitle}</span> : null}
        </span>
      </span>
      {badge ? <span style={{ padding: '0 var(--space-3) var(--space-3)' }}>{badge}</span> : null}
    </button>
  );
}

/** A profile-style preview: banner, picture, name, bio, custom rows and sections, with Edit/Delete. */
export function ProfilePreviewDialog({
  open,
  onClose,
  name,
  subtitle,
  bio,
  avatarUrl,
  bannerUrl,
  color,
  icon,
  customInfo,
  customSections,
  stats,
  children,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  subtitle?: ReactNode;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  customInfo?: unknown;
  customSections?: unknown;
  stats?: { label: string; value: ReactNode }[];
  children?: ReactNode;
  onEdit: () => void;
  onDelete?: () => void;
}): JSX.Element | null {
  const info = parseRows(customInfo).filter((row) => row.label || row.value);
  const sections = parseRows(customSections).filter((row) => row.label || row.value);
  return (
    <Dialog open={open} onClose={onClose} title={name} wide>
      <div className="profile-page">
        <div
          className="profile-page__banner"
          style={bannerUrl ? { backgroundImage: `url("${bannerUrl}")` } : color ? { background: `linear-gradient(135deg, ${color}66, transparent)` } : undefined}
        />
        <div className="profile-page__head">
          <Avatar name={name} src={avatarUrl || null} color={color ?? null} icon={icon ?? null} size={96} round />
          <div style={{ minWidth: 0 }}>
            <h2 className="profile-page__name">{name}</h2>
            {subtitle ? <p className="profile-page__sub">{subtitle}</p> : null}
          </div>
          <div className="profile-page__actions">
            <Button variant="primary" icon="edit" onClick={onEdit}>
              Edit
            </Button>
            {onDelete ? (
              <Button variant="ghost" icon="trash" onClick={onDelete}>
                Delete
              </Button>
            ) : null}
          </div>
        </div>
        {bio ? <p className="profile-page__bio">{bio}</p> : null}
        {stats && stats.length > 0 ? (
          <div className="stat-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="stat">
                <div className="stat__label">{stat.label}</div>
                <div className="stat__value">{stat.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        {info.length > 0 ? (
          <Card title="Details">
            <dl className="stack stack--tight" style={{ margin: 0 }}>
              {info.map((row, index) => (
                <div key={index} className="row row--between row--nowrap" style={{ alignItems: 'flex-start' }}>
                  <dt className="small muted">{row.label}</dt>
                  <dd className="small" style={{ margin: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
        {children}
        {sections.map((row, index) => (
          <Card key={index} title={row.label || undefined}>
            <p className="profile-page__bio">{row.value}</p>
          </Card>
        ))}
      </div>
    </Dialog>
  );
}
