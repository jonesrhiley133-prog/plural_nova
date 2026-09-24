import { useState } from 'react';
import { formatDuration, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useLiveSession } from '../core/liveSession.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat, Status, Tabs } from '../ui/primitives.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { ColumnChart, RankedBars } from '../charts/index.js';
import { OPTIONS } from '@pluralnova/shared';

/**
 * Work.
 *
 * Workplaces, the shift schedule, work tasks, coworkers and the charts that
 * come out of them. Everything here is the user's own record of their working
 * life — it is never shared and it is not an attendance system anyone else sees.
 */

type Tab = 'overview' | 'schedule' | 'tasks' | 'workplaces' | 'people';

interface WorkStats {
  weeks: number;
  shiftCount: number;
  totalMinutes: number;
  averageShiftMinutes: number;
  earnings: number | null;
  earningsCurrency: string | null;
  byDay: { label: string; value: number; key: string }[];
  byWeekday: { label: string; value: number }[];
  workplaces: { id: string; name: string; minutes: number; earnings: number | null; currency: string | null }[];
  tasks: { open: number; completed: number };
}

export default function Work(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('overview');
  const stats = useQuery<WorkStats>('/api/stats/work', { weeks: 8 });

  const workplaces = useCollection('workplaces');
  const shifts = useCollection('workShifts');
  const tasks = useCollection('workTasks');
  const coworkers = useCollection('coworkers');

  const editor = useDialog<{ collection: string; record: StoredRecord | null }>();
  const confirm = useDialog<{ collection: string; record: StoredRecord }>();
  const session = useLiveSession(shifts, 'startsAt', 'endsAt');

  const clockOut = async (): Promise<void> => {
    try {
      const stopped = await session.stop();
      if (stopped) editor.show({ collection: 'workShifts', record: stopped });
    } catch (cause) {
      toast.fromError(cause, 'Could not clock out');
    }
  };

  const collectionFor = (name: string) =>
    name === 'workplaces' ? workplaces : name === 'workShifts' ? shifts : name === 'workTasks' ? tasks : coworkers;

  const collectionForTab: Record<Tab, string> = {
    overview: 'workShifts',
    schedule: 'workShifts',
    tasks: 'workTasks',
    workplaces: 'workplaces',
    people: 'coworkers',
  };

  return (
    <>
      <PageHeader
        title="Work"
        description={
          session.active
            ? `Clocked in for ${formatDuration(session.elapsedMinutes)} so far.`
            : 'Shifts, tasks and the people you work with — kept private to this account.'
        }
        actions={
          tab === 'overview' || tab === 'schedule' ? (
            session.active ? (
              <Button variant="primary" icon="pause" onClick={() => void clockOut()}>
                Clock out
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => editor.show({ collection: 'workShifts', record: null })}
                >
                  Add a shift
                </Button>
                <Button variant="primary" icon="play" onClick={() => void session.start()}>
                  Clock in
                </Button>
              </>
            )
          ) : (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => editor.show({ collection: collectionForTab[tab], record: null })}
            >
              Add
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        label="Work sections"
        options={(['overview', 'schedule', 'tasks', 'workplaces', 'people'] as const).map((option) => ({
          value: option,
          label: option[0]!.toUpperCase() + option.slice(1),
        }))}
      />

      {tab === 'overview' ? (
        <div className="stack">
          <div className="stat-grid">
            <Stat label="Hours worked" value={formatDuration(stats.data?.totalMinutes ?? 0)} detail="last 8 weeks" />
            <Stat label="Shifts" value={stats.data?.shiftCount ?? 0} />
            <Stat label="Average shift" value={formatDuration(stats.data?.averageShiftMinutes ?? 0)} />
            <Stat
              label="Open tasks"
              value={stats.data?.tasks.open ?? 0}
              detail={stats.data?.tasks.completed ? `${stats.data.tasks.completed} done` : undefined}
            />
            {stats.data?.earnings !== null && stats.data?.earnings !== undefined ? (
              <Stat
                label="Earnings"
                value={new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: stats.data.earningsCurrency ?? 'USD',
                  maximumFractionDigits: 0,
                }).format(stats.data.earnings)}
                detail="last 8 weeks, from hourly rate"
              />
            ) : null}
          </div>

          <Card>
            <ColumnChart
              title="Hours by day"
              subtitle="Shifts you marked as worked"
              valueLabel="Minutes"
              points={(stats.data?.byDay ?? []).map((bucket) => ({
                label: bucket.label,
                value: bucket.value,
                detail: bucket.key,
              }))}
              format={(value) => formatDuration(value)}
              emptyMessage="No shifts recorded in this period."
            />
          </Card>

          <div className="split">
            <Card>
              <ColumnChart
                title="By day of the week"
                valueLabel="Minutes"
                points={(stats.data?.byWeekday ?? []).map((bucket) => ({
                  label: bucket.label,
                  value: bucket.value,
                }))}
                format={(value) => formatDuration(value)}
              />
            </Card>

            <Card>
              <RankedBars
                title="By workplace"
                valueLabel="Minutes"
                items={(stats.data?.workplaces ?? []).map((workplace) => ({
                  id: workplace.id,
                  label: workplace.name,
                  value: workplace.minutes,
                  detail:
                    workplace.earnings !== null
                      ? `${formatDuration(workplace.minutes)} · ${new Intl.NumberFormat(undefined, {
                          style: 'currency',
                          currency: workplace.currency ?? 'USD',
                          maximumFractionDigits: 0,
                        }).format(workplace.earnings)}`
                      : formatDuration(workplace.minutes),
                }))}
                format={(value) => formatDuration(value)}
                emptyMessage="No workplaces set up yet."
              />
            </Card>
          </div>

          <DescriptiveNote>
            These totals come from the shifts you marked as worked. They are your own record, not a
            timesheet anyone else can see.
          </DescriptiveNote>
        </div>
      ) : null}

      {tab === 'schedule' ? (
        <AsyncContent
          loading={shifts.loading}
          error={shifts.error}
          items={shifts.items}
          onRetry={shifts.reload}
          empty={{
            title: 'No shifts yet',
            body: 'Add a shift, or a repeating one, and it shows up in the calendar too.',
            icon: 'work',
            action: { label: 'Add a shift', run: () => editor.show({ collection: 'workShifts', record: null }) },
          }}
        >
          {(items) => (
            <Card flush>
              <div className="list">
                {items.map((shift) => {
                  const workplace = workplaces.items.find((row) => row.id === shift['workplaceId']);
                  const minutes = shift['endsAt']
                    ? Math.max(
                        0,
                        Math.round(
                          (Date.parse(String(shift['endsAt'])) - Date.parse(String(shift['startsAt']))) / 60000,
                        ) - Number(shift['breakMinutes'] ?? 0),
                      )
                    : 0;

                  return (
                    <div key={shift.id} className="list-row">
                      <span className="list-row__body">
                        <span className="list-row__title">
                          {dates.dateTime(String(shift['startsAt']))}
                          {shift['endsAt'] ? ` → ${dates.time(String(shift['endsAt']))}` : ''}
                        </span>
                        <span className="list-row__meta">
                          {workplace ? <Chip>{String(workplace['name'])}</Chip> : null}
                          {minutes > 0 ? <span className="faint">{formatDuration(minutes)}</span> : null}
                          {Number(shift['breakMinutes'] ?? 0) > 0 ? (
                            <span className="faint">{String(shift['breakMinutes'])}m break</span>
                          ) : null}
                          {shift['recurrence'] ? <Chip>{String(shift['recurrence'])}</Chip> : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        <Button
                          variant={shift['completed'] === true ? 'ghost' : 'secondary'}
                          size="sm"
                          onClick={() => void shifts.update(shift.id, { completed: shift['completed'] !== true })}
                        >
                          {shift['completed'] === true ? 'Worked' : 'Mark worked'}
                        </Button>
                        <IconButton
                          icon="edit"
                          label="Edit shift"
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show({ collection: 'workShifts', record: shift })}
                        />
                        <IconButton
                          icon="trash"
                          label="Delete shift"
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show({ collection: 'workShifts', record: shift })}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'tasks' ? (
        <AsyncContent
          loading={tasks.loading}
          error={tasks.error}
          items={tasks.items}
          onRetry={tasks.reload}
          empty={{
            title: 'No work tasks',
            body: 'Separate from your personal task list, so one does not bury the other.',
            icon: 'task',
            action: { label: 'Add a task', run: () => editor.show({ collection: 'workTasks', record: null }) },
          }}
        >
          {(items) => (
            <Card flush>
              <div className="list">
                {items.map((task) => {
                  const priority =
                    OPTIONS.priority.find((option) => option.value === task['priority']) ??
                    OPTIONS.priority.find((option) => option.value === 'normal')!;
                  return (
                    <div key={task.id} className="list-row">
                      <input
                        type="checkbox"
                        checked={task['completed'] === true}
                        onChange={() =>
                          void tasks.update(task.id, {
                            completed: task['completed'] !== true,
                            completedAt: task['completed'] !== true ? new Date().toISOString() : null,
                          })
                        }
                        aria-label={`Mark ${String(task['title'])} complete`}
                        style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
                      />
                      <span
                        className="list-row__icon"
                        aria-hidden="true"
                        style={{
                          ['--row-icon-color' as never]: `color-mix(in srgb, ${priority.color} 15%, transparent)`,
                          ['--row-icon-fg' as never]: priority.color,
                        }}
                      >
                        {priority.icon}
                      </span>
                      <span className="list-row__body">
                        <span
                          className="list-row__title"
                          style={{ textDecoration: task['completed'] === true ? 'line-through' : undefined }}
                        >
                          {String(task['title'])}
                        </span>
                        <span className="list-row__meta">
                          {task['project'] ? <Chip>{String(task['project'])}</Chip> : null}
                          {task['dueAt'] ? <span>{dates.date(String(task['dueAt']))}</span> : null}
                          {priority.value !== 'normal' ? (
                            <Chip color={priority.color}>
                              {priority.icon} {priority.label}
                            </Chip>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        <IconButton
                          icon="edit"
                          label="Edit task"
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show({ collection: 'workTasks', record: task })}
                        />
                        <IconButton
                          icon="trash"
                          label="Delete task"
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show({ collection: 'workTasks', record: task })}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'workplaces' ? (
        <AsyncContent
          loading={workplaces.loading}
          error={workplaces.error}
          items={workplaces.items}
          onRetry={workplaces.reload}
          empty={{
            title: 'No workplaces yet',
            body: 'Add where you work and shifts can be attributed to it.',
            icon: 'work',
            action: { label: 'Add a workplace', run: () => editor.show({ collection: 'workplaces', record: null }) },
          }}
        >
          {(items) => (
            <div className="grid" style={{ ['--grid-min' as never]: '230px' }}>
              {items.map((workplace) => (
                <Card
                  key={workplace.id}
                  title={String(workplace['name'])}
                  subtitle={String(workplace['position'] ?? '')}
                  actions={
                    <IconButton
                      icon="edit"
                      label="Edit workplace"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor.show({ collection: 'workplaces', record: workplace })}
                    />
                  }
                >
                  <div className="row">
                    {workplace['current'] === true ? <Chip accent>Current</Chip> : <Chip>Past</Chip>}
                    {workplace['startedOn'] ? (
                      <span className="tiny faint">since {dates.date(String(workplace['startedOn']))}</span>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'people' ? (
        <AsyncContent
          loading={coworkers.loading}
          error={coworkers.error}
          items={coworkers.items}
          onRetry={coworkers.reload}
          empty={{
            title: 'No coworkers recorded',
            body: term('Useful when a {{member}} who has not met someone needs to know how they are.'),
            icon: 'contact',
            action: { label: 'Add a coworker', run: () => editor.show({ collection: 'coworkers', record: null }) },
          }}
        >
          {(items) => (
            <Card flush>
              <div className="list">
                {items.map((person) => {
                  const level = OPTIONS.safety.find((option) => option.value === person['safety']);
                  return (
                    <div key={person.id} className="list-row">
                      <span className="list-row__body">
                        <span className="list-row__title">{String(person['name'])}</span>
                        <span className="list-row__meta">
                          {person['role'] ? <span>{String(person['role'])}</span> : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        {level && level.value !== 'unset' ? (
                          <Status label={level.label} color={level.color} glyph={level.icon} />
                        ) : null}
                        <IconButton
                          icon="edit"
                          label="Edit coworker"
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show({ collection: 'coworkers', record: person })}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </AsyncContent>
      ) : null}

      <Dialog open={editor.open} onClose={editor.hide} title={editor.value?.record ? 'Edit' : 'Add'}>
        {editor.value ? (
          <RecordForm
            collection={editor.value.collection}
            record={editor.value.record}
            initial={editor.value.collection === 'workShifts' ? { startsAt: new Date().toISOString() } : {}}
            omit={['remindSent']}
            onSubmit={async (values) => {
              const target = collectionFor(editor.value!.collection);
              if (editor.value!.record) await target.update(editor.value!.record.id, values);
              else await target.create(values);
              toast.success('Saved');
              stats.reload();
              editor.hide();
            }}
            onCancel={editor.hide}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this?"
        body="It is removed from the list and from the charts."
        onConfirm={async () => {
          if (!confirm.value) return;
          await collectionFor(confirm.value.collection).remove(confirm.value.record.id);
          toast.success('Deleted');
          stats.reload();
        }}
      />
    </>
  );
}
