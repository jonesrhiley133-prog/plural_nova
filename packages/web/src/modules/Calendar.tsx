import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dayKey, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useAuth } from '../core/auth.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { EmptyState } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * The calendar.
 *
 * Month, week, day and agenda over the same events. System events sit alongside
 * ordinary ones rather than in a separate calendar — a therapy appointment and
 * a member's birthday belong on the same grid.
 */

type View = 'month' | 'week' | 'day' | 'agenda';

export default function Calendar(): JSX.Element {
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const { settings } = useAuth();
  const members = useRecordMap('members');

  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));

  const { items, loading, create, update, remove } = useCollection('calendarEvents');
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(params.get('new') === '1');

  const byDay = useMemo(() => {
    const map = new Map<string, StoredRecord[]>();
    for (const event of items) {
      const key = dayKey(String(event['startsAt']));
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => String(a['startsAt']).localeCompare(String(b['startsAt'])));
    }
    return map;
  }, [items]);

  const shift = (amount: number): void => {
    const next = new Date(cursor);
    if (view === 'month') next.setMonth(next.getMonth() + amount);
    else if (view === 'week') next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
    if (view === 'day') setSelectedDay(dayKey(next));
  };

  const periodLabel =
    view === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'day'
        ? dates.date(cursor)
        : `Week of ${dates.date(startOfWeek(cursor, settings.weekStart))}`;

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New event
          </Button>
        }
      />

      <div className="row row--between" style={{ marginBottom: 'var(--space-4)' }}>
        <SegmentedControl
          value={view}
          onChange={setView}
          label="View"
          options={(['month', 'week', 'day', 'agenda'] as const).map((option) => ({
            value: option,
            label: option[0]!.toUpperCase() + option.slice(1),
          }))}
        />

        {view !== 'agenda' ? (
          <div className="row row--nowrap">
            <IconButton icon="chevronLeft" label="Previous" variant="ghost" size="sm" onClick={() => shift(-1)} />
            <span className="small" style={{ minWidth: 140, textAlign: 'center' }}>
              {periodLabel}
            </span>
            <IconButton icon="chevronRight" label="Next" variant="ghost" size="sm" onClick={() => shift(1)} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCursor(new Date());
                setSelectedDay(dayKey(new Date()));
              }}
            >
              Today
            </Button>
          </div>
        ) : null}
      </div>

      {view === 'month' ? (
        <MonthGrid
          cursor={cursor}
          weekStart={settings.weekStart}
          byDay={byDay}
          selected={selectedDay}
          onSelect={setSelectedDay}
        />
      ) : null}

      {view === 'week' ? (
        <WeekStrip
          cursor={cursor}
          weekStart={settings.weekStart}
          byDay={byDay}
          selected={selectedDay}
          onSelect={setSelectedDay}
        />
      ) : null}

      {view !== 'agenda' ? (
        <DayList
          day={selectedDay}
          events={byDay.get(selectedDay) ?? []}
          members={members}
          onEdit={(event) => editor.show(event)}
          onDelete={(event) => confirm.show(event)}
          onAdd={() => setCreating(true)}
        />
      ) : (
        <Agenda
          items={items}
          members={members}
          loading={loading}
          onEdit={(event) => editor.show(event)}
          onAdd={() => setCreating(true)}
        />
      )}

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? 'Edit event' : 'New event'}
      >
        <RecordForm
          collection="calendarEvents"
          record={editor.value}
          initial={{ startsAt: new Date(`${selectedDay}T09:00:00`).toISOString() }}
          omit={['attachmentIds', 'remindSent']}
          onSubmit={async (values) => {
            if (editor.value) {
              await update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await create(values);
              toast.success('Event added');
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
        title={t('confirm.deleteTitle', { label: String(confirm.value?.['title'] ?? 'this event') })}
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await remove(confirm.value.id);
          toast.success('Event deleted');
        }}
      />

      <p className="tiny faint" style={{ marginTop: 'var(--space-4)' }}>
        {term('{{System}} events and everyday ones share the same calendar.')}
      </p>
    </>
  );
}

function startOfWeek(date: Date, weekStart: 0 | 1): Date {
  const result = new Date(date);
  const offset = (result.getDay() - weekStart + 7) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function MonthGrid({
  cursor,
  weekStart,
  byDay,
  selected,
  onSelect,
}: {
  cursor: Date;
  weekStart: 0 | 1;
  byDay: Map<string, StoredRecord[]>;
  selected: string;
  onSelect: (day: string) => void;
}): JSX.Element {
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first, weekStart);
    // Six rows always, so the grid does not jump height between months.
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor, weekStart]);

  const labels = weekStart === 1
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const today = dayKey(new Date());

  return (
    <Card flush style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {labels.map((label) => (
          <span key={label} className="tiny faint" style={{ textAlign: 'center', paddingBottom: 4 }}>
            {label}
          </span>
        ))}
        {days.map((date) => {
          const key = dayKey(date);
          const events = byDay.get(key) ?? [];
          const otherMonth = date.getMonth() !== cursor.getMonth();
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={key === today ? 'date' : undefined}
              aria-label={`${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${events.length} events`}
              style={{
                aspectRatio: '1',
                border:
                  key === selected ? '1px solid var(--accent)' : '1px solid transparent',
                background:
                  key === today ? 'var(--accent-soft)' : key === selected ? 'var(--surface-sunken)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                color: otherMonth ? 'var(--text-faint)' : 'var(--text)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: 2,
                minHeight: 38,
              }}
            >
              <span className="tiny numeric">{date.getDate()}</span>
              {events.length > 0 ? (
                <span className="row row--nowrap" style={{ gap: 2 }} aria-hidden="true">
                  {events.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: (event['color'] as string) || 'var(--accent)',
                      }}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekStrip({
  cursor,
  weekStart,
  byDay,
  selected,
  onSelect,
}: {
  cursor: Date;
  weekStart: 0 | 1;
  byDay: Map<string, StoredRecord[]>;
  selected: string;
  onSelect: (day: string) => void;
}): JSX.Element {
  const start = startOfWeek(cursor, weekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return (
    <Card flush style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
      <div className="row row--nowrap" style={{ gap: 4 }}>
        {days.map((date) => {
          const key = dayKey(date);
          const events = byDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className="card card--interactive"
              style={{
                flex: 1,
                padding: 'var(--space-2)',
                textAlign: 'center',
                borderColor: key === selected ? 'var(--accent)' : undefined,
              }}
            >
              <div className="tiny faint">{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className="numeric" style={{ fontSize: 'var(--size-md)' }}>
                {date.getDate()}
              </div>
              <div className="tiny faint">{events.length || ''}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function DayList({
  day,
  events,
  members,
  onEdit,
  onDelete,
  onAdd,
}: {
  day: string;
  events: StoredRecord[];
  members: Map<string, StoredRecord>;
  onEdit: (event: StoredRecord) => void;
  onDelete: (event: StoredRecord) => void;
  onAdd: () => void;
}): JSX.Element {
  const dates = useDateFormat();

  return (
    <Card title={dates.date(`${day}T12:00:00`)} flush>
      {events.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nothing on this day"
          body="A free day is a result, not a gap."
          action={{ label: 'Add an event', run: onAdd }}
        />
      ) : (
        <div className="list">
          {events.map((event) => (
            <div key={event.id} className="list-row">
              <span
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  borderRadius: 'var(--radius-xs)',
                  background: (event['color'] as string) || 'var(--accent)',
                }}
                aria-hidden="true"
              />
              <span className="list-row__body">
                <span className="list-row__title">{String(event['title'])}</span>
                <span className="list-row__meta">
                  <span>
                    {event['allDay'] === true
                      ? 'All day'
                      : `${dates.time(String(event['startsAt']))}${
                          event['endsAt'] ? ` – ${dates.time(String(event['endsAt']))}` : ''
                        }`}
                  </span>
                  {event['location'] ? (
                    <span className="faint">
                      <Icon name="location" size={11} /> {String(event['location'])}
                    </span>
                  ) : null}
                  {((event['memberIds'] as string[]) ?? []).map((id) => {
                    const member = members.get(id);
                    return member ? (
                      <Chip key={id} color={(member['color'] as string) ?? null}>
                        {String(member['name'])}
                      </Chip>
                    ) : null;
                  })}
                </span>
              </span>
              <span className="list-row__trailing">
                <IconButton icon="edit" label="Edit event" variant="ghost" size="sm" onClick={() => onEdit(event)} />
                <IconButton icon="trash" label="Delete event" variant="ghost" size="sm" onClick={() => onDelete(event)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Agenda({
  items,
  members,
  loading,
  onEdit,
  onAdd,
}: {
  items: StoredRecord[];
  members: Map<string, StoredRecord>;
  loading: boolean;
  onEdit: (event: StoredRecord) => void;
  onAdd: () => void;
}): JSX.Element {
  const dates = useDateFormat();
  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return items
      .filter((event) => String(event['startsAt']) >= now)
      .sort((a, b) => String(a['startsAt']).localeCompare(String(b['startsAt'])))
      .slice(0, 60);
  }, [items]);

  if (!loading && upcoming.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="calendar"
          title="Nothing coming up"
          body="Events you add will appear here in order."
          action={{ label: 'Add an event', run: onAdd }}
        />
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="list">
        {upcoming.map((event) => (
          <button key={event.id} type="button" className="list-row" onClick={() => onEdit(event)}>
            <span className="list-row__body">
              <span className="list-row__title">{String(event['title'])}</span>
              <span className="list-row__meta">
                <span>{dates.dateTime(String(event['startsAt']))}</span>
                {((event['memberIds'] as string[]) ?? []).slice(0, 2).map((id) => {
                  const member = members.get(id);
                  return member ? <Chip key={id}>{String(member['name'])}</Chip> : null;
                })}
              </span>
            </span>
            <Icon name="chevronRight" size={14} />
          </button>
        ))}
      </div>
    </Card>
  );
}
