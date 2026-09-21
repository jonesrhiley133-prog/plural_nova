import { useCallback, useEffect, useState } from 'react';
import { CRUD_COLLECTIONS, requireCollection, type ConflictStrategy } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { recordStore } from '../core/data.js';
import { syncEngine } from '../core/sync.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Stat } from '../ui/primitives.js';
import { FileButton, SelectField } from '../ui/forms.js';
import { ErrorPanel } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * The import centre.
 *
 * Each source is an adapter on the server. A row it cannot read is reported by
 * name and skipped; the rest of the file still imports. Nothing already stored
 * is overwritten unless that is explicitly chosen.
 */

interface ImportSource {
  id: string;
  label: string;
  description: string;
  accepts: 'json' | 'csv';
  instructions: string;
  collections: string[];
}

interface ImportReport {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  byCollection: Record<string, { imported: number; updated: number; skipped: number; failed: number }>;
}

interface Problem {
  index: number;
  reason: string;
  name?: string;
}

export default function ImportCentre(): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();

  const [sources, setSources] = useState<ImportSource[]>([]);
  const [source, setSource] = useState<string>('pluralkit');
  const [payload, setPayload] = useState<unknown | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('skipExisting');

  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvCollection, setCsvCollection] = useState('notes');
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ sources: ImportSource[] }>('/api/data/import/sources');
      setSources(result.sources);
    } catch {
      // The list is convenience; the import itself still works from the ids.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = sources.find((candidate) => candidate.id === source);

  const readFile = async (file: File): Promise<void> => {
    setFileName(file.name);
    setParseError(null);
    setReport(null);
    setProblems([]);

    try {
      const text = await file.text();
      if (active?.accepts === 'csv' || file.name.toLowerCase().endsWith('.csv')) {
        const { columns, rows } = parseCsv(text);
        if (columns.length === 0) throw new Error('No header row found.');
        setCsvColumns(columns);
        setCsvRows(rows);
        setPayload(null);
      } else {
        setPayload(JSON.parse(text));
        setCsvColumns([]);
        setCsvRows([]);
      }
    } catch (cause) {
      setParseError(
        cause instanceof Error
          ? `That file could not be read: ${cause.message}`
          : 'That file could not be read.',
      );
      setPayload(null);
    }
  };

  const run = async (): Promise<void> => {
    setRunning(true);
    setReport(null);
    try {
      const body =
        csvRows.length > 0
          ? { source: 'csv', payload: { collection: csvCollection, mapping, rows: csvRows }, strategy }
          : { source, payload, strategy };

      const result = await api.post<{ report: ImportReport; problems: Problem[]; sourceLabel: string }>(
        '/api/data/import',
        body,
      );

      setReport(result.report);
      setProblems(result.problems);
      await recordStore.clear();
      await syncEngine.run();

      if (result.report.imported > 0) {
        toast.success(
          `Imported ${result.report.imported} record${result.report.imported === 1 ? '' : 's'}`,
          result.problems.length > 0 ? `${result.problems.length} could not be read.` : undefined,
        );
      } else {
        toast.info('Nothing was imported', 'Check the problems listed below.');
      }
    } catch (cause) {
      toast.error('The import did not run', messageFor(cause));
    } finally {
      setRunning(false);
    }
  };

  const ready = payload !== null || csvRows.length > 0;

  return (
    <>
      <PageHeader
        title="Import"
        description={term('Bring {{members}} and history in from somewhere else.')}
      />

      <div className="grid" style={{ ['--grid-min' as never]: '230px', marginBottom: 'var(--space-4)' }}>
        {sources.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className="card card--interactive"
            aria-pressed={source === candidate.id}
            style={{ textAlign: 'left', borderColor: source === candidate.id ? 'var(--accent)' : undefined }}
            onClick={() => {
              setSource(candidate.id);
              setPayload(null);
              setCsvRows([]);
              setFileName(null);
              setReport(null);
            }}
          >
            <div className="card__title">{candidate.label}</div>
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              {candidate.description}
            </p>
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <Chip>{candidate.accepts.toUpperCase()}</Chip>
              {candidate.collections.map((name) => (
                <Chip key={name}>{name === 'any' ? 'anything' : name}</Chip>
              ))}
            </div>
          </button>
        ))}
      </div>

      {active ? (
        <Card title={`Importing from ${active.label}`} style={{ marginBottom: 'var(--space-4)' }}>
          <p className="small muted prose" style={{ marginBottom: 'var(--space-4)' }}>
            {active.instructions}
          </p>

          <FileButton
            label={fileName ? `Chosen: ${fileName}` : 'Choose a file'}
            accept={active.accepts === 'csv' ? '.csv,text/csv' : 'application/json,.json'}
            onFile={(file) => void readFile(file)}
            variant="secondary"
          />

          {parseError ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <ErrorPanel message={parseError} />
            </div>
          ) : null}

          {csvColumns.length > 0 ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <p className="small muted">
                {csvRows.length} row{csvRows.length === 1 ? '' : 's'} found. Choose what they are, then
                match the columns.
              </p>

              <SelectField
                label="These rows are"
                value={csvCollection}
                options={CRUD_COLLECTIONS.filter((candidate) => !candidate.vault).map((candidate) => ({
                  value: candidate.name,
                  label: candidate.label,
                }))}
                onChange={(value) => {
                  setCsvCollection(value);
                  setMapping({});
                }}
                placeholder="Choose a record type"
              />

              <div className="stack stack--tight" style={{ marginTop: 'var(--space-3)' }}>
                {requireCollection(csvCollection)
                  .fields.filter((field) => !['json', 'refs'].includes(field.kind))
                  .slice(0, 14)
                  .map((field) => (
                    <div key={field.name} className="row row--between row--nowrap">
                      <span className="small" style={{ minWidth: 130 }}>
                        {field.label}
                        {field.required ? <span className="field__required"> required</span> : null}
                      </span>
                      <select
                        className="select"
                        value={mapping[field.name] ?? ''}
                        aria-label={`Column for ${field.label}`}
                        onChange={(event) =>
                          setMapping((current) => ({ ...current, [field.name]: event.target.value }))
                        }
                      >
                        <option value="">Not imported</option>
                        {csvColumns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <SelectField
              label="If a record already exists"
              value={strategy}
              options={[
                { value: 'skipExisting', label: 'Keep what is already here (recommended)' },
                { value: 'merge', label: 'Keep whichever is newer' },
                { value: 'replace', label: 'Take the imported version' },
              ]}
              onChange={(value) => setStrategy(value as ConflictStrategy)}
              placeholder="Keep what is already here"
            />

            <Button variant="primary" icon="import" disabled={!ready} loading={running} onClick={() => void run()}>
              Import
            </Button>
          </div>
        </Card>
      ) : null}

      {report ? (
        <Card title="Import summary" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="stat-grid">
            <Stat label="Imported" value={report.imported} />
            <Stat label="Updated" value={report.updated} />
            <Stat label="Skipped" value={report.skipped} />
            <Stat label="Could not read" value={report.failed + problems.length} />
          </div>

          {Object.keys(report.byCollection).length > 0 ? (
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              {Object.entries(report.byCollection).map(([name, counts]) => (
                <Chip key={name}>
                  {name}: {counts.imported} in
                </Chip>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {problems.length > 0 ? (
        <Card title={`${problems.length} could not be read`} subtitle="Everything else was imported">
          <div className="stack stack--tight">
            {problems.slice(0, 40).map((problem, index) => (
              <div key={index} className="row row--nowrap small">
                <span style={{ color: 'var(--caution)' }}>
                  <Icon name="warning" size={13} />
                </span>
                <span className="muted">
                  Row {problem.index + 1}
                  {problem.name ? ` (${problem.name})` : ''}: {problem.reason}
                </span>
              </div>
            ))}
            {problems.length > 40 ? (
              <p className="tiny faint">…and {problems.length - 40} more.</p>
            ) : null}
          </div>
          <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
            Nothing already in PluralNova was changed by these. You can fix the file and import again —
            records that came in the first time are skipped.
          </p>
        </Card>
      ) : null}
    </>
  );
}

/** A small CSV reader that handles quoted fields and embedded newlines. */
function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift() ?? [];
  const columns = header.map((column) => column.trim()).filter(Boolean);

  return {
    columns,
    rows: rows
      .filter((values) => values.some((value) => value.trim()))
      .map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']))),
  };
}
