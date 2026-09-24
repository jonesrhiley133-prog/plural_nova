import { newId } from './ids.js';

/**
 * Typed custom fields.
 *
 * A member's `customFields` used to be a flat, unlabelled blob — useful only
 * to whatever wrote it, since nothing in the app could edit or render it as
 * more than a line of text. This gives each field a type, so a rating looks
 * like a rating and a colour looks like a swatch, and an optional group, so a
 * profile with many of them reads as sections rather than a wall of rows.
 */

export const CUSTOM_FIELD_TYPES = [
  'text',
  'longText',
  'number',
  'date',
  'choice',
  'multiSelect',
  'checkbox',
  'rating',
  'color',
  'link',
  'currency',
  'percentage',
  'tags',
  'group',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Short text',
  longText: 'Long text',
  number: 'Number',
  date: 'Date',
  choice: 'Choice — pick one',
  multiSelect: 'Choice — pick several',
  checkbox: 'Yes / no',
  rating: 'Rating',
  color: 'Colour',
  link: 'Link',
  currency: 'Currency amount',
  percentage: 'Percentage',
  tags: 'Tags',
  group: 'Section header',
};

/** Types whose `value` is a JSON-encoded array rather than a plain string. */
export const CUSTOM_FIELD_LIST_TYPES: readonly CustomFieldType[] = ['multiSelect', 'tags'];

export type CustomFieldDisplay = 'inline' | 'badge' | 'stat' | 'progress';

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Always a string; `multiSelect`/`tags` hold a JSON array of strings. */
  value: string;
  /** Fields sharing a group render together under that heading. */
  group?: string;
  /** Preset choices for `choice`/`multiSelect`. */
  options?: string[];
  /** Bounds for `rating`/`percentage`. */
  min?: number;
  max?: number;
  /** Unit label for `number` (kg, cm, pts…). */
  unit?: string;
  display?: CustomFieldDisplay;
}

export function newCustomField(type: CustomFieldType): CustomFieldDef {
  return {
    id: newId('cf'),
    label: type === 'group' ? 'Section' : 'New field',
    type,
    value: '',
    ...(type === 'choice' || type === 'multiSelect' ? { options: [] } : {}),
    ...(type === 'rating' ? { min: 1, max: 5 } : {}),
    ...(type === 'percentage' ? { min: 0, max: 100 } : {}),
  };
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
 * A profile's `customFields` might still be the old flat `{label: value}`
 * shape — from before this existed, or from an importer that never learned
 * the new one. Reading it through here means nothing already stored needs a
 * migration: it upgrades in memory, and saving from the editor writes it back
 * in the new shape without the account ever losing a value.
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

export function customFieldListValue(field: CustomFieldDef): string[] {
  if (!field.value) return [];
  try {
    const parsed: unknown = JSON.parse(field.value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}
