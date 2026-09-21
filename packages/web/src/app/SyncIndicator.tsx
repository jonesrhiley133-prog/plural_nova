import { useEffect, useState } from 'react';
import { syncEngine, type SyncStatus } from '../core/sync.js';
import { useI18n } from '../core/i18n.js';
import { Icon } from '../ui/Icon.js';

/**
 * Sync state, shown rather than hidden.
 *
 * "Offline" is a normal state and says so; a pending count tells the user their
 * work is saved and waiting, not lost. The indicator is only silent when there
 * is genuinely nothing to report.
 */
export function SyncIndicator(): JSX.Element | null {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());

  useEffect(() => syncEngine.subscribe(setStatus), []);

  if (status.state === 'idle' && status.pendingCount === 0) return null;

  const label =
    status.state === 'offline'
      ? status.pendingCount > 0
        ? t('app.pendingChanges', { count: status.pendingCount })
        : 'Offline'
      : status.state === 'syncing'
        ? t('app.syncing')
        : status.state === 'error'
          ? t('app.syncFailed')
          : t('app.pendingChanges', { count: status.pendingCount });

  const icon = status.state === 'offline' ? 'warning' : status.state === 'error' ? 'warning' : 'refresh';

  return (
    <button
      type="button"
      className="sync-pill"
      data-state={status.state}
      onClick={() => void syncEngine.run()}
      title={status.lastError ?? 'Sync now'}
    >
      <Icon name={icon} size={12} />
      {label.replace(/\(s\)/g, status.pendingCount === 1 ? '' : 's')}
    </button>
  );
}
