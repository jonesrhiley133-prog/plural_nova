import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  ACHIEVEMENTS,
  BACKUP_COLLECTIONS,
  COLLECTIONS,
  CRUD_COLLECTIONS,
  DEFAULT_THEME,
  EN,
  EMOTIONS,
  EMOTION_FAMILIES,
  LOCALES,
  NAVIGATION,
  TERMS,
  THEME_PRESETS,
  applyTerminology,
  buildDemoData,
  buildTheme,
  contrastRatio,
  createBackup,
  createCustomPreset,
  currentStreak,
  defaultSettings,
  evaluateAchievements,
  frontingTotals,
  getCollection,
  memberFrontingStats,
  mergeSettings,
  migrateBackup,
  normaliseThemeSettings,
  notificationAllowed,
  resolveTerminology,
  sanitizeImportedPreset,
  translate,
  validateBackup,
  validateRecord,
  withinQuietHours,
  type BackupFile,
} from '../index.js';

describe('collection registry', () => {
  it('has a unique name for every collection', () => {
    const names = COLLECTIONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every collection a title field that exists', () => {
    for (const collection of COLLECTIONS) {
      const fieldNames = new Set(collection.fields.map((f) => f.name));
      const isBaseColumn = ['id', 'createdAt', 'updatedAt', 'memberId'].includes(collection.titleField);
      expect(
        fieldNames.has(collection.titleField) || isBaseColumn,
        `${collection.name}.titleField "${collection.titleField}" is not a field`,
      ).toBe(true);
    }
  });

  it('points every reference field at a real collection', () => {
    for (const collection of COLLECTIONS) {
      for (const field of collection.fields) {
        if (field.kind !== 'ref' && field.kind !== 'refs') continue;
        expect(getCollection(field.ref ?? ''), `${collection.name}.${field.name} → ${field.ref}`).toBeDefined();
      }
    }
  });

  it('keeps server-managed collections out of the generic CRUD surface', () => {
    for (const collection of CRUD_COLLECTIONS) expect(collection.serverManaged).toBeFalsy();
    expect(CRUD_COLLECTIONS.length).toBeLessThan(COLLECTIONS.length);
  });

  it('includes everything but device registrations in a backup', () => {
    const names = BACKUP_COLLECTIONS.map((c) => c.name);
    expect(names).toContain('members');
    expect(names).toContain('journalEntries');
    expect(names).toContain('headspaceObjects');
    expect(names).not.toContain('devices');
  });

  it('gives a phone or email field its own kind rather than treating it as plain text', () => {
    // A field named this way but declared with f.text() would fall back to a
    // generic input on mobile — no numeric keypad or @-optimised keyboard,
    // and no autofill. This catches that regression anywhere in the registry.
    const withContactInfo = COLLECTIONS.filter((c) =>
      c.fields.some((field) => field.name === 'phone' || field.name === 'email'),
    );
    expect(withContactInfo.length).toBeGreaterThan(0);
    for (const collection of withContactInfo) {
      const phone = collection.fields.find((field) => field.name === 'phone');
      const email = collection.fields.find((field) => field.name === 'email');
      if (phone) expect(phone.kind, `${collection.name}.phone`).toBe('phone');
      if (email) expect(email.kind, `${collection.name}.email`).toBe('email');
    }
  });
});

describe('emotions', () => {
  it('offers a wide catalogue across 12 families', () => {
    expect(EMOTION_FAMILIES).toHaveLength(12);
    expect(EMOTIONS.length).toBeGreaterThanOrEqual(200);
    for (const family of EMOTION_FAMILIES) {
      expect(EMOTIONS.filter((e) => e.family === family.id).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('has no duplicate names or ids', () => {
    expect(new Set(EMOTIONS.map((e) => e.id)).size).toBe(EMOTIONS.length);
    expect(new Set(EMOTIONS.map((e) => e.name)).size).toBe(EMOTIONS.length);
  });
});

describe('terminology', () => {
  it('substitutes singular, plural and capitalised forms', () => {
    const terms = resolveTerminology({ member: { one: 'starling', other: 'starlings' } });
    expect(applyTerminology('{{member}}', terms)).toBe('starling');
    expect(applyTerminology('{{Member}}', terms)).toBe('Starling');
    expect(applyTerminology('{{members}}', terms)).toBe('starlings');
    expect(applyTerminology('{{Members}}', terms)).toBe('Starlings');
  });

  it('falls back to the default for a term that was not overridden', () => {
    const terms = resolveTerminology({ member: { one: 'headmate' } });
    expect(applyTerminology('{{members}}', terms)).toBe('members');
    expect(applyTerminology('{{system}}', terms)).toBe('system');
  });

  it('leaves an unknown token visible rather than blanking it', () => {
    expect(applyTerminology('{{nonsense}}', resolveTerminology(null))).toBe('{{nonsense}}');
  });

  it('applies terminology through the string catalogue', () => {
    const terms = resolveTerminology({ member: { one: 'headmate', other: 'headmates' } });
    expect(translate('members.empty', { terms })).toBe('No headmates yet');
  });

  it('only uses tokens that a term actually defines', () => {
    const known = new Set(TERMS.flatMap((t) => [t.key, `${t.key}s`]));
    for (const [key, value] of Object.entries(EN as Record<string, string>)) {
      for (const match of value.matchAll(/\{\{\s*([A-Za-z]+)\s*\}\}/g)) {
        const token = (match[1] ?? '').toLowerCase();
        expect(known.has(token), `${key} uses unknown token {{${match[1]}}}`).toBe(true);
      }
    }
  });
});

describe('localisation', () => {
  it('uses a locale it has, and English for one it does not', () => {
    expect(translate('action.save', { locale: 'es' })).toBe('Guardar');
    // Every shipped locale is complete, so the fallback is reached by asking
    // for a language the app does not carry rather than by a missing key.
    expect(translate('backup.title', { locale: 'pt' })).toBe('Backup & restore');
  });

  it('returns the key rather than undefined when nothing matches', () => {
    expect(translate('does.not.exist')).toBe('does.not.exist');
  });

  it('substitutes parameters and leaves unfilled ones visible', () => {
    expect(translate('dashboard.greeting', { params: { name: 'Vega' } })).toBe('Hello, Vega');
    expect(translate('dashboard.greeting')).toBe('Hello, {name}');
  });
});

describe('theming', () => {
  it('keeps a custom accent readable against the background', () => {
    const theme = buildTheme(normaliseThemeSettings({ base: 'dark', accent: '#0a0d14' }));
    expect(contrastRatio(theme.accent, theme.bg)).toBeGreaterThanOrEqual(3);
  });

  it('meets normal-text contrast for body copy in every base', () => {
    for (const base of ['dark', 'amoled', 'light'] as const) {
      const theme = buildTheme(normaliseThemeSettings({ base }));
      expect(contrastRatio(theme.text, theme.bg), `${base} body text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('carries the accent into the page background itself, not just onto buttons', () => {
    for (const base of ['dark', 'light'] as const) {
      const blue = buildTheme(normaliseThemeSettings({ base, accent: '#3b82f6' }));
      const green = buildTheme(normaliseThemeSettings({ base, accent: '#22c55e' }));
      expect(blue.bg, `${base} bg`).not.toBe(green.bg);
      expect(blue.bgSubtle, `${base} bgSubtle`).not.toBe(green.bgSubtle);
    }
  });

  it('keeps AMOLED true black regardless of accent', () => {
    const theme = buildTheme(normaliseThemeSettings({ base: 'amoled', accent: '#22c55e' }));
    expect(theme.bg).toBe('#000000');
  });

  it('raises contrast further in high-contrast mode', () => {
    const normal = buildTheme(normaliseThemeSettings({ base: 'dark' }));
    const high = buildTheme(normaliseThemeSettings({ base: 'dark', highContrast: true }));
    expect(contrastRatio(high.textMuted, high.bg)).toBeGreaterThan(
      contrastRatio(normal.textMuted, normal.bg),
    );
  });

  it('keeps its border and surface treatment no matter which card style is picked', () => {
    // Surface style used to be resolved after high contrast, so a solid or
    // clear card style ran its own, separate assignment to these same fields
    // afterwards and quietly put the softer, low-contrast values back.
    for (const surfaceStyle of ['solid', 'glass', 'clear'] as const) {
      const theme = buildTheme(normaliseThemeSettings({ base: 'dark', highContrast: true, surfaceStyle }));
      expect(theme.glassEdge).toBe('#b6c1d8');
      expect(theme.surface).toBe('#0d1120');
    }
  });

  it('repairs an invalid accent instead of rendering nothing', () => {
    const settings = normaliseThemeSettings({ accent: 'not-a-colour' });
    expect(settings.accent).toBe('#7aa2f7');
  });

  it('has a unique, buildable id for every built-in preset', () => {
    const ids = THEME_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(16);
    for (const preset of THEME_PRESETS) {
      // Every preset has to survive normalising and building without falling
      // back to defaults it never asked for.
      const settings = normaliseThemeSettings(preset.settings);
      expect(buildTheme(settings)).toBeTruthy();
      if (preset.settings.base) expect(settings.base).toBe(preset.settings.base);
      if (preset.settings.accent) expect(settings.accent.toLowerCase()).toBe(preset.settings.accent.toLowerCase());
    }
  });

  it('names a preset saved from the current theme, and drops the id it copied it from', () => {
    const live = normaliseThemeSettings({ accent: '#22c55e', presetId: 'nebula' });
    const saved = createCustomPreset('  My theme  ', live);

    expect(saved.label).toBe('My theme');
    expect(saved.settings.accent).toBe('#22c55e');
    expect(saved.settings.presetId).toBeUndefined();
    expect(saved.id).not.toBe('nebula');
  });

  it('falls back to a name rather than saving one blank', () => {
    const saved = createCustomPreset('   ', normaliseThemeSettings(null));
    expect(saved.label).toBe('Untitled theme');
  });

  it('gives two saved presets different ids even created back to back', () => {
    const live = normaliseThemeSettings(null);
    const a = createCustomPreset('One', live);
    const b = createCustomPreset('Two', live);
    expect(a.id).not.toBe(b.id);
  });

  describe('importing a theme file', () => {
    it('accepts a well-formed export', () => {
      const exported = { label: 'Shared with me', settings: { base: 'light', accent: '#22c55e' } };
      const imported = sanitizeImportedPreset(exported);

      expect(imported?.label).toBe('Shared with me');
      expect(imported?.settings.base).toBe('light');
      expect(imported?.settings.accent).toBe('#22c55e');
    });

    it('repairs settings the same way a normal save would, rather than trusting the file', () => {
      const imported = sanitizeImportedPreset({ settings: { base: 'not-a-base', accent: 'garbage' } });
      expect(imported?.settings.base).toBe('dark');
      expect(imported?.settings.accent).toBe('#7aa2f7');
    });

    it('falls back to a name when the file has none', () => {
      const imported = sanitizeImportedPreset({ settings: {} });
      expect(imported?.label).toBe('Imported theme');
    });

    it('rejects anything that is not a settings object, rather than throwing', () => {
      expect(sanitizeImportedPreset(null)).toBeNull();
      expect(sanitizeImportedPreset('a string')).toBeNull();
      expect(sanitizeImportedPreset(42)).toBeNull();
      expect(sanitizeImportedPreset({})).toBeNull();
      expect(sanitizeImportedPreset({ settings: 'not an object' })).toBeNull();
    });

    it('never carries over the id or label of whatever preset the file was exported from', () => {
      const imported = sanitizeImportedPreset({ id: 'nebula', label: 'Nebula', settings: DEFAULT_THEME });
      expect(imported?.id).not.toBe('nebula');
    });
  });
});

describe('settings', () => {
  it('fills in fields a stored copy predates', () => {
    const merged = mergeSettings({ mode: 'system', locale: 'en' } as never);
    expect(merged.notifications.messages.push).toBe(true);
    expect(merged.privacy.defaultVisibility).toBe('private');
    expect(merged.widgets.length).toBeGreaterThan(0);
  });

  it('keeps a partial notification override and defaults the rest', () => {
    const merged = mergeSettings({
      notifications: { messages: { inApp: true, foreground: false, push: false, badge: false } },
    } as never);
    expect(merged.notifications.messages.push).toBe(false);
    expect(merged.notifications.tasks.push).toBe(true);
  });

  it('treats quiet hours as a range that can wrap past midnight', () => {
    const quietHours = { enabled: true, from: '22:00', to: '07:00' };
    expect(withinQuietHours(quietHours, new Date('2026-01-01T23:30:00'))).toBe(true);
    expect(withinQuietHours(quietHours, new Date('2026-01-01T03:00:00'))).toBe(true);
    expect(withinQuietHours(quietHours, new Date('2026-01-01T12:00:00'))).toBe(false);
  });

  it('still records in-app notifications during quiet hours', () => {
    const settings = defaultSettings();
    settings.quietHours = { enabled: true, from: '00:00', to: '23:59' };
    const at = new Date('2026-01-01T12:00:00');
    expect(notificationAllowed(settings, 'messages', 'push', at)).toBe(false);
    expect(notificationAllowed(settings, 'messages', 'inApp', at)).toBe(true);
  });

  it('keeps a saved theme preset across a merge', () => {
    const mine = createCustomPreset('Mine', DEFAULT_THEME);
    const merged = mergeSettings({ customThemePresets: [mine] } as never);
    expect(merged.customThemePresets).toEqual([mine]);
  });

  it('drops a stored preset that is not shaped like one, instead of passing it through', () => {
    const merged = mergeSettings({
      customThemePresets: [null, 'not a preset', { id: 'ok', label: 'Ok', settings: {} }, { label: 'no id' }],
    } as never);
    expect(merged.customThemePresets).toEqual([{ id: 'ok', label: 'Ok', settings: {} }]);
  });

  it('has no saved presets for a new account', () => {
    expect(defaultSettings().customThemePresets).toEqual([]);
  });
});

describe('validation', () => {
  it('rejects a missing required field on create but not on patch', () => {
    const collection = getCollection('members')!;
    expect(validateRecord(collection, {}, { partial: false }).ok).toBe(false);
    expect(validateRecord(collection, { pronouns: 'she/her' }, { partial: true }).ok).toBe(true);
  });

  it('coerces numbers, booleans and tag lists', () => {
    const collection = getCollection('tasks')!;
    const result = validateRecord(
      collection,
      { title: 'Something', completed: 'true', tags: 'a, b , c' },
      { partial: true },
    );
    expect(result.values['completed']).toBe(1);
    expect(result.values['tags']).toEqual(['a', 'b', 'c']);
  });

  it('clamps a value outside a field’s range and says so', () => {
    const collection = getCollection('emotionEntries')!;
    const result = validateRecord(collection, { intensity: 99 }, { partial: true });
    expect(result.ok).toBe(false);
    expect(result.errors['intensity']).toContain('cannot be above 5');
  });
});

describe('analytics', () => {
  const events = [
    { id: '1', memberId: 'a', coFronterIds: [], startedAt: '2026-01-01T09:00:00Z', endedAt: '2026-01-01T11:00:00Z' },
    { id: '2', memberId: 'b', coFronterIds: ['a'], startedAt: '2026-01-01T12:00:00Z', endedAt: '2026-01-01T13:00:00Z' },
  ];

  it('totals fronting time across events', () => {
    const totals = frontingTotals(events);
    expect(totals.totalMinutes).toBe(180);
    expect(totals.eventCount).toBe(2);
    expect(totals.averageMinutes).toBe(90);
  });

  it('credits a co-fronter with the whole event', () => {
    const stats = memberFrontingStats(events);
    const a = stats.find((s) => s.memberId === 'a')!;
    const b = stats.find((s) => s.memberId === 'b')!;
    expect(a.minutes).toBe(180);
    expect(b.minutes).toBe(60);
    expect(a.coFrontEvents).toBe(1);
  });

  it('counts a streak back from today and stops at the first gap', () => {
    const today = new Date('2026-03-10T12:00:00');
    const dates = ['2026-03-10', '2026-03-09', '2026-03-08', '2026-03-06'].map(
      (d) => `${d}T10:00:00`,
    );
    expect(currentStreak(dates, today)).toBe(3);
  });
});

describe('backup', () => {
  it('validates a file it just produced', () => {
    const demo = buildDemoData({ userId: 'usr_demo', systemId: 'sys_demo', days: 7 });
    const backup = createBackup({
      account: { displayName: 'Demo', email: null, mode: 'system', activeSystemId: 'sys_demo' },
      settings: {},
      collections: demo,
      appVersion: '1.0.0',
    });
    const validation = validateBackup(backup);
    expect(validation.valid).toBe(true);
    expect(validation.checksumOk).toBe(true);
    expect(validation.totalRecords).toBeGreaterThan(50);
  });

  it('notices a file that was modified after export', () => {
    const backup = createBackup({
      account: { displayName: 'Demo', email: null, mode: 'system', activeSystemId: null },
      settings: {},
      collections: { notes: [] },
      appVersion: '1.0.0',
    });
    const tampered = { ...backup, collections: { notes: [{ id: 'x' } as never] } };
    const validation = validateBackup(tampered);
    expect(validation.checksumOk).toBe(false);
    expect(validation.warnings.join(' ')).toContain('checksum');
  });

  it('refuses a backup from a newer format', () => {
    const validation = validateBackup({
      format: 'pluralnova.backup',
      version: 99,
      collections: { notes: [] },
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('newer version');
  });

  it('migrates a version 1 file forward', () => {
    const legacy = {
      format: 'pluralnova.backup',
      version: 1,
      createdAt: new Date().toISOString(),
      app: { name: 'PluralNova', version: '0.9.0' },
      account: { displayName: 'Old', email: null, mode: 'system', activeSystemId: null },
      settings: {},
      counts: {},
      checksum: '',
      collections: {
        fronts: [{ id: 'f1', startedAt: '2026-01-01T00:00:00Z', private: false } as never],
      },
    } as unknown as BackupFile;

    const migrated = migrateBackup(legacy);
    expect(migrated.version).toBe(3);
    expect(migrated.collections['fronts']).toBeUndefined();
    expect(migrated.collections['frontEvents']?.[0]?.['visibility']).toBe('system');
    expect(migrated.collections['frontEvents']?.[0]?.['coFronterIds']).toEqual([]);
  });
});

describe('demo data', () => {
  it('produces the same system for the same seed', () => {
    const a = buildDemoData({ userId: 'u', systemId: 's', days: 30, seed: 7, now: new Date('2026-01-01') });
    const b = buildDemoData({ userId: 'u', systemId: 's', days: 30, seed: 7, now: new Date('2026-01-01') });
    expect(a['members']?.map((m) => m['name'])).toEqual(b['members']?.map((m) => m['name']));
    expect(a['frontEvents']?.length).toBe(b['frontEvents']?.length);
  });

  it('covers the modules a tour needs to be worth taking', () => {
    const demo = buildDemoData({ userId: 'u', systemId: 's', days: 30 });
    for (const collection of [
      'members', 'frontEvents', 'journalEntries', 'moodEntries', 'emotionEntries',
      'tasks', 'calendarEvents', 'relationships', 'headspaceObjects', 'systemChatMessages',
      'polls', 'stories', 'musicTracks', 'contacts', 'dictionaryTerms',
    ]) {
      expect(demo[collection]?.length, `demo data is missing ${collection}`).toBeGreaterThan(0);
    }
  });

  it('scales with the chosen demo period', () => {
    const week = buildDemoData({ userId: 'u', systemId: 's', days: 7 });
    const quarter = buildDemoData({ userId: 'u', systemId: 's', days: 90 });
    expect(quarter['frontEvents']!.length).toBeGreaterThan(week['frontEvents']!.length);
  });
});

describe('achievements and navigation', () => {
  it('unlocks only what the metrics support', () => {
    const earned = evaluateAchievements({ 'members.count': 5, 'journalEntries.count': 1 }, new Set());
    const keys = earned.map((a) => a.key);
    expect(keys).toContain('first-member');
    expect(keys).toContain('five-members');
    expect(keys).toContain('first-journal');
    expect(keys).not.toContain('twenty-members');
  });

  it('does not re-unlock something already earned', () => {
    const earned = evaluateAchievements({ 'members.count': 5 }, new Set(['first-member']));
    expect(earned.map((a) => a.key)).not.toContain('first-member');
  });

  it('gives every achievement a unique key', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });

  it('gives every navigation item a unique id and path', () => {
    const items = NAVIGATION.flatMap((c) => c.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
  });
});

describe('translations', () => {
  /*
   * A mistranslated token is silent. `{{member}}` resolves to whatever word a
   * system chose for itself; swapping it for `{{front}}`, or for a fixed noun,
   * produces a sentence that still reads fine and quietly undoes the whole
   * terminology system. Eight of these were written by hand and every one was
   * caught by a check like this rather than by reading.
   */
  const TOKEN = /\{\{[^}]+\}\}/g;
  const PLACEHOLDER = /(?<!\{)\{[a-zA-Z]+\}(?!\})/g;

  for (const locale of LOCALES.filter((entry) => entry.code !== 'en')) {
    describe(locale.label, () => {
      it('uses exactly the tokens and placeholders the English does', () => {
        const wrong: string[] = [];
        for (const [key, english] of Object.entries(EN)) {
          const translated = locale.table[key];
          if (translated === undefined) continue;

          const expectedTokens = (english.match(TOKEN) ?? []).sort();
          const actualTokens = (translated.match(TOKEN) ?? []).sort();
          if (expectedTokens.join() !== actualTokens.join()) {
            wrong.push(`${key}: tokens ${expectedTokens.join()} became ${actualTokens.join()}`);
          }

          const expectedSlots = (english.match(PLACEHOLDER) ?? []).sort();
          const actualSlots = (translated.match(PLACEHOLDER) ?? []).sort();
          if (expectedSlots.join() !== actualSlots.join()) {
            wrong.push(`${key}: placeholders ${expectedSlots.join()} became ${actualSlots.join()}`);
          }

          if (english.includes('(s)') !== translated.includes('(s)')) {
            wrong.push(`${key}: the counted-plural marker was dropped`);
          }
        }
        expect(wrong).toEqual([]);
      });

      it('translates no key that English does not have', () => {
        const stray = Object.keys(locale.table).filter((key) => !(key in EN));
        expect(stray).toEqual([]);
      });

      it('reports its coverage honestly', () => {
        const covered = Object.keys(EN).filter((key) => locale.table[key]).length;
        expect(locale.coverage).toBe(Math.round((covered / Object.keys(EN).length) * 100));
      });

      it('leaves no string untranslated, because the picker offers it as a language', () => {
        const missing = Object.keys(EN).filter((key) => !locale.table[key]);
        expect(missing).toEqual([]);
      });
    });
  }
});

/**
 * The registry is the single description of PluralNova's data: it generates the
 * SQLite DDL, the migrations, the validation, the CRUD routes, the backup
 * format, the forms and the list screens. A mistake in it is therefore not a
 * mistake in one place — which is the argument for checking its shape here
 * rather than waiting for a screen to fail to render.
 */
describe('the collection registry holds together', () => {
  const names = new Set(COLLECTIONS.map((collection) => collection.name));

  it('points every reference at a collection that exists', () => {
    // A dangling ref is silent until something tries to render the form for
    // it, and then it is an empty picker with nothing to choose.
    const dangling: string[] = [];
    for (const collection of COLLECTIONS) {
      for (const field of collection.fields) {
        if (field.kind !== 'ref' && field.kind !== 'refs') continue;
        if (!field.ref || !names.has(field.ref)) {
          dangling.push(`${collection.name}.${field.name} -> ${String(field.ref)}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('gives every collection a title field it actually has', () => {
    const broken = COLLECTIONS.filter(
      (collection) => !collection.fields.some((field) => field.name === collection.titleField),
    ).map((collection) => `${collection.name}.${collection.titleField}`);
    expect(broken).toEqual([]);
  });

  it('names each field once per collection', () => {
    // Two fields with one name means one column, and whichever is declared
    // second silently wins everywhere.
    const duplicated: string[] = [];
    for (const collection of COLLECTIONS) {
      const seen = new Set<string>();
      for (const field of collection.fields) {
        if (seen.has(field.name)) duplicated.push(`${collection.name}.${field.name}`);
        seen.add(field.name);
      }
    }
    expect(duplicated).toEqual([]);
  });

  it('gives every enum some options to choose from', () => {
    const empty = COLLECTIONS.flatMap((collection) =>
      collection.fields
        .filter((field) => field.kind === 'enum' && (field.options?.length ?? 0) === 0)
        .map((field) => `${collection.name}.${field.name}`),
    );
    expect(empty).toEqual([]);
  });

  it('labels every field, since the form has nothing else to show', () => {
    const unlabelled = COLLECTIONS.flatMap((collection) =>
      collection.fields
        .filter((field) => !field.label || !field.label.trim())
        .map((field) => `${collection.name}.${field.name}`),
    );
    expect(unlabelled).toEqual([]);
  });
});

/**
 * The version is written in two places that cannot see each other: package.json,
 * which the Android build reads to derive its versionCode, and APP_VERSION,
 * which is bundled into the browser where no package.json exists. The release
 * workflow refuses a tag that disagrees with package.json — this refuses a
 * build where the two copies have drifted apart, which is the failure that
 * would otherwise reach a phone reporting the wrong version of itself.
 */
describe('the version is the same everywhere', () => {
  it('matches package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');

    const here = dirname(fileURLToPath(import.meta.url));
    const declared = JSON.parse(
      readFileSync(resolve(here, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };

    expect(APP_VERSION).toBe(declared.version);
  });
});
