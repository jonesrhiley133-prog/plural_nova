import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { findNavItemByPath } from '@pluralnova/shared';
import { useAuth, useSystemMode } from '../core/auth.js';
import { ThemeScope, useAppearance, useSectionAttribute } from '../core/appearance.js';
import { themeFor } from '@pluralnova/shared';
import { GuestBanner } from './GuestBanner.js';
import { useI18n } from '../core/i18n.js';
import { useBadges } from '../core/badges.js';
import { useFronting } from '../core/fronting.js';
import { ErrorBoundary } from '../ui/feedback.js';
import { Badge, IconButton } from '../ui/primitives.js';
import { Atmosphere } from './Atmosphere.js';
import { BarTitleContext } from './BarTitleContext.js';
import { FrontingRitual } from './FrontingRitual.js';
import { MusicPlayerBar } from './MusicPlayerBar.js';
import { BottomNav, SidebarNav } from './Navigation.js';
import { QuickActions } from './QuickActions.js';
import { SyncIndicator } from './SyncIndicator.js';

/**
 * Screens that are tables, calendars and charts rather than reading material —
 * the ones that feel cramped in the default column on a wide monitor, since
 * there's nothing there to read, only room to use. Exact paths, not prefixes:
 * `/members` (the table) gets the wide column, `/members/:id` (a profile,
 * reading material again) does not.
 */
const WIDE_LAYOUT_ROUTES = new Set(['/calendar', '/members', '/finances', '/stats', '/school/analytics']);

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
  const systemMode = useSystemMode();
  const { term } = useI18n();
  const badges = useBadges();
  const section = useSectionAttribute();
  const { state: appearance, musicTheme } = useAppearance();
  const { state: frontState } = useFronting();
  const frontingAlterId = frontState.fronting[0]?.id;
  const alterTheme =
    appearance.alterThemeScope === 'everywhere' && frontingAlterId ? themeFor(appearance, 'alter', frontingAlterId) : null;
  const sectionTheme =
    appearance.musicApplyScope === 'section' && section === 'music' && musicTheme
      ? musicTheme
      : themeFor(appearance, 'section', section);

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

          {user?.isGuest ? <GuestBanner /> : null}

          <main
            id="main-content"
            className={`app-main${WIDE_LAYOUT_ROUTES.has(location.pathname) ? ' app-main--wide' : ''}`}
            tabIndex={-1}
          >
            <ErrorBoundary label={title} onReset={() => navigate(0)}>
              <BarTitleContext.Provider value={current ? title : null}>
                {/* Keyed by path, so every navigation — not just a route that
                    happens to mount a different component tree — is a fresh
                    element for .app-main > * to animate in. */}
                <div key={location.pathname} className="page-transition">
                  <ThemeScope theme={sectionTheme}>
                    <ThemeScope theme={alterTheme}>
                      <Outlet />
                    </ThemeScope>
                  </ThemeScope>
                </div>
              </BarTitleContext.Provider>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <QuickActions />
      <BottomNav />
      {systemMode ? <FrontingRitual /> : null}
      <ThemeScope theme={appearance.musicApplyScope === 'player' ? musicTheme : null}>
        <MusicPlayerBar />
      </ThemeScope>
    </>
  );
}
