import { useEffect, useState } from 'react';
import { syncEngine, type SyncStatus } from '../core/sync.js';
import { useI18n } from '../core/i18n.js';
import { Icon } from '../ui/Icon.js';
import { SyncConflicts } from './SyncConflicts.js';

/**
 * Sync state, shown rather than hidden.
 *
 * "Offline" is a normal state and says so; a pending count tells the user their
 * work is saved and waiting, not lost. The indicator is only silent when there
 * is genuinely nothing to report. A conflict takes over the pill entirely,
 * since it is the one sync state that needs a person to look at it — tapping
 * it opens the resolution dialog instead of forcing a sync.
 */
export function SyncIndicator(): JSX.Element | null {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => syncEngine.subscribe(setStatus), []);

  const hasConflicts = status.conflicts.length > 0;

  if (status.state === 'idle' && status.pendingCount === 0 && !hasConflicts) return null;

  const label = hasConflicts
    ? t('sync.conflicts.pill', { count: status.conflicts.length })
    : status.state === 'offline'
      ? status.pendingCount > 0
        ? t('app.pendingChanges', { count: status.pendingCount })
        : 'Offline'
      : status.state === 'syncing'
        ? t('app.syncing')
        : status.state === 'error'
          ? t('app.syncFailed')
          : t('app.pendingChanges', { count: status.pendingCount });

  const icon = hasConflicts || status.state === 'offline' || status.state === 'error' ? 'warning' : 'refresh';

  return (
    <>
      <button
        type="button"
        className="sync-pill"
        data-state={hasConflicts ? 'conflict' : status.state}
        onClick={() => (hasConflicts ? setReviewing(true) : void syncEngine.run())}
        title={hasConflicts ? t('sync.conflicts.title') : (status.lastError ?? 'Sync now')}
      >
        <Icon name={icon} size={12} />
        {label.replace(/\(s\)/g, status.pendingCount === 1 ? '' : 's')}
      </button>
      <SyncConflicts open={reviewing} onClose={() => setReviewing(false)} conflicts={status.conflicts} />
    </>
  );
}
