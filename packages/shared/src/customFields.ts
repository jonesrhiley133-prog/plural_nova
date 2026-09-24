import { newId } from './ids.js';

/**
 * Typed custom fields.
 *
 * A field is defined once for the whole system — its label, type and, for a
 * choice-shaped type, its preset options — and lives in the
 * `customFieldDefinitions` collection. Each member keeps only their own
 * answers against those shared definitions, in `customFieldValues`. Defining
 * "Species" once and having every member pick from the same options (or
 * leave it blank) is the point: the alternative, where each profile
 * re-invents the same field, is how two members' option lists quietly drift
 * apart.
 *
 * A profile only ever shows the definitions it has an answer for — an
 * unanswered field is not a gap worth displaying on every single member's
 * page.
 */

export const CUSTOM_FIELD_TYPES = [
  // Text
  'text',
  'longText',
  'markdown',
  'code',
  // Numbers
  'number',
  'currency',
  'percentage',
  'scale',
  'slider',
  'progress',
  'counter',
  'rating',
  // Selection
  'choice',
  'radio',
  'multiSelect',
  'checkbox',
  'yesNoMaybe',
  'priority',
  'status',
  'tags',
  'checklist',
  // Date & time
  'date',
  'datetime',
  'time',
  // Visual
  'color',
  'flag',
  // Links
  'link',
  'alterLink',
  // Structure
  'group',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Short text',
  longText: 'Long text',
  markdown: 'Markdown',
  code: 'Code',
  number: 'Number',
  currency: 'Currency',
  percentage: 'Percentage',
  scale: 'Scale',
  slider: 'Slider',
  progress: 'Progress',
  counter: 'Counter',
  rating: 'Rating',
  choice: 'Dropdown',
  radio: 'Radio',
  multiSelect: 'Multi-select',
  checkbox: 'Checkbox',
  yesNoMaybe: 'Yes / No / Maybe',
  priority: 'Priority',
  status: 'Status',
  tags: 'Tags',
  checklist: 'Checklist',
  date: 'Date',
  datetime: 'Date & time',
  time: 'Time',
  color: 'Colour',
  flag: 'Flag',
  link: 'Link',
  alterLink: 'Member link',
  group: 'Section header',
};

export type CustomFieldCategory = 'Text' | 'Numbers' | 'Selection' | 'Date & time' | 'Visual' | 'Links' | 'Structure';

export const CUSTOM_FIELD_TYPE_CATEGORIES: Record<CustomFieldType, CustomFieldCategory> = {
  text: 'Text',
  longText: 'Text',
  markdown: 'Text',
  code: 'Text',
  number: 'Numbers',
  currency: 'Numbers',
  percentage: 'Numbers',
  scale: 'Numbers',
  slider: 'Numbers',
  progress: 'Numbers',
  counter: 'Numbers',
  rating: 'Numbers',
  choice: 'Selection',
  radio: 'Selection',
  multiSelect: 'Selection',
  checkbox: 'Selection',
  yesNoMaybe: 'Selection',
  priority: 'Selection',
  status: 'Selection',
  tags: 'Selection',
  checklist: 'Selection',
  date: 'Date & time',
  datetime: 'Date & time',
  time: 'Date & time',
  color: 'Visual',
  flag: 'Visual',
  link: 'Links',
  alterLink: 'Links',
  group: 'Structure',
};

/** Every icon here already exists in the app's own set — nothing new to draw. */
export const CUSTOM_FIELD_TYPE_ICONS: Record<CustomFieldType, string> = {
  text: 'edit',
  longText: 'note',
  markdown: 'story',
  code: 'template',
  number: 'stats',
  currency: 'finance',
  percentage: 'stats',
  scale: 'sort',
  slider: 'filter',
  progress: 'summary',
  counter: 'plus',
  rating: 'star',
  choice: 'list',
  radio: 'check',
  multiSelect: 'grid',
  checkbox: 'check',
  yesNoMaybe: 'help',
  priority: 'warning',
  status: 'info',
  tags: 'tag',
  checklist: 'list',
  date: 'calendar',
  datetime: 'calendar',
  time: 'clock',
  color: 'sparkle',
  flag: 'flag',
  link: 'link',
  alterLink: 'member',
  group: 'folder',
};

/** Types whose per-member value is a JSON-encoded array rather than a plain string. */
export const CUSTOM_FIELD_LIST_TYPES: readonly CustomFieldType[] = ['multiSelect', 'checklist'];

/** Types with a system-wide preset list of choices, editable where the definition is managed. */
export const CUSTOM_FIELD_CHOICE_TYPES: readonly CustomFieldType[] = [
  'choice',
  'radio',
  'multiSelect',
  'priority',
  'status',
  'checklist',
];

/** Types with a numeric min/max worth configuring on the definition. */
export const CUSTOM_FIELD_BOUNDED_TYPES: readonly CustomFieldType[] = ['rating', 'scale', 'slider', 'progress', 'percentage'];

export type CustomFieldDisplay = 'inline' | 'badge' | 'stat' | 'progress';

export interface CustomFieldOption {
  id: string;
  label: string;
  /** Unset renders as a plain chip; only status-like types need this to earn their name. */
  color?: string;
}

export function newCustomFieldOption(label = ''): CustomFieldOption {
  return { id: newId('opt'), label };
}

const PRIORITY_DEFAULTS: readonly [string, string][] = [
  ['Low', '#6b7fa8'],
  ['Medium', '#7aa2f7'],
  ['High', '#f0a05a'],
  ['Urgent', '#e06c93'],
];

const STATUS_DEFAULTS: readonly [string, string][] = [
  ['Not started', '#6b7fa8'],
  ['In progress', '#7aa2f7'],
  ['Done', '#5ec6a8'],
];

/** Priority and status earn their name from a sensible starting palette; every other choice type starts blank. */
export function defaultOptionsFor(type: CustomFieldType): CustomFieldOption[] | undefined {
  if (type === 'priority') return PRIORITY_DEFAULTS.map(([label, color]) => ({ id: newId('opt'), label, color }));
  if (type === 'status') return STATUS_DEFAULTS.map(([label, color]) => ({ id: newId('opt'), label, color }));
  if (CUSTOM_FIELD_CHOICE_TYPES.includes(type)) return [];
  return undefined;
}

/** A sensible starting range for the types that use one, so the definition works the moment it's added. */
export function defaultBoundsFor(type: CustomFieldType): { min?: number; max?: number } {
  switch (type) {
    case 'rating':
      return { min: 1, max: 5 };
    case 'scale':
      return { min: 1, max: 10 };
    case 'slider':
    case 'progress':
    case 'percentage':
      return { min: 0, max: 100 };
    default:
      return {};
  }
}

/**
 * The create payload for a new shared definition — everything but the id,
 * which the record store assigns.
 */
export function newCustomFieldDefinitionInput(type: CustomFieldType, sortOrder: number): Record<string, unknown> {
  return {
    label: type === 'group' ? 'Section' : 'New field',
    type,
    options: defaultOptionsFor(type),
    ...defaultBoundsFor(type),
    sortOrder,
  };
}

export function customFieldOptions(raw: unknown): CustomFieldOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry['id'] === 'string' ? entry['id'] : newId('opt'),
      label: typeof entry['label'] === 'string' ? entry['label'] : '',
      ...(typeof entry['color'] === 'string' ? { color: entry['color'] } : {}),
    }));
}

/** A field's stored value, parsed as a list — for `multiSelect`/`checklist`. */
export function parseListValue(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

// ── Per-member values ────────────────────────────────────────────────────────

export interface CustomFieldValueEntry {
  definitionId: string;
  /** Always a string; list-shaped types hold a JSON array of strings. */
  value: string;
}

export function isCustomFieldValueArray(value: unknown): value is CustomFieldValueEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>)['definitionId'] === 'string',
    )
  );
}

export function customFieldValues(value: unknown): CustomFieldValueEntry[] {
  return isCustomFieldValueArray(value) ? value : [];
}

export function valueForDefinition(definitionId: string, values: CustomFieldValueEntry[]): string {
  return values.find((entry) => entry.definitionId === definitionId)?.value ?? '';
}

/** Replaces (or drops, if blank) one definition's entry, leaving the rest untouched. */
export function withDefinitionValue(
  values: CustomFieldValueEntry[],
  definitionId: string,
  value: string,
): CustomFieldValueEntry[] {
  const rest = values.filter((entry) => entry.definitionId !== definitionId);
  return value === '' ? rest : [...rest, { definitionId, value }];
}

// ── Legacy per-member fields ─────────────────────────────────────────────────
//
// Before definitions were shared, a member's `customFields` held its own
// type, options and value all together. Kept here only so existing data
// still reads correctly and the one-time migration has something to read
// from — nothing writes this shape any more.

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  value: string;
  group?: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  display?: CustomFieldDisplay;
}

export function isCustomFieldArray(value: unknown): value is CustomFieldDef[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>)['id'] === 'string' &&
        typeof (entry as Record<string, unknown>)['type'] === 'string',
    )
  );
}

/**
 * A profile's `customFields` might still be the very first, flat `{label:
 * value}` shape, from before it was even a typed list. Reading it through
 * here means nothing already stored ever needed a forced migration: it
 * upgrades in memory, on read.
 */
export function upgradeLegacyCustomFields(value: unknown): CustomFieldDef[] {
  if (isCustomFieldArray(value)) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([label, raw]) => ({
    id: newId('cf'),
    label,
    type: 'text' as const,
    value: typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : JSON.stringify(raw),
  }));
}

/** @deprecated Use `parseListValue(field.value)` — kept for the migration path. */
export function customFieldListValue(field: CustomFieldDef): string[] {
  return parseListValue(field.value);
}
