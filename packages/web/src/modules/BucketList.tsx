import { useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Button, Chip, IconButton, ListRow, Meter, Stat } from '../ui/primitives.js';
import { useDateFormat } from '../core/i18n.js';
import { now } from '@pluralnova/shared';
import {
  DetailCover,
  DetailFacts,
  DetailTags,
  DetailText,
  byText,
  memberNames,
  newestFirst,
} from '../ui/detailParts.js';

interface Milestone {
  label: string;
  done: boolean;
}

function milestonesOf(record: StoredRecord): Milestone[] {
  const raw = record['milestones'];
  return Array.isArray(raw)
    ? (raw as Milestone[]).filter((m) => m && typeof m.label === 'string')
    : [];
}

/** Progress is the share of steps done when there are steps, otherwise the number typed in. */
function progressOf(record: StoredRecord): number {
  if (record['completed'] === true) return 100;
  const steps = milestonesOf(record);
  if (steps.length > 0) return Math.round((steps.filter((m) => m.done).length / steps.length) * 100);
  return Number(record['progress'] ?? 0);
}

export default function BucketList(): JSX.Element {
  const dates = useDateFormat();
  const [view, setView] = useState<'open' | 'done' | 'all'>('open');
  const filter = useMemo(
    () => (record: StoredRecord) =>
      view === 'all' || (view === 'done' ? record['completed'] === true : record['completed'] !== true),
    [view],
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <CollectionScreen
      collection="bucketListItems"
      description="Things the whole {{system}} wants to do together someday — with steps, deadlines and who it is for."
      emptyTitle="Nothing on the list yet"
      emptyBody="Add something you'd like to do together — check it off whenever you get there."
      filter={filter}
      filters={[
        { field: 'category' },
        { field: 'priority' },
        { field: 'tags' },
        { field: 'memberIds', label: 'Member' },
        { field: 'favorite', label: '★ Favourites' },
      ]}
      sorts={[
        { id: 'new', label: 'Recently added', compare: newestFirst('createdAt') },
        { id: 'deadline', label: 'Soonest deadline', compare: (a, b) => String(a['targetDate'] || '9999').localeCompare(String(b['targetDate'] || '9999')) },
        { id: 'progress', label: 'Most progress', compare: (a, b) => progressOf(b) - progressOf(a) },
        { id: 'title', label: 'Title A–Z', compare: byText('title') },
      ]}
      headerActions={
        <div className="segmented" role="group" aria-label="Show">
          {(['open', 'done', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="segmented__option"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value === 'open' ? 'To do' : value === 'done' ? 'Done' : 'All'}
            </button>
          ))}
        </div>
      }
      stats={(all) => {
        const done = all.filter((r) => r['completed'] === true).length;
        const overdue = all.filter((r) => r['completed'] !== true && r['targetDate'] && String(r['targetDate']) < today).length;
        return (
          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat label="Done" value={`${done} / ${all.length}`} />
            <Stat label="Completion" value={`${all.length ? Math.round((done / all.length) * 100) : 0}%`} />
            <Stat label="In progress" value={all.filter((r) => r['completed'] !== true && progressOf(r) > 0).length} />
            <Stat label="Past deadline" value={overdue} />
          </div>
        );
      }}
      detail={(record, helpers) => <BucketDetail record={record} helpers={helpers} />}
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const done = record['completed'] === true;
        const progress = progressOf(record);
        const overdue = !done && record['targetDate'] && String(record['targetDate']) < today;
        return (
          <ListRow
            key={record.id}
            onClick={helpers.open}
            title={`${record['favorite'] ? '★ ' : ''}${String(record['title'] ?? '')}`}
            meta={
              <>
                {record['category'] ? <Chip>{String(record['category'])}</Chip> : null}
                {record['targetDate'] ? (
                  <span className={overdue ? '' : 'faint'} style={overdue ? { color: 'var(--warning, var(--accent))' } : undefined}>
                    {overdue ? 'Past ' : 'By '}
                    {dates.date(String(record['targetDate']))}
                  </span>
                ) : null}
                {!done && progress > 0 ? (
                  <span style={{ width: 70 }}>
                    <Meter value={progress} max={100} label={`${progress}% done`} />
                  </span>
                ) : null}
              </>
            }
            trailing={
              <Button
                size="sm"
                variant={done ? 'ghost' : 'primary'}
                onClick={async (event) => {
                  event.stopPropagation();
                  await helpers.update(
                    done
                      ? { completed: false, completedAt: null }
                      : { completed: true, completedAt: now(), progress: 100 },
                  );
                }}
              >
                {done ? 'Undo' : 'Done!'}
              </Button>
            }
          />
        );
      }}
    />
  );
}

function BucketDetail({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const steps = milestonesOf(record);
  const progress = progressOf(record);
  const toggle = (index: number): void => {
    const next = steps.map((m, i) => (i === index ? { ...m, done: !m.done } : m));
    void helpers.update({ milestones: next });
  };
  return (
    <>
      <DetailCover url={record['imageUrl']} />
      <div>
        <div className="row row--between small">
          <span>{record['completed'] === true ? 'Done' : 'Progress'}</span>
          <span className="faint">{progress}%</span>
        </div>
        <Meter value={progress} max={100} label={`${progress}% done`} />
      </div>
      {steps.length > 0 ? (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 'var(--space-1)' }}>
          {steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className="row">
              <label className="row" style={{ gap: 'var(--space-2)' }}>
                <input type="checkbox" checked={step.done} onChange={() => toggle(index)} />
                <span style={step.done ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>{step.label}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <DetailFacts
        facts={[
          ['Category', String(record['category'] ?? '')],
          ['Priority', String(record['priority'] ?? '')],
          ['Aim to do it by', String(record['targetDate'] ?? '')],
          ['Where', String(record['location'] ?? '')],
          ['Who wants this', memberNames(record['memberIds'], helpers.memberName)],
          ['Added by', helpers.memberName((record['addedByMemberId'] as string) ?? null)],
          ['Completed', record['completedAt'] ? String(record['completedAt']).slice(0, 10) : ''],
        ]}
      />
      <DetailTags tags={record['tags']} />
      <DetailText title="Notes" text={record['notes']} />
      <p className="tiny faint">Edit the item to add or rename steps (one per line in the "Steps" field).</p>
    </>
  );
}
