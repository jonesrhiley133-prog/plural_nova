import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  CUSTOM_FONT_PREFIX,
  FONT_PRESETS,
  buildTheme,
  normaliseThemeSettings,
  type ThemeSettings,
  type ThemeTokens,
} from '@pluralnova/shared';
import { useAuth } from './auth.js';
import { useToast } from './toast.js';

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
  root.dataset['font'] = resolved.fontFamily;
  applyFont(resolved);
  root.dataset['reducedMotion'] = String(resolved.reducedMotion);
  root.style.setProperty('--text-scale', String(resolved.textScale / 100));
  // `zoom` rather than `transform: scale` — transform creates a new
  // containing block for `position: fixed` descendants, which would break
  // the bottom nav, FABs and dialogs; zoom does not. Direct property
  // assignment rather than `setProperty`: `zoom` predates the CSSOM
  // property-registration spec that `setProperty` validates against, so
  // some engines (including jsdom, in tests) only recognise it this way.
  (root.style as unknown as { zoom: string }).zoom = String(resolved.uiZoom / 100);
  root.style.colorScheme = resolved.base === 'light' ? 'light' : 'dark';

  // The header's gradient keeps the same +/-7 spread it always had — one
  // slider moves both stops together rather than flattening the fade.
  root.style.setProperty('--header-opacity-top', `${Math.min(100, resolved.headerOpacity + 7)}%`);
  root.style.setProperty('--header-opacity-bottom', `${Math.max(0, resolved.headerOpacity - 7)}%`);
  root.style.setProperty('--background-dim', String(resolved.backgroundDim / 100));

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
        font: resolved.fontFamily,
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

/** Sets the font stack and (re)injects the @font-face rules for uploaded fonts. */
function applyFont(resolved: ThemeSettings): void {
  const root = document.documentElement;
  let style = document.getElementById('pn-custom-fonts') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'pn-custom-fonts';
    document.head.appendChild(style);
  }
  style.textContent = resolved.customFonts
    .map((font) => `@font-face{font-family:"pn-custom-${font.id}";src:url("${font.dataUrl}");font-display:swap;}`)
    .join('\n');

  const custom = resolved.customFonts.find((font) => resolved.fontFamily === `${CUSTOM_FONT_PREFIX}${font.id}`);
  const preset = FONT_PRESETS.find((font) => font.id === resolved.fontFamily);
  if (custom) root.style.setProperty('--font-sans', `"pn-custom-${custom.id}", 'Lexend', var(--font-system)`);
  else if (preset?.stack) root.style.setProperty('--font-sans', preset.stack);
  else root.style.removeProperty('--font-sans');
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const toast = useToast();

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
        try {
          await saveSettings({ theme: next });
        } catch (cause) {
          // The DOM already shows `next` — without this, a save that fails
          // (offline, a dropped connection) leaves the page looking changed
          // right up until the next reload quietly puts the old theme back
          // with no explanation. It is still queued to retry once back
          // online (see auth.tsx's saveSettings); this is just telling the
          // person now, the same way every other setting already does.
          toast.fromError(cause, 'That theme change was not saved');
        }
      },
      reset: async () => {
        const next = normaliseThemeSettings(null);
        applyTheme(next);
        try {
          await saveSettings({ theme: next });
        } catch (cause) {
          toast.fromError(cause, 'Resetting the theme was not saved');
        }
      },
    }),
    [effective, tokens, settings.theme, settings.performanceMode, saveSettings, toast],
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
