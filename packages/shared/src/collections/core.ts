import { f, type CollectionDef } from './schema.js';

/**
 * The system record itself. An account may hold several — a system, a side
 * system, an archived one — and exactly one is active at a time.
 */
export const systems: CollectionDef = {
  name: 'systems',
  label: 'Systems',
  singular: 'System',
  icon: 'system',
  area: 'system',
  scope: 'user',
  serverManaged: true,
  audited: true,
  titleField: 'name',
  sortField: 'createdAt',
  sortDir: 'asc',
  fields: [
    f.text('name', 'System name', { required: true, inList: true, searchable: true }),
    f.text('pronouns', 'Pronouns'),
    f.long('description', 'Description', { searchable: true }),
    f.text('systemType', 'Origin / type', {
      hint: 'Only if this is something you want recorded. Nothing is assumed.',
    }),
    f.image('avatarUrl', 'System icon'),
    f.image('bannerUrl', 'Banner'),
    f.json('avatarFocus', 'Icon focal point'),
    f.json('bannerFocus', 'Banner focal point'),
    f.color('accent', 'Accent colour'),
    f.int('memberCount', 'Member count', { defaultValue: 0 }),
    f.json('terminology', 'Terminology overrides'),
    f.json('privacy', 'Privacy defaults'),
    f.bool('archived', 'Archived'),
  ],
};

export const CORE_COLLECTIONS = [systems] as const;
