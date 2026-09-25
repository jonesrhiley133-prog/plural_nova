import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useAllEmotions } from '../core/emotions.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { usePrefersReducedMotion } from '../core/theme.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, ListRow, Stat, Tabs } from '../ui/primitives.js';
import { NumberField, TextField, SwitchRow } from '../ui/forms.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { LineChart } from '../charts/index.js';
import { Icon } from '../ui/Icon.js';

/**
 * Wellbeing.
 *
 * Calm, low-stakes things to do right now — a breathing rhythm, something to
 * pop, a walk through the five senses — with the check-ins and the trends
 * that follow from them a tab away rather than gone. Nothing here is scored
 * or timed against you; there is nothing to win.
 */

type WellbeingTab = 'games' | 'checkIns';

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
  const { findEmotion } = useAllEmotions();

  const checkIn = useDialog();
  const [moodOpen, setMoodOpen] = useState(params.get('new') === 'mood');
  const [tab, setTab] = useState<WellbeingTab>('games');

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
        description={
          tab === 'games'
            ? 'Nothing here is timed or scored. Stay as long as it helps.'
            : t('wellbeing.disclaimer')
        }
        actions={
          tab === 'checkIns' ? (
            <>
              <Button icon="mood" onClick={() => setMoodOpen(true)}>
                Log a mood
              </Button>
              <Button variant="primary" icon="plus" onClick={() => checkIn.show()}>
                {t('wellbeing.checkIn')}
              </Button>
            </>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        label="Wellbeing sections"
        options={[
          { value: 'games', label: 'Games' },
          { value: 'checkIns', label: 'Check-ins' },
        ]}
      />

      {tab === 'games' ? <div style={{ marginTop: 'var(--space-4)' }}><WellbeingGames /></div> : null}

      {tab === 'checkIns' && overview.loading && !overview.data ? (
        <SkeletonCards count={4} />
      ) : tab === 'checkIns' && overview.error && !overview.data ? (
        <ErrorPanel message={overview.error} onRetry={overview.reload} />
      ) : tab === 'checkIns' ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
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
              <Card
                title="Latest check-in"
                subtitle={latest ? dates.relative(String(latest['recordedAt'])) : undefined}
              >
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
                      const emotion = findEmotion(String(entry['emotionId']));
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

            <Card title="More tracking" subtitle="Each of these is separate, and each is optional" flush>
              <div className="list">
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
                  <ListRow
                    key={path}
                    leading={
                      <span className="list-row__icon">
                        <Icon name={icon} size={17} />
                      </span>
                    }
                    title={label}
                    trailing={<Icon name="chevronRight" size={14} />}
                    onClick={() => navigate(path)}
                  />
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
        </div>
      ) : null}

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

function WellbeingGames(): JSX.Element {
  const breathing = useDialog();
  const bubbles = useDialog();
  const grounding = useDialog();

  const games: { title: string; subtitle: string; icon: 'headspace' | 'sparkle' | 'eye'; open: () => void }[] = [
    {
      title: 'Breathing',
      subtitle: 'A slow, guided rhythm',
      icon: 'headspace',
      open: () => breathing.show(),
    },
    {
      title: 'Bubble pop',
      subtitle: 'Pop as many as you like',
      icon: 'sparkle',
      open: () => bubbles.show(),
    },
    {
      title: 'Grounding',
      subtitle: 'The five senses, one at a time',
      icon: 'eye',
      open: () => grounding.show(),
    },
  ];

  return (
    <>
      <div className="grid" style={{ ['--grid-min' as never]: '200px' }}>
        {games.map((game) => (
          <Card
            key={game.title}
            interactive
            role="button"
            tabIndex={0}
            aria-label={game.title}
            onClick={game.open}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                game.open();
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <Icon name={game.icon} size={22} />
            <div style={{ marginTop: 'var(--space-2)', fontWeight: 'var(--weight-semibold)' }}>{game.title}</div>
            <div className="small faint">{game.subtitle}</div>
          </Card>
        ))}
      </div>

      <Dialog open={breathing.open} onClose={breathing.hide} title="Breathing">
        <BreathingExercise />
      </Dialog>
      <Dialog open={bubbles.open} onClose={bubbles.hide} title="Bubble pop">
        <BubblePop />
      </Dialog>
      <Dialog open={grounding.open} onClose={grounding.hide} title="Grounding">
        <GroundingExercise />
      </Dialog>
    </>
  );
}

type BreathPattern = 'box' | 'calm' | 'simple';

const BREATH_PATTERNS: Record<
  BreathPattern,
  { label: string; phases: { name: string; seconds: number; scale: number }[] }
> = {
  box: {
    label: 'Box — 4 in, 4 hold, 4 out, 4 hold',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Hold', seconds: 4, scale: 1 },
      { name: 'Breathe out', seconds: 4, scale: 0.55 },
      { name: 'Hold', seconds: 4, scale: 0.55 },
    ],
  },
  calm: {
    label: '4-7-8 — a longer, slower exhale',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Hold', seconds: 7, scale: 1 },
      { name: 'Breathe out', seconds: 8, scale: 0.55 },
    ],
  },
  simple: {
    label: 'Simple — in and out, no holding',
    phases: [
      { name: 'Breathe in', seconds: 4, scale: 1 },
      { name: 'Breathe out', seconds: 4, scale: 0.55 },
    ],
  },
};

function BreathingExercise(): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const [pattern, setPattern] = useState<BreathPattern>('box');
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  const phases = BREATH_PATTERNS[pattern].phases;
  const phase = phases[phaseIndex]!;

  useEffect(() => {
    setPhaseIndex(0);
    setRunning(false);
  }, [pattern]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, phase.seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, phaseIndex, phase.seconds, phases.length]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
        {(Object.keys(BREATH_PATTERNS) as BreathPattern[]).map((key) => (
          <Chip key={key} selected={pattern === key} onClick={() => setPattern(key)}>
            {BREATH_PATTERNS[key].label.split(' — ')[0]}
          </Chip>
        ))}
      </div>

      <div
        className="breath-circle"
        style={{
          transform: `scale(${running ? phase.scale : 0.75})`,
          transition: reducedMotion ? 'none' : `transform ${phase.seconds}s ease-in-out`,
        }}
      />

      <p style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)', minHeight: '1.6em' }}>
        {running ? phase.name : 'Ready when you are'}
      </p>
      <p className="small faint">{BREATH_PATTERNS[pattern].label}</p>

      <Button
        variant="primary"
        size="lg"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={() => {
          if (running) {
            setRunning(false);
          } else {
            setPhaseIndex(0);
            setRunning(true);
          }
        }}
      >
        {running ? 'Stop' : 'Start'}
      </Button>
    </div>
  );
}

function BubblePop(): JSX.Element {
  const size = 40;
  const [popped, setPopped] = useState<boolean[]>(() => Array(size).fill(false) as boolean[]);
  const allPopped = popped.every(Boolean);

  return (
    <div>
      <div className="bubble-grid">
        {popped.map((isPopped, index) => (
          <button
            key={index}
            type="button"
            className={`bubble${isPopped ? ' bubble--popped' : ''}`}
            aria-label={isPopped ? 'Already popped' : 'Pop this bubble'}
            aria-pressed={isPopped}
            onClick={() =>
              setPopped((current) => current.map((value, position) => (position === index ? true : value)))
            }
          />
        ))}
      </div>

      {allPopped ? (
        <p className="small faint" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
          All popped.
        </p>
      ) : null}

      <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={() => setPopped(Array(size).fill(false) as boolean[])}>
          Re-inflate
        </Button>
      </div>
    </div>
  );
}

const GROUNDING_STEPS = [
  { count: 5, sense: 'see' },
  { count: 4, sense: 'hear' },
  { count: 3, sense: 'feel' },
  { count: 2, sense: 'smell' },
  { count: 1, sense: 'taste' },
] as const;

function GroundingExercise(): JSX.Element {
  const [step, setStep] = useState(0);
  const done = step >= GROUNDING_STEPS.length;
  const current = done ? null : GROUNDING_STEPS[step]!;

  return (
    <div style={{ textAlign: 'center' }}>
      {done || !current ? (
        <>
          <p className="prose">
            That is the five senses. However that felt, it is over now — nothing to fix or judge about it.
          </p>
          <Button variant="ghost" style={{ marginTop: 'var(--space-3)' }} onClick={() => setStep(0)}>
            Start again
          </Button>
        </>
      ) : (
        <>
          <div className="tiny faint" style={{ marginBottom: 'var(--space-2)' }}>
            Step {step + 1} of {GROUNDING_STEPS.length}
          </div>
          <p style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)' }}>
            Name {current.count} thing{current.count === 1 ? '' : 's'} you can {current.sense}
          </p>
          <p className="small faint" style={{ marginTop: 'var(--space-2)' }}>
            Say them out loud or just notice them. No need to write anything down.
          </p>
          <Button variant="primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setStep((value) => value + 1)}>
            {step === GROUNDING_STEPS.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </>
      )}
    </div>
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
              placeholder="Metric name"
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
