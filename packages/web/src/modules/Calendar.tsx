import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dayKey, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useAuth } from '../core/auth.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, ListRow, SegmentedControl, Tabs } from '../ui/primitives.js';
import { EmptyState } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import {
  ColorField,
  DateTimeField,
  Field,
  ImageField,
  NumberField,
  ReferenceField,
  SelectField,
  SwitchRow,
  TextField,
} from '../ui/forms.js';
import { Icon, type IconName } from '../ui/Icon.js';

/**
 * The calendar.
 *
 * Month, week, day and agenda over the same events. The New/Edit dialog is
 * built to its own layout rather than the generic record form — repeat
 * rules, reminders and appearance need more shape than one flat list of
 * fields gives them.
 *
 * Birthdays sit beside the grid, not on it: a side panel on a wide screen, a
 * separate tab on a narrow one, reading straight from each member's own
 * birthday field rather than keeping a second copy of the same date.
 */

type View = 'month' | 'week' | 'day' | 'agenda';

export default function Calendar(): JSX.Element {
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const { settings } = useAuth();
  const members = useRecordMap('members');
  const membersCollection = useCollection('members');
  const locations = useRecordMap('locationEntries');

  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [section, setSection] = useState<'calendar' | 'birthdays'>('calendar');

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

      <div className="calendar-mobile-tabs">
        <Tabs
          value={section}
          onChange={setSection}
          label="Calendar section"
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'birthdays', label: 'Birthdays' },
          ]}
        />
      </div>

      <div className="split split--wide-first">
        <div className={section === 'birthdays' ? 'calendar-mobile-hidden' : undefined}>
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
              locations={locations}
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

          <p className="tiny faint" style={{ marginTop: 'var(--space-4)' }}>
            {term('{{System}} events and everyday ones share the same calendar.')}
          </p>
        </div>

        <aside className={`split__aside${section === 'calendar' ? ' calendar-mobile-hidden' : ''}`}>
          <BirthdaysPanel members={membersCollection.items} onSave={membersCollection.update} />
        </aside>
      </div>

      <EventEditor
        open={creating || editor.open}
        record={editor.value}
        defaultDay={selectedDay}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        onSave={async (values) => {
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
      />

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

/** Local wall-clock HH:MM out of an ISO timestamp — `dayKey`'s counterpart for time. */
function timeKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

/** A local `YYYY-MM-DD` and `HH:MM` back into the UTC ISO storage expects. */
function combineLocal(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

const REMINDER_PRESETS = [
  { value: '0', label: 'At the time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
  { value: '10080', label: '1 week before' },
];

function recurrenceUnitLabel(recurrenceType: string): string {
  switch (recurrenceType) {
    case 'daily':
      return 'day(s)';
    case 'weekly':
      return 'week(s)';
    case 'monthly':
      return 'month(s)';
    default:
      return 'year(s)';
  }
}

/** The next time a birthday comes around from today, and the age it brings. */
function nextBirthdayOccurrence(birthday: string): { date: Date; age: number } | null {
  const born = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let year = today.getFullYear();
  let next = new Date(year, born.getMonth(), born.getDate());
  if (next < today) {
    year += 1;
    next = new Date(year, born.getMonth(), born.getDate());
  }
  return { date: next, age: year - born.getFullYear() };
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
  locations,
  onEdit,
  onDelete,
  onAdd,
}: {
  day: string;
  events: StoredRecord[];
  members: Map<string, StoredRecord>;
  locations: Map<string, StoredRecord>;
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
                  {(() => {
                    const names = ((event['locationIds'] as string[]) ?? [])
                      .map((id) => locations.get(id)?.['name'])
                      .filter((name): name is string => Boolean(name));
                    return names.length > 0 ? (
                      <span className="faint">
                        <Icon name="location" size={11} /> {names.join(', ')}
                      </span>
                    ) : null;
                  })()}
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

/**
 * The event editor.
 *
 * Its own layout rather than the registry-driven `RecordForm`: repeat rules,
 * reminders and appearance need more structure than one flat list of fields,
 * and a couple of them had no editor at all before this — a JSON-kind field
 * renders nothing in the generic form, so the specific weekdays a weekly
 * repeat falls on were unreachable, and "remind me in N minutes" was a number
 * box that saved a number nothing ever read. The actual reminder sweep reads
 * an absolute `remindAt`, so that is what gets computed and stored here.
 */
function EventEditor({
  open,
  record,
  defaultDay,
  onSave,
  onClose,
}: {
  open: boolean;
  record: StoredRecord | null;
  defaultDay: string;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const folders = useCollection('calendarFolders');
  const locations = useCollection('locationEntries');
  const members = useCollection('members');

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [dateStr, setDateStr] = useState(defaultDay);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [emoji, setEmoji] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState<number | null>(1);
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  const [recurrenceEndsOn, setRecurrenceEndsOn] = useState<string | null>(null);
  const [remindMinutesBefore, setRemindMinutesBefore] = useState<number | null>(null);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [showOnCalendar, setShowOnCalendar] = useState(true);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const originalRemindAt = useRef<string | null>(null);

  const folderCreator = useDialog();

  // Fresh state each time the dialog opens, not just when the record's id
  // changes — a "New event" opened twice in a row should never carry over
  // what was half-typed the first time.
  useEffect(() => {
    if (!open) return;
    setTitle(String(record?.['title'] ?? ''));
    setTitleError(null);
    setNotes(String(record?.['notes'] ?? ''));
    const startsAt = String(record?.['startsAt'] ?? '');
    setDateStr((startsAt && dayKey(startsAt)) || defaultDay);
    setAllDay(record?.['allDay'] === true);
    setStartTime((startsAt && timeKey(startsAt)) || '09:00');
    setEndTime(record?.['endsAt'] ? timeKey(String(record['endsAt'])) : '');
    setFolderId((record?.['folderId'] as string) ?? null);
    setColor(String(record?.['color'] ?? ''));
    setEmoji(String(record?.['emoji'] ?? ''));
    setBannerUrl(String(record?.['bannerUrl'] ?? ''));
    setIsRecurring(record?.['isRecurring'] === true);
    setRecurrenceType(String(record?.['recurrenceType'] || 'weekly'));
    setRecurrenceInterval(Number(record?.['recurrenceInterval']) || 1);
    setRecurrenceWeekdays(
      Array.isArray(record?.['recurrenceWeekdays']) ? (record!['recurrenceWeekdays'] as number[]) : [],
    );
    setRecurrenceEndsOn((record?.['recurrenceEndsOn'] as string) || null);
    setRemindMinutesBefore(
      record?.['remindMinutesBefore'] !== undefined &&
        record?.['remindMinutesBefore'] !== null &&
        record?.['remindMinutesBefore'] !== ''
        ? Number(record['remindMinutesBefore'])
        : null,
    );
    setLocationIds(Array.isArray(record?.['locationIds']) ? (record!['locationIds'] as string[]) : []);
    setLink(String(record?.['link'] ?? ''));
    setMemberIds(Array.isArray(record?.['memberIds']) ? (record!['memberIds'] as string[]) : []);
    setShowOnCalendar(record?.['showOnCalendar'] !== false);
    setOpenSections(new Set());
    originalRemindAt.current = record?.['remindAt'] ? String(record['remindAt']) : null;
  }, [open, record?.id]);

  const toggleSection = (id: string): void =>
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleWeekday = (day: number): void =>
    setRecurrenceWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );

  const save = async (): Promise<void> => {
    if (!title.trim()) {
      setTitleError('A title is needed.');
      return;
    }
    setSaving(true);
    try {
      const startsAt = combineLocal(dateStr, allDay ? '00:00' : startTime || '00:00');
      const endsAt = !allDay && endTime ? combineLocal(dateStr, endTime) : null;
      const remindAt =
        remindMinutesBefore !== null
          ? new Date(new Date(startsAt).getTime() - remindMinutesBefore * 60_000).toISOString()
          : null;

      const payload: Record<string, unknown> = {
        title: title.trim(),
        notes,
        startsAt,
        endsAt,
        allDay,
        folderId,
        color,
        emoji,
        bannerUrl,
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : '',
        recurrenceInterval: isRecurring ? recurrenceInterval ?? 1 : 1,
        recurrenceWeekdays: isRecurring && recurrenceType === 'weekly' ? recurrenceWeekdays : [],
        recurrenceEndsOn: isRecurring ? recurrenceEndsOn : null,
        remindMinutesBefore,
        locationIds,
        link,
        memberIds,
        showOnCalendar,
      };
      // A reminder that has not moved keeps whatever `remindSent` already is
      // — touching it here would re-fire one that already went out. One that
      // has moved, including to or from "none", is not that same reminder.
      if (remindAt !== originalRemindAt.current) {
        payload['remindAt'] = remindAt;
        payload['remindSent'] = false;
      }

      await onSave(payload);
    } catch (cause) {
      toast.fromError(cause, 'Could not save that event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? 'Edit Event' : 'New Event'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {record ? 'Save' : 'Create Event'}
          </Button>
        </>
      }
    >
      <div
        className="row row--nowrap"
        style={{
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          background: 'var(--surface-sunken)',
          border: 'var(--border-width) solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            flexShrink: 0,
            fontSize: 18,
          }}
        >
          {emoji || <Icon name="star" size={18} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 'var(--weight-semibold)' }}>
            {title.trim() || 'Event title'}
          </div>
          <div className="tiny faint">{dateStr ? dates.date(`${dateStr}T12:00:00`) : ''}</div>
        </div>
      </div>

      <TextField
        label="Title"
        value={title}
        onChange={(value) => {
          setTitle(value);
          if (titleError) setTitleError(null);
        }}
        required
        {...(titleError ? { error: titleError } : {})}
        placeholder="Event name…"
      />

      <TextField
        label="Description"
        value={notes}
        onChange={setNotes}
        multiline
        rows={3}
        placeholder="What's this event about?"
      />

      <div className="field-row">
        <DateTimeField
          label="Date"
          value={dateStr}
          onChange={(value) => setDateStr(value ?? defaultDay)}
          dateOnly
          required
        />
        <SwitchRow label="All day" checked={allDay} onChange={setAllDay} />
      </div>

      {!allDay ? (
        <div className="field-row">
          <TextField label="Start time" type="time" value={startTime} onChange={setStartTime} />
          <TextField label="End time" type="time" value={endTime} onChange={setEndTime} />
        </div>
      ) : null}

      <Field label="Folder">
        {({ id, describedBy }) => (
          <div className="row row--nowrap">
            <select
              id={id}
              className="select"
              style={{ flex: 1 }}
              value={folderId ?? ''}
              aria-describedby={describedBy}
              onChange={(event) => setFolderId(event.target.value || null)}
            >
              <option value="">No folder</option>
              {folders.items.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {String(folder['name'] ?? 'Untitled')}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" icon="plus" onClick={() => folderCreator.show()}>
              New
            </Button>
          </div>
        )}
      </Field>

      <CollapsibleSection
        icon="sparkle"
        title="Appearance"
        open={openSections.has('appearance')}
        onToggle={() => toggleSection('appearance')}
      >
        <ColorField label="Colour" value={color} onChange={setColor} />
        <TextField label="Emoji" value={emoji} onChange={setEmoji} maxLength={8} placeholder="🎉" />
        <ImageField label="Banner" value={bannerUrl} onChange={setBannerUrl} shape="banner" />
      </CollapsibleSection>

      <CollapsibleSection
        icon="repeat"
        title="Repeat"
        open={openSections.has('repeat')}
        onToggle={() => toggleSection('repeat')}
      >
        <SwitchRow label="Repeats" checked={isRecurring} onChange={setIsRecurring} />
        {isRecurring ? (
          <>
            <div className="field-row">
              <SelectField
                label="How often"
                value={recurrenceType}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
                onChange={setRecurrenceType}
              />
              <NumberField
                label="Every"
                value={recurrenceInterval}
                onChange={(value) => setRecurrenceInterval(value ?? 1)}
                min={1}
                max={365}
                suffix={recurrenceUnitLabel(recurrenceType)}
              />
            </div>
            {recurrenceType === 'weekly' ? (
              <div className="field">
                <span className="field__label">On these days</span>
                <div className="row">
                  {WEEKDAYS.map((weekday) => (
                    <Chip
                      key={weekday.value}
                      selected={recurrenceWeekdays.includes(weekday.value)}
                      onClick={() => toggleWeekday(weekday.value)}
                    >
                      {weekday.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
            <DateTimeField
              label="Until"
              value={recurrenceEndsOn}
              onChange={setRecurrenceEndsOn}
              dateOnly
              hint="Leave blank to repeat with no end."
            />
          </>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        icon="notification"
        title="Reminders"
        open={openSections.has('reminders')}
        onToggle={() => toggleSection('reminders')}
      >
        <SelectField
          label="Remind me"
          value={remindMinutesBefore === null ? '' : String(remindMinutesBefore)}
          placeholder="No reminder"
          options={REMINDER_PRESETS}
          onChange={(value) => setRemindMinutesBefore(value === '' ? null : Number(value))}
        />
      </CollapsibleSection>

      <CollapsibleSection
        icon="link"
        title="Location & link"
        open={openSections.has('location')}
        onToggle={() => toggleSection('location')}
      >
        <ReferenceField
          label="Locations"
          value={locationIds}
          multiple
          options={locations.items.map((item) => ({ id: item.id, label: String(item['name'] ?? 'Unnamed') }))}
          onChange={(value) => setLocationIds(value as string[])}
          emptyLabel="None"
        />
        <TextField label="Link" type="url" value={link} onChange={setLink} placeholder="https://…" />
      </CollapsibleSection>

      <ReferenceField
        label={term('Associated {{member}}')}
        value={memberIds}
        multiple
        options={members.items.map((member) => ({
          id: member.id,
          label: String(member['name'] ?? 'Unnamed'),
          color: (member['color'] as string) ?? null,
          icon: (member['icon'] as string) ?? null,
        }))}
        onChange={(value) => setMemberIds(value as string[])}
        emptyLabel="None"
      />

      <SwitchRow
        label="Show on calendar grid"
        hint="Off keeps it as a record without putting it on the grid."
        checked={showOnCalendar}
        onChange={setShowOnCalendar}
      />

      <Dialog open={folderCreator.open} onClose={folderCreator.hide} title="New calendar folder">
        <RecordForm
          collection="calendarFolders"
          fields={['name', 'color']}
          onSubmit={async (values) => {
            const created = await folders.create(values);
            setFolderId(created.id);
            folderCreator.hide();
          }}
          onCancel={folderCreator.hide}
        />
      </Dialog>
    </Dialog>
  );
}

function CollapsibleSection({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div style={{ margin: 'var(--space-4) 0' }}>
      <button type="button" className="row row--between disclosure-toggle" aria-expanded={open} onClick={onToggle}>
        <span
          className="section-heading__label"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Icon name={icon} size={15} />
          {title}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
      </button>
      {open ? <div style={{ marginTop: 'var(--space-3)' }}>{children}</div> : null}
    </div>
  );
}

/**
 * Birthdays.
 *
 * Reads straight from each member's own birthday field — there is no separate
 * birthday record, so adding or editing one here is the same write as doing
 * it from their profile's Identity tab, just reachable from the calendar too.
 */
function BirthdaysPanel({
  members,
  onSave,
}: {
  members: StoredRecord[];
  onSave: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
}): JSX.Element {
  const dates = useDateFormat();
  const dialog = useDialog<StoredRecord>();

  const upcoming = useMemo(() => {
    return members
      .map((member) => ({
        member,
        occurrence: member['birthday'] ? nextBirthdayOccurrence(String(member['birthday'])) : null,
      }))
      .filter(
        (entry): entry is { member: StoredRecord; occurrence: { date: Date; age: number } } =>
          Boolean(entry.occurrence),
      )
      .sort((a, b) => a.occurrence.date.getTime() - b.occurrence.date.getTime());
  }, [members]);

  return (
    <Card
      title="Birthdays"
      actions={
        <Button variant="ghost" size="sm" icon="plus" onClick={() => dialog.show()}>
          Add
        </Button>
      }
      flush
    >
      {upcoming.length === 0 ? (
        <EmptyState
          icon="star"
          title="No birthdays yet"
          body="Add one to see it here, and to be reminded when it comes around."
          action={{ label: 'Add a birthday', run: () => dialog.show() }}
        />
      ) : (
        <div className="list">
          {upcoming.map(({ member, occurrence }) => (
            <ListRow
              key={member.id}
              onClick={() => dialog.show(member)}
              leading={
                <Avatar
                  name={String(member['name'])}
                  src={(member['avatarUrl'] as string) ?? null}
                  color={(member['color'] as string) ?? null}
                  icon={(member['icon'] as string) ?? null}
                  size={40}
                  round
                />
              }
              title={String(member['name'])}
              meta={
                <>
                  <span className="row row--nowrap" style={{ gap: 6 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: (member['color'] as string) || 'var(--accent)',
                        flexShrink: 0,
                      }}
                    />
                    {occurrence.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Turning{' '}
                    {occurrence.age}
                  </span>
                  <span className="faint">{dates.relative(occurrence.date.toISOString())}</span>
                </>
              }
              trailing={<Icon name="chevronRight" size={14} />}
            />
          ))}
        </div>
      )}

      <BirthdayDialog dialog={dialog} members={members} onSave={onSave} />
    </Card>
  );
}

function BirthdayDialog({
  dialog,
  members,
  onSave,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
  members: StoredRecord[];
  onSave: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
}): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const editing = Boolean(dialog.value);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dialog.open) return;
    setMemberId(dialog.value?.id ?? null);
    setDate((dialog.value?.['birthday'] as string) ?? null);
  }, [dialog.open, dialog.value]);

  const save = async (): Promise<void> => {
    if (!memberId || !date) return;
    setSaving(true);
    try {
      await onSave(memberId, { birthday: date });
      toast.success('Birthday saved');
      dialog.hide();
    } catch (cause) {
      toast.fromError(cause);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!memberId) return;
    setSaving(true);
    try {
      await onSave(memberId, { birthday: null });
      toast.success('Birthday removed');
      dialog.hide();
    } catch (cause) {
      toast.fromError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={editing ? 'Edit birthday' : 'Add a birthday'}
      footer={
        <>
          {editing ? (
            <Button variant="ghost" onClick={() => void remove()} disabled={saving}>
              Remove
            </Button>
          ) : null}
          <Button variant="ghost" onClick={dialog.hide} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!memberId || !date} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {editing ? null : (
        <ReferenceField
          label={term('{{Member}}')}
          value={memberId}
          options={members.map((member) => ({
            id: member.id,
            label: String(member['name'] ?? 'Unnamed'),
            color: (member['color'] as string) ?? null,
            icon: (member['icon'] as string) ?? null,
          }))}
          onChange={(value) => setMemberId(value as string | null)}
          emptyLabel="Choose one"
        />
      )}
      <DateTimeField label="Birthday" value={date} onChange={setDate} dateOnly required />
    </Dialog>
  );
}
