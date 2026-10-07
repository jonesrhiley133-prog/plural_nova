import { f, type CollectionDef } from './schema.js';

/** An alter's reflection on a day's astrology: how it actually felt, next to what the reading said. */
export const astroEntries: CollectionDef = {
  name: 'astroEntries',
  label: 'Astrology reflections',
  singular: 'Astrology reflection',
  icon: 'sparkle',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'entryDate',
  sortField: 'entryDate',
  sortDir: 'desc',
  indexes: [['systemId', 'memberId']],
  description: 'How a day actually felt, kept next to what the astrology reading suggested — never claiming the stars caused the mood.',
  fields: [
    f.date('entryDate', 'Date', { required: true, inList: true }),
    f.text('theme', 'Astrology theme', { inList: true }),
    f.text('moonPhase', 'Moon phase'),
    f.int('readingEnergy', 'Reading energy (%)', { min: 0, max: 100 }),
    f.text('reportedMood', 'Reported mood', { inList: true, searchable: true }),
    f.enumOf('reportedEnergy', 'Reported energy', [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ], { inList: true }),
    f.long('reflection', 'Reflection', { searchable: true }),
    f.bool('fit', 'The reading felt like a fit'),
  ],
};

/** A saved tarot reading. Reflective, entertainment guidance only. */
export const tarotReadings: CollectionDef = {
  name: 'tarotReadings',
  label: 'Tarot readings',
  singular: 'Tarot reading',
  icon: 'sparkle',
  area: 'life',
  scope: 'system',
  memberScoped: true,
  titleField: 'spreadName',
  sortField: 'drawnAt',
  sortDir: 'desc',
  indexes: [['systemId', 'memberId']],
  fields: [
    f.text('spreadId', 'Spread', { required: true }),
    f.text('spreadName', 'Spread name', { inList: true, searchable: true }),
    f.datetime('drawnAt', 'Drawn', { required: true, inList: true }),
    f.json('cards', 'Cards', { hint: 'Card ids with position and orientation.' }),
    f.long('note', 'Reflection', { searchable: true }),
  ],
};

export const ASTRO_COLLECTIONS = [astroEntries, tarotReadings];
