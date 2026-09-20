import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUICK_ACTIONS } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useI18n } from '../core/i18n.js';
import { Icon, iconOr } from '../ui/Icon.js';
import { Dialog } from '../ui/overlays.js';

/**
 * The quick-action button.
 *
 * Anything worth recording in the moment — a front, a mood, a note — is two
 * taps from anywhere in the app. The same list backs the app shortcuts in the
 * manifest, so a long-press on the installed icon offers the same actions.
 */
export function QuickActions(): JSX.Element {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { settings } = useAuth();
  const { term } = useI18n();

  const actions = QUICK_ACTIONS.filter(
    (action) => settings.mode === 'system' || !action.systemOnly,
  );

  return (
    <>
      <button
        type="button"
        className="quick-action-button"
        onClick={() => setOpen(true)}
        aria-label="Quick actions"
        aria-haspopup="dialog"
      >
        <Icon name="plus" size={22} />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Quick actions">
        <div className="grid" style={{ ['--grid-min' as never]: '150px' }}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="card card--interactive"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                textAlign: 'left',
              }}
              onClick={() => {
                setOpen(false);
                navigate(action.path);
              }}
            >
              <span style={{ color: 'var(--accent)' }}>
                <Icon name={iconOr(action.icon)} size={20} />
              </span>
              <span style={{ fontWeight: 'var(--weight-medium)' }}>{term(action.label)}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
