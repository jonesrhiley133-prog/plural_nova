import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, normaliseThemeSettings } from '@pluralnova/shared';
import { applyTheme } from '../theme.js';

/**
 * `applyTheme` is the only place a colour reaches the document, and the copy it
 * writes to localStorage is read by the inline script in index.html before
 * React starts. That makes the storage shape a contract between two files, so
 * it is pinned here rather than left to be noticed as a flash of the wrong
 * background on the next launch.
 */
describe('applyTheme', () => {
  it('writes every token as a CSS custom property in kebab-case', () => {
    const tokens = applyTheme(DEFAULT_THEME);
    const root = document.documentElement;

    expect(root.style.getPropertyValue('--bg')).toBe(tokens.bg);
    expect(root.style.getPropertyValue('--surface-raised')).toBe(tokens.surfaceRaised);
    expect(root.style.getPropertyValue('--text-muted')).toBe(tokens.textMuted);
    expect(root.style.getPropertyValue('--accent')).toBe(tokens.accent);
  });

  it('records the behavioural parts of the theme as data attributes', () => {
    applyTheme({ ...DEFAULT_THEME, base: 'light', effects: 'performance', reducedMotion: true });
    const root = document.documentElement;

    expect(root.dataset['base']).toBe('light');
    expect(root.dataset['effects']).toBe('performance');
    expect(root.dataset['reducedMotion']).toBe('true');
    expect(root.style.colorScheme).toBe('light');
  });

  it('scales type from a percentage rather than a multiplier', () => {
    applyTheme({ ...DEFAULT_THEME, textScale: 125 });
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.25');
  });

  it('follows the page with the browser chrome colour', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#000000');
    document.head.append(meta);

    const tokens = applyTheme({ ...DEFAULT_THEME, base: 'light' });
    expect(meta.getAttribute('content')).toBe(tokens.bg);
    meta.remove();
  });

  it('stores the tokens under the names index.html replays before first paint', () => {
    const tokens = applyTheme({ ...DEFAULT_THEME, base: 'amoled' });
    const stored = JSON.parse(localStorage.getItem('pluralnova.theme') ?? '{}');

    expect(stored.base).toBe('amoled');
    expect(stored.surfaceStyle).toBe(DEFAULT_THEME.surfaceStyle);
    // index.html writes `--${key}`, so the stored keys must carry no leading dashes.
    expect(stored.tokens.bg).toBe(tokens.bg);
    expect(stored.tokens['surface-raised']).toBe(tokens.surfaceRaised);
    expect(Object.keys(stored.tokens).every((key) => !key.startsWith('-'))).toBe(true);
  });

  it('keeps a custom accent readable against its own background', () => {
    // Near-black on a near-black base: the engine has to move it, not honour it.
    const tokens = applyTheme(normaliseThemeSettings({ base: 'amoled', accent: '#060606' }));
    expect(tokens.accent.toLowerCase()).not.toBe('#060606');
  });
});
