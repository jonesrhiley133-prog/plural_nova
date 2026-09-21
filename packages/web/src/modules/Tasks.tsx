import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OPTIONS, dayKey, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * Tasks.
 *
 * Grouped by when they are due rather than by list, because "what is overdue"
 * and "what is today" are the two questions actually being asked. Completing a
 * recurring task schedules the next one instead of just ticking it off.
 */

type Filter = 'open' | 'today' | 'overdue' | 'done' | 'all';

export default function Tasks(): JSX.Element {
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const members = useRecordMap('members');

  const [filter, setFilter] = useState<Filter>('open');
  const [category, setCategory] = useState<string | null>(null);

  const { items, all, loading, error, reload, create, update, remove } = useCollection('tasks');
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(params.get('new') === '1');

  const now = new Date().toISOString();
  const today = dayKey(new Date());

  const categories = useMemo(
    () => [...new Set(all.map((task) => String(task['category'] ?? '')).filter(Boolean))].sort(),
    [all],
  );

  const filtered = useMemo(() => {
    const matchesCategory = (task: StoredRecord): boolean =>
      category === null || task['category'] === category;

    return items
      .filter((task) => task['archived'] !== true)
      .filter(matchesCategory)
      .filter((task) => {
        const due = task['dueAt'] ? String(task['dueAt']) : null;
        switch (filter) {
          case 'open':
            return task['completed'] !== true;
          case 'today':
            return task['completed'] !== true && due !== null && dayKey(due) === today;
          case 'overdue':
            return task['completed'] !== true && due !== null && due < now;
          case 'done':
            return task['completed'] === true;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        const order = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
        const dueA = String(a['dueAt'] ?? '9999');
        const dueB = String(b['dueAt'] ?? '9999');
        return dueA.localeCompare(dueB) || (order[String(a['priority'])] ?? 2) - (order[String(b['priority'])] ?? 2);
      });
  }, [items, filter, category, now, today]);

  const counts = useMemo(
    () => ({
      open: all.filter((task) => task['completed'] !== true && task['archived'] !== true).length,
      overdue: all.filter(
        (task) => task['completed'] !== true && task['dueAt'] && String(task['dueAt']) < now,
      ).length,
      done: all.filter((task) => task['completed'] === true).length,
    }),
    [all, now],
  );

  const complete = async (task: StoredRecord): Promise<void> => {
    const done = task['completed'] !== true;
    await update(task.id, {
      completed: done,
      completedAt: done ? new Date().toISOString() : null,
    });

    // A recurring task that is finished schedules its next occurrence, rather
    // than needing to be recreated by hand every time.
    const recurrence = String(task['recurrence'] ?? '').trim();
    if (done && recurrence && task['dueAt']) {
      const next = nextOccurrence(String(task['dueAt']), recurrence);
      if (next) {
        await create({
          title: task['title'],
          notes: task['notes'],
          category: task['category'],
          priority: task['priority'],
          memberId: task['memberId'],
          recurrence,
          dueAt: next,
          forWholeSystem: task['forWholeSystem'],
          tags: task['tags'],
        });
        toast.success('Done', `The next one is due ${dates.date(next)}.`);
        return;
      }
    }
    if (done) toast.success('Done');
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Open" value={counts.open} />
        <Stat label="Overdue" value={counts.overdue} detail={counts.overdue > 0 ? 'Worth a look' : undefined} />
        <Stat label="Completed" value={counts.done} />
      </div>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="segmented" role="group" aria-label="Filter">
          {(['open', 'today', 'overdue', 'done', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="segmented__option"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option[0]!.toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        {categories.length > 0 ? (
          <div className="row">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              All categories
            </Chip>
            {categories.map((name) => (
              <Chip key={name} selected={category === name} onClick={() => setCategory(name)}>
                {name}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        items={filtered}
        onRetry={reload}
        empty={{
          title: filter === 'done' ? 'Nothing completed yet' : 'Nothing here',
          body:
            filter === 'open'
              ? 'No open tasks. That is a finished list, not an empty one.'
              : 'Try a different filter, or add a task.',
          icon: 'task',
          action: { label: 'New task', run: () => setCreating(true) },
        }}
      >
        {(tasks) => (
          <Card flush>
            <div className="list">
              {tasks.map((task) => {
                const due = task['dueAt'] ? String(task['dueAt']) : null;
                const overdue = due !== null && due < now && task['completed'] !== true;
                const priority = OPTIONS.priority.find((option) => option.value === task['priority']);
                const assignee = task['memberId'] ? members.get(String(task['memberId'])) : null;
                const subtasks = (task['subtasks'] as { id: string; label: string; done: boolean }[]) ?? [];

                return (
                  <div key={task.id} className="list-row">
                    <input
                      type="checkbox"
                      checked={task['completed'] === true}
                      onChange={() => void complete(task).catch((cause: unknown) => toast.fromError(cause))}
                      aria-label={`Mark ${String(task['title'])} ${task['completed'] === true ? 'incomplete' : 'complete'}`}
                      style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
                    />
                    <span className="list-row__body">
                      <span
                        className="list-row__title"
                        style={{
                          textDecoration: task['completed'] === true ? 'line-through' : undefined,
                          opacity: task['completed'] === true ? 0.6 : 1,
                        }}
                      >
                        {String(task['title'])}
                      </span>
                      <span className="list-row__meta">
                        {due ? (
                          <span style={overdue ? { color: 'var(--critical)' } : undefined}>
                            {overdue ? 'Overdue · ' : ''}
                            {dates.dateTime(due)}
                          </span>
                        ) : null}
                        {priority && priority.value !== 'normal' ? (
                          <Chip color={priority.color}>
                            {priority.icon} {priority.label}
                          </Chip>
                        ) : null}
                        {task['category'] ? <Chip>{String(task['category'])}</Chip> : null}
                        {assignee ? <Chip color={(assignee['color'] as string) ?? null}>{String(assignee['name'])}</Chip> : null}
                        {task['recurrence'] ? (
                          <span className="faint">
                            <Icon name="repeat" size={11} /> {String(task['recurrence'])}
                          </span>
                        ) : null}
                        {subtasks.length > 0 ? (
                          <span className="faint numeric">
                            {subtasks.filter((item) => item.done).length}/{subtasks.length}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="list-row__trailing">
                      <IconButton
                        icon="edit"
                        label={`Edit ${String(task['title'])}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.show(task)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Delete ${String(task['title'])}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm.show(task)}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </AsyncContent>

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? 'Edit task' : 'New task'}
      >
        <RecordForm
          collection="tasks"
          record={editor.value}
          omit={['completedAt', 'remindSent', 'archived', 'subtasks']}
          onSubmit={async (values) => {
            if (editor.value) {
              await update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await create(values);
              toast.success('Task added');
              setCreating(false);
            }
          }}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title={t('confirm.deleteTitle', { label: String(confirm.value?.['title'] ?? 'this task') })}
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await remove(confirm.value.id);
          toast.success('Task deleted');
        }}
      />

      <p className="tiny faint" style={{ marginTop: 'var(--space-5)' }}>
        {term('Tasks can be for the whole {{system}} or for one {{member}} — both are on the form.')}
      </p>
    </>
  );
}

/** Works out the next due date for a repeating task. */
function nextOccurrence(from: string, recurrence: string): string | null {
  const date = new Date(from);
  if (Number.isNaN(date.getTime())) return null;

  switch (recurrence.toLowerCase()) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekdays':
      do {
        date.setDate(date.getDate() + 1);
      } while (date.getDay() === 0 || date.getDay() === 6);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'fortnightly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return date.toISOString();
}
