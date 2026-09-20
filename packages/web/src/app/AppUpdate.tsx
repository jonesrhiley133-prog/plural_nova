import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppUpdate, useNotificationDeepLinks } from '../core/serviceWorker.js';
import { Button } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';

/**
 * Two things the service worker needs from the app tree.
 *
 * An update is offered, never imposed — reloading while someone is part-way
 * through an entry would throw away what they had written. And a notification
 * tapped on a browser that cannot navigate an existing window arrives here as a
 * message, which is turned back into an ordinary route change.
 */
export function AppUpdate(): JSX.Element | null {
  const navigate = useNavigate();
  const { ready, apply } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  useNotificationDeepLinks(
    useCallback((to: string) => navigate(to), [navigate]),
  );

  if (!ready || dismissed) return null;

  return (
    <div className="app-update" role="status">
      <Icon name="refresh" size={16} />
      <span className="app-update__text">A new version of PluralNova is ready.</span>
      <Button size="sm" variant="primary" onClick={apply}>
        Reload
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
        Later
      </Button>
    </div>
  );
}
