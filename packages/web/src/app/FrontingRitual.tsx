import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dayKey, formatDuration } from '@pluralnova/shared';
import { useAuth, useSystemMode } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useFronting } from '../core/fronting.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button } from '../ui/primitives.js';
import { Dialog } from '../ui/overlays.js';

const STORAGE_KEY = 'pluralnova.frontingRitual.lastShown';

/**
 * The startup ritual.
 *
 * Once a day, the first thing the app asks is the thing it exists to answer:
 * who is out. A quick confirm if someone already is, a quick way to log it if
 * not, and always skippable — a ritual, not a checkpoint. Replaces the old
 * Who's There nav page; ending, switching and browsing the roster live on in
 * the dashboard's current-front card, the fronting tracker, and Quick Front.
 *
 * The decision to show is made exactly once per mount, the moment the member
 * count first finishes loading — never re-evaluated after, so adding the
 * first member mid-session cannot pop this open on top of whatever the
 * account is already doing.
 */
export function FrontingRitual(): JSX.Element | null {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSystem = useSystemMode();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const members = useCollection('members');
  const { state, loading, end, clear } = useFronting();
  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || loading || members.loading || user?.isGuest) return;
    decided.current = true;
    if (!isSystem || members.items.length === 0) return;
    const today = dayKey(new Date());
    let shownToday = false;
    try {
      shownToday = localStorage.getItem(STORAGE_KEY) === today;
      if (!shownToday) localStorage.setItem(STORAGE_KEY, today);
    } catch {
      // Private browsing or blocked storage: the ritual just shows every time.
    }
    if (!shownToday) setOpen(true);
  }, [loading, members.loading, members.items.length, user?.isGuest, isSystem]);

  const close = (): void => setOpen(false);
  const goTo = (path: string): void => {
    close();
    navigate(path);
  };

  return (
    <Dialog open={open} onClose={close} title={t('front.whosThere')}>
      {state.active.length === 0 ? (
        <div className="stack">
          <p className="small muted">{t('front.noOneBody')}</p>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <Button variant="primary" icon="bolt" onClick={() => goTo('/quick-front')}>
              {t('front.start')}
            </Button>
            <Button variant="ghost" onClick={close}>
              {term('Not sure yet')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {state.active.map((event) => (
            <div key={event.id} className="row row--nowrap" style={{ alignItems: 'center' }}>
              <Avatar
                name={String(event.member?.['name'] ?? t('front.unknown'))}
                src={(event.member?.['avatarUrl'] as string) ?? null}
                color={(event.member?.['color'] as string) ?? null}
                icon={(event.member?.['icon'] as string) ?? null}
                size={44}
                round
                ring
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'var(--weight-medium)' }}>
                  {event['unknownFronter'] === true
                    ? t('front.unknown')
                    : String(event.member?.['name'] ?? t('front.unknown'))}
                </div>
                <div className="tiny faint">
                  {t('front.since', { time: dates.time(String(event['startedAt'])) })} ·{' '}
                  {formatDuration(event.minutes)}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void end(event.id)
                    .then(() => toast.success(term('{{Front}} ended')))
                    .catch((cause: unknown) => toast.fromError(cause));
                }}
              >
                {t('front.end')}
              </Button>
            </div>
          ))}

          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="ghost" onClick={() => goTo('/quick-front?switch=1')}>
              {t('front.switch')}
            </Button>
            {state.active.length > 1 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  void clear()
                    .then(() => toast.success(term('{{Front}} cleared')))
                    .catch((cause: unknown) => toast.fromError(cause));
                }}
              >
                {t('front.clear')}
              </Button>
            ) : null}
            <span className="spacer" />
            <Button variant="primary" onClick={close}>
              {term('Still right')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
