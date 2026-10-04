import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  appearanceCss,
  assignmentKey,
  findTheme,
  newId,
  normaliseAppearance,
  scopeVars,
  themeFor,
  type AppearanceGlobal,
  type AppearanceState,
  type AssignmentTarget,
  type ElementStyle,
  type SavedTheme,
} from '@pluralnova/shared';
import { useAuth } from './auth.js';
import { useMusicPlayer } from './musicPlayer.js';
import { useToast } from './toast.js';

/**
 * Advanced appearance engine.
 *
 * Edits apply instantly from a local draft (live preview) and are saved to the
 * account settings after a short pause, so dragging a slider does not fire a
 * request per pixel. Theme assets are only ever in the style sheet when used:
 * one <style> tag holds the global look; scoped themes (section / alter /
 * song) are plain inline CSS variables on a wrapper, so nothing is loaded
 * for themes that are not on screen.
 */

interface AppearanceContextValue {
  state: AppearanceState;
  /** Patch the whole state. */
  update: (patch: Partial<AppearanceState>) => void;
  setGlobal: (patch: Partial<AppearanceGlobal>) => void;
  /** Pass undefined for a key to clear it (inherit). */
  clearGlobal: (key: keyof AppearanceGlobal) => void;
  setElement: (id: string, patch: Partial<ElementStyle> | null) => void;
  saveTheme: (name: string) => SavedTheme;
  /** Apply a theme as the starting point; every value stays editable afterwards. */
  applyTheme: (theme: SavedTheme) => void;
  renameTheme: (id: string, name: string) => void;
  duplicateTheme: (id: string) => void;
  deleteTheme: (id: string) => void;
  togglePinTheme: (id: string) => void;
  importThemeObject: (theme: SavedTheme) => void;
  assign: (target: AssignmentTarget, id: string | undefined, themeId: string | null) => void;
  resetSection: (section: 'global' | 'elements') => void;
  resetAll: () => void;
  /** Theme chosen by the currently playing pinned song, if any. */
  musicTheme: SavedTheme | null;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const STYLE_ID = 'pn-appearance';

export function AppearanceProvider({ children }: { children: ReactNode }): JSX.Element {
  const { settings, saveSettings } = useAuth();
  const toast = useToast();
  const player = useMusicPlayer();
  const [draft, setDraft] = useState<AppearanceState>(() => normaliseAppearance(settings.appearance));
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);

  // Adopt server state (sign-in, restore, reset demo) unless an edit is pending.
  useEffect(() => {
    if (!dirty.current) setDraft(normaliseAppearance(settings.appearance));
  }, [settings.appearance]);

  const commit = useCallback(
    (next: AppearanceState) => {
      setDraft(next);
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void saveSettings({ appearance: next })
          .catch((cause) => toast.fromError(cause, 'That appearance change was not saved'))
          .finally(() => {
            dirty.current = false;
          });
      }, 600);
    },
    [saveSettings, toast],
  );

  // Latest draft in a ref so action callbacks stay stable and never use stale state.
  const ref = useRef(draft);
  ref.current = draft;
  const mutate = useCallback((fn: (s: AppearanceState) => AppearanceState) => commit(fn(ref.current)), [commit]);

  // Music theme: the playing pinned song's theme, if enabled.
  const musicTheme = useMemo(() => {
    if (!draft.musicThemeEnabled || !player.current) return null;
    const pin = draft.musicPins.find((p) => p.trackId === player.current?.id);
    if (!pin) return null;
    const base = findTheme(draft, pin.themeId) ?? findTheme(draft, draft.assignments[assignmentKey('song', pin.trackId)]);
    const accent = pin.accent ? { accent: pin.accent } : {};
    if (!base && !pin.accent && !pin.gradient) return null;
    return {
      id: `pin:${pin.id}`,
      name: pin.displayName,
      createdAt: '',
      elements: base?.elements ?? {},
      global: { ...(base?.global ?? {}), ...accent, ...(pin.gradient ? { bgGradient: pin.gradient } : {}) },
    } satisfies SavedTheme;
  }, [draft, player.current]);

  const performance = Boolean(settings.performanceMode) || settings.theme.effects === 'performance';

  // One <style> tag for the global look. Removed entirely when nothing is customised.
  useEffect(() => {
    const globalMusic = draft.musicApplyScope === 'global' && musicTheme ? musicTheme : null;
    const css = appearanceCss(
      {
        global: { ...draft.global, ...(globalMusic?.global ?? {}) },
        elements: { ...draft.elements, ...(globalMusic?.elements ?? {}) },
        animatedGradients: draft.animatedGradients,
        decorativeEffects: draft.decorativeEffects,
      },
      { performance },
    );
    let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!css) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [draft, musicTheme, performance]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      state: draft,
      musicTheme,
      update: (patch) => mutate((s) => ({ ...s, ...patch })),
      setGlobal: (patch) => mutate((s) => ({ ...s, global: { ...s.global, ...patch } })),
      clearGlobal: (key) =>
        mutate((s) => {
          const global = { ...s.global };
          delete global[key];
          return { ...s, global };
        }),
      setElement: (id, patch) =>
        mutate((s) => {
          const elements = { ...s.elements };
          if (patch === null) delete elements[id];
          else elements[id] = { ...elements[id], ...patch };
          return { ...s, elements };
        }),
      saveTheme: (name) => {
        const theme: SavedTheme = {
          id: newId('theme'),
          name: name.trim() || 'My theme',
          global: structuredClone(ref.current.global),
          elements: structuredClone(ref.current.elements),
          createdAt: new Date().toISOString(),
        };
        mutate((s) => ({ ...s, savedThemes: [...s.savedThemes, theme], activeThemeId: theme.id }));
        return theme;
      },
      applyTheme: (theme) =>
        mutate((s) => ({
          ...s,
          global: structuredClone(theme.global),
          elements: structuredClone(theme.elements),
          activeThemeId: theme.id,
        })),
      renameTheme: (id, name) =>
        mutate((s) => ({ ...s, savedThemes: s.savedThemes.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)) })),
      duplicateTheme: (id) =>
        mutate((s) => {
          const source = findTheme(s, id);
          if (!source) return s;
          const copy: SavedTheme = {
            ...structuredClone(source),
            id: newId('theme'),
            name: `${source.name} copy`,
            builtIn: undefined,
            pinned: false,
            createdAt: new Date().toISOString(),
          };
          return { ...s, savedThemes: [...s.savedThemes, copy] };
        }),
      deleteTheme: (id) =>
        mutate((s) => {
          // Assignments and music pins that pointed at it fall back to inheriting.
          const assignments = Object.fromEntries(Object.entries(s.assignments).filter(([, v]) => v !== id));
          return {
            ...s,
            savedThemes: s.savedThemes.filter((t) => t.id !== id),
            assignments,
            activeThemeId: s.activeThemeId === id ? null : s.activeThemeId,
            musicPins: s.musicPins.map((p) => (p.themeId === id ? { ...p, themeId: null } : p)),
          };
        }),
      togglePinTheme: (id) =>
        mutate((s) => {
          const existing = s.savedThemes.find((t) => t.id === id);
          if (existing) return { ...s, savedThemes: s.savedThemes.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)) };
          // A built-in preset: pinning copies it into saved themes so the pin has somewhere to live.
          const builtin = findTheme(s, id);
          if (!builtin) return s;
          return { ...s, savedThemes: [...s.savedThemes, { ...structuredClone(builtin), id: newId('theme'), builtIn: undefined, pinned: true }] };
        }),
      importThemeObject: (theme) => mutate((s) => ({ ...s, savedThemes: [...s.savedThemes, theme] })),
      assign: (target, id, themeId) =>
        mutate((s) => {
          const assignments = { ...s.assignments };
          const key = assignmentKey(target, id);
          if (themeId) assignments[key] = themeId;
          else delete assignments[key];
          return { ...s, assignments };
        }),
      resetSection: (section) => mutate((s) => ({ ...s, [section]: {}, activeThemeId: null })),
      resetAll: () =>
        mutate((s) => ({
          ...s,
          global: {},
          elements: {},
          activeThemeId: null,
          assignments: {},
          animatedGradients: true,
          decorativeEffects: true,
        })),
    }),
    [draft, musicTheme, mutate],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside <AppearanceProvider>.');
  return ctx;
}

/** Maps a route to the `data-section` id used by section themes and element selectors. */
export function sectionForPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'dashboard';
  if (parts[0] === 'system' && parts[1] === 'chat') return 'system-chat';
  if (parts[0] === 'social' && parts[1]) return parts[1];
  return parts[0] as string;
}

/** Keeps `<html data-section>` in step with the route. */
export function useSectionAttribute(): string {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  useEffect(() => {
    document.documentElement.dataset['section'] = section;
  }, [section]);
  return section;
}

/**
 * Wraps content in a scoped theme. `display: contents` keeps layout untouched;
 * custom properties still inherit through it. Passing no theme renders children as-is.
 */
export function ThemeScope({
  theme,
  children,
  className,
}: {
  theme: SavedTheme | null | undefined;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const { settings } = useAuth();
  const lite = Boolean(settings.performanceMode);
  if (!theme) return <>{children}</>;
  const vars = scopeVars(theme, lite) as CSSProperties;
  return (
    <div className={className} style={{ ...vars, display: 'contents' }} data-theme-scope={theme.id}>
      {children}
    </div>
  );
}

/** The theme assigned to a target, resolved against current state. */
export function useAssignedTheme(target: AssignmentTarget, id?: string): SavedTheme | null {
  const { state } = useAppearance();
  return themeFor(state, target, id);
}
