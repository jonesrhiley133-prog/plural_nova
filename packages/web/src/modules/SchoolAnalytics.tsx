import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { newId, type GradeBand } from '@pluralnova/shared';
import { useQuery } from '../core/data.js';
import { useMemberScope } from '../core/memberScope.js';
import { useOptimisticSettings } from '../core/settings.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { DescriptiveNote, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { LineChart } from '../charts/index.js';
import { MemberScopeChips } from '../ui/MemberScope.js';
import { SCHOOL_TREND_LABEL, type SchoolClassStat, type SchoolStats, type SchoolTrend } from '../core/schoolStats.js';

const TREND_GLYPH: Record<SchoolTrend, string> = {
  rising: '▲',
  falling: '▼',
  steady: '·',
  unknown: '—',
};

const CELL: CSSProperties = {
  padding: 'var(--space-2)',
  borderTop: 'var(--border-width) solid var(--border)',
  textAlign: 'center',
};

/**
 * Academic analytics — percentages, a configurable GPA, a literal
 * class-to-class comparison table, and a transparent "needs the most study
 * time" ranking with the real numbers behind it, per the user's own answer
 * to how this page should work.
 */
export default function SchoolAnalytics(): JSX.Element {
  const scope = useMemberScope();
  const stats = useQuery<SchoolStats>('/api/stats/school', scope.queryParam);

  if (stats.loading && !stats.data) {
    return (
      <>
        <PageHeader title="Academic analytics" />
        <SkeletonCards count={4} />
      </>
    );
  }

  if (stats.error && !stats.data) {
    return (
      <>
        <PageHeader title="Academic analytics" />
        <ErrorPanel message={stats.error} onRetry={stats.reload} />
      </>
    );
  }

  const data = stats.data;

  return (
    <>
      <PageHeader
        title="Academic analytics"
        description="Percentages and a GPA computed from your own grading scale — numbers, not a verdict."
      />

      <MemberScopeChips scope={scope} />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat
          label="Average grade"
          value={data?.averagePercentage !== null && data?.averagePercentage !== undefined ? `${data.averagePercentage}%` : '—'}
          detail={data ? SCHOOL_TREND_LABEL[data.trend] : undefined}
        />
        <Stat label="GPA" value={data?.gpa ?? '—'} detail="Credit-weighted" />
        <Stat
          label="Completed"
          value={data ? `${data.completion.completed}/${data.completion.total}` : '—'}
          detail={data && (data.completion.late > 0 || data.completion.missing > 0) ? `${data.completion.late} late · ${data.completion.missing} missing` : undefined}
        />
        <Stat
          label="Test average"
          value={data?.testAverage !== null && data?.testAverage !== undefined ? `${data.testAverage}%` : '—'}
        />
      </div>

      <Card title="How each class is doing" subtitle="Every class, side by side" flush>
        <ClassGradeTable classes={data?.byClass ?? []} />
      </Card>

      <Card title="Trend over time">
        <LineChart
          title="Average percentage by week"
          valueLabel="Percent"
          min={0}
          max={100}
          format={(value) => `${Math.round(value)}%`}
          points={(data?.byWeek ?? []).map((bucket) => ({
            label: bucket.label,
            value: bucket.value,
            detail: `${bucket.label}: ${bucket.count} graded`,
          }))}
          emptyMessage="Not enough graded work yet to show a trend."
        />
      </Card>

      {data && data.needsAttention.length > 0 ? (
        <Card title="Worth the most study time" subtitle="Furthest below your own average, or trending down">
          <div className="stack stack--tight">
            {data.needsAttention.map((item) => (
              <div key={item.classId} className="row row--between">
                <Chip color={item.color}>{item.name}</Chip>
                <span className="small muted">
                  {item.currentPercentage}%
                  {item.percentagePointsBelowAverage > 0
                    ? `, ${item.percentagePointsBelowAverage} pts below your average`
                    : ''}
                  {item.trend === 'falling' ? ' — trending down' : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Grading scale" subtitle="How a percentage turns into a letter and GPA points">
        <GradingScaleEditor />
      </Card>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          These numbers come only from what's tracked. A class with nothing graded yet doesn't pull the
          average down — it's unrecorded, not a zero.
        </DescriptiveNote>
      </div>
    </>
  );
}

/** The literal side-by-side comparison table — how each class is doing, at a glance. */
function ClassGradeTable({ classes }: { classes: SchoolClassStat[] }): JSX.Element {
  if (classes.length === 0) {
    return (
      <p className="small faint" style={{ padding: 'var(--space-4)' }}>
        Add a class and some grades to see them compared here.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--size-sm)' }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-muted)' }}>
              Class
            </th>
            <th scope="col" style={{ ...CELL, color: 'var(--text-muted)' }}>
              Grade
            </th>
            <th scope="col" style={{ ...CELL, color: 'var(--text-muted)' }}>
              Letter
            </th>
            <th scope="col" style={{ ...CELL, color: 'var(--text-muted)' }}>
              Trend
            </th>
            <th scope="col" style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--text-muted)' }}>
              By category
            </th>
            <th scope="col" style={{ ...CELL, color: 'var(--text-muted)' }}>
              Graded
            </th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => (
            <tr key={cls.classId}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: 'var(--space-2)',
                  borderTop: 'var(--border-width) solid var(--border)',
                  fontWeight: 'var(--weight-normal)',
                }}
              >
                <Link
                  to={`/school/classes/${cls.classId}`}
                  className="row row--nowrap"
                  style={{ gap: 6, textDecoration: 'none', color: 'inherit', alignItems: 'center' }}
                >
                  <Avatar name={cls.name} color={cls.color} icon={cls.icon} size={22} round />
                  <span className="truncate">{cls.name}</span>
                </Link>
              </th>
              <td style={CELL}>
                <strong>{cls.currentPercentage !== null ? `${cls.currentPercentage}%` : '—'}</strong>
              </td>
              <td style={CELL}>{cls.letter ?? '—'}</td>
              <td style={CELL} title={SCHOOL_TREND_LABEL[cls.trend]}>
                {TREND_GLYPH[cls.trend]}
              </td>
              <td className="tiny faint" style={{ padding: 'var(--space-2)', borderTop: 'var(--border-width) solid var(--border)' }}>
                {cls.categories.filter((cat) => cat.count > 0).map((cat) => `${cat.name} ${cat.average}%`).join(' · ') || '—'}
              </td>
              <td style={CELL}>{cls.gradedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A repeating band-row editor for `settings.gradingScale.bands` — the same
 * shape as `GradeCategoriesEditor` in SchoolClasses.tsx, but there's no
 * `RecordForm` underneath it here: account settings save immediately on
 * change (the same convention `Settings.tsx`'s notification table uses),
 * so this just reads and writes `useOptimisticSettings()` directly.
 */
function GradingScaleEditor(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  const bands = settings.gradingScale.bands;

  const setBands = (next: GradeBand[]): void => update({ gradingScale: { bands: next } });
  const updateBand = (index: number, patch: Partial<GradeBand>): void => {
    setBands(bands.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  };

  const ordered = [...bands].sort((a, b) => b.minPercent - a.minPercent);

  return (
    <div className="stack stack--tight">
      {ordered.map((band) => {
        const index = bands.indexOf(band);
        return (
          <div key={band.id} className="row row--nowrap">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={band.minPercent}
              onChange={(event) => updateBand(index, { minPercent: Number(event.target.value) })}
              aria-label={`${band.letter || 'Band'} minimum percent`}
              style={{ flex: 1 }}
            />
            <span className="tiny faint">% and up →</span>
            <input
              className="input"
              value={band.letter}
              onChange={(event) => updateBand(index, { letter: event.target.value })}
              placeholder="Letter"
              aria-label="Letter grade"
              style={{ flex: 1 }}
            />
            <input
              className="input"
              type="number"
              step={0.1}
              min={0}
              value={band.gpaPoints}
              onChange={(event) => updateBand(index, { gpaPoints: Number(event.target.value) })}
              aria-label={`${band.letter || 'Band'} GPA points`}
              style={{ flex: 1 }}
            />
            <IconButton
              icon="trash"
              label={`Remove ${band.letter || 'band'}`}
              variant="ghost"
              size="sm"
              onClick={() => setBands(bands.filter((_, i) => i !== index))}
            />
          </div>
        );
      })}
      <div className="row row--between" style={{ marginTop: 'var(--space-2)' }}>
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => setBands([...bands, { id: newId('band'), minPercent: 0, letter: '', gpaPoints: 0 }])}
        >
          Add band
        </Button>
        <span className="tiny faint">Checked top-down — the highest band a percentage meets or exceeds wins.</span>
      </div>
    </div>
  );
}
