import { useState } from 'react';
import { getEmotionFamily } from '@pluralnova/shared';
import { useQuery } from '../../core/data.js';
import { useAllEmotions } from '../../core/emotions.js';
import { useI18n } from '../../core/i18n.js';
import { Card, Chip, Stat } from '../../ui/primitives.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../../ui/feedback.js';
import { ColumnChart, LineChart, RankedBars } from '../../charts/index.js';

/**
 * Analytics.
 *
 * What used to be the standalone "Emotion insights" screen, plus the one
 * breakdown that screen could never have shown: how mood and emotions relate
 * on the entries that recorded both. Still descriptions of the log, phrased
 * as descriptions — "most often recorded" rather than "your dominant
 * emotion", "logged alongside" rather than "caused by".
 */

interface EmotionStats {
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
  moodLinks:
    | {
        band: 'low' | 'mid' | 'high';
        label: string;
        checkIns: number;
        topEmotions: { key: string; count: number }[];
      }[]
    | null;
}

interface OverviewStats {
  mood: {
    entries: number;
    average: number;
    trend: 'rising' | 'falling' | 'steady' | 'unknown';
    variance: number;
    stdev: number;
    streak: number;
    longestStreak: number;
    byDay: { label: string; value: number; count: number }[];
  };
}

const RANGES = [30, 90, 180, 365];

export function Analytics(): JSX.Element {
  const { term } = useI18n();
  const [days, setDays] = useState(90);
  const insights = useQuery<EmotionStats>('/api/stats/emotions', { days });
  const overview = useQuery<OverviewStats>('/api/stats/overview', { days });
  const { findEmotion } = useAllEmotions();

  if ((insights.loading && !insights.data) || (overview.loading && !overview.data)) {
    return <SkeletonCards count={4} />;
  }

  if (insights.error && !insights.data) {
    return <ErrorPanel message={insights.error} onRetry={insights.reload} />;
  }

  const data = insights.data;
  const mood = overview.data?.mood ?? null;

  if (!data || (data.total === 0 && !data.moodLinks && (!mood || mood.entries === 0))) {
    return (
      <Card>
        <EmptyState
          icon="insight"
          title="Nothing to describe yet"
          body="Log a few check-ins and this tab will start showing what you recorded — which words came up, when, and alongside what mood."
        />
      </Card>
    );
  }

  const trendWord = (trend: string): string =>
    trend === 'rising'
      ? 'higher than earlier in the period'
      : trend === 'falling'
        ? 'lower than earlier in the period'
        : trend === 'steady'
          ? 'about the same across the period'
          : 'not enough logged to compare';

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {RANGES.map((range) => (
          <Chip key={range} selected={days === range} onClick={() => setDays(range)}>
            {range === 365 ? 'A year' : `${range} days`}
          </Chip>
        ))}
      </div>

      {mood && mood.entries > 0 ? (
        <div className="stack" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="stat-grid">
            <Stat label="Average mood" value={`${mood.average}/10`} detail={trendWord(mood.trend)} />
            <Stat label="Spread (stdev)" value={mood.stdev} detail="0-100 scale — smaller means steadier" />
            <Stat label="Current streak" value={`${mood.streak} ${mood.streak === 1 ? 'day' : 'days'}`} />
            <Stat label="Longest streak" value={`${mood.longestStreak} ${mood.longestStreak === 1 ? 'day' : 'days'}`} />
          </div>
          <Card>
            <LineChart
              title="Mood over time"
              subtitle="Legacy 1-10 scale, same as the Snapshot's own list converts to"
              valueLabel="Mood"
              min={0}
              max={10}
              points={mood.byDay.map((bucket) => ({
                label: bucket.label,
                value: bucket.count > 0 ? bucket.value / bucket.count : 0,
              }))}
            />
          </Card>
        </div>
      ) : null}

      {data.total > 0 ? (
        <>
          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat label="Entries" value={data.total} detail={`over ${data.rangeDays} days`} />
            <Stat label="Average intensity" value={`${data.averageIntensity}/5`} detail={trendWord(data.intensityTrend)} />
            <Stat label="Different words used" value={data.topEmotions.length} />
            <Stat
              label="Most recorded family"
              value={getEmotionFamily(data.families[0]?.key ?? '')?.label ?? '—'}
            />
          </div>

          <div className="stack">
            {data.moodLinks ? (
              <Card title="Typical emotions by mood" subtitle="From check-ins that recorded both, grouped into three bands">
                <div className="stat-grid">
                  {data.moodLinks.map((bandEntry) => (
                    <div key={bandEntry.band} className="stack stack--tight">
                      <span className="small" style={{ fontWeight: 'var(--weight-medium)' }}>
                        {bandEntry.label}
                      </span>
                      <span className="tiny faint">{bandEntry.checkIns} check-ins</span>
                      <div className="row">
                        {bandEntry.topEmotions.length > 0 ? (
                          bandEntry.topEmotions.map((entry) => {
                            const emotion = findEmotion(entry.key);
                            return (
                              <Chip key={entry.key}>
                                {emotion ? `${emotion.emoji} ${emotion.name}` : entry.key} · {entry.count}
                              </Chip>
                            );
                          })
                        ) : (
                          <span className="tiny faint">Nothing recorded alongside this band yet.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card>
              <RankedBars
                title="Most often recorded"
                subtitle="Simply the words that come up most"
                valueLabel="Times logged"
                items={data.topEmotions.map((entry) => {
                  const emotion = findEmotion(entry.key);
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
        </>
      ) : null}

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Two things appearing together in this log does not mean one caused the other. These counts
          describe what was written down — nothing about why.
        </DescriptiveNote>
      </div>
    </>
  );
}
