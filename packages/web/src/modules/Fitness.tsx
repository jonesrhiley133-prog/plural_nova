import { useQuery } from '../core/data.js';
import { formatDuration } from '@pluralnova/shared';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card, Chip, ListRow, Stat } from '../ui/primitives.js';
import { DescriptiveNote } from '../ui/feedback.js';
import { ColumnChart } from '../charts/index.js';
import { useDateFormat } from '../core/i18n.js';

/**
 * Fitness.
 *
 * Movement you chose to record. There are no targets, no streak pressure and
 * nothing about weight — the screen counts minutes and activities because that
 * is what was asked for, and stops there.
 */
export default function Fitness(): JSX.Element {
  const dates = useDateFormat();
  const stats = useQuery<{
    sessions: number;
    totalMinutes: number;
    totalDistanceKm: number;
    totalSteps: number;
    streak: number;
    byDay: { label: string; value: number; key: string }[];
    activities: { key: string; count: number }[];
  }>('/api/stats/fitness', { days: 30 });

  return (
    <CollectionScreen
      collection="fitnessEntries"
      title="Fitness"
      description="Anything you moved for, recorded however you like."
      newRecordDefaults={{ performedAt: new Date().toISOString() }}
      emptyTitle="Nothing logged yet"
      emptyBody="A walk counts. So does stretching for four minutes."
      above={
        <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="stat-grid">
            <Stat label="Sessions" value={stats.data?.sessions ?? 0} detail="last 30 days" />
            <Stat label="Time" value={formatDuration(stats.data?.totalMinutes ?? 0)} />
            <Stat
              label="Distance"
              value={stats.data?.totalDistanceKm ? `${stats.data.totalDistanceKm} km` : '—'}
            />
            <Stat label="Steps" value={(stats.data?.totalSteps ?? 0).toLocaleString()} />
          </div>

          <Card>
            <ColumnChart
              title="Minutes over the last 30 days"
              valueLabel="Minutes"
              points={(stats.data?.byDay ?? []).map((bucket) => ({
                label: bucket.label,
                value: bucket.value,
                detail: bucket.key,
              }))}
              format={(value) => formatDuration(value)}
              emptyMessage="Nothing logged in this period."
            />
          </Card>

          {stats.data?.activities.length ? (
            <Card title="What you have been doing">
              <div className="row">
                {stats.data.activities.map((activity) => (
                  <Chip key={activity.key}>
                    {activity.key} · {activity.count}
                  </Chip>
                ))}
              </div>
            </Card>
          ) : null}

          <DescriptiveNote>
            PluralNova counts what you logged. It does not set goals for you, and there is nothing
            here that turns into a score.
          </DescriptiveNote>
        </div>
      }
      renderRow={(record, helpers) => (
        <ListRow
          title={String(record['activity'])}
          meta={
            <>
              <span>{dates.dateTime(String(record['performedAt']))}</span>
              {record['durationMinutes'] ? (
                <Chip>{formatDuration(Number(record['durationMinutes']))}</Chip>
              ) : null}
              {record['distanceKm'] ? <Chip>{String(record['distanceKm'])} km</Chip> : null}
              {record['steps'] ? <Chip>{Number(record['steps']).toLocaleString()} steps</Chip> : null}
            </>
          }
          onClick={helpers.edit}
        />
      )}
    />
  );
}
