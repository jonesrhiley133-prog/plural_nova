import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useAllEmotions } from '../core/emotions.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId, useSystemMode } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, ListRow, Meter, Stat, Tabs } from '../ui/primitives.js';
import { NumberField, TextField, SwitchRow } from '../ui/forms.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { LineChart } from '../charts/index.js';
import { Icon } from '../ui/Icon.js';
import { Cycle } from './wellbeing/Cycle.js';
import { Symptoms } from './wellbeing/Symptoms.js';

/**
 * Wellbeing.
 *
 * Calm, low-stakes things to do right now — a breathing rhythm, something to
 * pop, a walk through the five senses — with the check-ins and the trends
 * that follow from them a tab away rather than gone. Nothing here is scored
 * or timed against you; there is nothing to win.
 */

type WellbeingTab = 'checkIns' | 'cycle' | 'symptoms';

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
  const systemMode = useSystemMode();

  const moods = useCollection('moodEntries');
  const wellness = useCollection('wellnessEntries');
  // 50 rather than the 5 "Recent emotions" shows: also the pool "How we're
  // feeling" draws each member's latest entry from, so a system with more
  // than a handful of members doesn't lose someone's only recent log to the
  // window before it is even looked at.
  const emotions = useCollection('emotionEntries', { limit: 50 });
  const members = useCollection('members', { enabled: systemMode });
  const { findEmotion } = useAllEmotions();

  const checkIn = useDialog();
  const [moodOpen, setMoodOpen] = useState(params.get('new') === 'mood');
  const [tab, setTab] = useState<WellbeingTab>(() => {
    const requested = params.get('tab');
    return requested === 'symptoms' || requested === 'cycle' ? requested : 'checkIns';
  });

  const overview = useQuery<{
    mood: { entries: number; average: number; trend: string; byDay: { label: string; value: number; key: string }[] };
    sleep: { averageMinutes: number; averageQuality: number };
    emotions: { entries: number; topFamilies: { key: string; count: number; label: string; color: string | null }[] };
    snapshot: { axes: { key: string; label: string; percent: number | null }[]; overall: number | null };
    energySignals: { source: string; label: string; value: number; percent: number; recordedAt: string }[];
  }>('/api/stats/overview', { days: 30 });

  const latest = wellness.items[0];

  return (
    <>
      <PageHeader
        title={t('wellbeing.title')}
        description={t('wellbeing.disclaimer')}
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
          { value: 'checkIns', label: 'Check-ins' },
          { value: 'cycle', label: 'Cycle' },
          { value: 'symptoms', label: 'Symptoms' },
        ]}
      />

      {tab === 'cycle' ? <div style={{ marginTop: 'var(--space-4)' }}><Cycle /></div> : null}
      {tab === 'symptoms' ? <div style={{ marginTop: 'var(--space-4)' }}><Symptoms /></div> : null}

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
                title="Today's snapshot"
                subtitle={
                  overview.data?.snapshot.overall != null
                    ? `${overview.data.snapshot.overall}% overall — a plain average of what's below`
                    : "Each bar is its own most recent log, not blended with the others"
                }
              >
                {!overview.data?.snapshot.axes.some((axis) => axis.percent !== null) ? (
                  <EmptyState
                    icon="wellbeing"
                    title="Nothing to show yet"
                    body="Log a mood or a check-in and the first bars appear."
                  />
                ) : (
                  <div className="stack stack--tight">
                    {overview.data.snapshot.axes
                      .filter((axis) => axis.percent !== null)
                      .map((axis) => (
                        <div key={axis.key}>
                          <div className="row row--between tiny" style={{ marginBottom: 3 }}>
                            <span>{axis.label}</span>
                            <span className="numeric muted">{axis.percent}%</span>
                          </div>
                          <Meter value={axis.percent!} max={100} label={`${axis.label}, ${axis.percent} of 100`} />
                        </div>
                      ))}
                  </div>
                )}
              </Card>

              <Card title="Energy signals" subtitle="The most recent reading from each place energy gets logged, not one blended number">
                {!overview.data || overview.data.energySignals.length === 0 ? (
                  <p className="small faint">Nothing logged yet.</p>
                ) : (
                  <div className="stack stack--tight">
                    {overview.data.energySignals.map((signal) => (
                      <div key={signal.source} className="row row--between small">
                        <span>{signal.label}</span>
                        <span className="row row--nowrap" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
                          <span className="faint tiny">{dates.relative(signal.recordedAt)}</span>
                          <span className="numeric muted">{signal.percent}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

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
                        ['Focus', latest['focus'], 10],
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
                    {emotions.items.slice(0, 5).map((entry) => {
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

            <HowWeFeelCard members={members.items} emotions={emotions.items} moods={moods.items} findEmotion={findEmotion} dates={dates} />

            <Card title="More tracking" subtitle="Each of these is separate, and each is optional" flush>
              <div className="list">
                {(
                  [
                    ['emotion', 'Emotions', '/emotions'],
                    ['body', 'Body sensations', '/body-map'],
                    ['insight', 'Mood & Emotions analytics', '/mood-emotions?tab=analytics'],
                    ['sleep', 'Sleep', '/sleep'],
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

/**
 * How everyone's doing, at a glance — each member's most recent mood or
 * emotion log side by side, rather than the account-wide blend the stats
 * above already show. Singlet Mode has no second person to compare against,
 * and a lone member in an otherwise-empty system has nothing to be "beside"
 * either, so this only appears once there is genuinely more than one person
 * to see at once.
 */
function HowWeFeelCard({
  members,
  emotions,
  moods,
  findEmotion,
  dates,
}: {
  members: StoredRecord[];
  emotions: StoredRecord[];
  moods: StoredRecord[];
  findEmotion: (id: string) => { emoji: string; name: string } | undefined;
  dates: ReturnType<typeof useDateFormat>;
}): JSX.Element | null {
  if (members.length < 2) return null;

  const latestByMember = <T extends StoredRecord>(entries: T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const entry of entries) {
      const memberId = String(entry['memberId'] ?? '');
      if (memberId && !map.has(memberId)) map.set(memberId, entry);
    }
    return map;
  };
  const latestEmotion = latestByMember(emotions);
  const latestMood = latestByMember(moods);

  const rows = members
    .map((member) => ({
      member,
      emotion: latestEmotion.get(member.id) ?? null,
      mood: latestMood.get(member.id) ?? null,
    }))
    .filter((row) => row.emotion || row.mood)
    .map((row) => ({
      ...row,
      mostRecentAt: [row.emotion?.['recordedAt'], row.mood?.['recordedAt']]
        .filter((value): value is string => Boolean(value))
        .sort()
        .reverse()[0],
    }))
    .sort((a, b) => Date.parse(String(b.mostRecentAt)) - Date.parse(String(a.mostRecentAt)));

  return (
    <Card title="How we're feeling" subtitle="Each person's most recent log">
      {rows.length === 0 ? (
        <p className="small faint">Nobody has logged a mood or an emotion yet.</p>
      ) : (
        <div className="stack stack--tight">
          {rows.map(({ member, emotion, mood, mostRecentAt }) => {
            const emotionDef = emotion ? findEmotion(String(emotion['emotionId'])) : null;
            return (
              <div key={member.id} className="row row--between row--nowrap small">
                <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                  <Avatar
                    name={String(member['name'])}
                    src={(member['avatarUrl'] as string) || null}
                    color={(member['color'] as string) ?? null}
                    size={24}
                    round
                  />
                  {String(member['name'])}
                  {emotionDef ? (
                    <span>
                      {emotionDef.emoji} {emotionDef.name}
                    </span>
                  ) : mood ? (
                    <span className="faint">
                      {String(mood['label'])}
                      {mood['score'] ? ` · ${String(mood['score'])}/10` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="faint tiny">{mostRecentAt ? dates.relative(mostRecentAt) : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
    focus: 5,
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
          ['focus', 'Focus', 1, 10],
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
