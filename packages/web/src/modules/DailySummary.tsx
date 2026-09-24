import { useState } from 'react';
import { dayKey, formatDuration, getEmotion } from '@pluralnova/shared';
import { useQuery } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * A day, gathered.
 *
 * Everything recorded on one date in one place, so a week later it is possible
 * to answer "what actually happened on Tuesday" without visiting eight screens.
 */

interface DayInsights {
  mood: { today: number; baseline: number } | null;
  emotions: { todayCount: number; baselineCountPerDay: number; todayAverage: number; baselineAverage: number } | null;
  sensations: { todayCount: number; baselineCountPerDay: number } | null;
  fronting: { todayMinutes: number; baselineMinutesPerDay: number } | null;
  sleep: { todayMinutes: number; baselineMinutes: number } | null;
  journalStreak: number;
}

/**
 * Each line is a comparison against the trailing two weeks — never a claim
 * about why the numbers differ. Only `fronting` and `journal` are configurable
 * terms; the rest (mood, emotion, sensation, sleep) are not, so those lines
 * never need `term()`.
 */
function insightLines(insights: DayInsights, term: (text: string) => string): string[] {
  const lines: string[] = [];
  if (insights.mood) {
    lines.push(
      `Mood averaged ${insights.mood.today}/10 today, compared to ${insights.mood.baseline}/10 over the last two weeks.`,
    );
  }
  if (insights.emotions) {
    const { todayCount, baselineCountPerDay, todayAverage, baselineAverage } = insights.emotions;
    lines.push(
      `${todayCount} emotion${todayCount === 1 ? '' : 's'} logged today, averaging ${todayAverage}/10 — ` +
        `compared to about ${baselineCountPerDay} a day recently, averaging ${baselineAverage}/10.`,
    );
  }
  if (insights.sensations) {
    const { todayCount, baselineCountPerDay } = insights.sensations;
    lines.push(
      `${todayCount} body sensation${todayCount === 1 ? '' : 's'} noted today, compared to about ${baselineCountPerDay} a day recently.`,
    );
  }
  if (insights.fronting) {
    lines.push(
      term(
        `{{Fronting}} totalled ${formatDuration(insights.fronting.todayMinutes)} today, compared to a usual ${formatDuration(insights.fronting.baselineMinutesPerDay)} a day.`,
      ),
    );
  }
  if (insights.sleep) {
    lines.push(
      `Slept ${formatDuration(insights.sleep.todayMinutes)} last night, compared to an average of ${formatDuration(insights.sleep.baselineMinutes)}.`,
    );
  }
  if (insights.journalStreak > 1) {
    lines.push(term(`{{Journal}} entries ${insights.journalStreak} days in a row, including today.`));
  }
  return lines;
}

interface Day {
  date: string;
  insights: DayInsights;
  fronting: { id: string; memberName: string | null; minutes: number; activity?: string; startedAt: string }[];
  moods: { id: string; label: string; score: number; recordedAt: string }[];
  emotions: { id: string; emotionId: string; intensity: number; emotion: { name: string; emoji: string } | null }[];
  sensations: { id: string; region: string; sensation: string }[];
  journal: { id: string; title: string; body: string }[];
  notes: { id: string; title: string }[];
  tasks: { id: string; title: string; completed: boolean }[];
  completedTasks: { id: string; title: string }[];
  events: { id: string; title: string; startsAt: string }[];
  sleep: { id: string; durationMinutes: number; quality: number }[];
  wellness: { id: string; energy: number; stress: number }[];
  fitness: { id: string; activity: string; durationMinutes: number }[];
  locations: { id: string; name: string }[];
  shifts: { id: string; startsAt: string; role: string }[];
}

export default function DailySummary(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const day = useQuery<Day>(`/api/stats/day/${date}`);

  const shift = (amount: number): void => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + amount);
    setDate(dayKey(next));
  };

  const isToday = date === dayKey(new Date());
  const data = day.data;
  const lines = data ? insightLines(data.insights, term) : [];

  const counts = data
    ? data.fronting.length +
      data.moods.length +
      data.emotions.length +
      data.journal.length +
      data.completedTasks.length +
      data.events.length +
      data.sleep.length +
      data.fitness.length
    : 0;

  return (
    <>
      <PageHeader
        title="Daily summary"
        description="Everything recorded on one day."
        actions={
          <div className="row row--nowrap">
            <IconButton icon="chevronLeft" label="Previous day" variant="ghost" size="sm" onClick={() => shift(-1)} />
            <input
              type="date"
              className="input"
              value={date}
              max={dayKey(new Date())}
              onChange={(event) => setDate(event.target.value)}
              aria-label="Choose a day"
              style={{ minWidth: 150 }}
            />
            <IconButton
              icon="chevronRight"
              label="Next day"
              variant="ghost"
              size="sm"
              onClick={() => shift(1)}
              disabled={isToday}
            />
          </div>
        }
      />

      {day.loading && !data ? (
        <SkeletonCards count={4} />
      ) : day.error && !data ? (
        <ErrorPanel message={day.error} onRetry={day.reload} />
      ) : counts === 0 ? (
        <Card>
          <EmptyState
            icon="summary"
            title={`Nothing recorded on ${dates.date(`${date}T12:00:00`)}`}
            body="A blank day in the log is not a blank day. It only means nothing was written down."
          />
        </Card>
      ) : (
        <>
          {lines.length > 0 ? (
            <Card
              title={
                <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                  <Icon name="insight" size={16} /> Insights
                </span>
              }
              subtitle="Simple comparisons against the last two weeks — not a diagnosis, just numbers next to other numbers."
              style={{ marginBottom: 'var(--space-4)' }}
            >
              <ul className="stack stack--tight" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                {lines.map((line, index) => (
                  <li key={index} className="small">
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat
              label={term('{{Fronting}}')}
              value={formatDuration(data!.fronting.reduce((sum, front) => sum + front.minutes, 0))}
              detail={`${data!.fronting.length} recorded`}
            />
            <Stat
              label="Sleep"
              value={
                data!.sleep.length
                  ? formatDuration(data!.sleep.reduce((sum, entry) => sum + entry.durationMinutes, 0))
                  : '—'
              }
            />
            <Stat label="Tasks done" value={data!.completedTasks.length} />
            <Stat label="Entries written" value={data!.journal.length + data!.notes.length} />
          </div>

          <div className="stack">
            <Section
              title={term('Who was {{fronting}}')}
              icon="front"
              empty={data!.fronting.length === 0}
            >
              <div className="list">
                {data!.fronting.map((front) => (
                  <div key={front.id} className="list-row">
                    <span className="list-row__body">
                      <span className="list-row__title">{front.memberName ?? 'Unknown'}</span>
                      <span className="list-row__meta">
                        <span>{dates.time(front.startedAt)}</span>
                        <span className="faint">{formatDuration(front.minutes)}</span>
                        {front.activity ? <Chip>{front.activity}</Chip> : null}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Moods and emotions" icon="mood" empty={data!.moods.length === 0 && data!.emotions.length === 0}>
              <div className="row">
                {data!.moods.map((mood) => (
                  <Chip key={mood.id} accent>
                    {mood.label} {mood.score ? `· ${mood.score}/10` : ''}
                  </Chip>
                ))}
                {data!.emotions.map((entry) => (
                  <Chip key={entry.id}>
                    {entry.emotion?.emoji} {entry.emotion?.name ?? entry.emotionId}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section title={term('{{Journal}}')} icon="journal" empty={data!.journal.length === 0}>
              <div className="stack stack--tight">
                {data!.journal.map((entry) => (
                  <div key={entry.id}>
                    <div style={{ fontWeight: 'var(--weight-medium)' }}>{entry.title || 'Untitled'}</div>
                    <p className="small muted clamp-2">{entry.body}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Calendar" icon="calendar" empty={data!.events.length === 0}>
              <div className="stack stack--tight">
                {data!.events.map((event) => (
                  <div key={event.id} className="row row--between small">
                    <span>{event.title}</span>
                    <span className="faint tiny">{dates.time(event.startsAt)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Tasks completed" icon="task" empty={data!.completedTasks.length === 0}>
              <div className="stack stack--tight">
                {data!.completedTasks.map((task) => (
                  <div key={task.id} className="row small">
                    <Icon name="check" size={13} /> {task.title}
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Body and wellbeing"
              icon="wellbeing"
              empty={data!.sensations.length === 0 && data!.wellness.length === 0}
            >
              <div className="row">
                {data!.wellness.map((entry) => (
                  <Chip key={entry.id}>
                    Energy {entry.energy}/10 · Stress {entry.stress}/10
                  </Chip>
                ))}
                {data!.sensations.map((entry) => (
                  <Chip key={entry.id}>
                    {entry.sensation} · {entry.region}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section
              title="Elsewhere"
              icon="location"
              empty={data!.fitness.length === 0 && data!.locations.length === 0 && data!.shifts.length === 0}
            >
              <div className="row">
                {data!.fitness.map((entry) => (
                  <Chip key={entry.id}>
                    {entry.activity} · {formatDuration(entry.durationMinutes)}
                  </Chip>
                ))}
                {data!.locations.map((entry) => (
                  <Chip key={entry.id}>{entry.name}</Chip>
                ))}
                {data!.shifts.map((entry) => (
                  <Chip key={entry.id}>Shift · {dates.time(entry.startsAt)}</Chip>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}

      {!isToday ? (
        <div className="row" style={{ marginTop: 'var(--space-5)', justifyContent: 'center' }}>
          <Button variant="ghost" onClick={() => setDate(dayKey(new Date()))}>
            Back to today
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Section({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: 'front' | 'mood' | 'journal' | 'calendar' | 'task' | 'wellbeing' | 'location';
  empty: boolean;
  children: React.ReactNode;
}): JSX.Element | null {
  if (empty) return null;
  return (
    <Card
      title={
        <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
          <Icon name={icon} size={16} /> {title}
        </span>
      }
      flush={icon === 'front'}
    >
      {children}
    </Card>
  );
}

export { getEmotion };
