import { useQuery } from '../../core/data.js';
import { useDateFormat } from '../../core/i18n.js';
import { Card, Chip, Stat } from '../../ui/primitives.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../../ui/feedback.js';

/**
 * Cycle comparison: one cycle against the next, and which symptoms show up
 * most within each phase. Reads `/api/stats/cycle` directly — that endpoint
 * already existed before Insights did (Cycle & Wellbeing's own depth pass),
 * it just never had a screen showing it yet.
 */

interface CycleSummary {
  startDate: string;
  endDate: string | null;
  lengthDays: number | null;
  averageEnergy: number | null;
  averageDiscomfort: number | null;
  symptomDays: number;
  topSymptoms: { key: string; count: number }[];
}

interface CycleStats {
  cycles: CycleSummary[];
  cycleCount: number;
  averageLengthDays: number | null;
  symptomsByPhase: { phase: string; count: number; topSymptoms: { key: string; count: number }[] }[];
}

export function CycleComparison(): JSX.Element {
  const dates = useDateFormat();
  const query = useQuery<CycleStats>('/api/stats/cycle');

  if (query.loading && !query.data) return <SkeletonCards count={3} />;
  if (query.error && !query.data) return <ErrorPanel message={query.error} onRetry={query.reload} />;

  const data = query.data;
  if (!data || data.cycleCount === 0) {
    return (
      <Card>
        <EmptyState
          icon="cycle"
          title="Nothing logged yet"
          body="Log a cycle start on the Cycle & wellness page, and this tab will start comparing one cycle to the next."
        />
      </Card>
    );
  }

  const recent = [...data.cycles].reverse();

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Cycles logged" value={data.cycleCount} />
        <Stat label="Average length" value={data.averageLengthDays !== null ? `${data.averageLengthDays} days` : '—'} />
      </div>

      <div className="stack">
        <Card title="Recent cycles" flush>
          <div className="list">
            {recent.map((cycle) => (
              <div key={cycle.startDate} className="list-row">
                <span className="list-row__body">
                  <span className="list-row__title">
                    {dates.date(cycle.startDate)} {cycle.endDate ? `– ${dates.date(cycle.endDate)}` : '(ongoing)'}
                  </span>
                  <span className="list-row__meta">
                    {cycle.lengthDays !== null ? <span>{cycle.lengthDays} days</span> : null}
                    {cycle.averageEnergy !== null ? <span>Energy {cycle.averageEnergy}/10</span> : null}
                    {cycle.averageDiscomfort !== null ? <span>Discomfort {cycle.averageDiscomfort}/10</span> : null}
                    {cycle.symptomDays > 0 ? <span>{cycle.symptomDays} symptom days</span> : null}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        {data.symptomsByPhase.length > 0 ? (
          <Card
            title="Symptoms by phase"
            subtitle="Each symptom grouped by whichever phase was most recently named as of that day"
          >
            <div className="stat-grid">
              {data.symptomsByPhase.map((entry) => (
                <div key={entry.phase} className="stack stack--tight">
                  <span className="small" style={{ fontWeight: 'var(--weight-medium)' }}>
                    {entry.phase}
                  </span>
                  <span className="tiny faint">{entry.count} symptoms logged</span>
                  <div className="row">
                    {entry.topSymptoms.map((symptom) => (
                      <Chip key={symptom.key}>
                        {symptom.key} · {symptom.count}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Cycle lengths and symptoms vary naturally. This is a record of what you logged, not a prediction of what
          comes next.
        </DescriptiveNote>
      </div>
    </>
  );
}
