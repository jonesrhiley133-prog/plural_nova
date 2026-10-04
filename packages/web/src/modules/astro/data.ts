import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Astro, type StoredRecord } from '@pluralnova/shared';
import { useActiveMemberId } from '../../core/auth.js';
import { useCollection } from '../../core/data.js';

/** Noon UTC on the viewer's local calendar day (+ offset): a stable instant for "that day". */
export function localDay(offsetDays = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 12));
}

export const fmtDay = (date: Date | string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }): string =>
  (typeof date === 'string' ? new Date(`${date}T12:00:00Z`) : date).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

export function inputOf(record: Record<string, unknown> | StoredRecord | null | undefined): Astro.AstroInput {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    birthday: (record?.['birthday'] as string) || null,
    birthTime: (record?.['birthTime'] as string) || null,
    latitude: num(record?.['birthLatitude']),
    longitude: num(record?.['birthLongitude']),
    utcOffset: num(record?.['birthUtcOffset']),
  };
}

export interface Subject {
  member: StoredRecord;
  id: string;
  name: string;
  color: string;
  profile: Astro.AstroProfile;
  visibility: Astro.AstroVisibility;
  /** The viewer may see this alter's astrology. */
  canView: boolean;
  /** The viewer may edit it (the alter itself, or the account owner with no profile selected). */
  canEdit: boolean;
}

export function subjectOf(member: StoredRecord, viewerId: string | null): Subject {
  return {
    member,
    id: member.id,
    name: String(member['name'] ?? 'Alter'),
    color: (member['color'] as string) || '#7aa2f7',
    profile: Astro.buildProfile(inputOf(member)),
    visibility: Astro.normaliseVisibility(member['astroVisibility']),
    canView: Astro.canViewAstro(member['astroVisibility'], member.id, viewerId),
    canEdit: viewerId === null || viewerId === member.id,
  };
}

export interface AstroContext {
  subjects: Subject[];
  /** Alters the viewer is allowed to see astrology for. */
  visible: Subject[];
  selected: Subject | null;
  select: (id: string) => void;
  viewerId: string | null;
  loading: boolean;
}

export function useAstroContext(): AstroContext {
  const members = useCollection('members', { filter: (m) => m['archived'] !== true });
  const viewerId = useActiveMemberId();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('alter');

  const subjects = useMemo(() => members.items.map((m) => subjectOf(m, viewerId)), [members.items, viewerId]);
  const visible = useMemo(() => subjects.filter((s) => s.canView), [subjects]);
  const selected =
    subjects.find((s) => s.id === wanted) ??
    subjects.find((s) => s.id === viewerId) ??
    visible[0] ??
    subjects[0] ??
    null;

  return {
    subjects,
    visible,
    selected,
    viewerId,
    loading: members.loading,
    select: (id) => {
      const next = new URLSearchParams(params);
      next.set('alter', id);
      setParams(next, { replace: true });
    },
  };
}

export const reader = (s: Subject): Astro.ReaderKey => ({ id: s.id });

export const signLine = (p: Astro.AstroProfile): string[] => [
  p.sun ? `${Astro.signInfo(p.sun).glyph} ${p.sun} Sun` : '',
  p.moon ? `🌙 ${p.moon} Moon` : '',
  p.rising ? `⬆️ ${p.rising} Rising` : '',
].filter(Boolean);
