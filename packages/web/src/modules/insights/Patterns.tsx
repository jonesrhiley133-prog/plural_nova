import { useState } from 'react';
import { useQuery } from '../../core/data.js';
import { Card, Chip } from '../../ui/primitives.js';
import { DescriptiveNote, EmptyState, ErrorPanel, SkeletonCards } from '../../ui/feedback.js';

/**
 * Patterns: one card per named relationship the account currently has enough
 * evidence for — mood against who was around, what you were doing, who was
 * fronting, how you slept, and (once cycle tracking is on) the cycle phase.
 * A card only appears once both sides of its comparison clear a small
 * evidence floor; see `services/insights.ts` on the server for how each one
 * is built.
 */

interface PatternCard {
  key: string;
  title: string;
  description: string;
  evidenceCount: number;
  confidence: 'low' | 'moderate' | 'high';
}

interface PatternsResponse {
  rangeDays: number;
  patterns: PatternCard[];
}

const RANGES = [90, 180, 365, 730];

const CONFIDENCE_LABELS: Record<PatternCard['confidence'], string> = {
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

function rangeLabel(days: number): string {
  return days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}` : `${days} days`;
}

export function Patterns(): JSX.Element {
  const [days, setDays] = useState(180);
  const query = useQuery<PatternsResponse>('/api/insights/patterns', { days });

  if (query.loading && !query.data) return <SkeletonCards count={4} />;
  if (query.error && !query.data) return <ErrorPanel message={query.error} onRetry={query.reload} />;

  const patterns = query.data?.patterns ?? [];

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {RANGES.map((range) => (
          <Chip key={range} selected={days === range} onClick={() => setDays(range)}>
            {rangeLabel(range)}
          </Chip>
        ))}
      </div>

      {patterns.length === 0 ? (
        <Card>
          <EmptyState
            icon="insight"
            title="Nothing to compare yet"
            body="A pattern shows up once a relationship has enough check-ins on more than one side of it to actually compare — log a few more and come back."
          />
        </Card>
      ) : (
        <div className="stack">
          {patterns.map((pattern) => (
            <Card key={pattern.key} title={pattern.title}>
              <p className="small">{pattern.description}</p>
              <div className="row" style={{ marginTop: 'var(--space-2)', alignItems: 'center' }}>
                <Chip>{CONFIDENCE_LABELS[pattern.confidence]}</Chip>
                <span className="tiny faint">{pattern.evidenceCount} check-ins behind this</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          Each card compares things you logged against each other. None of this is a cause, a diagnosis, or a
          ranking of how anyone feels — just what came up next to what else.
        </DescriptiveNote>
      </div>
    </>
  );
}
