import { useId, useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon.js';
import { EmptyState } from '../ui/feedback.js';

/**
 * The frame every chart sits in.
 *
 * It supplies the three things a chart needs beyond its marks: a title that
 * says what is plotted, a legend when there is more than one series, and a
 * table view of the same numbers. The table is not a nicety — it is how the
 * values stay readable for a screen reader, in forced-colours mode, and for
 * the light-mode palette slots that sit just under the contrast threshold.
 */

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
}

export interface ChartFrameProps {
  title: string;
  subtitle?: string;
  series?: ChartSeries[];
  /** Rows for the table view: first column is the category, then one per series. */
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  action?: ReactNode;
  /** Shown instead of the chart when there is nothing recorded yet. */
  emptyMessage?: string;
  isEmpty?: boolean;
  /** One line describing what the chart shows, for anyone not seeing it. */
  description?: string;
}

export function ChartFrame({
  title,
  subtitle,
  series,
  table,
  children,
  action,
  emptyMessage,
  isEmpty,
  description,
}: ChartFrameProps): JSX.Element {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        className="row row--between"
        style={{ marginBottom: 'var(--space-3)', alignItems: 'flex-start' }}
      >
        <div>
          <div className="card__title">{title}</div>
          {subtitle ? <div className="card__subtitle">{subtitle}</div> : null}
        </div>
        <div className="row row--nowrap">
          {action}
          {table ? (
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={() => setShowTable((value) => !value)}
              aria-expanded={showTable}
              aria-controls={tableId}
            >
              <Icon name={showTable ? 'stats' : 'list'} size={14} />
              {showTable ? 'Chart' : 'Table'}
            </button>
          ) : null}
        </div>
      </figcaption>

      {isEmpty ? (
        <EmptyState title="Nothing recorded yet" body={emptyMessage} icon="stats" />
      ) : showTable && table ? (
        <DataTable id={tableId} columns={table.columns} rows={table.rows} caption={title} />
      ) : (
        <>
          {description ? <span className="visually-hidden">{description}</span> : null}
          {children}
        </>
      )}

      {series && series.length > 1 && !showTable ? <Legend series={series} /> : null}
    </figure>
  );
}

export function Legend({ series }: { series: ChartSeries[] }): JSX.Element {
  return (
    <ul
      className="row"
      style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-3)', gap: 'var(--space-3)' }}
    >
      {series.map((item) => (
        <li key={item.id} className="row row--nowrap tiny" style={{ gap: 'var(--space-2)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 'var(--radius-xs)',
              background: item.color,
              flexShrink: 0,
            }}
          />
          <span className="muted">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function DataTable({
  id,
  columns,
  rows,
  caption,
}: {
  id?: string;
  columns: string[];
  rows: (string | number)[][];
  caption: string;
}): JSX.Element {
  return (
    <div id={id} style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--size-sm)' }}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                style={{
                  textAlign: index === 0 ? 'left' : 'right',
                  padding: 'var(--space-2)',
                  borderBottom: 'var(--border-width) solid var(--border)',
                  color: 'var(--text-muted)',
                  fontWeight: 'var(--weight-medium)',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--surface)',
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    textAlign: cellIndex === 0 ? 'left' : 'right',
                    padding: 'var(--space-2)',
                    borderBottom: 'var(--border-width) solid var(--border)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Positions a tooltip near the pointer without letting it leave the chart. */
export function ChartTooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}): JSX.Element {
  const flip = x > width * 0.6;
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 9px',
        fontSize: 'var(--size-xs)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow)',
        zIndex: 2,
      }}
    >
      {children}
    </div>
  );
}
