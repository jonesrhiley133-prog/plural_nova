import { useMemo, useState } from 'react';
import { dayKey, type StoredRecord } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { NumberField, SwitchRow, TagField, TextField, DateTimeField } from '../ui/forms.js';
import { AsyncContent, DescriptiveNote, EmptyState } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Heatmap, Sparkline } from '../charts/index.js';
import { Icon } from '../ui/Icon.js';

const EVENT_META: Record<string, { icon: 'flag' | 'sparkle' | 'note' | 'cycle'; color: string }> = {
  start: { icon: 'flag', color: 'var(--accent)' },
  end: { icon: 'flag', color: 'var(--text-muted)' },
  symptom: { icon: 'sparkle', color: 'var(--caution)' },
  note: { icon: 'note', color: 'var(--info)' },
  none: { icon: 'cycle', color: 'var(--text-faint)' },
};

/**
 * Cycle & wellness.
 *
 * Off by default and named by the user. The phases are free text rather than a
 * fixed menstrual model, because the people who want this feature do not all
 * want the same version of it, and the people who do not want it should not
 * have to see it.
 */
export default function Cycle(): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const dates = useDateFormat();
  const toast = useToast();
  const entries = useCollection('cycleEntries', { enabled: settings.cycleEnabled });
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);

  const cycles = useMemo(() => {
    const starts = entries.items
      .filter((entry) => entry['eventType'] === 'start')
      .map((entry) => String(entry['entryDate']))
      .sort();
    const gaps: number[] = [];
    for (let index = 1; index < starts.length; index += 1) {
      const previous = Date.parse(`${starts[index - 1]}T00:00:00`);
      const current = Date.parse(`${starts[index]}T00:00:00`);
      gaps.push(Math.round((current - previous) / 86_400_000));
    }
    return {
      starts,
      gaps,
      lastStart: starts[starts.length - 1] ?? null,
      averageGap: gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null,
    };
  }, [entries.items]);

  const phases = useMemo(
    () => [...new Set(entries.items.map((entry) => String(entry['phase'] ?? '')).filter(Boolean))],
    [entries.items],
  );

  // Ten weeks, Sunday-aligned, so a glance shows the shape of the last two and
  // a half cycles rather than a scroll of individual days.
  const heatmap = useMemo(() => {
    const weeks = 10;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    // This week's Saturday first, then back up to the Sunday `weeks` earlier —
    // computing the start from today directly double-counted today's own
    // weekday offset and left the range ending before today.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - today.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const byDay = new Map<string, StoredRecord[]>();
    for (const entry of entries.items) {
      const key = String(entry['entryDate']).slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(entry);
      else byDay.set(key, [entry]);
    }

    const rows: string[] = [];
    const values: number[][] = [];
    const cursor = new Date(start);
    for (let week = 0; week < weeks; week += 1) {
      rows.push(`${cursor.getMonth() + 1}/${cursor.getDate()}`);
      const rowValues: number[] = [];
      for (let day = 0; day < 7; day += 1) {
        const dayEntries = byDay.get(dayKey(cursor)) ?? [];
        const hasStart = dayEntries.some((entry) => entry['eventType'] === 'start');
        rowValues.push(hasStart ? 2 : dayEntries.length > 0 ? 1 : 0);
        cursor.setDate(cursor.getDate() + 1);
      }
      values.push(rowValues);
    }
    return { rows, values };
  }, [entries.items]);

  if (!settings.cycleEnabled) {
    return (
      <>
        <PageHeader title="Cycle & wellness" />
        <Card>
          <EmptyState
            icon="cycle"
            title="This section is off"
            body="Cycle tracking is entirely optional, and nothing about it is assumed. Turn it on and you choose what the phases are called and which fields you use — including none of them."
            action={{
              label: 'Turn on cycle tracking',
              run: () => {
                void saveSettings({ cycleEnabled: true }).then(() => toast.success('Cycle tracking is on'));
              },
            }}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Cycle & wellness"
        description="Your own labels, your own fields. Nothing here is required."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Add an entry
          </Button>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat
          label="Last recorded start"
          value={cycles.lastStart ? dates.date(`${cycles.lastStart}T12:00:00`) : '—'}
        />
        <Stat
          label="Average gap"
          value={cycles.averageGap ? `${cycles.averageGap} days` : '—'}
          detail={
            cycles.starts.length < 2 ? (
              'Needs two starts to compare'
            ) : (
              <span className="row row--nowrap" style={{ gap: 6 }}>
                {`from ${cycles.starts.length} starts`}
                {cycles.gaps.length > 1 ? (
                  <Sparkline values={cycles.gaps} label="Recent gap length between starts" />
                ) : null}
              </span>
            )
          }
        />
        <Stat label="Entries" value={entries.items.length} />
      </div>

      <Card title="Last ten weeks" subtitle="Darker means a cycle start; a dot means something was logged" style={{ marginBottom: 'var(--space-4)' }}>
        <Heatmap
          title="Cycle activity"
          rows={heatmap.rows}
          columns={['S', 'M', 'T', 'W', 'T', 'F', 'S']}
          values={heatmap.values}
          valueLabel="Activity"
          format={(value) => (value >= 2 ? 'Cycle start' : value === 1 ? 'Logged' : 'Nothing recorded')}
          emptyMessage="Nothing recorded in the last ten weeks."
        />
      </Card>

      {phases.length > 0 ? (
        <Card title="Your phases" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row">
            {phases.map((phase) => (
              <Chip key={phase}>{phase}</Chip>
            ))}
          </div>
          <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
            These are the words you have used. PluralNova does not supply a set.
          </p>
        </Card>
      ) : null}

      <AsyncContent
        loading={entries.loading}
        error={entries.error}
        items={entries.items}
        onRetry={entries.reload}
        empty={{
          title: 'Nothing recorded yet',
          body: 'Add a day and note whatever is worth noting.',
          icon: 'cycle',
          action: { label: 'Add an entry', run: () => setCreating(true) },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.map((entry) => {
                const meta = EVENT_META[String(entry['eventType'] ?? 'none')] ?? EVENT_META['none']!;
                return (
                <div key={entry.id} className="list-row">
                  <span
                    className="list-row__icon"
                    aria-hidden="true"
                    style={{
                      ['--row-icon-color' as never]: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                      ['--row-icon-fg' as never]: meta.color,
                    }}
                  >
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">
                      {dates.date(`${String(entry['entryDate'])}T12:00:00`)}
                      {entry['phase'] ? <span className="faint"> · {String(entry['phase'])}</span> : null}
                    </span>
                    <span className="list-row__meta">
                      {entry['eventType'] && entry['eventType'] !== 'none' ? (
                        <Chip accent>{String(entry['eventType'])}</Chip>
                      ) : null}
                      {((entry['symptoms'] as string[]) ?? []).map((symptom) => (
                        <Chip key={symptom}>{symptom}</Chip>
                      ))}
                      {entry['energy'] ? <span className="faint">Energy {String(entry['energy'])}/10</span> : null}
                      {entry['discomfort'] ? (
                        <span className="faint">Discomfort {String(entry['discomfort'])}/10</span>
                      ) : null}
                      {entry['mood'] ? <span className="faint">{String(entry['mood'])}</span> : null}
                      {entry['remind'] === true ? <Chip>Reminder set</Chip> : null}
                    </span>
                    {entry['note'] ? (
                      <p className="tiny muted prose clamp-2" style={{ marginTop: 'var(--space-1)' }}>
                        {String(entry['note'])}
                      </p>
                    ) : null}
                  </span>
                  <span className="list-row__trailing">
                    <IconButton icon="edit" label="Edit entry" variant="ghost" size="sm" onClick={() => editor.show(entry)} />
                    <IconButton icon="trash" label="Delete entry" variant="ghost" size="sm" onClick={() => confirm.show(entry)} />
                  </span>
                </div>
                );
              })}
            </div>
          </Card>
        )}
      </AsyncContent>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          A gap between recorded starts is a gap between two things you wrote down. It is not a
          prediction, and PluralNova will not make one.
        </DescriptiveNote>
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void saveSettings({ cycleEnabled: false }).then(() =>
                toast.success('Cycle tracking is off', 'Your entries are kept.'),
              );
            }}
          >
            Turn this section off
          </Button>
        </div>
      </div>

      <CycleDialog
        open={creating || editor.open}
        record={editor.value}
        phases={phases}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        onSave={async (values) => {
          if (editor.value) {
            await entries.update(editor.value.id, values);
            toast.success('Saved');
          } else {
            await entries.create(values);
            toast.success('Entry added');
          }
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this entry?"
        body="It is removed from the list and from the averages."
        onConfirm={async () => {
          if (!confirm.value) return;
          await entries.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

const EVENTS = [
  { value: 'none', label: 'No event' },
  { value: 'start', label: 'Cycle start' },
  { value: 'end', label: 'Cycle end' },
  { value: 'symptom', label: 'Symptom day' },
  { value: 'note', label: 'Note only' },
];

function CycleDialog({
  open,
  record,
  phases,
  onClose,
  onSave,
}: {
  open: boolean;
  record: StoredRecord | null;
  phases: string[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const [eventType, setEventType] = useState('none');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [energy, setEnergy] = useState<number | null>(null);
  const [discomfort, setDiscomfort] = useState<number | null>(null);
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const [remind, setRemind] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const targetId = record?.id ?? 'new';
  if (open && loadedId !== targetId) {
    setLoadedId(targetId);
    setEntryDate(record ? String(record['entryDate']) : dayKey(new Date()));
    setPhase(record ? String(record['phase'] ?? '') : '');
    setEventType(record ? String(record['eventType'] ?? 'none') : 'none');
    setSymptoms(record ? ((record['symptoms'] as string[]) ?? []) : []);
    setEnergy(record ? ((record['energy'] as number) ?? null) : null);
    setDiscomfort(record ? ((record['discomfort'] as number) ?? null) : null);
    setMood(record ? String(record['mood'] ?? '') : '');
    setNote(record ? String(record['note'] ?? '') : '');
    setRemind(record ? record['remind'] === true : false);
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave({
        entryDate: (entryDate ?? dayKey(new Date())).slice(0, 10),
        phase,
        eventType,
        symptoms,
        energy,
        discomfort,
        mood,
        note,
        remind,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? 'Edit entry' : 'Add an entry'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <DateTimeField label="Date" value={entryDate} onChange={setEntryDate} dateOnly required />

      <div className="field">
        <span className="field__label">Event</span>
        <div className="row">
          {EVENTS.map((option) => (
            <Chip key={option.value} selected={eventType === option.value} onClick={() => setEventType(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <TextField
        label="Phase"
        value={phase}
        onChange={setPhase}
        hint="Whatever you call it. PluralNova does not have a list."
      />
      {phases.length > 0 ? (
        <div className="row" style={{ marginTop: 'calc(var(--space-4) * -1)', marginBottom: 'var(--space-4)' }}>
          {phases.map((option) => (
            <Chip key={option} onClick={() => setPhase(option)}>
              {option}
            </Chip>
          ))}
        </div>
      ) : null}

      <TagField label="Symptoms" values={symptoms} onChange={setSymptoms} />
      <NumberField label="Energy" value={energy} onChange={setEnergy} min={1} max={10} />
      <NumberField label="Discomfort" value={discomfort} onChange={setDiscomfort} min={0} max={10} />
      <TextField label="Mood" value={mood} onChange={setMood} />
      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />
      <SwitchRow
        label="Remind me around the next one"
        hint="Based on the gaps you have recorded, not a prediction."
        checked={remind}
        onChange={setRemind}
      />
    </Dialog>
  );
}
