import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { findNavItemByPath } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useI18n } from '../core/i18n.js';
import { useBadges } from '../core/badges.js';
import { ErrorBoundary } from '../ui/feedback.js';
import { Badge, IconButton } from '../ui/primitives.js';
import { Atmosphere } from './Atmosphere.js';
import { BarTitleContext } from './BarTitleContext.js';
import { BottomNav, SidebarNav } from './Navigation.js';
import { QuickActions } from './QuickActions.js';
import { SyncIndicator } from './SyncIndicator.js';

/**
 * The shell.
 *
 * A rail and a wide column on a desktop, a bar and a single column on a phone.
 * The same tree serves both — the layout is CSS, not a second component — so
 * there is only ever one place a screen can be wired up.
 */
export function Layout(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { term } = useI18n();
  const badges = useBadges();

  const current = findNavItemByPath(location.pathname);
  const title = current ? term(current.label) : 'PluralNova';

  // The document title follows the route, which matters for browser history,
  // for tab switchers, and for anyone navigating by screen reader.
  useEffect(() => {
    document.title = current ? `${term(current.label)} · PluralNova` : 'PluralNova';
  }, [current, term]);

  // Each navigation starts at the top and moves focus to the main region, so a
  // keyboard or screen-reader user is not left at the end of the previous page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <>
      <Atmosphere />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <div className="app-shell">
        <SidebarNav />

        <div className="app-shell__content app">
          <header className="app-header">
            <div style={{ minWidth: 0 }}>
              <div className="app-header__title">{title}</div>
              {user?.isGuest ? (
                <div className="app-header__subtitle">Demo account — nothing here is real data</div>
              ) : null}
            </div>

            <div className="app-header__actions">
              <SyncIndicator />
              <IconButton
                icon="search"
                label="Search"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/search')}
              />
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <IconButton
                  icon="notification"
                  label={`Notifications${badges.notifications > 0 ? `, ${badges.notifications} unread` : ''}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/notifications')}
                />
                {badges.notifications > 0 ? (
                  <span style={{ position: 'absolute', top: -2, right: -2 }}>
                    <Badge count={badges.notifications} />
                  </span>
                ) : null}
              </span>
            </div>
          </header>

          <main id="main-content" className="app-main" tabIndex={-1}>
            <ErrorBoundary label={title} onReset={() => navigate(0)}>
              <BarTitleContext.Provider value={current ? title : null}>
                <Outlet />
              </BarTitleContext.Provider>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <QuickActions />
      <BottomNav />
    </>
  );
}
