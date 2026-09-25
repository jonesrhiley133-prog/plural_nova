import { Fragment, useMemo, useRef, useState } from 'react';
import { CHART_INK, magnitudeColor, memberColor, seriesColor, chartMode } from './palette.js';
import { ChartFrame, ChartTooltip, type ChartSeries } from './ChartFrame.js';

/**
 * Charts.
 *
 * Plain SVG — no charting dependency — because the whole set here is bars,
 * lines, areas and a heatmap, and hand-drawing them keeps the mark specs exact:
 * 2px lines, bars capped at 24px with a rounded data-end, a 2px surface gap
 * between touching fills, hairline gridlines, and a hover layer on everything
 * that plots.
 *
 * Every chart takes a table of the same numbers and passes it to the frame, so
 * the values are always available as text as well as ink.
 */

export interface Point {
  label: string;
  value: number;
  /** A fuller label for the tooltip, when the axis label is abbreviated. */
  detail?: string;
  color?: string;
}

const AXIS_FONT = 10;
const BAR_MAX = 24;
const RADIUS = 4;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (!Number.isInteger(value)) return value.toFixed(1);
  return value.toLocaleString();
}

// ── Column chart ────────────────────────────────────────────────────────────

export function ColumnChart({
  title,
  subtitle,
  points,
  height = 180,
  valueLabel = 'Value',
  format = formatNumber,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  points: Point[];
  height?: number;
  valueLabel?: string;
  format?: (value: number) => string;
  emptyMessage?: string;
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const max = niceMax(Math.max(...points.map((point) => point.value), 0));
  const isEmpty = points.every((point) => point.value === 0);
  const width = 100;
  const plotHeight = height - 22;
  const slot = width / Math.max(points.length, 1);
  const barWidth = Math.min(slot * 0.62, (BAR_MAX / 320) * width);

  // Labels are thinned rather than rotated, so none of them overlap.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <ChartFrame
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(emptyMessage ? { emptyMessage } : {})}
      isEmpty={isEmpty}
      description={`${title}: ${points.length} values, highest ${format(max)}.`}
      table={{
        columns: ['Period', valueLabel],
        rows: points.map((point) => [point.detail ?? point.label, format(point.value)]),
      }}
    >
      <div ref={container} style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height, overflow: 'visible' }}
          role="img"
          aria-label={`${title}. Highest value ${format(max)}.`}
        >
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={width}
              y1={plotHeight * fraction}
              y2={plotHeight * fraction}
              stroke={CHART_INK.grid}
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {points.map((point, index) => {
            const barHeight = max > 0 ? (point.value / max) * plotHeight : 0;
            const x = index * slot + (slot - barWidth) / 2;
            const y = plotHeight - barHeight;
            const fill = point.color ?? seriesColor(0);

            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, point.value > 0 ? 1.5 : 0)}
                  rx={Math.min(RADIUS / 4, barWidth / 2)}
                  fill={fill}
                  opacity={hover === null || hover === index ? 1 : 0.45}
                />
                {/* A full-height hit area, so a short bar is still easy to hover. */}
                <rect
                  x={index * slot}
                  y={0}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}
        </svg>

        {/*
          One slot per point keeps every label under the value it belongs to,
          and only every nth is shown. The row must not wrap: a slot is narrower
          than the label it holds, and wrapping stacks them on top of each other.
        */}
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
            marginTop: 6,
            gap: 0,
          }}
          aria-hidden="true"
        >
          {points.map((point, index) => (
            <span
              key={`${point.label}-${index}`}
              className="tiny faint"
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                fontSize: AXIS_FONT,
                visibility: index % labelEvery === 0 ? 'visible' : 'hidden',
              }}
            >
              {point.label}
            </span>
          ))}
        </div>

        {hover !== null && points[hover] ? (
          <ChartTooltip
            x={((hover + 0.5) / points.length) * (container.current?.clientWidth ?? 300)}
            y={24}
            width={container.current?.clientWidth ?? 300}
          >
            <strong>{points[hover]!.detail ?? points[hover]!.label}</strong>
            <br />
            {format(points[hover]!.value)}
          </ChartTooltip>
        ) : null}
      </div>
    </ChartFrame>
  );
}

// ── Line / area chart ───────────────────────────────────────────────────────

export function LineChart({
  title,
  subtitle,
  points,
  height = 180,
  valueLabel = 'Value',
  format = formatNumber,
  area = true,
  color,
  emptyMessage,
  min,
  max: maxOverride,
}: {
  title: string;
  subtitle?: string;
  points: Point[];
  height?: number;
  valueLabel?: string;
  format?: (value: number) => string;
  area?: boolean;
  color?: string;
  emptyMessage?: string;
  min?: number;
  max?: number;
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const stroke = color ?? seriesColor(0);

  const filled = points.filter((point) => point.value > 0);
  const isEmpty = filled.length === 0;
  const floor = min ?? 0;
  const ceiling = maxOverride ?? niceMax(Math.max(...points.map((point) => point.value), 1));
  const width = 100;
  const plotHeight = height - 22;

  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const share = (point.value - floor) / Math.max(1, ceiling - floor);
    return { x, y: plotHeight - Math.min(1, Math.max(0, share)) * plotHeight, point };
  });

  const path = coords.map((c, index) => `${index === 0 ? 'M' : 'L'}${c.x} ${c.y}`).join(' ');
  const areaPath = `${path} L${coords[coords.length - 1]?.x ?? 0} ${plotHeight} L${coords[0]?.x ?? 0} ${plotHeight} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <ChartFrame
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(emptyMessage ? { emptyMessage } : {})}
      isEmpty={isEmpty}
      description={`${title}: ${points.length} points between ${format(floor)} and ${format(ceiling)}.`}
      table={{
        columns: ['Period', valueLabel],
        rows: points.map((point) => [point.detail ?? point.label, format(point.value)]),
      }}
    >
      <div ref={container} style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height, overflow: 'visible' }}
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            setHover(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
          }}
        >
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={width}
              y1={plotHeight * fraction}
              y2={plotHeight * fraction}
              stroke={CHART_INK.grid}
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {area ? <path d={areaPath} fill={stroke} opacity={0.1} /> : null}
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover !== null && coords[hover] ? (
            <>
              <line
                x1={coords[hover]!.x}
                x2={coords[hover]!.x}
                y1={0}
                y2={plotHeight}
                stroke={CHART_INK.axis}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
              {/* A 2px surface ring keeps the marker legible where it crosses the line. */}
              <circle
                cx={coords[hover]!.x}
                cy={coords[hover]!.y}
                r={4}
                fill={stroke}
                stroke="var(--bg-subtle)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4, gap: 0 }} aria-hidden="true">
          {points.map((point, index) => (
            <span
              key={`${point.label}-${index}`}
              className="tiny faint"
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: AXIS_FONT,
                visibility: index % labelEvery === 0 ? 'visible' : 'hidden',
              }}
            >
              {point.label}
            </span>
          ))}
        </div>

        {hover !== null && points[hover] ? (
          <ChartTooltip
            x={(coords[hover]!.x / width) * (container.current?.clientWidth ?? 300)}
            y={(coords[hover]!.y / height) * height}
            width={container.current?.clientWidth ?? 300}
          >
            <strong>{points[hover]!.detail ?? points[hover]!.label}</strong>
            <br />
            {format(points[hover]!.value)}
          </ChartTooltip>
        ) : null}
      </div>
    </ChartFrame>
  );
}

// ── Horizontal ranked bars ──────────────────────────────────────────────────

export interface RankedItem {
  id: string;
  label: string;
  value: number;
  color?: string | null;
  detail?: string;
}

export function RankedBars({
  title,
  subtitle,
  items,
  valueLabel = 'Value',
  format = formatNumber,
  emptyMessage,
  limit = 8,
}: {
  title: string;
  subtitle?: string;
  items: RankedItem[];
  valueLabel?: string;
  format?: (value: number) => string;
  emptyMessage?: string;
  limit?: number;
}): JSX.Element {
  const shown = items.slice(0, limit);
  const max = Math.max(...shown.map((item) => item.value), 1);

  return (
    <ChartFrame
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(emptyMessage ? { emptyMessage } : {})}
      isEmpty={shown.length === 0}
      description={`${title}: ${shown.length} entries, highest ${format(max)}.`}
      table={{
        columns: ['Name', valueLabel],
        rows: items.map((item) => [item.label, format(item.value)]),
      }}
    >
      <div className="stack stack--tight">
        {shown.map((item, index) => (
          <div key={item.id}>
            <div className="row row--between tiny" style={{ marginBottom: 3 }}>
              <span className="truncate" style={{ maxWidth: '60%' }}>
                {item.label}
              </span>
              <span className="numeric muted">{item.detail ?? format(item.value)}</span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'var(--surface-sunken)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(item.value / max) * 100}%`,
                  height: '100%',
                  borderRadius: '0 4px 4px 0',
                  background: item.color ?? seriesColor(index),
                  transition: 'width var(--duration) var(--ease)',
                }}
              />
            </div>
          </div>
        ))}
        {items.length > limit ? (
          <p className="tiny faint">
            {items.length - limit} more — open the table view to see them all.
          </p>
        ) : null}
      </div>
    </ChartFrame>
  );
}

// ── Stacked share bar ───────────────────────────────────────────────────────

/**
 * One bar split by share. Segments are separated by a 2px gap in the surface
 * colour rather than a stroke, so neighbouring hues stay distinct without
 * adding ink that is not data.
 */
export function ShareBar({
  title,
  subtitle,
  items,
  format = formatNumber,
  emptyMessage,
  valueLabel = 'Share',
}: {
  title: string;
  subtitle?: string;
  items: RankedItem[];
  format?: (value: number) => string;
  emptyMessage?: string;
  valueLabel?: string;
}): JSX.Element {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const series: ChartSeries[] = items.slice(0, 8).map((item, index) => ({
    id: item.id,
    label: item.label,
    color: item.color ?? seriesColor(index),
  }));

  return (
    <ChartFrame
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(emptyMessage ? { emptyMessage } : {})}
      isEmpty={total === 0}
      series={series}
      description={`${title}: ${items.length} parts of ${format(total)}.`}
      table={{
        columns: ['Name', valueLabel, 'Share'],
        rows: items.map((item) => [
          item.label,
          format(item.value),
          `${Math.round((item.value / Math.max(total, 1)) * 100)}%`,
        ]),
      }}
    >
      <div className="row row--nowrap" style={{ gap: 2, height: 14 }}>
        {items.slice(0, 8).map((item, index) => (
          <div
            key={item.id}
            title={`${item.label}: ${format(item.value)}`}
            style={{
              flex: Math.max(item.value, 0.0001),
              background: item.color ?? seriesColor(index),
              borderRadius: index === 0 ? '4px 0 0 4px' : index === items.length - 1 ? '0 4px 4px 0' : 0,
              minWidth: item.value > 0 ? 3 : 0,
            }}
          />
        ))}
      </div>
    </ChartFrame>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────────

/** Magnitude over two dimensions — hour of day against day of week, typically. */
export function Heatmap({
  title,
  subtitle,
  rows,
  columns,
  values,
  format = formatNumber,
  emptyMessage,
  valueLabel = 'Count',
}: {
  title: string;
  subtitle?: string;
  rows: string[];
  columns: string[];
  values: number[][];
  format?: (value: number) => string;
  emptyMessage?: string;
  valueLabel?: string;
}): JSX.Element {
  const mode = chartMode();
  const max = Math.max(...values.flat(), 1);
  const isEmpty = values.flat().every((value) => value === 0);

  return (
    <ChartFrame
      title={title}
      {...(subtitle ? { subtitle } : {})}
      {...(emptyMessage ? { emptyMessage } : {})}
      isEmpty={isEmpty}
      description={`${title}: highest ${format(max)}.`}
      table={{
        columns: ['', ...columns],
        rows: rows.map((row, rowIndex) => [
          row,
          ...(values[rowIndex] ?? []).map((value) => format(value)),
        ]),
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `auto repeat(${columns.length}, minmax(14px, 1fr))`,
            gap: 2,
            minWidth: columns.length * 16,
          }}
        >
          <span />
          {columns.map((column, index) => (
            <span
              key={column}
              className="tiny faint"
              style={{ textAlign: 'center', fontSize: 9, visibility: index % 3 === 0 ? 'visible' : 'hidden' }}
            >
              {column}
            </span>
          ))}
          {rows.map((row, rowIndex) => (
            <Fragment key={row}>
              <span className="tiny faint" style={{ paddingRight: 6, fontSize: 9 }}>
                {row}
              </span>
              {columns.map((column, columnIndex) => {
                const value = values[rowIndex]?.[columnIndex] ?? 0;
                return (
                  <span
                    key={`${row}-${column}`}
                    title={`${row} · ${column}: ${format(value)}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 'var(--radius-xs)',
                      background:
                        value === 0 ? 'var(--surface-sunken)' : magnitudeColor(value / max, mode),
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

/** A trend beside a number. No axes, no labels — the number carries the value. */
export function Sparkline({
  values,
  color,
  width = 72,
  height = 22,
  label,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  label: string;
}): JSX.Element | null {
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / Math.max(1, max - min)) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} role="img" aria-label={label} style={{ overflow: 'visible' }}>
      <path
        d={path}
        fill="none"
        stroke={color ?? seriesColor(0)}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { ChartFrame, seriesColor, memberColor, magnitudeColor };
export type { ChartSeries };
