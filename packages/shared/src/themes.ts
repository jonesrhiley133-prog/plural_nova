/**
 * Theming.
 *
 * A theme is a flat set of design tokens. The client writes them onto the root
 * element as CSS custom properties; nothing in the UI hard-codes a colour. That
 * keeps "AMOLED", "high contrast" and a user's own palette on exactly the same
 * footing as the built-in presets.
 */

export type ThemeBase = 'dark' | 'amoled' | 'light';
export type SurfaceStyle = 'glass' | 'solid' | 'clear';
export type EffectLevel = 'full' | 'balanced' | 'performance';

export interface ThemeTokens {
  /** Page background, furthest back. */
  bg: string;
  /** Slightly raised background, used behind grouped content. */
  bgSubtle: string;
  /** Card and panel fill. */
  surface: string;
  /** A card sitting on top of another card. */
  surfaceRaised: string;
  /** Fill for inputs and wells. */
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  positive: string;
  caution: string;
  critical: string;
  info: string;
  /** Backdrop of the starfield / atmosphere layer. */
  atmosphere: string;
  shadow: string;

  /*
   * The glass. A translucent panel only reads as glass when three things are
   * true: something varied sits behind it, its own fill is a gradient rather
   * than a flat wash, and light catches its top edge. These are those.
   */
  /** Inner highlight along a panel's top edge, where light would land. */
  glassEdge: string;
  /** Gradient wash over a panel's own fill, brighter at the top. */
  glassSheen: string;
  /** A deeper, two-stage shadow, so panels lift off the background. */
  shadowLift: string;
  /** Accent-coloured bloom, for the controls that should glow. */
  glow: string;

  /*
   * The three colour fields behind the glass. Without something to refract, a
   * blurred panel over a near-black page is just a darker rectangle — these are
   * what make the blur visible at all.
   */
  nebulaCore: string;
  nebulaDrift: string;
  nebulaDeep: string;
}

export interface ThemeSettings {
  base: ThemeBase;
  accent: string;
  surfaceStyle: SurfaceStyle;
  effects: EffectLevel;
  /** 0–100; how translucent glass surfaces are. */
  surfaceOpacity: number;
  highContrast: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  /** Scales every font size. 100 = default. */
  textScale: number;
  /** Fully custom token overrides, applied last. */
  custom: Partial<ThemeTokens> | null;
  presetId: string | null;
  showStarfield: boolean;
}

export const DEFAULT_ACCENT = '#7aa2f7';

export const DEFAULT_THEME: ThemeSettings = {
  base: 'dark',
  accent: DEFAULT_ACCENT,
  surfaceStyle: 'glass',
  effects: 'full',
  surfaceOpacity: 82,
  highContrast: false,
  reducedMotion: false,
  largeText: false,
  textScale: 100,
  custom: null,
  presetId: 'nebula',
  showStarfield: true,
};

const DARK: ThemeTokens = {
  bg: '#0b1020',
  bgSubtle: '#111935',
  surface: '#19223c',
  surfaceRaised: '#212c4c',
  surfaceSunken: '#0e142a',
  border: '#2a3558',
  borderStrong: '#3c4a76',
  text: '#e7ecf8',
  textMuted: '#c3cee6',
  textFaint: '#b2bed7',
  accent: DEFAULT_ACCENT,
  accentText: '#04070f',
  accentSoft: '#7aa2f726',
  positive: '#5ec6a8',
  caution: '#f0a85a',
  critical: '#ec7392',
  info: '#8bd5ff',
  atmosphere: '#16224a',
  shadow: '0 18px 40px -24px rgba(0, 0, 0, 0.9)',
  glassEdge: 'rgba(200, 220, 255, 0.13)',
  glassSheen: 'rgba(160, 190, 255, 0.045)',
  shadowLift: '0 2px 6px -2px rgba(0, 0, 0, 0.6), 0 24px 56px -28px rgba(4, 10, 30, 0.95)',
  glow: 'rgba(122, 162, 247, 0.17)',
  // Muted rather than saturated: these wash the background, and a vivid one
  // reads as a galaxy wallpaper instead of a night sky.
  nebulaCore: '#2b3d73',
  nebulaDrift: '#5f4a8c',
  nebulaDeep: '#1a4668',
};

const AMOLED: ThemeTokens = {
  ...DARK,
  bg: '#000000',
  bgSubtle: '#050608',
  surface: '#0a0c12',
  surfaceRaised: '#11141c',
  surfaceSunken: '#000000',
  border: '#181c26',
  borderStrong: '#242a38',
  atmosphere: '#04060d',
  shadow: '0 18px 40px -26px rgba(0, 0, 0, 1)',
  glassEdge: 'rgba(170, 196, 255, 0.09)',
  glassSheen: 'rgba(130, 160, 240, 0.03)',
  shadowLift: '0 2px 6px -2px rgba(0, 0, 0, 0.85), 0 24px 56px -30px rgba(0, 0, 0, 1)',
  glow: 'rgba(122, 162, 247, 0.14)',
  // Dimmer on AMOLED: the point of a true-black theme is the black.
  nebulaCore: '#141d42',
  nebulaDrift: '#33234f',
  nebulaDeep: '#0a1e39',
};

const LIGHT: ThemeTokens = {
  bg: '#f3f5fb',
  bgSubtle: '#e9edf7',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#eef1f9',
  border: '#d9dfee',
  borderStrong: '#bcc6de',
  text: '#131a2b',
  textMuted: '#5a6784',
  textFaint: '#7b87a3',
  accent: '#3d6fd4',
  accentText: '#ffffff',
  accentSoft: '#3d6fd41f',
  positive: '#1f8d70',
  caution: '#b26a12',
  critical: '#c23d63',
  info: '#1d6f9c',
  atmosphere: '#dbe4f7',
  shadow: '0 16px 36px -26px rgba(22, 34, 63, 0.4)',
  // On a light page the highlight is white and the sheen is almost nothing;
  // glass reads through shadow and translucency here, not through glow.
  glassEdge: 'rgba(255, 255, 255, 0.85)',
  glassSheen: 'rgba(255, 255, 255, 0.5)',
  shadowLift: '0 1px 3px -1px rgba(22, 34, 63, 0.14), 0 20px 44px -28px rgba(22, 34, 63, 0.4)',
  glow: 'rgba(61, 111, 212, 0.2)',
  nebulaCore: '#b9cdf5',
  nebulaDrift: '#d6c6f0',
  nebulaDeep: '#c6dcf2',
};

export const BASE_TOKENS: Record<ThemeBase, ThemeTokens> = {
  dark: DARK,
  amoled: AMOLED,
  light: LIGHT,
};

export interface AccentPreset {
  id: string;
  label: string;
  accent: string;
  /** Text colour that sits on top of a filled accent surface. */
  accentText: string;
  description: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'nebula', label: 'Nebula', accent: '#7aa2f7', accentText: '#04070f', description: 'The default blue.' },
  { id: 'aurora', label: 'Aurora', accent: '#5ec6a8', accentText: '#03110d', description: 'Cool green.' },
  { id: 'quasar', label: 'Quasar', accent: '#a78bfa', accentText: '#0a0514', description: 'Deep violet.' },
  { id: 'comet', label: 'Comet', accent: '#8bd5ff', accentText: '#041018', description: 'Pale cyan.' },
  { id: 'solar', label: 'Solar', accent: '#f2c45a', accentText: '#140e02', description: 'Warm gold.' },
  { id: 'ember', label: 'Ember', accent: '#f0855a', accentText: '#150600', description: 'Burnt orange.' },
  { id: 'magnetar', label: 'Magnetar', accent: '#ec7392', accentText: '#150409', description: 'Rose pink.' },
  { id: 'pulsar', label: 'Pulsar', accent: '#c0c8e0', accentText: '#0a0d16', description: 'Neutral silver.' },
];

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  settings: Partial<ThemeSettings>;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'nebula',
    label: 'Nebula',
    description: 'The default: deep navy, soft glass, quiet motion.',
    settings: { base: 'dark', accent: '#7aa2f7', surfaceStyle: 'glass', effects: 'full', showStarfield: true },
  },
  {
    id: 'void',
    label: 'Void',
    description: 'True black for OLED screens, with effects kept low.',
    settings: { base: 'amoled', accent: '#8bd5ff', surfaceStyle: 'solid', effects: 'balanced', showStarfield: false },
  },
  {
    id: 'observatory',
    label: 'Observatory',
    description: 'Light mode, high legibility, no atmosphere.',
    settings: { base: 'light', accent: '#3d6fd4', surfaceStyle: 'solid', effects: 'balanced', showStarfield: false },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Green accent over dark glass.',
    settings: { base: 'dark', accent: '#5ec6a8', surfaceStyle: 'glass', effects: 'full', showStarfield: true },
  },
  {
    id: 'quiet',
    label: 'Quiet',
    description: 'Minimal: no blur, no starfield, no movement.',
    settings: {
      base: 'dark',
      accent: '#c0c8e0',
      surfaceStyle: 'solid',
      effects: 'performance',
      showStarfield: false,
      reducedMotion: true,
    },
  },
  {
    id: 'contrast',
    label: 'High contrast',
    description: 'Maximum separation between text, surfaces and borders.',
    settings: {
      base: 'dark',
      accent: '#8bd5ff',
      surfaceStyle: 'solid',
      effects: 'performance',
      highContrast: true,
      showStarfield: false,
    },
  },
];

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const t = Math.min(1, Math.max(0, amount));
  return toHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t,
  );
}

export function withAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const a = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `#${[c.r, c.g, c.b, a].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio; used to keep a custom accent readable rather than to score it. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Picks whichever of black/white reads better on the given fill. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#05070d')
    ? '#ffffff'
    : '#05070d';
}

/**
 * Resolves settings into the final token set. Accent contrast is repaired here
 * rather than being left to whoever picked the colour: a custom accent that
 * cannot be read on the page background is lightened or darkened until it can.
 */
export function buildTheme(settings: ThemeSettings): ThemeTokens {
  const base = BASE_TOKENS[settings.base] ?? DARK;
  const tokens: ThemeTokens = { ...base };
  const isLight = settings.base === 'light';

  let accent = parseHex(settings.accent) ? settings.accent : base.accent;
  let guard = 0;
  while (contrastRatio(accent, tokens.bg) < 3 && guard < 24) {
    accent = mix(accent, isLight ? '#000000' : '#ffffff', 0.08);
    guard += 1;
  }
  tokens.accent = accent;
  tokens.accentText = readableTextOn(accent);
  tokens.accentSoft = withAlpha(accent, isLight ? 0.12 : 0.16);

  /*
   * The glow and the nearest colour field follow the accent, so choosing a
   * different accent moves the whole background with it rather than leaving a
   * blue galaxy behind a green app. The two further fields keep their own hues
   * — a single-hue background is a wash, not a sky.
   */
  tokens.glow = withAlpha(accent, isLight ? 0.2 : 0.34);
  tokens.nebulaCore = isLight ? mix(accent, '#ffffff', 0.62) : mix(accent, base.nebulaCore, 0.45);

  if (settings.highContrast) {
    tokens.text = isLight ? '#000000' : '#ffffff';
    tokens.textMuted = isLight ? '#2b3348' : '#cfd8ec';
    tokens.textFaint = isLight ? '#404a63' : '#aeb9d2';
    tokens.border = isLight ? '#5a6784' : '#7d89a6';
    tokens.borderStrong = isLight ? '#1d2438' : '#b6c1d8';
    tokens.surface = isLight ? '#ffffff' : '#0d1120';
    tokens.surfaceRaised = isLight ? '#ffffff' : '#141a2c';
    tokens.glassSheen = 'transparent';
    tokens.glassEdge = isLight ? '#5a6784' : '#b6c1d8';
  }

  if (settings.surfaceStyle === 'clear') {
    tokens.surface = withAlpha(base.surface, isLight ? 0.55 : 0.4);
    tokens.surfaceRaised = withAlpha(base.surfaceRaised || base.surface, isLight ? 0.6 : 0.45);
  } else if (settings.surfaceStyle === 'glass') {
    const opacity = Math.min(100, Math.max(20, settings.surfaceOpacity)) / 100;
    /*
     * Frosted glass is a pale film over whatever is behind it. A dark fill with
     * some transparency in it is just a dark box that lets a little through,
     * which is why lifting the fill toward the text colour comes first.
     *
     * The lift is slight, and the opacity is used as given. It used to be
     * scaled by 0.62, so a panel set to 100 was still 38% see-through and the
     * default sat at 29% — every surface competing with the background behind
     * it, which is what made the app look like it was made of windows. A
     * control named opacity should mean opacity.
     */
    const film = mix(base.surface, tokens.text, isLight ? 0.0 : 0.11);
    tokens.surface = withAlpha(film, opacity);
    tokens.surfaceRaised = withAlpha(film, Math.min(1, opacity + 0.06));
  } else {
    tokens.surface = base.surface;
    tokens.surfaceRaised = isLight ? '#ffffff' : mix(base.surface, '#ffffff', 0.05);
    // An opaque panel with a rim light on it looks like a mistake, not glass.
    tokens.glassSheen = 'transparent';
  }

  if (settings.custom) Object.assign(tokens, settings.custom);
  return tokens;
}

export function normaliseThemeSettings(input: Partial<ThemeSettings> | null | undefined): ThemeSettings {
  const merged: ThemeSettings = { ...DEFAULT_THEME, ...(input ?? {}) };
  merged.textScale = Math.min(160, Math.max(80, Math.round(merged.textScale || 100)));
  merged.surfaceOpacity = Math.min(100, Math.max(20, Math.round(merged.surfaceOpacity ?? 82)));
  if (!parseHex(merged.accent)) merged.accent = DEFAULT_ACCENT;
  if (!['dark', 'amoled', 'light'].includes(merged.base)) merged.base = 'dark';
  if (!['glass', 'solid', 'clear'].includes(merged.surfaceStyle)) merged.surfaceStyle = 'glass';
  if (!['full', 'balanced', 'performance'].includes(merged.effects)) merged.effects = 'full';
  return merged;
}

export function applyPreset(settings: ThemeSettings, presetId: string): ThemeSettings {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return settings;
  return normaliseThemeSettings({ ...settings, ...preset.settings, presetId: preset.id });
}
