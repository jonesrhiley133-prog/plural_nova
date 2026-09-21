import { useCallback, useEffect, useState } from 'react';
import {
  BACKUP_VERSION,
  suggestedFilename,
  validateBackup,
  type BackupValidation,
  type ConflictStrategy,
} from '@pluralnova/shared';
import { api, getToken, messageFor } from '../core/api.js';
import { useAuth } from '../core/auth.js';
import { recordStore } from '../core/data.js';
import { syncEngine } from '../core/sync.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Stat } from '../ui/primitives.js';
import { FileButton, SelectField, SwitchRow } from '../ui/forms.js';
import { DescriptiveNote, ErrorPanel } from '../ui/feedback.js';
import { ConfirmDialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Backup and restore.
 *
 * The thing that makes leaving PluralNova possible. Export is the whole account
 * in one file; restore previews what a file contains before anything is
 * written, merges rather than replaces by default, and never empties a table.
 */

interface BackupRow {
  id: string;
  createdAt: string;
  sizeBytes: number;
  recordCount: number;
  formatVersion: number;
  checksum: string;
}

interface AccountSummary {
  counts: Record<string, number>;
  totalRecords: number;
}

export default function Backup(): JSX.Element {
  const { settings, refresh } = useAuth();
  const { t } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const [history, setHistory] = useState<BackupRow[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<unknown | null>(null);
  const [validation, setValidation] = useState<BackupValidation | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>('merge');
  const [includeSettings, setIncludeSettings] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [report, setReport] = useState<{ imported: number; updated: number; skipped: number; failed: number } | null>(null);

  const confirmRestore = useDialog();

  const load = useCallback(async () => {
    try {
      const [backups, account] = await Promise.all([
        api.get<{ backups: BackupRow[] }>('/api/data/backups'),
        api.get<AccountSummary>('/api/data/account'),
      ]);
      setHistory(backups.backups);
      setSummary(account);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportAll = async (): Promise<void> => {
    setExporting(true);
    try {
      // Fetched as a blob so the browser saves it as a file rather than the app
      // holding the whole account in memory as a string.
      const response = await fetch('/api/data/backup', {
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!response.ok) throw new Error('The export could not be prepared.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedFilename();
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Backup downloaded', 'Keep it somewhere you will still have it later.');
      await load();
      await refresh();
    } catch (cause) {
      toast.error('The export did not finish', messageFor(cause));
    } finally {
      setExporting(false);
    }
  };

  const readFile = async (chosen: File): Promise<void> => {
    setReport(null);
    try {
      const text = await chosen.text();
      const parsed: unknown = JSON.parse(text);
      setFile(parsed);
      setValidation(validateBackup(parsed));
    } catch {
      setFile(null);
      setValidation({
        valid: false,
        version: null,
        errors: ['That file is not readable as JSON. It may be the wrong file, or a partial download.'],
        warnings: [],
        preview: [],
        totalRecords: 0,
        createdAt: null,
        checksumOk: false,
      });
    }
  };

  const restore = async (): Promise<void> => {
    if (!file) return;
    setRestoring(true);
    try {
      const result = await api.post<{
        report: { imported: number; updated: number; skipped: number; failed: number };
        warnings: string[];
      }>('/api/data/restore', { backup: file, strategy, includeSettings });

      setReport(result.report);
      await recordStore.clear();
      await syncEngine.reset();
      await syncEngine.run();
      await refresh();
      toast.success(
        'Restore finished',
        `${result.report.imported} added, ${result.report.updated} updated, ${result.report.skipped} already current.`,
      );
    } catch (cause) {
      toast.error('The restore did not finish', messageFor(cause));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('backup.title')}
        description="Your data, in a file you keep. Nothing here locks you in."
      />

      {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : null}

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Records" value={(summary?.totalRecords ?? 0).toLocaleString()} />
        <Stat label="Collections" value={Object.keys(summary?.counts ?? {}).length} />
        <Stat
          label="Last export"
          value={settings.lastBackupAt ? dates.relative(settings.lastBackupAt) : 'Never'}
        />
        <Stat label="Format" value={`v${BACKUP_VERSION}`} />
      </div>

      <div className="split">
        <Card title={t('backup.export')} subtitle={t('backup.exportBody')}>
          <Button variant="primary" icon="download" onClick={() => void exportAll()} loading={exporting} block>
            Export everything
          </Button>

          {summary && Object.keys(summary.counts).length > 0 ? (
            <details style={{ marginTop: 'var(--space-4)' }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>
                What is in it
              </summary>
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                {Object.entries(summary.counts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => (
                    <Chip key={name}>
                      {name} · {count}
                    </Chip>
                  ))}
              </div>
            </details>
          ) : null}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <DescriptiveNote>
              The file is plain JSON with a version number and a checksum. It can be read by anything,
              and restoring it into a future version of PluralNova migrates it forward automatically.
            </DescriptiveNote>
          </div>
        </Card>

        <Card title={t('backup.restore')} subtitle={t('backup.restoreBody')}>
          <FileButton label="Choose a backup file" accept="application/json,.json" onFile={(chosen) => void readFile(chosen)} />

          {validation ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              {validation.errors.length > 0 ? (
                <ErrorPanel
                  title="This file cannot be restored"
                  message={validation.errors[0] ?? 'Unreadable.'}
                  {...(validation.errors.length > 1 ? { detail: validation.errors.join('\n') } : {})}
                />
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                    <Chip accent>
                      <Icon name="check" size={11} /> Readable
                    </Chip>
                    <Chip>{validation.totalRecords.toLocaleString()} records</Chip>
                    <Chip>format v{validation.version}</Chip>
                    {validation.createdAt ? <Chip>from {dates.date(validation.createdAt)}</Chip> : null}
                    {validation.checksumOk ? (
                      <Chip>checksum matches</Chip>
                    ) : (
                      <Chip color="var(--caution)">checksum mismatch</Chip>
                    )}
                  </div>

                  {validation.warnings.map((warning) => (
                    <p key={warning} className="small" style={{ color: 'var(--caution)' }}>
                      {warning}
                    </p>
                  ))}

                  <details style={{ margin: 'var(--space-3) 0' }}>
                    <summary className="small muted" style={{ cursor: 'pointer' }}>
                      What it would restore
                    </summary>
                    <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                      {validation.preview.map((row) => (
                        <Chip key={row.collection}>
                          {row.label} · {row.count}
                        </Chip>
                      ))}
                    </div>
                  </details>

                  <SelectField
                    label="If something is already here"
                    value={strategy}
                    options={[
                      { value: 'merge', label: 'Keep whichever is newer (recommended)' },
                      { value: 'skipExisting', label: 'Keep what is already here' },
                      { value: 'replace', label: 'Take the version in the file' },
                    ]}
                    onChange={(value) => setStrategy(value as ConflictStrategy)}
                    placeholder="Keep whichever is newer"
                  />

                  <SwitchRow
                    label="Restore settings too"
                    hint="Theme, terminology, notification preferences and dashboard layout."
                    checked={includeSettings}
                    onChange={setIncludeSettings}
                  />

                  <Button
                    variant="primary"
                    block
                    icon="upload"
                    loading={restoring}
                    onClick={() => confirmRestore.show()}
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Restore
                  </Button>

                  <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
                    Restoring never empties anything. Records not in the file are left alone.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {report ? (
            <Card raised style={{ marginTop: 'var(--space-4)' }}>
              <div className="stat-grid">
                <Stat label="Added" value={report.imported} />
                <Stat label="Updated" value={report.updated} />
                <Stat label="Already current" value={report.skipped} />
                <Stat label="Could not read" value={report.failed} />
              </div>
              {report.failed > 0 ? (
                <p className="small" style={{ color: 'var(--caution)', marginTop: 'var(--space-3)' }}>
                  {report.failed} record{report.failed === 1 ? '' : 's'} could not be written. Everything
                  else was restored.
                </p>
              ) : null}
            </Card>
          ) : null}
        </Card>
      </div>

      {history.length > 0 ? (
        <Card title="Export history" flush style={{ marginTop: 'var(--space-4)' }}>
          <div className="list">
            {history.map((row) => (
              <div key={row.id} className="list-row">
                <span className="list-row__body">
                  <span className="list-row__title">{dates.dateTime(row.createdAt)}</span>
                  <span className="list-row__meta">
                    <span>{row.recordCount.toLocaleString()} records</span>
                    <span className="faint">{Math.round(row.sizeBytes / 1024)} KB</span>
                    <Chip>v{row.formatVersion}</Chip>
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="tiny faint" style={{ padding: 'var(--space-3)' }}>
            PluralNova records that an export happened, not the file itself — that is on your device,
            where it belongs.
          </p>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmRestore.open}
        onClose={confirmRestore.hide}
        title="Restore this backup?"
        body={`${validation?.totalRecords.toLocaleString() ?? 0} records will be merged into this account using the option you chose. Nothing is deleted.`}
        confirmLabel="Restore"
        tone="primary"
        recoverable={false}
        onConfirm={restore}
      />
    </>
  );
}
