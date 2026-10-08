import { useMemo, useState } from 'react';
import { EMOTION_FAMILIES, type Emotion } from '@pluralnova/shared';
import { useQuery } from '../../core/data.js';
import { ChartFrame } from '../../charts/ChartFrame.js';
import { Card } from '../../ui/primitives.js';
import { ErrorPanel, SkeletonCards } from '../../ui/feedback.js';

/**
 * The Emotional Constellation.
 *
 * Fixed coordinates, not a force-directed layout — a layout that moves every
 * time new data arrives would defeat the one thing a constellation is for,
 * which is becoming familiar. Each of the 12 families gets a fixed point on
 * a ring; each emotion that has actually been logged sits near its family's
 * point, nudged by a small deterministic offset derived from its own id, so
 * the same emotion always lands in the same spot. Star size is how intense
 * it tends to be logged; star opacity is how often. The lines are the
 * pairs most often logged in the very same entry — nothing about causation,
 * just what tends to show up together.
 */

interface ConstellationEmotion {
  key: string;
  count: number;
  averageIntensity: number;
  emotion: Emotion | null;
}

interface ConstellationPair {
  a: string;
  b: string;
  count: number;
}

const WIDTH = 320;
const HEIGHT = 260;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 - 6 };
const RING_RADIUS = 92;
const MAX_LINES = 10;

/** A small, stable, non-cryptographic hash — just enough for a repeatable jitter per id. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface StarPosition {
  x: number;
  y: number;
}

function familyAnchor(familyIndex: number, familyCount: number): StarPosition & { angle: number } {
  const angle = -Math.PI / 2 + (familyIndex / familyCount) * 2 * Math.PI;
  return { x: CENTER.x + Math.cos(angle) * RING_RADIUS, y: CENTER.y + Math.sin(angle) * RING_RADIUS, angle };
}

function starPosition(emotionId: string, anchor: StarPosition): StarPosition {
  const hash = hashString(emotionId);
  const jitterAngle = ((hash % 360) / 360) * 2 * Math.PI;
  const jitterRadius = 9 + ((hash >> 6) % 20);
  return {
    x: anchor.x + Math.cos(jitterAngle) * jitterRadius,
    y: anchor.y + Math.sin(jitterAngle) * jitterRadius,
  };
}

interface ConstellationStats {
  topEmotions: ConstellationEmotion[];
  coOccurrence: ConstellationPair[];
  rangeDays: number;
}

const DAYS = 90;

export function Constellation(): JSX.Element {
  const stats = useQuery<ConstellationStats>('/api/stats/emotions', { days: DAYS });

  if (stats.loading && !stats.data) return <SkeletonCards count={1} />;
  if (stats.error && !stats.data) return <ErrorPanel message={stats.error} onRetry={stats.reload} />;
  if (!stats.data) return <SkeletonCards count={1} />;

  return <ConstellationChart topEmotions={stats.data.topEmotions} coOccurrence={stats.data.coOccurrence} rangeDays={stats.data.rangeDays} />;
}

function ConstellationChart({
  topEmotions,
  coOccurrence,
  rangeDays,
}: {
  topEmotions: ConstellationEmotion[];
  coOccurrence: ConstellationPair[];
  rangeDays: number;
}): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  const familyIndex = useMemo(() => new Map(EMOTION_FAMILIES.map((family, index) => [family.id, index])), []);

  const stars = useMemo(() => {
    const maxCount = Math.max(...topEmotions.map((entry) => entry.count), 1);
    return topEmotions
      .filter((entry) => entry.emotion !== null)
      .map((entry) => {
        const emotion = entry.emotion!;
        const index = familyIndex.get(emotion.family) ?? 0;
        const anchor = familyAnchor(index, EMOTION_FAMILIES.length);
        const position = starPosition(entry.key, anchor);
        return {
          ...entry,
          emotion,
          ...position,
          radius: 3 + (Math.min(Math.max(entry.averageIntensity, 1), 5) - 1) * 1.7,
          opacity: 0.32 + 0.68 * (entry.count / maxCount),
        };
      });
  }, [topEmotions, familyIndex]);

  const starByKey = useMemo(() => new Map(stars.map((star) => [star.key, star])), [stars]);

  const lines = useMemo(
    () =>
      coOccurrence
        .filter((pair) => starByKey.has(pair.a) && starByKey.has(pair.b))
        .slice(0, MAX_LINES),
    [coOccurrence, starByKey],
  );

  const activeStar = selected ? starByKey.get(selected) ?? null : null;

  return (
    <ChartFrame
      title="Emotional Constellation"
      subtitle={`Every emotion logged over the last ${rangeDays} days, grouped by family`}
      isEmpty={stars.length === 0}
      emptyMessage="Log a few emotions and they'll start taking their place here."
      description={`Emotional Constellation: ${stars.length} emotions logged, grouped into families, with lines between the pairs most often logged together.`}
      table={{
        columns: ['Emotion', 'Family', 'Times logged', 'Usual intensity'],
        rows: stars
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((star) => [
            `${star.emotion.emoji} ${star.emotion.name}`,
            EMOTION_FAMILIES.find((family) => family.id === star.emotion.family)?.label ?? star.emotion.family,
            star.count,
            `${star.averageIntensity}/5`,
          ]),
      }}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', height: 'auto', maxWidth: 360, display: 'block', margin: '0 auto' }}
        role="group"
        aria-label="Constellation of logged emotions, grouped by family. Select a star to read its details."
      >
        {EMOTION_FAMILIES.map((family, index) => {
          const anchor = familyAnchor(index, EMOTION_FAMILIES.length);
          const labelRadius = RING_RADIUS + 18;
          const labelX = CENTER.x + Math.cos(anchor.angle) * labelRadius;
          const labelY = CENTER.y + Math.sin(anchor.angle) * labelRadius;
          const cos = Math.cos(anchor.angle);
          const sin = Math.sin(anchor.angle);
          return (
            <g key={family.id} aria-hidden="true">
              <circle cx={anchor.x} cy={anchor.y} r={30} fill={family.color} opacity={0.06} />
              <text
                x={labelX}
                y={labelY + (sin > 0.3 ? 8 : sin < -0.3 ? -3 : 2)}
                textAnchor={cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'}
                fontSize={8.5}
                fill="var(--text-faint)"
              >
                {family.label}
              </text>
            </g>
          );
        })}

        {lines.map((pair) => {
          const starA = starByKey.get(pair.a)!;
          const starB = starByKey.get(pair.b)!;
          return (
            <line
              key={`${pair.a}|${pair.b}`}
              x1={starA.x}
              y1={starA.y}
              x2={starB.x}
              y2={starB.y}
              stroke="var(--text-faint)"
              strokeWidth={1}
              opacity={0.4}
            />
          );
        })}

        {stars.map((star) => (
          <circle
            key={star.key}
            cx={star.x}
            cy={star.y}
            r={star.key === selected ? star.radius + 2 : star.radius}
            fill={star.emotion.color}
            opacity={star.key === selected ? 1 : star.opacity}
            stroke={star.key === selected ? 'var(--text)' : 'none'}
            strokeWidth={1.5}
            tabIndex={0}
            role="button"
            aria-label={`${star.emotion.name}, logged ${star.count} ${star.count === 1 ? 'time' : 'times'}, usually around ${star.averageIntensity} of 5`}
            style={{ cursor: 'pointer' }}
            onClick={() => setSelected((current) => (current === star.key ? null : star.key))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelected((current) => (current === star.key ? null : star.key));
              }
            }}
          />
        ))}
      </svg>

      {activeStar ? (
        <Card flush style={{ marginTop: 'var(--space-3)' }}>
          <p className="small" style={{ padding: 'var(--space-3)' }}>
            {activeStar.emotion.emoji} <strong>{activeStar.emotion.name}</strong> — logged {activeStar.count}{' '}
            {activeStar.count === 1 ? 'time' : 'times'} in the last {rangeDays} days, usually around{' '}
            {activeStar.averageIntensity} of 5.{' '}
            <span className="faint">
              Part of the {EMOTION_FAMILIES.find((family) => family.id === activeStar.emotion.family)?.label ?? ''} family.
            </span>
          </p>
        </Card>
      ) : (
        <p className="tiny faint" style={{ marginTop: 'var(--space-2)', textAlign: 'center' }}>
          Select a star to read its details.
        </p>
      )}
    </ChartFrame>
  );
}
