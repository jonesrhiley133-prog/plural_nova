import { useEffect, useState } from 'react';
import { requireCollection, type SyncConflict } from '@pluralnova/shared';
import { recordStore } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { syncEngine } from '../core/sync.js';
import { useToast } from '../core/toast.js';
import { Button } from '../ui/primitives.js';
import { Dialog } from '../ui/overlays.js';

/**
 * What happens when an offline edit loses a genuine same-field race.
 *
 * Everything else already merged automatically server-side — a conflict only
 * ever reaches here when two devices changed the exact same field at close
 * enough to the same time that one of them had to give way. "Keep synced"
 * accepts that (already applied); "keep mine" resubmits the value that lost,
 * as an ordinary edit against the now-current record.
 */
export function SyncConflicts({
  open,
  onClose,
  conflicts,
}: {
  open: boolean;
  onClose: () => void;
  conflicts: SyncConflict[];
}): JSX.Element {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open && conflicts.length === 0) onClose();
  }, [open, conflicts.length, onClose]);

  const keepMine = (conflict: SyncConflict): void => {
    if (!conflict.lostFields) return;
    setBusy(conflict.operationId);
    void recordStore
      .update(conflict.collection, conflict.recordId, conflict.lostFields)
      .then(() => syncEngine.dismissConflict(conflict.operationId))
      .catch((cause: unknown) => toast.fromError(cause))
      .finally(() => setBusy(null));
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('sync.conflicts.title')} description={t('sync.conflicts.subtitle')}>
      <div className="stack">
        {conflicts.map((conflict) => {
          const collection = requireCollection(conflict.collection);
          const label = String(conflict.server[collection.titleField] ?? collection.singular);
          const fields = Object.keys(conflict.lostFields ?? {});
          const deleted = Boolean(conflict.server.deletedAt);
          const isBusy = busy === conflict.operationId;

          return (
            <div key={conflict.operationId} className="card" style={{ padding: 'var(--space-3)' }}>
              <p className="small" style={{ margin: 0, fontWeight: 600 }}>
                {label}
              </p>

              {deleted ? (
                <p className="small faint" style={{ marginTop: 'var(--space-2)' }}>
                  {t('sync.conflicts.deletedNotice')}
                </p>
              ) : (
                fields.map((fieldName) => {
                  const fieldLabel = collection.fields.find((f) => f.name === fieldName)?.label ?? fieldName;
                  const mine = String(conflict.lostFields?.[fieldName] ?? '');
                  const kept = String(conflict.server[fieldName] ?? '');
                  return (
                    <div key={fieldName} className="small faint" style={{ marginTop: 'var(--space-2)' }}>
                      <div>{t('sync.conflicts.kept', { field: fieldLabel, value: kept })}</div>
                      <div>{t('sync.conflicts.yours', { field: fieldLabel, value: mine })}</div>
                    </div>
                  );
                })
              )}

              <div className="row" style={{ marginTop: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => syncEngine.dismissConflict(conflict.operationId)}
                >
                  {t('sync.conflicts.keepSynced')}
                </Button>
                {!deleted && (
                  <Button variant="primary" size="sm" loading={isBusy} onClick={() => keepMine(conflict)}>
                    {t('sync.conflicts.keepMine')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
