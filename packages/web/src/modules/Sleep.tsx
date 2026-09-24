import { useMemo, useState } from 'react';
import { formatDuration, requireCollection, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery, useRecordMap } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useLiveSession } from '../core/liveSession.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, FieldList, IconButton, Stat } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { ColumnChart } from '../charts/index.js';

/** Looks up an enum field's label for a stored value, rather than duplicating the option list. */
function enumLabel(collection: string, field: string, value: unknown): string | null {
  if (!value) return null;
  const definition = requireCollection(collection).fields.find((candidate) => candidate.name === field);
  return definition?.options?.find((option) => option.value === value)?.label ?? String(value);
}

/** A reasonable default for "when did you fall asleep" when logging last night's sleep just now. */
function lastNight(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(23, 0, 0, 0);
  return date.toISOString();
}

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
  const members = useRecordMap('members');
  const locations = useRecordMap('locationEntries');
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const session = useLiveSession(entries, 'startedAt', 'endedAt');

  const wake = async (): Promise<void> => {
    if (!session.active) return;
    const durationMinutes = Math.max(
      0,
      Math.round((Date.now() - Date.parse(String(session.active['startedAt']))) / 60000),
    );
    try {
      const stopped = await session.stop({ durationMinutes });
      if (stopped) editor.show(stopped);
    } catch (cause) {
      toast.fromError(cause, 'Could not record waking up');
    }
  };

  const overview = useQuery<{
    sleep: {
      entries: number;
      averageMinutes: number;
      averageQuality: number;
      averageLatencyMinutes: number;
      nightmareNights: number;
      sleepwalkingNights: number;
      byDay: { label: string; value: number; key: string }[];
    };
  }>('/api/stats/overview', { days: 30 });

  const naps = useMemo(() => entries.items.filter((entry) => entry['isNap'] === true).length, [entries.items]);

  return (
    <>
      <PageHeader
        title="Sleep"
        description={
          session.active
            ? `Asleep for ${formatDuration(session.elapsedMinutes)} so far.`
            : 'When you slept, how long, and how it went.'
        }
        actions={
          session.active ? (
            <Button variant="primary" icon="pause" onClick={() => void wake()}>
              Wake up
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setCreating(true)}>
                Log a past night
              </Button>
              <Button variant="primary" icon="play" onClick={() => void session.start()}>
                Start
              </Button>
            </>
          )
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
        {overview.data?.sleep.averageLatencyMinutes ? (
          <Stat label="Time to fall asleep" value={`${overview.data.sleep.averageLatencyMinutes} min`} detail="average" />
        ) : null}
        {overview.data?.sleep.nightmareNights ? (
          <Stat label="Nightmares" value={overview.data.sleep.nightmareNights} detail="last 30 days" />
        ) : null}
        {overview.data?.sleep.sleepwalkingNights ? (
          <Stat label="Sleepwalking" value={overview.data.sleep.sleepwalkingNights} detail="last 30 days" />
        ) : null}
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
              {records.map((entry) => {
                const isOpen = expanded === entry.id;
                const wokeMember = entry['frontingMemberId']
                  ? members.get(String(entry['frontingMemberId']))
                  : null;
                const flags = [
                  entry['nightmares'] === true ? 'Nightmares' : null,
                  entry['sleepwalking'] === true ? 'Sleepwalking' : null,
                  entry['sleepTalking'] === true ? 'Sleep talking' : null,
                ].filter((flag): flag is string => flag !== null);
                const medications = Array.isArray(entry['medications']) ? (entry['medications'] as string[]) : [];
                const locationNames = ((entry['locationIds'] as string[]) ?? [])
                  .map((id) => locations.get(id)?.['name'])
                  .filter((name): name is string => Boolean(name))
                  .join(', ');
                const hasDetail =
                  Boolean(entry['bedtime']) ||
                  Boolean(entry['outOfBedAt']) ||
                  Boolean(entry['latencyMinutes']) ||
                  flags.length > 0 ||
                  Boolean(entry['moodBefore']) ||
                  Boolean(entry['stress']) ||
                  locationNames.length > 0 ||
                  Boolean(entry['noise']) ||
                  Boolean(entry['lightLevel']) ||
                  Boolean(entry['temperature']) ||
                  entry['caffeine'] === true ||
                  entry['exercised'] === true ||
                  medications.length > 0 ||
                  Boolean(entry['dreamNotes']) ||
                  Boolean(entry['note']) ||
                  Boolean(wokeMember);

                return (
                  <div key={entry.id}>
                    <div className="list-row">
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
                          {flags.map((flag) => (
                            <Chip key={flag}>{flag}</Chip>
                          ))}
                        </span>
                        {hasDetail ? (
                          <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : entry.id)}>
                            {isOpen ? 'Show less' : 'Show more detail'}
                          </Button>
                        ) : null}
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
                    {isOpen ? (
                      <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
                        <FieldList
                          rows={[
                            ['Went to bed', entry['bedtime'] ? dates.time(String(entry['bedtime'])) : null],
                            [
                              'Time to fall asleep',
                              entry['latencyMinutes'] ? `${String(entry['latencyMinutes'])} min` : null,
                            ],
                            ['Got up', entry['outOfBedAt'] ? dates.time(String(entry['outOfBedAt'])) : null],
                            ['Who woke up', wokeMember ? String(wokeMember['name']) : null],
                            ['Mood before sleep', entry['moodBefore'] ? `${String(entry['moodBefore'])}/10` : null],
                            ['Stress', entry['stress'] ? `${String(entry['stress'])}/5` : null],
                            ['Caffeine that day', entry['caffeine'] === true ? 'Yes' : null],
                            ['Exercised that day', entry['exercised'] === true ? 'Yes' : null],
                            ['Medications', medications.length > 0 ? medications : null],
                            ['Where', locationNames.length > 0 ? locationNames : null],
                            ['Noise', enumLabel('sleepEntries', 'noise', entry['noise'])],
                            ['Light', enumLabel('sleepEntries', 'lightLevel', entry['lightLevel'])],
                            ['Temperature', enumLabel('sleepEntries', 'temperature', entry['temperature'])],
                          ]}
                        />
                        {entry['dreamNotes'] ? (
                          <p className="small muted prose" style={{ marginTop: 'var(--space-3)' }}>
                            {String(entry['dreamNotes'])}
                          </p>
                        ) : null}
                        {entry['note'] ? (
                          <p className="small muted prose" style={{ marginTop: 'var(--space-2)' }}>
                            {String(entry['note'])}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
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
        title={editor.value ? 'Edit sleep' : 'Log sleep'}
        wide
      >
        <RecordForm
          collection="sleepEntries"
          record={editor.value}
          initial={{ startedAt: lastNight(), endedAt: new Date().toISOString() }}
          omit={['durationMinutes']}
          onSubmit={async (values) => {
            const startedAt = String(values['startedAt']);
            const endedAt = values['endedAt'] ? String(values['endedAt']) : null;
            if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) {
              const error = new Error(
                'Waking up before falling asleep is not something PluralNova can record.',
              ) as Error & { fieldErrors?: Record<string, string> };
              error.fieldErrors = { endedAt: 'Must be after falling asleep.' };
              throw error;
            }

            const durationMinutes = endedAt
              ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000))
              : 0;

            // Filled in from bedtime and fell-asleep, exactly as the field's own
            // hint promises, rather than asking for a number that is really a
            // subtraction of two things already on the form.
            let latencyMinutes = values['latencyMinutes'];
            if ((latencyMinutes === '' || latencyMinutes === null || latencyMinutes === undefined) && values['bedtime']) {
              const bedtime = Date.parse(String(values['bedtime']));
              if (!Number.isNaN(bedtime)) {
                latencyMinutes = Math.max(0, Math.round((Date.parse(startedAt) - bedtime) / 60000));
              }
            }

            const payload = {
              ...values,
              durationMinutes,
              ...(latencyMinutes !== undefined ? { latencyMinutes } : {}),
            };

            if (editor.value) {
              await entries.update(editor.value.id, payload);
              toast.success('Saved');
              editor.hide();
            } else {
              await entries.create(payload);
              toast.success('Sleep logged');
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
