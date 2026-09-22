import { useState } from 'react';
import { formatDuration } from '@pluralnova/shared';
import { useQuery, useRecordMap } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Card, Chip, Stat } from '../ui/primitives.js';
import { DescriptiveNote, ErrorLine, ErrorPanel, LoadingLine, SkeletonCards } from '../ui/feedback.js';
import { ColumnChart, Heatmap, RankedBars, ShareBar } from '../charts/index.js';
import { memberColor } from '../charts/palette.js';

/**
 * Fronting statistics.
 *
 * Counts and averages of what was recorded, and nothing beyond that. The
 * wording throughout says "logged" rather than "is", because the difference
 * between the two is the whole distance between a tracker and a diagnosis.
 */

interface FrontingStats {
  rangeDays: number;
  totals: {
    totalMinutes: number;
    eventCount: number;
    averageMinutes: number;
    longestMinutes: number;
    activeCount: number;
  };
  members: {
    memberId: string;
    name: string;
    color: string | null;
    minutes: number;
    events: number;
    coFrontEvents: number;
    share: number;
  }[];
  pairs: { a: string; b: string; aName: string; bName: string; events: number; minutes: number }[];
  transitions: { fromName: string; toName: string; count: number }[];
  events: { startedAt: string; durationMinutes: number | null }[];
}

interface Overview {
  fronting: {
    byDay: { key: string; label: string; value: number }[];
    byHour: { key: string; label: string; value: number }[];
    byWeekday: { key: string; label: string; value: number }[];
  };
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
];

export default function Stats(): JSX.Element {
  const { term } = useI18n();
  const [days, setDays] = useState(30);
  const members = useRecordMap('members');

  const stats = useQuery<FrontingStats>('/api/fronting/stats', { days });
  const overview = useQuery<Overview>('/api/stats/overview', { days });

  if (stats.loading && !stats.data) {
    return (
      <>
        <PageHeader title={term('{{Fronting}} statistics')} />
        <SkeletonCards count={4} />
      </>
    );
  }

  if (stats.error && !stats.data) {
    return (
      <>
        <PageHeader title={term('{{Fronting}} statistics')} />
        <ErrorPanel message={stats.error} onRetry={stats.reload} />
      </>
    );
  }

  const data = stats.data;
  const hourly = overview.data?.fronting.byHour ?? [];
  const weekday = overview.data?.fronting.byWeekday ?? [];

  return (
    <>
      <PageHeader
        title={term('{{Fronting}} statistics')}
        description={term('What was logged over the period you choose. Nothing here is a conclusion.')}
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {RANGES.map((range) => (
          <Chip key={range.days} selected={days === range.days} onClick={() => setDays(range.days)}>
            {range.label}
          </Chip>
        ))}
      </div>

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat
          label={term('Total {{fronting}} time')}
          value={formatDuration(data?.totals.totalMinutes ?? 0)}
          detail={`over ${days} days`}
        />
        <Stat
          label={term('{{Fronts}} recorded')}
          value={data?.totals.eventCount ?? 0}
          detail={data?.totals.activeCount ? `${data.totals.activeCount} open now` : undefined}
        />
        <Stat
          label="Average length"
          value={formatDuration(data?.totals.averageMinutes ?? 0)}
        />
        <Stat label="Longest" value={formatDuration(data?.totals.longestMinutes ?? 0)} />
      </div>

      <div className="stack">
        <Card>
          <RankedBars
            title={term('Time {{fronting}}, by {{member}}')}
            subtitle={term('A {{cofronter}} is credited with the whole {{front}}, so shares can add up past 100%.')}
            valueLabel="Minutes"
            items={(data?.members ?? []).map((member) => ({
              id: member.memberId,
              label: member.name,
              value: member.minutes,
              detail: formatDuration(member.minutes),
              color: memberColor(
                members.get(member.memberId) as { id: string; color?: string | null } | undefined,
              ),
            }))}
            format={(value) => formatDuration(value)}
            emptyMessage={term('No {{fronts}} in this period.')}
          />
        </Card>

        <Card>
          <ShareBar
            title={term('Share of the {{front}}')}
            subtitle="Proportion of recorded time"
            valueLabel="Minutes"
            items={(data?.members ?? []).slice(0, 8).map((member) => ({
              id: member.memberId,
              label: member.name,
              value: member.minutes,
              color: memberColor(
                members.get(member.memberId) as { id: string; color?: string | null } | undefined,
              ),
            }))}
            format={(value) => formatDuration(value)}
          />
        </Card>

        <Card>
          {overview.loading ? (
            <LoadingLine label={term('Loading {{fronting}} by day…')} />
          ) : overview.error ? (
            <ErrorLine message={overview.error} />
          ) : (
            <ColumnChart
              title={term('{{Fronting}} by day')}
              subtitle="Minutes recorded"
              valueLabel="Minutes"
              points={(overview.data?.fronting.byDay ?? []).map((bucket) => ({
                label: bucket.label,
                value: bucket.value,
                detail: bucket.key,
              }))}
              format={(value) => formatDuration(value)}
              emptyMessage="Nothing recorded in this period yet."
            />
          )}
        </Card>

        <Card>
          {overview.loading ? (
            <LoadingLine label="Loading when fronts start…" />
          ) : overview.error ? (
            <ErrorLine message={overview.error} />
          ) : (
            <Heatmap
              title="When fronts start"
              subtitle="Day of the week against hour of the day"
              valueLabel="Fronts started"
              rows={weekday.map((bucket) => bucket.label)}
              columns={hourly.map((bucket) => bucket.label.slice(0, 2))}
              values={weekday.map((day) =>
                hourly.map((hour) => hourCountFor(data?.events ?? [], day.key, hour.key)),
              )}
              emptyMessage="Not enough recorded yet to show a pattern."
            />
          )}
        </Card>

        <div className="split">
          <Card title={term('Who {{fronts}} together')} subtitle="Pairs present at the same time">
            {data?.pairs.length ? (
              <div className="stack stack--tight">
                {data.pairs.slice(0, 8).map((pair) => (
                  <div key={`${pair.a}-${pair.b}`} className="row row--between small">
                    <span className="truncate">
                      {pair.aName} + {pair.bName}
                    </span>
                    <span className="numeric muted">
                      {pair.events}× · {formatDuration(pair.minutes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small faint">{term('No co-{{fronting}} recorded in this period.')}</p>
            )}
          </Card>

          <Card title={term('{{Switches}}')} subtitle="Who tended to follow whom">
            {data?.transitions.length ? (
              <div className="stack stack--tight">
                {data.transitions.slice(0, 8).map((transition, index) => (
                  <div key={index} className="row row--between small">
                    <span className="truncate">
                      {transition.fromName} → {transition.toName}
                    </span>
                    <span className="numeric muted">{transition.count}×</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small faint">{term('No {{switches}} recorded in this period.')}</p>
            )}
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          These are counts of what you recorded. Gaps mean nothing was logged, which is not the same
          as nothing happening — and none of these numbers mean anything about how a system should
          work.
        </DescriptiveNote>
      </div>
    </>
  );
}

/** Counts fronts that started on a given weekday and hour. */
function hourCountFor(
  events: { startedAt: string }[],
  weekdayKey: string,
  hourKey: string,
): number {
  const weekday = Number(weekdayKey);
  const hour = Number(hourKey);
  return events.filter((event) => {
    const date = new Date(event.startedAt);
    return (date.getDay() + 6) % 7 === weekday && date.getHours() === hour;
  }).length;
}
