/**
 * Astrology privacy for an alter. Birth data is never visible to other
 * system members just because it was entered: the default is `private`.
 */
export const ASTRO_VISIBILITY = [
  { value: 'private', label: '🔒 Private to this alter' },
  { value: 'system', label: '👥 Visible to the system' },
  { value: 'shareable', label: '🌐 Shareable' },
  { value: 'hidden', label: '🚫 Hide astrology information' },
] as const;
export type AstroVisibility = (typeof ASTRO_VISIBILITY)[number]['value'];

export function normaliseVisibility(value: unknown): AstroVisibility {
  return ASTRO_VISIBILITY.some((v) => v.value === value) ? (value as AstroVisibility) : 'private';
}

/**
 * Can `viewerId` see the astrology for the alter `ownerId`?
 * - the alter themself, always (unless fully hidden, which hides it from everyone including the dashboard)
 * - the account owner with no profile selected (`viewerId === null`) keeps their existing access to their own data,
 *   except for `hidden`, which hides the section everywhere
 * - other alters only when the alter chose `system` or `shareable`
 */
export function canViewAstro(visibility: unknown, ownerId: string, viewerId: string | null): boolean {
  const v = normaliseVisibility(visibility);
  if (v === 'hidden') return false;
  if (viewerId === null || viewerId === ownerId) return true;
  return v === 'system' || v === 'shareable';
}
