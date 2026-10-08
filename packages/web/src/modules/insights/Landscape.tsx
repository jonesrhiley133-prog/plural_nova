import { formatDuration } from '@pluralnova/shared';
import { useQuery } from '../../core/data.js';
import { Card, Chip, Stat } from '../../ui/primitives.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../../ui/feedback.js';

/**
 * Landscape: the long view rather than a chosen window — averages, spread,
 * and which of mood or sleep has stayed steadier relative to its own
 * average. Computed fresh on every visit; nothing here is stored.
 */

interface LandscapeStats {
  rangeDays: number;
  mood: { average: number; median: number; variance: number; stdev: number; count: number } | null;
  sleep: { averageMinutes: number; averageQuality: number | null; stdevMinutes: number; count: number } | null;
  topEmotionFamily: { key: string; label: string; color: string | null; count: number } | null;
  cycle: { averageLengthDays: number | null; cycleCount: number } | null;
  steadiestArea: 'mood' | 'sleep' | null;
}

export function Landscape(): JSX.Element {
  const query = useQuery<LandscapeStats>('/api/insights/landscape');

  if (query.loading && !query.data) return <SkeletonCards count={3} />;
  if (query.error && !query.data) return <ErrorPanel message={query.error} onRetry={query.reload} />;

  const data = query.data;
  if (!data || (!data.mood && !data.sleep && !data.topEmotionFamily)) {
    return (
      <Card>
        <EmptyState
          icon="insight"
          title="Not enough history yet"
          body="The long view needs a longer log — come back once mood, sleep or emotions have been logged for a while."
        />
      </Card>
    );
  }

  return (
    <>
      <div className="stack">
        {data.mood ? (
          <Card title="Mood, overall" subtitle={`From ${data.mood.count} logged moods`}>
            <div className="stat-grid">
              <Stat label="Average" value={`${data.mood.average}/100`} />
              <Stat label="Median" value={`${data.mood.median}/100`} />
              <Stat label="Spread (stdev)" value={data.mood.stdev} detail="smaller means steadier" />
            </div>
          </Card>
        ) : null}

        {data.sleep ? (
          <Card title="Sleep, overall" subtitle={`From ${data.sleep.count} logged nights`}>
            <div className="stat-grid">
              <Stat label="Average length" value={formatDuration(data.sleep.averageMinutes)} />
              {data.sleep.averageQuality !== null ? (
                <Stat label="Average quality" value={`${data.sleep.averageQuality}/5`} />
              ) : null}
              <Stat label="Spread (stdev)" value={formatDuration(data.sleep.stdevMinutes)} detail="smaller means steadier" />
            </div>
          </Card>
        ) : null}

        {data.steadiestArea ? (
          <Card>
            <p className="small">
              Relative to its own average, {data.steadiestArea} has stayed steadier than{' '}
              {data.steadiestArea === 'mood' ? 'sleep' : 'mood'} over this stretch.
            </p>
          </Card>
        ) : null}

        {data.topEmotionFamily ? (
          <Card title="Most logged emotion family">
            <Chip color={data.topEmotionFamily.color}>
              {data.topEmotionFamily.label} · {data.topEmotionFamily.count}
            </Chip>
          </Card>
        ) : null}

        {data.cycle ? (
          <Card title="Cycle, overall">
            <div className="stat-grid">
              <Stat label="Cycles logged" value={data.cycle.cycleCount} />
              <Stat
                label="Average length"
                value={data.cycle.averageLengthDays !== null ? `${data.cycle.averageLengthDays} days` : '—'}
              />
            </div>
          </Card>
        ) : null}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Long-run averages, computed fresh each time you open this tab — nothing here is tracked or stored beyond
          what you already logged.
        </DescriptiveNote>
      </div>
    </>
  );
}
