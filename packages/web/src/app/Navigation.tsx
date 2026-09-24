import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ALL_NAV_ITEMS,
  DEFAULT_MOBILE_TABS,
  DEFAULT_SINGLET_TABS,
  categoriesForMode,
  findNavItem,
} from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useI18n } from '../core/i18n.js';
import { useBadges } from '../core/badges.js';
import { Icon, iconOr } from '../ui/Icon.js';
import { Badge } from '../ui/primitives.js';
import { Logo } from './Atmosphere.js';

/**
 * Navigation.
 *
 * One source — the shared navigation map — renders both the desktop rail and
 * the mobile bar, so a route cannot appear in one and be missing from the
 * other. Labels pass through terminology, so a system that calls its people
 * "headmates" sees that word in the menu too.
 */

const COLLAPSE_KEY = 'pluralnova.nav.collapsed';

export function SidebarNav(): JSX.Element {
  const { settings, user } = useAuth();
  const { term } = useI18n();
  const badges = useBadges();
  const categories = useMemo(
    () => categoriesForMode(settings.mode, settings.hiddenModules),
    [settings.mode, settings.hiddenModules],
  );
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // A collapsed section that does not persist is a small loss, not an error.
    }
  }, [collapsed]);

  const toggle = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <nav className="app-nav" aria-label="Main">
      <NavLink to="/" className="app-nav__brand">
        <Logo size={26} />
        <span className="app-nav__brand-name">PluralNova</span>
      </NavLink>

      {categories.map((category) => {
        const isCollapsed = collapsed.has(category.id);
        const catColor = category.color ?? 'var(--accent)';
        return (
          <div className="app-nav__group" key={category.id} style={{ '--cat-color': catColor } as never}>
            <button
              type="button"
              className="app-nav__group-label"
              onClick={() => toggle(category.id)}
              aria-expanded={!isCollapsed}
              aria-controls={`nav-${category.id}`}
            >
              {term(category.label)}
              <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={13} />
            </button>
            {isCollapsed ? null : (
              <div id={`nav-${category.id}`}>
                {category.items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className="app-nav__item"
                    end={item.path === '/'}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                  >
                    <Icon name={iconOr(item.icon)} size={17} />
                    <span className="app-nav__item-label">{term(item.label)}</span>
                    {item.badge ? <Badge count={badges[item.badge] ?? 0} /> : null}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="app-nav__footer">
        <NavLink to="/settings" className="app-nav__item">
          <Icon name="settings" size={17} />
          <span className="app-nav__item-label">{user?.displayName ?? 'Settings'}</span>
        </NavLink>
      </div>
    </nav>
  );
}

/**
 * The mobile bar.
 *
 * Fixed above the safe area, hidden while the on-screen keyboard is open, and
 * paired with a reserved strip of page padding so it never covers content.
 */
export function BottomNav(): JSX.Element {
  const { settings } = useAuth();
  const { term } = useI18n();
  const badges = useBadges();
  const keyboardOpen = useKeyboardOpen();

  const tabIds = useMemo(() => {
    const configured = settings.mobileTabs?.length
      ? settings.mobileTabs
      : settings.mode === 'system'
        ? DEFAULT_MOBILE_TABS
        : DEFAULT_SINGLET_TABS;
    const hidden = new Set(settings.hiddenModules);
    return configured
      .map((id) => (id === 'more' ? MORE_TAB : findNavItem(id)))
      .filter((item): item is (typeof ALL_NAV_ITEMS)[number] => Boolean(item))
      .filter((item) => settings.mode === 'system' || !item.systemOnly)
      .filter((item) => item.id === 'more' || !hidden.has(item.id))
      .slice(0, 5);
  }, [settings.mobileTabs, settings.mode, settings.hiddenModules]);

  return (
    <nav className="app-bottom-nav" aria-label="Main" data-keyboard-open={keyboardOpen}>
      {tabIds.map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          className="app-bottom-nav__item"
          end={item.path === '/'}
        >
          <Icon name={iconOr(item.icon)} size={20} />
          <span className="app-bottom-nav__label">{term(item.label)}</span>
          {item.badge && (badges[item.badge] ?? 0) > 0 ? (
            <span className="app-bottom-nav__badge">
              <Badge count={badges[item.badge] ?? 0} />
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

const MORE_TAB = {
  id: 'more',
  path: '/more',
  label: 'More',
  icon: 'more',
} as (typeof ALL_NAV_ITEMS)[number];

/**
 * Detects the on-screen keyboard from the visual viewport shrinking. Used to
 * hide the floating bar, which otherwise sits on top of the field being typed
 * into on Android.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const check = (): void => {
      setOpen(window.innerHeight - viewport.height > 160);
    };
    viewport.addEventListener('resize', check);
    return () => viewport.removeEventListener('resize', check);
  }, []);

  return open;
}
