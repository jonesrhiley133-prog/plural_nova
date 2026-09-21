import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  buildTheme,
  normaliseThemeSettings,
  type ThemeSettings,
  type ThemeTokens,
} from '@pluralnova/shared';
import { useAuth } from './auth.js';

/**
 * The theming engine.
 *
 * Settings are resolved into tokens and written onto the root element as CSS
 * custom properties. Nothing re-renders to change a colour — the stylesheet
 * already refers to the variables — and the same values are mirrored into
 * localStorage so the next launch paints the right background before React
 * has started.
 */

const STORAGE_KEY = 'pluralnova.theme';

interface ThemeContextValue {
  settings: ThemeSettings;
  tokens: ThemeTokens;
  update: (patch: Partial<ThemeSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function tokenName(key: string): string {
  // `surfaceRaised` → `--surface-raised`, matching the names the CSS uses.
  return `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

export function applyTheme(settings: ThemeSettings): ThemeTokens {
  const resolved = normaliseThemeSettings(settings);
  const tokens = buildTheme(resolved);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(tokens)) {
    if (key === 'shadow') root.style.setProperty('--shadow', value);
    else root.style.setProperty(tokenName(key), value);
  }

  root.dataset['base'] = resolved.base;
  root.dataset['surface'] = resolved.surfaceStyle;
  root.dataset['effects'] = resolved.effects;
  root.dataset['reducedMotion'] = String(resolved.reducedMotion);
  root.dataset['largeText'] = String(resolved.largeText);
  root.style.setProperty('--text-scale', String(resolved.textScale / 100));
  root.style.colorScheme = resolved.base === 'light' ? 'light' : 'dark';

  // The browser chrome follows the page, so an installed app does not show a
  // strip of the wrong colour above the interface.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', tokens.bg);
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        base: resolved.base,
        effects: resolved.effects,
        surfaceStyle: resolved.surfaceStyle,
        tokens: Object.fromEntries(
          Object.entries(tokens).map(([key, value]) => [tokenName(key).slice(2), value]),
        ),
      }),
    );
  } catch {
    // Without storage the next launch simply uses the defaults for one frame.
  }

  return tokens;
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { settings, saveSettings } = useAuth();

  // Performance mode is a separate switch from the theme's effect tier: turning
  // it on forces the lowest tier without discarding the tier the user chose.
  const effective = useMemo(
    () =>
      normaliseThemeSettings(
        settings.performanceMode
          ? { ...settings.theme, effects: 'performance', showStarfield: false }
          : settings.theme,
      ),
    [settings.theme, settings.performanceMode],
  );

  const tokens = useMemo(() => applyTheme(effective), [effective]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      settings: effective,
      tokens,
      update: async (patch) => {
        const next = normaliseThemeSettings({ ...settings.theme, ...patch });
        applyTheme(settings.performanceMode ? { ...next, effects: 'performance' } : next);
        await saveSettings({ theme: next });
      },
      reset: async () => {
        const next = normaliseThemeSettings(null);
        applyTheme(next);
        await saveSettings({ theme: next });
      },
    }),
    [effective, tokens, settings.theme, settings.performanceMode, saveSettings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}

/** Honours the OS reduced-motion preference even when the theme does not set it. */
export function usePrefersReducedMotion(): boolean {
  const { settings } = useTheme();
  return useMemo(() => {
    if (settings.reducedMotion || settings.effects === 'performance') return true;
    if (typeof matchMedia !== 'function') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, [settings.reducedMotion, settings.effects]);
}

/** Applies the stored theme before the account loads, so sign-in is not a flash. */
export function usePreAuthTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset['base']) return;
    applyTheme(normaliseThemeSettings(null));
  }, []);
}
