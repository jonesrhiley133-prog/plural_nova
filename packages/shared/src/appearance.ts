import { newId } from './ids.js';
import { mix, parseHex, withAlpha } from './themes.js';

/**
 * Advanced appearance.
 *
 * Sits on top of the base theme (`themes.ts`). Every value is optional: an
 * unset value means "inherit", so a fresh account looks exactly as it did
 * before and customisation stays opt-in and reversible.
 *
 * Hierarchy, lowest to highest precedence:
 *   Global  →  Section theme  →  Component override  →  Individual item theme
 */

export type GradientKind = 'linear' | 'radial';

export interface GradientSpec {
  colors: string[];
  kind: GradientKind;
  /** Degrees, linear only. */
  angle: number;
  /** 0–100 */
  opacity: number;
  /** 0–100; how far the colours spread apart. */
  intensity: number;
  animated: boolean;
  /** Seconds per full cycle (lower is faster). */
  speed: number;
}

export const DEFAULT_GRADIENT: GradientSpec = {
  colors: ['#7aa2f7', '#bb9af7'],
  kind: 'linear',
  angle: 135,
  opacity: 100,
  intensity: 100,
  animated: false,
  speed: 12,
};

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

/** Global controls. Every field is optional; unset inherits the base theme. */
export interface AppearanceGlobal {
  bgColor?: string;
  bgOpacity?: number;
  bgImage?: string | null;
  bgImageOpacity?: number;
  bgBlur?: number;
  bgSaturation?: number;
  bgBrightness?: number;
  bgGradient?: GradientSpec | null;
  surfaceColor?: string;
  surfaceOpacity?: number;
  surfaceBlur?: number;
  surfaceGradient?: GradientSpec | null;
  borderColor?: string;
  borderOpacity?: number;
  borderWidth?: number;
  borderStyle?: BorderStyle;
  shadowEnabled?: boolean;
  shadowOpacity?: number;
  shadowBlur?: number;
  textColor?: string;
  textSecondary?: string;
  textMuted?: string;
  iconColor?: string;
  accent?: string;
  accentOpacity?: number;
  buttonColor?: string;
  buttonOpacity?: number;
  buttonBorder?: string;
  buttonRadius?: number;
  cardRadius?: number;
  panelRadius?: number;
  /** 0–100 overall rounding; scales every radius not set explicitly. */
  rounding?: number;
}

export type ElementMode = 'inherit' | 'solid' | 'gradient';

/** One element's override of the global look. */
export interface ElementStyle {
  mode?: ElementMode;
  color?: string;
  opacity?: number;
  textColor?: string;
  accent?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  blur?: number;
  shadow?: boolean;
  gradient?: GradientSpec | null;
}

export interface AppearanceElement {
  id: string;
  label: string;
  /** CSS selector(s) the override applies to. `data-section` is set on <html> by the layout. */
  selector: string;
}

const S = (section: string, inner = '.card'): string => `html[data-section="${section}"] ${inner}`;

export const APPEARANCE_ELEMENTS: readonly AppearanceElement[] = [
  { id: 'dashboardCards', label: 'Dashboard cards', selector: S('dashboard') },
  { id: 'alterCards', label: 'Alter cards', selector: `${S('members')}, .member-banner-row` },
  { id: 'alterBanners', label: 'Alter profile banners', selector: '.member-banner-row__image, .profile-banner' },
  { id: 'navigation', label: 'Navigation bar', selector: '.app-nav, .app-bottom-nav' },
  { id: 'topBars', label: 'Top bars', selector: '.app-header' },
  { id: 'buttons', label: 'Buttons', selector: '.button' },
  { id: 'inputs', label: 'Inputs', selector: '.input, .field input, .field textarea, .field select' },
  { id: 'chatBubbles', label: 'Chat bubbles', selector: '.chat-bubble' },
  { id: 'chatBackgrounds', label: 'Chat backgrounds', selector: '.chat-thread, .chat-messages' },
  { id: 'calendar', label: 'Calendar', selector: S('calendar') },
  { id: 'journalCards', label: 'Journal cards', selector: S('journal') },
  { id: 'notes', label: 'Notes', selector: S('notes') },
  { id: 'musicPlayer', label: 'Music player', selector: '.music-bar, .music-stage' },
  { id: 'musicLibrary', label: 'Music library', selector: S('music') },
  { id: 'wellbeingCards', label: 'Wellbeing cards', selector: `${S('wellbeing')}, ${S('emotions')}, ${S('sleep')}` },
  { id: 'analytics', label: 'Analytics', selector: `${S('stats')}, ${S('school-analytics')}` },
  { id: 'notifications', label: 'Notifications', selector: `.toast, ${S('notifications')}` },
  { id: 'modals', label: 'Modals', selector: '.dialog' },
  { id: 'menus', label: 'Menus', selector: '[role="menu"], .action-menu' },
  { id: 'tabs', label: 'Tabs', selector: '.tabs, .tab' },
  { id: 'badges', label: 'Badges', selector: '.badge, .chip' },
  { id: 'progressBars', label: 'Progress bars', selector: 'progress, .music-bar__progress, .progress' },
  { id: 'sliders', label: 'Sliders', selector: 'input[type="range"]' },
  { id: 'toggles', label: 'Toggles', selector: '.switch' },
  { id: 'systemChat', label: 'System Chat', selector: S('system-chat') },
  { id: 'messages', label: 'Messages', selector: S('messages') },
  { id: 'flux', label: 'Flux', selector: S('flux') },
  { id: 'schoolLife', label: 'School Life', selector: S('school') },
  { id: 'birthdayCards', label: 'Birthday cards', selector: '.birthday-card, .birthday-banner' },
  { id: 'frontingDisplay', label: 'Fronting display', selector: '.front-person, .front-row' },
  { id: 'astroCards', label: 'Astro cards', selector: `${S('astro')}, .astro-card` },
] as const;

/** Sections a theme can be assigned to, matched against `data-section`. */
export const APPEARANCE_SECTIONS: readonly { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'members', label: 'Alters' },
  { id: 'system-chat', label: 'System Chat' },
  { id: 'messages', label: 'Messages' },
  { id: 'flux', label: 'Flux' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'journal', label: 'Journal' },
  { id: 'notes', label: 'Notes' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'music', label: 'Music' },
  { id: 'school', label: 'School Life' },
  { id: 'astro', label: 'Astrology' },
  { id: 'settings', label: 'Settings' },
];

/** Where a saved theme can be assigned. Keys look like `section:music`, `alter:<id>`, `song:<id>`. */
export type AssignmentTarget = 'global' | 'section' | 'alter' | 'song' | 'playlist' | 'chat' | 'calendarCategory';

export const MUSIC_APPLY_SCOPES = ['player', 'section', 'global'] as const;
export type MusicApplyScope = (typeof MUSIC_APPLY_SCOPES)[number];

export interface SavedTheme {
  id: string;
  name: string;
  builtIn?: boolean;
  pinned?: boolean;
  global: AppearanceGlobal;
  elements: Record<string, ElementStyle>;
  createdAt: string;
}

export interface MusicPin {
  id: string;
  /** `musicTracks` record id. */
  trackId: string;
  displayName: string;
  coverUrl: string | null;
  accent: string | null;
  themeId: string | null;
  gradient: GradientSpec | null;
  background: string | null;
  favorite: boolean;
  playlistId: string | null;
}

export interface ChatCategory {
  id: string;
  label: string;
}

export const DEFAULT_CHAT_CATEGORIES: readonly ChatCategory[] = [
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Friends' },
  { id: 'work', label: 'Work' },
  { id: 'school', label: 'School' },
  { id: 'fun', label: 'Fun' },
  { id: 'support', label: 'Support' },
  { id: 'projects', label: 'Projects' },
];

export interface AppearanceState {
  global: AppearanceGlobal;
  elements: Record<string, ElementStyle>;
  savedThemes: SavedTheme[];
  /** Id of the theme last applied as the base, for display only. */
  activeThemeId: string | null;
  /** `target:id` → saved theme id. */
  assignments: Record<string, string>;
  /** Alter themes: only on the profile, or everywhere that alter is fronting/shown. */
  alterThemeScope: 'profile' | 'everywhere';
  musicApplyScope: MusicApplyScope;
  /** Whether selecting a pinned song switches the interface to its theme. */
  musicThemeEnabled: boolean;
  musicPins: MusicPin[];
  chatCategories: ChatCategory[];
  /** Turn off animated gradients / decorative effects regardless of theme. */
  animatedGradients: boolean;
  decorativeEffects: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  global: {},
  elements: {},
  savedThemes: [],
  activeThemeId: null,
  assignments: {},
  alterThemeScope: 'profile',
  musicApplyScope: 'player',
  musicThemeEnabled: true,
  musicPins: [],
  chatCategories: [],
  animatedGradients: true,
  decorativeEffects: true,
};

/* ------------------------------ presets ------------------------------ */

const preset = (id: string, name: string, global: AppearanceGlobal, elements: Record<string, ElementStyle> = {}): SavedTheme => ({
  id: `builtin:${id}`,
  name,
  builtIn: true,
  global,
  elements,
  createdAt: '2024-01-01T00:00:00.000Z',
});

const grad = (colors: string[], extra: Partial<GradientSpec> = {}): GradientSpec => ({ ...DEFAULT_GRADIENT, colors, ...extra });

export const BUILTIN_APPEARANCE_PRESETS: readonly SavedTheme[] = [
  preset('midnight', 'Midnight', { bgColor: '#0b1020', surfaceColor: '#19223c', accent: '#7aa2f7', textColor: '#e7ecf8' }),
  preset('amoled', 'AMOLED', { bgColor: '#000000', surfaceColor: '#0a0c12', borderColor: '#171b25', shadowEnabled: false, surfaceBlur: 0 }),
  preset('stardust', 'Stardust', {
    bgColor: '#0d0b1e', surfaceColor: '#1b1736', accent: '#c4a7ff',
    bgGradient: grad(['#0d0b1e', '#251a4d', '#0b2540'], { angle: 160 }),
  }),
  preset('nebula', 'Nebula', {
    bgColor: '#120a24', surfaceColor: '#241447', accent: '#e07bff', surfaceBlur: 12, surfaceOpacity: 82,
    bgGradient: grad(['#120a24', '#3a1466', '#14315c'], { kind: 'radial' }),
  }),
  preset('ocean', 'Ocean', {
    bgColor: '#061a26', surfaceColor: '#0d2e42', accent: '#4fd1c5', textColor: '#e6f7fb',
    bgGradient: grad(['#061a26', '#0a3a52'], { angle: 180 }),
  }),
  preset('aurora', 'Aurora', {
    bgColor: '#07161a', surfaceColor: '#0f2a2f', accent: '#6ee7b7',
    bgGradient: grad(['#07161a', '#0f3d3a', '#2a1a52'], { angle: 120, animated: true, speed: 20 }),
  }),
  preset('soft-galaxy', 'Soft Galaxy', {
    bgColor: '#1a1530', surfaceColor: '#2a2250', accent: '#f4a8d8', rounding: 80,
    bgGradient: grad(['#1a1530', '#3a2a66', '#4a2a55']),
  }),
  preset('glass', 'Glass', {
    bgColor: '#0b1020', surfaceColor: '#ffffff', surfaceOpacity: 9, surfaceBlur: 18, borderColor: '#ffffff', borderOpacity: 18,
    bgGradient: grad(['#0b1020', '#27407a', '#4a2a7a'], { angle: 145 }),
  }),
  preset('minimal', 'Minimal', {
    bgColor: '#f6f6f4', surfaceColor: '#ffffff', textColor: '#1a1a1a', textSecondary: '#444444', textMuted: '#777777',
    accent: '#222222', shadowEnabled: false, rounding: 20, borderColor: '#e4e4e0',
  }),
  preset('retro', 'Retro', {
    bgColor: '#1d1230', surfaceColor: '#2c1b47', accent: '#ff9f1c', textColor: '#fff3d6', rounding: 0,
    borderWidth: 2, borderStyle: 'solid', borderColor: '#ff5d8f', shadowEnabled: false,
  }),
  preset('pastel', 'Pastel', {
    bgColor: '#fdf4f8', surfaceColor: '#ffffff', accent: '#b794f4', textColor: '#3b2f4a', textSecondary: '#5b4a70',
    textMuted: '#8a7a9e', borderColor: '#f0d9e8', rounding: 90,
  }),
  preset('custom', 'Custom', {}),
];

/* ------------------------------ resolving ------------------------------ */

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const isHex = (value: unknown): value is string => typeof value === 'string' && parseHex(value) !== null;

export function gradientCss(spec: GradientSpec): string {
  const colors = spec.colors.filter(isHex);
  if (colors.length === 0) return 'none';
  const list = colors.length === 1 ? [colors[0] as string, colors[0] as string] : colors;
  // Intensity is how far along the line the last colour is reached.
  const spread = clamp(spec.intensity, 10, 100);
  const alpha = clamp(spec.opacity, 0, 100) / 100;
  const stops = list
    .map((color, i) => `${withAlpha(color, alpha)} ${Math.round((i / (list.length - 1)) * spread)}%`)
    .join(', ');
  return spec.kind === 'radial'
    ? `radial-gradient(circle at 30% 20%, ${stops})`
    : `linear-gradient(${Math.round(spec.angle)}deg, ${stops})`;
}

function radiusFromRounding(level: number, base: number): string {
  // 0 → square, 50 → default, 100 → 2× default.
  return `${Math.round(base * (clamp(level, 0, 100) / 50))}px`;
}

/** CSS custom-property overrides for a global look. Empty object means "change nothing". */
export function globalVars(g: AppearanceGlobal): Record<string, string> {
  const v: Record<string, string> = {};
  if (isHex(g.bgColor)) v['--bg'] = withAlpha(g.bgColor, clamp(g.bgOpacity ?? 100, 0, 100) / 100);
  if (isHex(g.surfaceColor)) {
    const surface = withAlpha(g.surfaceColor, clamp(g.surfaceOpacity ?? 100, 0, 100) / 100);
    v['--surface'] = surface;
    v['--surface-raised'] = surface;
    v['--surface-sunken'] = mix(g.surfaceColor, '#000000', 0.25);
  }
  if (typeof g.surfaceBlur === 'number') v['--blur-surface'] = `${clamp(g.surfaceBlur, 0, 40)}px`;
  if (isHex(g.borderColor)) {
    const border = withAlpha(g.borderColor, clamp(g.borderOpacity ?? 100, 0, 100) / 100);
    v['--border'] = border;
    v['--border-strong'] = border;
  }
  if (isHex(g.textColor)) v['--text'] = g.textColor;
  if (isHex(g.textSecondary)) v['--text-muted'] = g.textSecondary;
  if (isHex(g.textMuted)) v['--text-faint'] = g.textMuted;
  if (isHex(g.accent)) {
    v['--accent'] = withAlpha(g.accent, clamp(g.accentOpacity ?? 100, 0, 100) / 100);
    v['--accent-soft'] = withAlpha(g.accent, 0.15);
  }
  if (g.shadowEnabled === false) {
    v['--shadow'] = 'none';
    v['--shadow-lift'] = 'none';
  } else if (g.shadowEnabled === true || g.shadowOpacity !== undefined || g.shadowBlur !== undefined) {
    const s = `0 8px ${clamp(g.shadowBlur ?? 24, 0, 80)}px -6px rgba(0,0,0,${clamp(g.shadowOpacity ?? 60, 0, 100) / 100})`;
    v['--shadow'] = s;
    v['--shadow-lift'] = s;
  }
  if (typeof g.rounding === 'number') {
    v['--radius-sm'] = radiusFromRounding(g.rounding, 10);
    v['--radius'] = radiusFromRounding(g.rounding, 14);
    v['--radius-lg'] = radiusFromRounding(g.rounding, 20);
  }
  if (typeof g.cardRadius === 'number') v['--radius'] = `${clamp(g.cardRadius, 0, 48)}px`;
  if (typeof g.panelRadius === 'number') v['--radius-lg'] = `${clamp(g.panelRadius, 0, 64)}px`;
  if (typeof g.buttonRadius === 'number') v['--ap-button-radius'] = `${clamp(g.buttonRadius, 0, 999)}px`;
  if (isHex(g.buttonColor)) v['--ap-button-bg'] = withAlpha(g.buttonColor, clamp(g.buttonOpacity ?? 100, 0, 100) / 100);
  if (isHex(g.buttonBorder)) v['--ap-button-border'] = g.buttonBorder;
  if (isHex(g.iconColor)) v['--ap-icon'] = g.iconColor;
  if (typeof g.borderWidth === 'number') v['--ap-border-width'] = `${clamp(g.borderWidth, 0, 8)}px`;
  if (g.borderStyle) v['--ap-border-style'] = g.borderStyle;
  return v;
}

export function varsToCss(vars: Record<string, string>, important = false): string {
  return Object.entries(vars)
    .map(([k, val]) => `${k}:${val}${important ? ' !important' : ''};`)
    .join('');
}

function cssEscapeUrl(url: string): string {
  return url.replace(/["\\\n\r()]/g, '');
}

function animationCss(spec: GradientSpec, allowed: boolean): string {
  return spec.animated && allowed
    ? `background-size:300% 300%;animation:ap-gradient-shift ${clamp(spec.speed, 2, 60)}s ease infinite;`
    : '';
}

/** Declarations for a single element override; empty when it inherits. */
export function elementCss(style: ElementStyle | undefined, animate: boolean, lite = false): string {
  if (!style) return '';
  const d: string[] = [];
  if (style.mode === 'gradient' && style.gradient) {
    d.push(`background-image:${gradientCss(style.gradient)} !important`);
    const anim = animationCss(style.gradient, animate);
    if (anim) d.push(anim);
  } else if (style.mode === 'solid' && isHex(style.color)) {
    d.push(`background:${withAlpha(style.color, clamp(style.opacity ?? 100, 0, 100) / 100)} !important`);
  }
  if (isHex(style.textColor)) d.push(`color:${style.textColor} !important`);
  if (isHex(style.accent)) d.push(`--accent:${style.accent} !important`);
  if (isHex(style.borderColor)) d.push(`border-color:${style.borderColor} !important`);
  if (typeof style.borderWidth === 'number') d.push(`border-width:${clamp(style.borderWidth, 0, 8)}px !important`);
  if (typeof style.radius === 'number') d.push(`border-radius:${clamp(style.radius, 0, 64)}px !important`);
  if (typeof style.blur === 'number' && !lite) d.push(`backdrop-filter:blur(${clamp(style.blur, 0, 40)}px) !important`);
  if (style.shadow === false) d.push('box-shadow:none !important');
  if (style.shadow === true) d.push('box-shadow:0 8px 24px -8px rgba(0,0,0,.55) !important');
  return d.join(';');
}

/** The style sheet text for the global look plus every component override. */
export function appearanceCss(
  state: Pick<AppearanceState, 'global' | 'elements' | 'animatedGradients' | 'decorativeEffects'>,
  opts: { performance?: boolean } = {},
): string {
  const g = state.global;
  const lite = opts.performance === true;
  const animate = state.animatedGradients && !lite;
  const out: string[] = [];
  const vars = globalVars(g);
  if (lite) vars['--blur-surface'] = '0px';
  if (Object.keys(vars).length) out.push(`:root{${varsToCss(vars, true)}}`);

  if (g.bgGradient) out.push(`body{background-image:${gradientCss(g.bgGradient)} !important;background-attachment:fixed;${animationCss(g.bgGradient, animate)}}`);
  if (g.surfaceGradient) out.push(`.card,.dialog{background-image:${gradientCss(g.surfaceGradient)} !important;${animationCss(g.surfaceGradient, animate)}}`);

  if (vars['--ap-button-bg'] || vars['--ap-button-radius'] || vars['--ap-button-border']) {
    out.push(
      `.button{${vars['--ap-button-bg'] ? 'background:var(--ap-button-bg) !important;' : ''}${vars['--ap-button-radius'] ? 'border-radius:var(--ap-button-radius) !important;' : ''}${vars['--ap-button-border'] ? 'border:1px solid var(--ap-button-border) !important;' : ''}}`,
    );
  }
  if (vars['--ap-border-width'] || vars['--ap-border-style']) {
    out.push(`.card,.dialog{border-width:var(--ap-border-width,1px) !important;border-style:var(--ap-border-style,solid) !important;}`);
  }
  if (vars['--ap-icon']) out.push(`.icon,svg.icon{color:var(--ap-icon) !important;}`);
  if (g.bgImage) {
    const opacity = clamp(g.bgImageOpacity ?? 40, 0, 100) / 100;
    const blur = lite ? '' : `blur(${clamp(g.bgBlur ?? 0, 0, 40)}px) `;
    out.push(
      `body::before{content:"";position:fixed;inset:0;z-index:-1;background:url("${cssEscapeUrl(g.bgImage)}") center/cover no-repeat;opacity:${opacity};filter:${blur}saturate(${clamp(g.bgSaturation ?? 100, 0, 200)}%) brightness(${clamp(g.bgBrightness ?? 100, 20, 200)}%);pointer-events:none;}`,
    );
  }

  for (const el of APPEARANCE_ELEMENTS) {
    const css = elementCss(state.elements[el.id], animate, lite);
    if (css) out.push(`${el.selector}{${css}}`);
  }
  if (!state.decorativeEffects || lite) {
    out.push(':root{--nebula-core:transparent !important;--nebula-drift:transparent !important;--nebula-deep:transparent !important;}');
  }
  if (out.some((s) => s.includes('ap-gradient-shift'))) {
    out.push('@keyframes ap-gradient-shift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}');
  }
  return out.join('\n');
}

/** Inline CSS variables for a scoped wrapper (section / item / alter / song theme). */
export function scopeVars(theme: Pick<SavedTheme, 'global'> | null | undefined, lite = false): Record<string, string> {
  if (!theme) return {};
  const vars = globalVars(theme.global);
  if (lite) vars['--blur-surface'] = '0px';
  return vars;
}

/* ------------------------- themes, assignments ------------------------- */

export function allThemes(state: Pick<AppearanceState, 'savedThemes'>): SavedTheme[] {
  return [...BUILTIN_APPEARANCE_PRESETS, ...state.savedThemes];
}

export function findTheme(state: Pick<AppearanceState, 'savedThemes'>, id: string | null | undefined): SavedTheme | null {
  if (!id) return null;
  return allThemes(state).find((t) => t.id === id) ?? null;
}

export function assignmentKey(target: AssignmentTarget, id?: string): string {
  return id ? `${target}:${id}` : target;
}

/** The theme assigned to a target, or null. Dangling ids (deleted themes) resolve to null. */
export function themeFor(state: AppearanceState, target: AssignmentTarget, id?: string): SavedTheme | null {
  return findTheme(state, state.assignments[assignmentKey(target, id)]);
}

export function pinnedThemes(state: AppearanceState): SavedTheme[] {
  return allThemes(state).filter((t) => t.pinned);
}

/** Drops assignments and music pins that point to missing themes. */
export function repairAppearance(state: AppearanceState): AppearanceState {
  const ids = new Set(allThemes(state).map((t) => t.id));
  const assignments: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.assignments)) if (ids.has(value)) assignments[key] = value;
  return {
    ...state,
    assignments,
    musicPins: state.musicPins.map((p) => (p.themeId && !ids.has(p.themeId) ? { ...p, themeId: null } : p)),
  };
}

/* ------------------------- export / import / sanitise ------------------------- */

export const THEME_EXPORT_FORMAT = 'pluralnova.theme' as const;

export function exportTheme(theme: SavedTheme): string {
  return JSON.stringify(
    {
      format: THEME_EXPORT_FORMAT,
      version: 1,
      theme: { name: theme.name, global: theme.global, elements: theme.elements },
    },
    null,
    2,
  );
}

function cleanGlobal(input: unknown): AppearanceGlobal {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as AppearanceGlobal) : {};
}

function cleanElements(input: unknown): Record<string, ElementStyle> {
  const out: Record<string, ElementStyle> = {};
  if (!input || typeof input !== 'object') return out;
  const known = new Set(APPEARANCE_ELEMENTS.map((e) => e.id));
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (known.has(key) && value && typeof value === 'object') out[key] = value as ElementStyle;
  }
  return out;
}

/** Parses an exported theme. Always issues a fresh id, so an import can never overwrite an existing theme. */
export function importTheme(json: string): SavedTheme | null {
  try {
    const parsed = JSON.parse(json) as { format?: string; theme?: Partial<SavedTheme> };
    if (parsed?.format !== THEME_EXPORT_FORMAT || !parsed.theme) return null;
    const t = parsed.theme;
    return {
      id: newId('theme'),
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 60) : 'Imported theme',
      global: cleanGlobal(t.global),
      elements: cleanElements(t.elements),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Normalises stored appearance (older accounts, partial imports) into a full state. */
export function normaliseAppearance(input: Partial<AppearanceState> | null | undefined): AppearanceState {
  const base = DEFAULT_APPEARANCE;
  if (!input || typeof input !== 'object') return { ...base };
  const savedThemes = Array.isArray(input.savedThemes)
    ? input.savedThemes
        .filter((t): t is SavedTheme => !!t && typeof t.id === 'string' && typeof t.name === 'string')
        .map((t) => ({ ...t, builtIn: undefined, global: cleanGlobal(t.global), elements: cleanElements(t.elements) }))
    : [];
  return repairAppearance({
    ...base,
    ...input,
    global: cleanGlobal(input.global),
    elements: cleanElements(input.elements),
    savedThemes,
    assignments: input.assignments && typeof input.assignments === 'object' ? { ...input.assignments } : {},
    musicPins: Array.isArray(input.musicPins) ? input.musicPins.filter((p) => p && typeof p.id === 'string') : [],
    chatCategories: Array.isArray(input.chatCategories) ? input.chatCategories.filter((c) => c && typeof c.id === 'string') : [],
  });
}
