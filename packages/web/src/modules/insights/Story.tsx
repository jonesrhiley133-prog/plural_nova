import { useState } from 'react';
import { dayKey } from '@pluralnova/shared';
import { useQuery } from '../../core/data.js';
import { insightLines, type DayInsights } from '../../core/dayInsightLines.js';
import { useDateFormat, useI18n } from '../../core/i18n.js';
import { Card, IconButton } from '../../ui/primitives.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../../ui/feedback.js';

/**
 * Story: one day, told as a paragraph. The same baseline comparisons the
 * Daily Summary already shows for that day (mood, emotions, sensations,
 * fronting, sleep, journal streak), plus the two signals that only exist
 * because of this redesign — the cycle phase in effect, and how the day's
 * symptom count compares to the last fortnight.
 */

interface StoryResponse {
  date: string;
  insights: DayInsights;
  symptoms: { todayCount: number; baselineCountPerDay: number } | null;
  cyclePhase: string | null;
}

export function Story(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const query = useQuery<StoryResponse>('/api/insights/story', { date });

  const isToday = date === dayKey(new Date());

  const shiftDay = (delta: number): void => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + delta);
    setDate(dayKey(next));
  };

  if (query.loading && !query.data) return <SkeletonCards count={1} />;
  if (query.error && !query.data) return <ErrorPanel message={query.error} onRetry={query.reload} />;

  const data = query.data;
  const lines = data ? insightLines(data.insights, term) : [];
  if (data?.symptoms) {
    const { todayCount, baselineCountPerDay } = data.symptoms;
    lines.push(
      `${todayCount} symptom${todayCount === 1 ? '' : 's'} logged${isToday ? ' today' : ' that day'}, ` +
        `compared to about ${baselineCountPerDay} a day recently.`,
    );
  }
  if (data?.cyclePhase) {
    lines.push(`The cycle phase in effect${isToday ? ' today' : ' that day'} was "${data.cyclePhase}".`);
  }

  return (
    <>
      <div className="row row--between" style={{ marginBottom: 'var(--space-4)', alignItems: 'center' }}>
        <IconButton icon="chevronLeft" label="Previous day" variant="ghost" onClick={() => shiftDay(-1)} />
        <span className="small" style={{ fontWeight: 'var(--weight-medium)' }}>
          {isToday ? 'Today' : dates.date(date)}
        </span>
        <IconButton icon="chevronRight" label="Next day" variant="ghost" disabled={isToday} onClick={() => shiftDay(1)} />
      </div>

      <Card>
        {lines.length > 0 ? (
          <div className="stack stack--tight">
            {lines.map((line, index) => (
              <p className="small" key={index}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="insight"
            title="Not enough logged yet"
            body="Once there's a couple of weeks of history to compare against, this day will have something to say."
          />
        )}
      </Card>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Every line compares this day against your own recent average — nothing here is a verdict about it.
        </DescriptiveNote>
      </div>
    </>
  );
}
