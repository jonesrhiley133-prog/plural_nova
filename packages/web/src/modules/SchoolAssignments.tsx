import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dayKey, percentOf, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useMemberScope } from '../core/memberScope.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import type { SchoolStats } from '../core/schoolStats.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Chip, IconButton } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { SelectField } from '../ui/forms.js';
import { MemberScopeChips } from '../ui/MemberScope.js';

type StatusFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'late' | 'missing' | 'completed';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'late', label: 'Late' },
  { value: 'missing', label: 'Missing' },
  { value: 'completed', label: 'Completed' },
];

function matchesFilter(assignment: StoredRecord, filter: StatusFilter, now: Date): boolean {
  const due = new Date(String(assignment['dueAt']));
  const status = String(assignment['status'] ?? 'notStarted');
  const done = status === 'completed' || status === 'submitted';

  switch (filter) {
    case 'all':
      return true;
    case 'today':
      return dayKey(due) === dayKey(now);
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return dayKey(due) === dayKey(tomorrow);
    }
    case 'week': {
      const weekOut = new Date(now);
      weekOut.setDate(weekOut.getDate() + 7);
      return due >= now && due <= weekOut;
    }
    case 'late':
      return status === 'late' || (!done && due < now);
    case 'missing':
      return status === 'missing';
    case 'completed':
      return done;
  }
}

/** Assignments: filtered by status the way the spec asks for, with a class filter and the scope chips every School Life page shares. */
export default function SchoolAssignments(): JSX.Element {
  const [params] = useSearchParams();
  const toast = useToast();
  const dates = useDateFormat();
  const scope = useMemberScope();

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string>('');

  const classes = useCollection('classes', { filter: (cls) => cls['archived'] !== true });
  const classById = new Map(classes.items.map((cls) => [cls.id, cls]));
  const assignments = useCollection('assignments', {
    filter: (a) =>
      (scope.isWholeSystem || a['memberId'] === scope.memberId) &&
      (!classFilter || a['classId'] === classFilter),
    sort: (a, b) => String(a['dueAt']).localeCompare(String(b['dueAt'])),
  });
  const stats = useQuery<SchoolStats>('/api/stats/school', scope.queryParam);

  const editor = useDialog<StoredRecord | null>();
  const logGrade = useDialog<{ classId?: string; assignmentId?: string } | null>();
  const confirm = useDialog<StoredRecord>();

  useEffect(() => {
    if (params.get('new') === '1') editor.show(null);
    if (params.get('logGrade') === '1') logGrade.show(null);
    // Only ever seeded from the URL a screen was opened with, not re-applied
    // if the params change while it stays mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const filtered = useMemo(
    () => assignments.items.filter((a) => matchesFilter(a, filter, now)),
    [assignments.items, filter],
  );

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Everything due, filtered however you're looking at it right now."
        actions={
          <>
            <Button variant="ghost" icon="star" onClick={() => logGrade.show(null)}>
              Log a grade
            </Button>
            <Button variant="primary" icon="plus" onClick={() => editor.show(null)}>
              Add assignment
            </Button>
          </>
        }
      />

      <MemberScopeChips scope={scope} />

      <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
        {FILTERS.map((option) => (
          <Chip key={option.value} selected={filter === option.value} onClick={() => setFilter(option.value)}>
            {option.label}
          </Chip>
        ))}
        <span className="spacer" />
        {classes.items.length > 0 ? (
          <SelectField
            label="Class"
            value={classFilter}
            onChange={setClassFilter}
            placeholder="All classes"
            options={classes.items.map((cls) => ({ value: cls.id, label: String(cls['name']) }))}
          />
        ) : null}
      </div>

      <AsyncContent
        loading={assignments.loading}
        error={assignments.error}
        items={filtered}
        onRetry={assignments.reload}
        empty={{
          icon: 'task',
          title: filter === 'all' ? 'No assignments yet' : 'Nothing here',
          body: filter === 'all' ? 'Add an assignment to start tracking it.' : 'Nothing matches this filter right now.',
          action: { label: 'Add assignment', run: () => editor.show(null) },
        }}
      >
        {(items) => (
          <div className="list">
            {items.map((assignment) => {
              const cls = classById.get(String(assignment['classId']));
              const percent = percentOf(assignment['gradeReceived'], assignment['maxPoints']);
              const status = String(assignment['status'] ?? 'notStarted');
              return (
                <div key={assignment.id} className="list-row">
                  <Avatar
                    name={cls ? String(cls['name']) : '?'}
                    color={(cls?.['color'] as string) ?? null}
                    icon={(cls?.['icon'] as string) ?? null}
                    size={36}
                    round
                  />
                  <span className="list-row__body">
                    <span className="list-row__title">{String(assignment['name'])}</span>
                    <span className="list-row__meta">
                      {cls ? <Chip color={cls['color'] as string}>{String(cls['name'])}</Chip> : null}
                      <span>{dates.dateTime(String(assignment['dueAt']))}</span>
                      <Chip
                        color={
                          status === 'late' || status === 'missing'
                            ? '#e06c93'
                            : status === 'completed' || status === 'submitted'
                              ? '#5ec6a8'
                              : undefined
                        }
                      >
                        {status}
                      </Chip>
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    {percent !== null ? <strong>{Math.round(percent * 10) / 10}%</strong> : null}
                    <IconButton
                      icon="edit"
                      label={`Edit ${String(assignment['name'])}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => editor.show(assignment)}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete ${String(assignment['name'])}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => confirm.show(assignment)}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </AsyncContent>

      <Dialog open={editor.open} onClose={editor.hide} title={editor.value ? 'Edit assignment' : 'New assignment'}>
        <RecordForm
          collection="assignments"
          record={editor.value}
          omit={['remindSent']}
          onSubmit={async (values) => {
            // A day's notice by default — editable per-assignment like anything else `RecordForm` renders.
            const remindAt =
              values['remindAt'] || editor.value?.['remindAt']
                ? values['remindAt']
                : values['dueAt']
                  ? new Date(new Date(String(values['dueAt'])).getTime() - 24 * 3_600_000).toISOString()
                  : null;
            const payload = { ...values, remindAt };
            if (editor.value) await assignments.update(editor.value.id, payload);
            else await assignments.create(payload);
            toast.success('Saved');
            stats.reload();
            editor.hide();
          }}
          onCancel={editor.hide}
        />
      </Dialog>

      <LogGradeDialog
        open={logGrade.open}
        onClose={logGrade.hide}
        initial={logGrade.value}
        onSaved={() => {
          toast.success('Grade logged');
          stats.reload();
          logGrade.hide();
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this assignment?"
        body="Any grade logged directly on it goes with it."
        onConfirm={async () => {
          if (!confirm.value) return;
          await assignments.remove(confirm.value.id);
          toast.success('Deleted');
          stats.reload();
        }}
      />
    </>
  );
}

/**
 * "+Grade" as its own quick action — a grade that doesn't need a tracked
 * assignment behind it. Writes to `grades` directly; whether it's also
 * linked back to an assignment is just whether `assignmentId` is set.
 */
export function LogGradeDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { classId?: string; assignmentId?: string } | null;
  onSaved: () => void;
}): JSX.Element {
  const grades = useCollection('grades', { enabled: false });

  return (
    <Dialog open={open} onClose={onClose} title="Log a grade">
      <RecordForm
        collection="grades"
        initial={{ gradedAt: new Date().toISOString().slice(0, 10), ...(initial ?? {}) }}
        onSubmit={async (values) => {
          await grades.create(values);
          onSaved();
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}
