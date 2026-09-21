import { useState } from 'react';
import { getEmotion, getEmotionFamily } from '@pluralnova/shared';
import { useQuery } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Card, Chip, Stat } from '../ui/primitives.js';
import { DescriptiveNote, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { ColumnChart, RankedBars } from '../charts/index.js';

/**
 * Emotion insights.
 *
 * Descriptions of the log, phrased as descriptions. "Most often recorded"
 * rather than "your dominant emotion"; "logged alongside" rather than "caused
 * by". The difference is the whole point of the screen.
 */

interface Insights {
  rangeDays: number;
  total: number;
  averageIntensity: number;
  intensityTrend: 'rising' | 'falling' | 'steady' | 'unknown';
  topEmotions: { key: string; count: number }[];
  families: { key: string; count: number }[];
  contexts: { key: string; count: number }[];
  activities: { key: string; count: number }[];
  members: { key: string; count: number; name: string }[];
  byHour: { label: string; value: number }[];
  byWeekday: { label: string; value: number }[];
  byDay: { label: string; value: number; key: string }[];
}

const RANGES = [30, 90, 180, 365];

export default function EmotionInsights(): JSX.Element {
  const { term } = useI18n();
  const [days, setDays] = useState(90);
  const insights = useQuery<Insights>('/api/stats/emotions', { days });

  if (insights.loading && !insights.data) {
    return (
      <>
        <PageHeader title="Emotion insights" />
        <SkeletonCards count={4} />
      </>
    );
  }

  if (insights.error && !insights.data) {
    return (
      <>
        <PageHeader title="Emotion insights" />
        <ErrorPanel message={insights.error} onRetry={insights.reload} />
      </>
    );
  }

  const data = insights.data;

  if (!data || data.total === 0) {
    return (
      <>
        <PageHeader title="Emotion insights" />
        <Card>
          <p className="prose muted">
            Nothing to describe yet. Log a few emotions and this page will start showing what you
            recorded — which words came up, when, and alongside what.
          </p>
        </Card>
      </>
    );
  }

  const trendWord =
    data.intensityTrend === 'rising'
      ? 'higher than earlier in the period'
      : data.intensityTrend === 'falling'
        ? 'lower than earlier in the period'
        : data.intensityTrend === 'steady'
          ? 'about the same across the period'
          : 'not enough logged to compare';

  return (
    <>
      <PageHeader
        title="Emotion insights"
        description="What is in the log, described. Nothing here is a conclusion about anyone."
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {RANGES.map((range) => (
          <Chip key={range} selected={days === range} onClick={() => setDays(range)}>
            {range === 365 ? 'A year' : `${range} days`}
          </Chip>
        ))}
      </div>

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Entries" value={data.total} detail={`over ${data.rangeDays} days`} />
        <Stat label="Average intensity" value={`${data.averageIntensity}/5`} detail={trendWord} />
        <Stat label="Different words used" value={data.topEmotions.length} />
        <Stat
          label="Most recorded family"
          value={getEmotionFamily(data.families[0]?.key ?? '')?.label ?? '—'}
        />
      </div>

      <div className="stack">
        <Card>
          <RankedBars
            title="Most often recorded"
            subtitle="Simply the words that come up most"
            valueLabel="Times logged"
            items={data.topEmotions.map((entry) => {
              const emotion = getEmotion(entry.key);
              return {
                id: entry.key,
                label: emotion ? `${emotion.emoji} ${emotion.name}` : entry.key,
                value: entry.count,
                color: emotion?.color ?? null,
              };
            })}
          />
        </Card>

        <Card>
          <RankedBars
            title="By family"
            valueLabel="Times logged"
            items={data.families.map((entry) => {
              const family = getEmotionFamily(entry.key);
              return {
                id: entry.key,
                label: family?.label ?? entry.key,
                value: entry.count,
                color: family?.color ?? null,
              };
            })}
          />
        </Card>

        <Card>
          <ColumnChart
            title="What time of day"
            subtitle="When entries were recorded"
            valueLabel="Entries"
            points={data.byHour.map((bucket) => ({ label: bucket.label.slice(0, 2), value: bucket.value, detail: bucket.label }))}
          />
        </Card>

        <div className="split">
          <Card>
            <ColumnChart
              title="By day of the week"
              valueLabel="Entries"
              points={data.byWeekday.map((bucket) => ({ label: bucket.label, value: bucket.value }))}
            />
          </Card>

          <div className="stack">
            {data.contexts.length > 0 ? (
              <Card title="Logged alongside" subtitle="Context you typed in, counted">
                <div className="row">
                  {data.contexts.map((entry) => (
                    <Chip key={entry.key}>
                      {entry.key} · {entry.count}
                    </Chip>
                  ))}
                </div>
              </Card>
            ) : null}

            {data.activities.length > 0 ? (
              <Card title="During these activities">
                <div className="row">
                  {data.activities.map((entry) => (
                    <Chip key={entry.key}>
                      {entry.key} · {entry.count}
                    </Chip>
                  ))}
                </div>
              </Card>
            ) : null}

            {data.members.length > 0 ? (
              <Card title={term('By {{member}}')} subtitle={term('Who the entry was attributed to')}>
                <div className="row">
                  {data.members.map((entry) => (
                    <Chip key={entry.key}>
                      {entry.name} · {entry.count}
                    </Chip>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Two things appearing together in this log does not mean one caused the other. These counts
          describe what was written down — nothing about why.
        </DescriptiveNote>
      </div>
    </>
  );
}
