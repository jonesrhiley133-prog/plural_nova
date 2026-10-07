import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../core/api.js';
import { useAuth } from '../core/auth.js';
import { useToast } from '../core/toast.js';
import { Button } from '../ui/primitives.js';
import { ConfirmDialog, useDialog } from '../ui/overlays.js';

/**
 * Shown on every screen while in Guest Mode. The sandbox is a separate demo
 * account with its own data, so nothing done here touches a real system —
 * these three buttons are the only way out of it, and they say what they do.
 */
export function GuestBanner(): JSX.Element {
  const { signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const resetDialog = useDialog();
  const [busy, setBusy] = useState(false);

  const leave = async (): Promise<void> => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div
      role="status"
      className="row"
      style={{
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        justifyContent: 'center',
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--accent-soft)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.85em',
      }}
    >
      <span>
        <strong>Guest Mode</strong> — a sandbox with fictional demo data. Nothing here touches a real account.
      </span>
      <Button size="sm" variant="ghost" onClick={() => resetDialog.show()}>
        Reset Demo Data
      </Button>
      <Button size="sm" variant="ghost" onClick={() => navigate('/settings/account')}>
        Create / Sign In to Real System
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void leave()}>
        Exit Guest Mode
      </Button>
      <ConfirmDialog
        open={resetDialog.open}
        title="Reset demo data?"
        body="Everything you added or changed in this sandbox is replaced with the original demo content. Your real account is not affected."
        confirmLabel={busy ? 'Resetting…' : 'Reset demo data'}
        tone="primary"
        onClose={resetDialog.hide}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.post('/api/auth/guest/reset');
            await refresh();
            toast.success('Demo data reset');
            window.location.reload();
          } catch (cause) {
            toast.fromError(cause, 'Could not reset the demo');
          } finally {
            setBusy(false);
            resetDialog.hide();
          }
        }}
      />
    </div>
  );
}
