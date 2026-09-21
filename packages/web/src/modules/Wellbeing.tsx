import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getEmotion, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Stat } from '../ui/primitives.js';
import { NumberField, TextField, SwitchRow } from '../ui/forms.js';
import { DescriptiveNote, EmptyState } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { LineChart } from '../charts/index.js';
import { Icon } from '../ui/Icon.js';

/**
 * Wellbeing.
 *
 * A check-in and the trends that follow from it. The custom metrics field is
 * the important part: a system that wants to track something PluralNova never
 * thought of should not have to bend an unrelated field to do it.
 */

const MOOD_WORDS = [
  ['Bright', 8], ['Content', 7], ['Steady', 6], ['Flat', 4],
  ['Tired', 4], ['Anxious', 3], ['Low', 3], ['Wired', 6],
] as const;

export default function Wellbeing(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();

  const moods = useCollection('moodEntries');
  const wellness = useCollection('wellnessEntries');
  const emotions = useCollection('emotionEntries', { limit: 5 });

  const checkIn = useDialog();
  const [moodOpen, setMoodOpen] = useState(params.get('new') === 'mood');

  const overview = useQuery<{
    mood: { entries: number; average: number; trend: string; byDay: { label: string; value: number; key: string }[] };
    sleep: { averageMinutes: number; averageQuality: number };
    emotions: { entries: number; topFamilies: { key: string; count: number; label: string; color: string | null }[] };
  }>('/api/stats/overview', { days: 30 });

  const latest = wellness.items[0];

  return (
    <>
      <PageHeader
        title={t('wellbeing.title')}
        description={t('wellbeing.disclaimer')}
        actions={
          <>
            <Button icon="mood" onClick={() => setMoodOpen(true)}>
              Log a mood
            </Button>
            <Button variant="primary" icon="plus" onClick={() => checkIn.show()}>
              {t('wellbeing.checkIn')}
            </Button>
          </>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat
          label="Average mood"
          value={overview.data?.mood.average ? `${overview.data.mood.average}/10` : '—'}
          detail={overview.data?.mood.trend === 'unknown' ? 'Not enough logged' : overview.data?.mood.trend}
        />
        <Stat label="Moods logged" value={overview.data?.mood.entries ?? 0} detail="last 30 days" />
        <Stat label="Emotions logged" value={overview.data?.emotions.entries ?? 0} detail="last 30 days" />
        <Stat
          label="Average sleep"
          value={
            overview.data?.sleep.averageMinutes
              ? `${Math.floor(overview.data.sleep.averageMinutes / 60)}h ${overview.data.sleep.averageMinutes % 60}m`
              : '—'
          }
        />
      </div>

      <div className="stack">
        <Card>
          <LineChart
            title="Mood over the last 30 days"
            subtitle="Only the days you recorded something"
            valueLabel="Mood (1–10)"
            points={(overview.data?.mood.byDay ?? []).map((bucket) => ({
              label: bucket.label,
              value: bucket.value,
              detail: bucket.key,
            }))}
            max={10}
            emptyMessage="No moods recorded in this period."
          />
        </Card>

        <div className="split">
          <Card title="Latest check-in" subtitle={latest ? dates.relative(String(latest['recordedAt'])) : undefined}>
            {!latest ? (
              <EmptyState
                icon="wellbeing"
                title="No check-in yet"
                body="A handful of sliders, once a day or whenever you feel like it."
                action={{ label: t('wellbeing.checkIn'), run: () => checkIn.show() }}
              />
            ) : (
              <div className="stat-grid">
                {(
                  [
                    ['Energy', latest['energy'], 10],
                    ['Stress', latest['stress'], 10],
                    ['Comfort', latest['comfort'], 10],
                    ['Social battery', latest['socialBattery'], 10],
                    ['Water', latest['hydrationGlasses'], null],
                    ['Meals', latest['mealCount'], null],
                  ] as const
                )
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([label, value, max]) => (
                    <Stat key={label} label={label} value={max ? `${String(value)}/${max}` : String(value)} />
                  ))}
              </div>
            )}
          </Card>

          <Card
            title="Recent emotions"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/emotions')}>
                Open
              </Button>
            }
          >
            {emotions.items.length === 0 ? (
              <p className="small faint">Nothing logged yet.</p>
            ) : (
              <div className="stack stack--tight">
                {emotions.items.map((entry) => {
                  const emotion = getEmotion(String(entry['emotionId']));
                  return (
                    <div key={entry.id} className="row row--between small">
                      <span>
                        {emotion?.emoji} {emotion?.name ?? String(entry['emotionId'])}
                      </span>
                      <span className="faint tiny">{dates.relative(String(entry['recordedAt']))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card
          title="More tracking"
          subtitle="Each of these is separate, and each is optional"
        >
          <div className="grid" style={{ ['--grid-min' as never]: '160px' }}>
            {(
              [
                ['emotion', 'Emotions', '/emotions'],
                ['body', 'Body sensations', '/body-map'],
                ['insight', 'Emotion insights', '/emotion-insights'],
                ['sleep', 'Sleep', '/sleep'],
                ['cycle', 'Cycle & wellness', '/cycle'],
                ['fitness', 'Fitness', '/fitness'],
              ] as const
            ).map(([icon, label, path]) => (
              <button
                key={path}
                type="button"
                className="card card--interactive"
                style={{ textAlign: 'left', padding: 'var(--space-3)' }}
                onClick={() => navigate(path)}
              >
                <span style={{ color: 'var(--accent)' }}>
                  <Icon name={icon} size={18} />
                </span>
                <div className="small" style={{ marginTop: 'var(--space-2)' }}>
                  {label}
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          {term(
            'These are your own notes. PluralNova counts what you recorded and shows it back — it does not assess anyone, and a low number is not a problem to be solved by an app.',
          )}
        </DescriptiveNote>
      </div>

      <MoodDialog
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        onSave={async (values) => {
          await moods.create({ ...values, memberId: activeMemberId });
          toast.success('Mood recorded');
        }}
      />

      <CheckInDialog
        dialog={checkIn}
        latest={latest ?? null}
        onSave={async (values) => {
          await wellness.create({ ...values, memberId: activeMemberId });
          toast.success('Check-in saved');
        }}
      />
    </>
  );
}

function MoodDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [label, setLabel] = useState('');
  const [score, setScore] = useState<number | null>(6);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        score: score ?? 5,
        note,
        recordedAt: new Date().toISOString(),
      });
      setLabel('');
      setNote('');
      setScore(6);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How is it right now?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!label.trim()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {MOOD_WORDS.map(([word, value]) => (
          <Chip
            key={word}
            selected={label === word}
            onClick={() => {
              setLabel(word);
              setScore(value);
            }}
          >
            {word}
          </Chip>
        ))}
      </div>

      <TextField label="Or your own word" value={label} onChange={setLabel} />
      <NumberField
        label="Where would you put it, 1 to 10?"
        value={score}
        onChange={setScore}
        min={1}
        max={10}
        hint="A rough number is fine. It is only there to draw a line on a chart."
      />
      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />
    </Dialog>
  );
}

function CheckInDialog({
  dialog,
  latest,
  onSave,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  latest: StoredRecord | null;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, number | null>>({
    energy: 5,
    stress: 5,
    comfort: 5,
    socialBattery: 5,
    hydrationGlasses: null,
    mealCount: null,
    painLevel: null,
  });
  const [medication, setMedication] = useState(false);
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState<{ label: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: number | null): void =>
    setValues((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave({
        ...values,
        medicationTaken: medication,
        note,
        recordedAt: new Date().toISOString(),
        customMetrics: custom.length > 0 ? Object.fromEntries(custom.map((m) => [m.label, m.value])) : null,
      });
      dialog.hide();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Check in"
      description={latest ? 'Every field is optional — fill in what is useful today.' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      {(
        [
          ['energy', 'Energy', 1, 10],
          ['stress', 'Stress', 1, 10],
          ['comfort', 'Comfort', 1, 10],
          ['socialBattery', 'Social battery', 1, 10],
          ['painLevel', 'Physical discomfort', 0, 10],
          ['hydrationGlasses', 'Water (glasses)', 0, 30],
          ['mealCount', 'Meals', 0, 12],
        ] as const
      ).map(([key, label, min, max]) => (
        <NumberField
          key={key}
          label={label}
          value={values[key] ?? null}
          onChange={(value) => set(key, value)}
          min={min}
          max={max}
        />
      ))}

      <SwitchRow label="Medication taken" checked={medication} onChange={setMedication} />
      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />

      <div className="field">
        <span className="field__label">Your own metrics</span>
        <p className="field__hint">
          Anything PluralNova does not track. Whatever you name here is kept with the check-in.
        </p>
        {custom.map((metric, index) => (
          <div key={index} className="row row--nowrap" style={{ marginBottom: 'var(--space-2)' }}>
            <input
              className="input"
              placeholder="What"
              value={metric.label}
              onChange={(event) =>
                setCustom((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
              aria-label="Metric name"
            />
            <input
              className="input"
              placeholder="Value"
              value={metric.value}
              onChange={(event) =>
                setCustom((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, value: event.target.value } : item,
                  ),
                )
              }
              aria-label="Metric value"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustom((current) => current.filter((_, position) => position !== index))}
              aria-label="Remove metric"
            >
              <Icon name="close" size={13} />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => setCustom((current) => [...current, { label: '', value: '' }])}
        >
          Add a metric
        </Button>
      </div>
    </Dialog>
  );
}
