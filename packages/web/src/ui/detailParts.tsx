import type { ReactNode } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { Chip, Meter } from './primitives.js';
import { Markdown } from './Markdown.js';

/** Small building blocks shared by the preview dialogs of the collection screens. */

export function DetailCover({ url }: { url: unknown }): JSX.Element | null {
  if (!url) return null;
  return (
    <img
      src={String(url)}
      alt=""
      style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 'var(--radius)' }}
    />
  );
}

export function DetailFacts({ facts }: { facts: [string, ReactNode][] }): JSX.Element | null {
  const shown = facts.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
  if (shown.length === 0) return null;
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 'var(--space-1) var(--space-4)', margin: 0 }}>
      {shown.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt className="faint small">{label}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailTags({ tags }: { tags: unknown }): JSX.Element | null {
  const list = Array.isArray(tags) ? (tags as unknown[]).map(String).filter(Boolean) : [];
  if (list.length === 0) return null;
  return (
    <div className="row">
      {list.map((tag) => (
        <Chip key={tag}>{tag}</Chip>
      ))}
    </div>
  );
}

export function DetailText({ title, text }: { title?: string; text: unknown }): JSX.Element | null {
  const value = String(text ?? '').trim();
  if (!value) return null;
  return (
    <div>
      {title ? <h3 className="small faint" style={{ marginBottom: 'var(--space-1)' }}>{title}</h3> : null}
      <Markdown text={value} />
    </div>
  );
}

export function DetailProgress({ value, max, label }: { value: number; max: number; label: string }): JSX.Element | null {
  if (!max) return null;
  return (
    <div>
      <div className="row row--between small">
        <span>{label}</span>
        <span className="faint">
          {value} / {max}
        </span>
      </div>
      <Meter value={value} max={max} label={label} />
    </div>
  );
}

export function memberNames(ids: unknown, memberName: (id: string | null) => string | null): string {
  return (Array.isArray(ids) ? (ids as string[]) : [])
    .map((id) => memberName(id))
    .filter(Boolean)
    .join(', ');
}

export function byText(field: string) {
  return (a: StoredRecord, b: StoredRecord): number => String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
}

export function newestFirst(field: string) {
  return (a: StoredRecord, b: StoredRecord): number => String(b[field] ?? '').localeCompare(String(a[field] ?? ''));
}
