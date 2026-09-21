/**
 * The chart palette.
 *
 * Separate from the UI accent on purpose: an accent is chosen for mood and can
 * be anything the user likes, while a categorical palette has to stay
 * distinguishable — including under colour-vision deficiency — no matter what
 * the rest of the interface is set to. These slots are a documented, validated
 * set; they are assigned in fixed order and never cycled.
 *
 * Validated against PluralNova's own surfaces (dark #080b14, light #ffffff):
 * lightness band, chroma floor, protan/deutan separation, normal-vision floor
 * and contrast. Three light-mode slots sit just under 3:1, which is why every
 * chart in this app ships a table view — the relief channel that makes those
 * values readable without relying on the fill.
 */

export type ChartMode = 'light' | 'dark';

/** Eight hues, fixed order. A ninth series folds into "Other" rather than inventing a colour. */
const CATEGORICAL: Record<ChartMode, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** One hue, light → dark, for magnitude. The anchor flips between modes. */
const SEQUENTIAL: Record<ChartMode, readonly string[]> = {
  light: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  dark: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
};

/** Two poles and a neutral middle, for values either side of a baseline. */
export const DIVERGING = {
  negative: { light: '#e34948', dark: '#e66767' },
  neutral: { light: '#f0efec', dark: '#383835' },
  positive: { light: '#2a78d6', dark: '#3987e5' },
} as const;

/** Reserved meanings. Never reused as a series colour, always with a word beside them. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export function chartMode(): ChartMode {
  return document.documentElement.dataset['base'] === 'light' ? 'light' : 'dark';
}

/**
 * The colour for series `index`. Slots are assigned in order, so a filter that
 * removes a series never repaints the ones that remain.
 */
export function seriesColor(index: number, mode: ChartMode = chartMode()): string {
  const slots = CATEGORICAL[mode];
  return slots[index] ?? slots[slots.length - 1]!;
}

export function categoricalSlots(mode: ChartMode = chartMode()): readonly string[] {
  return CATEGORICAL[mode];
}

/** A step from the sequential ramp for a 0–1 magnitude. */
export function magnitudeColor(share: number, mode: ChartMode = chartMode()): string {
  const ramp = SEQUENTIAL[mode];
  const index = Math.min(ramp.length - 1, Math.max(0, Math.round(share * (ramp.length - 1))));
  return ramp[index]!;
}

export function sequentialRamp(mode: ChartMode = chartMode()): readonly string[] {
  return SEQUENTIAL[mode];
}

export function divergingColor(value: number, mode: ChartMode = chartMode()): string {
  if (value > 0) return DIVERGING.positive[mode];
  if (value < 0) return DIVERGING.negative[mode];
  return DIVERGING.neutral[mode];
}

/**
 * A stable colour for a member, so the same person is the same colour on every
 * chart. Their own profile colour is used when they set one; otherwise a slot is
 * derived from their id, which keeps it stable across sessions and devices.
 */
export function memberColor(
  member: { id: string; color?: string | null } | null | undefined,
  mode: ChartMode = chartMode(),
): string {
  if (!member) return CATEGORICAL[mode][7]!;
  if (member.color && /^#[0-9a-f]{6}$/i.test(member.color)) return member.color;
  let hash = 0;
  for (let i = 0; i < member.id.length; i += 1) hash = (hash * 31 + member.id.charCodeAt(i)) >>> 0;
  return CATEGORICAL[mode][hash % CATEGORICAL[mode].length]!;
}

/** Chart furniture, kept a step off the surface so it stays recessive. */
export const CHART_INK = {
  grid: 'color-mix(in srgb, var(--border) 70%, transparent)',
  axis: 'var(--border-strong)',
  label: 'var(--text-muted)',
  muted: 'var(--text-faint)',
  surface: 'var(--surface-sunken)',
} as const;
