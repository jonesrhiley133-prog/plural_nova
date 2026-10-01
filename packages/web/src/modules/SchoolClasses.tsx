import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_GRADE_CATEGORIES, newId, type GradeCategory, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useMemberScope } from '../core/memberScope.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { MemberScopeChips } from '../ui/MemberScope.js';
import type { SchoolStats } from '../core/schoolStats.js';

/**
 * Classes — the roster School Life's grade tracking, analytics and calendar
 * all lean on. The grading-categories and meeting-days editors are custom
 * because both are JSON fields (`RecordForm` never renders those generically,
 * the same as every other collection with structured JSON), so they're
 * composed alongside `<RecordForm>` rather than folded into it — one shared
 * `onSubmit` merges their local state into the payload `RecordForm` itself
 * never sees.
 */
export default function SchoolClasses(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const scope = useMemberScope();
  const classes = useCollection('classes', {
    filter: (cls) => cls['archived'] !== true && (scope.isWholeSystem || cls['memberId'] === scope.memberId),
  });
  const stats = useQuery<SchoolStats>('/api/stats/school', scope.queryParam);
  const statsByClass = new Map((stats.data?.byClass ?? []).map((row) => [row.classId, row]));

  const editor = useDialog<StoredRecord | null>();
  const confirm = useDialog<StoredRecord>();

  return (
    <>
      <PageHeader
        title="Classes"
        description="Every class, with as much grading detail as you want to track."
        actions={
          <Button variant="primary" icon="plus" onClick={() => editor.show(null)}>
            Add a class
          </Button>
        }
      />

      <MemberScopeChips scope={scope} />

      <AsyncContent
        loading={classes.loading}
        error={classes.error}
        items={classes.items}
        onRetry={classes.reload}
        empty={{
          icon: 'school',
          title: 'No classes yet',
          body: 'Add a class to start tracking assignments and grades for it.',
          action: { label: 'Add a class', run: () => editor.show(null) },
        }}
      >
        {(items) => (
          <div className="grid" style={{ ['--grid-min' as never]: '240px' }}>
            {items.map((cls) => {
              const row = statsByClass.get(cls.id);
              return (
                <Card
                  key={cls.id}
                  interactive
                  onClick={() => navigate(`/school/classes/${cls.id}`)}
                  title={String(cls['name'])}
                  subtitle={[cls['teacher'], cls['period']].filter(Boolean).join(' · ') || String(cls['subject'] ?? '')}
                  actions={
                    <IconButton
                      icon="edit"
                      label={`Edit ${String(cls['name'])}`}
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        editor.show(cls);
                      }}
                    />
                  }
                >
                  <div className="row row--between">
                    <Avatar
                      name={String(cls['name'])}
                      color={(cls['color'] as string) ?? null}
                      icon={(cls['icon'] as string) ?? null}
                      size={36}
                      round
                    />
                    {row?.currentPercentage !== null && row?.currentPercentage !== undefined ? (
                      <span className="row" style={{ gap: 6 }}>
                        <strong>{row.currentPercentage}%</strong>
                        {row.letter ? <Chip color={cls['color'] as string}>{row.letter}</Chip> : null}
                      </span>
                    ) : (
                      <span className="tiny faint">No grades yet</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AsyncContent>

      <ClassEditorDialog
        open={editor.open}
        classItem={editor.value ?? null}
        onClose={editor.hide}
        onSaved={() => {
          toast.success('Saved');
          classes.reload();
          stats.reload();
          editor.hide();
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this class?"
        body="Its assignments and grades stay on record but lose their class."
        onConfirm={async () => {
          if (!confirm.value) return;
          await classes.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

/** Shared by the class list and the class detail page, so editing looks and behaves identically from either. */
export function ClassEditorDialog({
  open,
  onClose,
  classItem,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  classItem: StoredRecord | null;
  onSaved: () => void;
}): JSX.Element {
  const classes = useCollection('classes', { enabled: false });
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [meetingDays, setMeetingDays] = useState<string[]>([]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={classItem ? `Edit ${String(classItem['name'])}` : 'New class'}
      wide
    >
      <ClassEditorForm
        key={classItem?.id ?? 'new'}
        classItem={classItem}
        categories={categories}
        setCategories={setCategories}
        meetingDays={meetingDays}
        setMeetingDays={setMeetingDays}
        onCancel={onClose}
        onSubmit={async (values) => {
          const payload = { ...values, gradeCategories: categories, meetingDays };
          if (classItem) await classes.update(classItem.id, payload);
          else await classes.create(payload);
          onSaved();
        }}
      />
    </Dialog>
  );
}

/**
 * Reads the record's own `gradeCategories`/`meetingDays` into local state once
 * per open record (the `key` on the parent's usage forces a remount rather
 * than a `useEffect` sync, the same as `RecordForm` itself resets on a new
 * `record.id`).
 */
function ClassEditorForm({
  classItem,
  categories,
  setCategories,
  meetingDays,
  setMeetingDays,
  onCancel,
  onSubmit,
}: {
  classItem: StoredRecord | null;
  categories: GradeCategory[];
  setCategories: (next: GradeCategory[]) => void;
  meetingDays: string[];
  setMeetingDays: (next: string[]) => void;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [ready] = useState(() => {
    // A brand new class starts from the schema's own default categories, the
    // same starting point `RecordForm` would have used had this field not
    // needed a custom editor — not an empty list nobody asked for.
    setCategories(
      Array.isArray(classItem?.['gradeCategories'])
        ? (classItem['gradeCategories'] as GradeCategory[])
        : classItem
          ? []
          : DEFAULT_GRADE_CATEGORIES.map((category) => ({ ...category })),
    );
    setMeetingDays(Array.isArray(classItem?.['meetingDays']) ? (classItem['meetingDays'] as string[]) : []);
    return true;
  });
  void ready;

  // GradeCategoriesEditor/MeetingDaysPicker are siblings, not children —
  // RecordForm never renders children, the same as it never renders a JSON
  // field generically. Its own Save button (in the dialog header, since it's
  // inside one) still triggers the `onSubmit` closure below, which is where
  // these two editors' local state actually joins the payload.
  return (
    <>
      <RecordForm
        collection="classes"
        record={classItem}
        omit={['gradeCategories', 'meetingDays']}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
      <GradeCategoriesEditor value={categories} onChange={setCategories} />
      <MeetingDaysPicker value={meetingDays} onChange={setMeetingDays} />
    </>
  );
}

function GradeCategoriesEditor({
  value,
  onChange,
}: {
  value: GradeCategory[];
  onChange: (next: GradeCategory[]) => void;
}): JSX.Element {
  const totalWeight = value.reduce((sum, category) => sum + (Number(category.weight) || 0), 0);

  const update = (index: number, patch: Partial<GradeCategory>): void => {
    onChange(value.map((category, i) => (i === index ? { ...category, ...patch } : category)));
  };

  return (
    <div className="field" style={{ marginTop: 'var(--space-4)' }}>
      <span className="field__label">Grading categories</span>
      <div className="stack stack--tight">
        {value.map((category, index) => (
          <div key={category.id} className="row row--nowrap">
            <input
              className="input"
              value={category.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Category name"
              aria-label="Category name"
              style={{ flex: 2 }}
            />
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={category.weight}
              onChange={(event) => update(index, { weight: Number(event.target.value) })}
              aria-label={`${category.name || 'Category'} weight`}
              style={{ flex: 1 }}
            />
            <span className="tiny faint">%</span>
            <IconButton
              icon="trash"
              label={`Remove ${category.name || 'category'}`}
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            />
          </div>
        ))}
      </div>
      <div className="row row--between" style={{ marginTop: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => onChange([...value, { id: newId('cat'), name: '', weight: 0 }])}
        >
          Add category
        </Button>
        <span className="tiny faint">
          Total weight: {totalWeight}% — categories don't need to add to 100, they're weighed relative to each other.
        </span>
      </div>
    </div>
  );
}

const WEEKDAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

function MeetingDaysPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }): JSX.Element {
  return (
    <div className="field" style={{ marginTop: 'var(--space-4)' }}>
      <span className="field__label">Meets on</span>
      <div className="row" role="group" aria-label="Meeting days">
        {WEEKDAYS.map((day) => (
          <Chip
            key={day.value}
            selected={value.includes(day.value)}
            onClick={() =>
              onChange(value.includes(day.value) ? value.filter((d) => d !== day.value) : [...value, day.value])
            }
          >
            {day.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
