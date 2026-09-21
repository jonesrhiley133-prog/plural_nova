import { useMemo, useState } from 'react';
import { formatDuration, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { DateTimeField, NumberField, SwitchRow, TextField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { ColumnChart } from '../charts/index.js';

/**
 * Sleep.
 *
 * Saving is a single request with its own loading and error state, and the
 * dialog stays open until the server has actually answered — a save that spins
 * forever, or closes without storing anything, is the failure this screen is
 * written to avoid.
 */
export default function Sleep(): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const entries = useCollection('sleepEntries');
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);

  const overview = useQuery<{
    sleep: {
      entries: number;
      averageMinutes: number;
      averageQuality: number;
      byDay: { label: string; value: number; key: string }[];
    };
  }>('/api/stats/overview', { days: 30 });

  const naps = useMemo(() => entries.items.filter((entry) => entry['isNap'] === true).length, [entries.items]);

  return (
    <>
      <PageHeader
        title="Sleep"
        description="When you slept, how long, and how it went."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Log sleep
          </Button>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat
          label="Average"
          value={formatDuration(overview.data?.sleep.averageMinutes ?? 0)}
          detail="last 30 days"
        />
        <Stat
          label="Average quality"
          value={overview.data?.sleep.averageQuality ? `${overview.data.sleep.averageQuality}/5` : '—'}
        />
        <Stat label="Nights logged" value={overview.data?.sleep.entries ?? 0} />
        <Stat label="Naps" value={naps} />
      </div>

      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <ColumnChart
          title="Sleep over the last 30 days"
          subtitle="Only nights you recorded"
          valueLabel="Minutes"
          points={(overview.data?.sleep.byDay ?? []).map((bucket) => ({
            label: bucket.label,
            value: bucket.value,
            detail: bucket.key,
          }))}
          format={(value) => formatDuration(value)}
          emptyMessage="Nothing logged in this period."
        />
      </Card>

      <AsyncContent
        loading={entries.loading}
        error={entries.error}
        items={entries.items}
        onRetry={entries.reload}
        empty={{
          title: 'No sleep logged yet',
          body: 'Log a night and the averages start from there.',
          icon: 'sleep',
          action: { label: 'Log sleep', run: () => setCreating(true) },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.map((entry) => (
                <div key={entry.id} className="list-row">
                  <span className="list-row__body">
                    <span className="list-row__title">
                      {formatDuration(Number(entry['durationMinutes'] ?? 0))}
                      {entry['isNap'] === true ? <span className="faint"> · nap</span> : null}
                    </span>
                    <span className="list-row__meta">
                      <span>
                        {dates.dateTime(String(entry['startedAt']))}
                        {entry['endedAt'] ? ` → ${dates.time(String(entry['endedAt']))}` : ''}
                      </span>
                      {entry['quality'] ? <Chip>Quality {String(entry['quality'])}/5</Chip> : null}
                      {entry['mood'] ? <Chip>{String(entry['mood'])}</Chip> : null}
                      {Number(entry['awakenings'] ?? 0) > 0 ? (
                        <span className="faint">{String(entry['awakenings'])} × awake</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    <IconButton
                      icon="edit"
                      label="Edit sleep entry"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor.show(entry)}
                    />
                    <IconButton
                      icon="trash"
                      label="Delete sleep entry"
                      variant="ghost"
                      size="sm"
                      onClick={() => confirm.show(entry)}
                    />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </AsyncContent>

      <SleepDialog
        open={creating || editor.open}
        record={editor.value}
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
            toast.success('Sleep logged');
          }
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this sleep entry?"
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

function SleepDialog({
  open,
  record,
  onClose,
  onSave,
}: {
  open: boolean;
  record: StoredRecord | null;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [quality, setQuality] = useState<number | null>(3);
  const [awakenings, setAwakenings] = useState<number | null>(0);
  const [isNap, setIsNap] = useState(false);
  const [mood, setMood] = useState('');
  const [dreamNotes, setDreamNotes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Loading the record into local state once per record, rather than on every
  // render, so typing is never overwritten mid-edit.
  const targetId = record?.id ?? 'new';
  if (open && loadedId !== targetId) {
    setLoadedId(targetId);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 0, 0, 0);
    setStartedAt(record ? String(record['startedAt']) : yesterday.toISOString());
    setEndedAt(record ? ((record['endedAt'] as string) ?? null) : new Date().toISOString());
    setQuality(record ? ((record['quality'] as number) ?? null) : 3);
    setAwakenings(record ? ((record['awakenings'] as number) ?? 0) : 0);
    setIsNap(record ? record['isNap'] === true : false);
    setMood(record ? String(record['mood'] ?? '') : '');
    setDreamNotes(record ? String(record['dreamNotes'] ?? '') : '');
    setNote(record ? String(record['note'] ?? '') : '');
    setError(null);
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const duration =
    startedAt && endedAt
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000))
      : 0;

  const save = async (): Promise<void> => {
    if (!startedAt) {
      setError('Say when the sleep started.');
      return;
    }
    if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
      setError('Waking up before falling asleep is not something PluralNova can record.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        startedAt,
        endedAt,
        durationMinutes: duration,
        quality,
        awakenings,
        isNap,
        mood,
        dreamNotes,
        note,
      });
      onClose();
    } catch (cause) {
      // The dialog stays open with the message, so nothing typed is lost to a
      // failed save.
      setError(cause instanceof Error ? cause.message : 'That could not be saved. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? 'Edit sleep' : 'Log sleep'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <DateTimeField label="Fell asleep" value={startedAt} onChange={setStartedAt} required />
      <DateTimeField label="Woke up" value={endedAt} onChange={setEndedAt} />

      {duration > 0 ? (
        <p className="small muted" style={{ marginBottom: 'var(--space-4)' }}>
          That is {formatDuration(duration)}.
        </p>
      ) : null}

      <NumberField label="Quality (1–5)" value={quality} onChange={setQuality} min={1} max={5} />
      <NumberField label="Times awake" value={awakenings} onChange={setAwakenings} min={0} max={50} />
      <SwitchRow label="This was a nap" checked={isNap} onChange={setIsNap} />
      <TextField label="Mood on waking" value={mood} onChange={setMood} />
      <TextField label="Dreams" value={dreamNotes} onChange={setDreamNotes} multiline rows={2} />
      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
