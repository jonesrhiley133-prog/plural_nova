import { parseHex, toHex } from './themes.js';

/**
 * Curated name → hex lookup for the chat colour syntax, so a name is never
 * passed through to a rendered `style` attribute as raw, unvalidated text —
 * every value this resolves to has already been round-tripped through
 * `parseHex`/`toHex`.
 */
const NAMED_COLORS: Record<string, string> = {
  red: '#e53e3e',
  orange: '#dd6b20',
  yellow: '#d69e2e',
  green: '#38a169',
  teal: '#319795',
  cyan: '#00b5d8',
  blue: '#3182ce',
  indigo: '#5a67d8',
  purple: '#805ad5',
  pink: '#d53f8c',
  brown: '#8b5e3c',
  gray: '#718096',
  grey: '#718096',
  black: '#1a202c',
  white: '#f7fafc',
};

function normalizeHex(value: string): string | null {
  const rgb = parseHex(value);
  return rgb ? toHex(rgb.r, rgb.g, rgb.b) : null;
}

/**
 * `#RRGGBB`, a curated name, or `hex/name` together — hex tried first, the
 * name used only as a fallback when the hex half doesn't validate (which
 * also covers a bare name on its own, since then both halves are the same
 * string). Returns a normalized `#rrggbb` string, or null for anything that
 * resolves to nothing real — a name is never returned as-is, only ever this
 * module's own validated hex.
 */
export function resolveColorSpec(spec: string): string | null {
  const slash = spec.indexOf('/');
  const hexPart = slash === -1 ? spec : spec.slice(0, slash);
  const namePart = slash === -1 ? spec : spec.slice(slash + 1);
  return normalizeHex(hexPart) ?? NAMED_COLORS[namePart.toLowerCase()] ?? null;
}
