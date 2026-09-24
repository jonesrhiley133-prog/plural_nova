/**
 * Field and collection metadata.
 *
 * This is the single description of PluralNova's data. It is read by:
 *   • the server, to generate SQLite DDL, migrations, validation and CRUD routes
 *   • the backup service, to enumerate and version every table
 *   • the client, to build forms, list views, filters, search and the local store
 *
 * Adding a field here adds it everywhere. Nothing about a collection is written
 * twice, which is the only way a surface this wide stays consistent.
 */

export const FIELD_KINDS = [
  'text',
  'longtext',
  'int',
  'real',
  'bool',
  'date',
  'time',
  'datetime',
  'enum',
  'json',
  'tags',
  'ref',
  'refs',
  'color',
  'url',
  'image',
  'duration',
  'money',
  'phone',
  'email',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldOption {
  value: string;
  label: string;
  /** Status colours always accompany a label or icon — colour alone never carries meaning. */
  color?: string;
  icon?: string;
}

export interface FieldDef {
  name: string;
  kind: FieldKind;
  label: string;
  /** Short help shown under the input. Explains intent, not mechanics. */
  hint?: string;
  required?: boolean;
  /** `enum` only. */
  options?: readonly FieldOption[];
  /** `ref`/`refs` only — the collection being pointed at. */
  ref?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  /** `int` only — a tappable star rating instead of a number field. */
  stars?: boolean;
  /** Rendered in compact list rows. */
  inList?: boolean;
  /** Included in global search. */
  searchable?: boolean;
  /** Form section heading. */
  group?: string;
  /**
   * Never sent to another account.
   *
   * Enforced server-side by `shareableView`, which strips these before a
   * record is projected to anybody who does not own it. That is the backstop:
   * the projections that matter are allowlists naming each field they emit,
   * which is the stronger pattern and stays the first line. This flag is what
   * catches a field added to a collection later, by somebody who does not know
   * which projections will end up carrying it.
   */
  sensitive?: boolean;
  placeholder?: string;
}

export interface CollectionDef {
  /** camelCase plural; also the SQLite table name and the API path segment. */
  name: string;
  label: string;
  singular: string;
  icon: string;
  /** Which navigation category owns the collection. */
  area: 'system' | 'life' | 'social' | 'creative' | 'work' | 'data';
  /** `system` rows belong to a system; `user` rows belong to the account. */
  scope: 'system' | 'user';
  fields: readonly FieldDef[];
  titleField: string;
  subtitleField?: string;
  /** Default ordering for list endpoints. */
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** Whether `memberId` is meaningful for this collection. */
  memberScoped?: boolean;
  /** Hidden entirely while the account is in Singlet Mode. */
  systemOnly?: boolean;
  /** Requires an unlocked vault session to read or write. */
  vault?: boolean;
  /** Never leaves the account, even via a shared profile or a notification preview. */
  neverPublic?: boolean;
  indexes?: readonly (readonly string[])[];
  /** Included in full backups. Defaults to true. */
  backup?: boolean;
  /**
   * Owned by a dedicated router rather than the generic CRUD layer. The table is
   * still generated, backed up and synced; only the open write endpoints are
   * withheld, because these rows cross account boundaries and their rules live
   * in code, not in a scope filter.
   */
  serverManaged?: boolean;
  /** Emits a system-history entry on create/update/delete. */
  audited?: boolean;
  description?: string;
}

export function fieldMap(collection: CollectionDef): Map<string, FieldDef> {
  return new Map(collection.fields.map((f) => [f.name, f]));
}

export function searchableFields(collection: CollectionDef): FieldDef[] {
  return collection.fields.filter((f) => f.searchable);
}

export function listFields(collection: CollectionDef): FieldDef[] {
  return collection.fields.filter((f) => f.inList);
}

/** Shorthand builders keep the registry readable — the noise is in here, not in the data. */
export const f = {
  text: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'text',
    label,
    maxLength: 400,
    ...extra,
  }),
  long: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'longtext',
    label,
    maxLength: 120_000,
    ...extra,
  }),
  int: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'int',
    label,
    ...extra,
  }),
  real: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'real',
    label,
    ...extra,
  }),
  bool: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'bool',
    label,
    defaultValue: false,
    ...extra,
  }),
  date: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'date',
    label,
    ...extra,
  }),
  datetime: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'datetime',
    label,
    ...extra,
  }),
  time: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'time',
    label,
    ...extra,
  }),
  enumOf: (
    name: string,
    label: string,
    options: readonly FieldOption[],
    extra: Partial<FieldDef> = {},
  ): FieldDef => ({ name, kind: 'enum', label, options, ...extra }),
  json: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'json',
    label,
    defaultValue: null,
    ...extra,
  }),
  tags: (name = 'tags', label = 'Tags', extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'tags',
    label,
    defaultValue: [],
    searchable: true,
    ...extra,
  }),
  ref: (name: string, label: string, ref: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'ref',
    label,
    ref,
    ...extra,
  }),
  refs: (name: string, label: string, ref: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'refs',
    label,
    ref,
    defaultValue: [],
    ...extra,
  }),
  color: (name = 'color', label = 'Colour', extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'color',
    label,
    ...extra,
  }),
  url: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'url',
    label,
    maxLength: 2000,
    ...extra,
  }),
  image: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'image',
    label,
    ...extra,
  }),
  money: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'money',
    label,
    ...extra,
  }),
  duration: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'duration',
    label,
    hint: 'Minutes',
    ...extra,
  }),
  phone: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'phone',
    label,
    maxLength: 40,
    ...extra,
  }),
  email: (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
    name,
    kind: 'email',
    label,
    maxLength: 200,
    ...extra,
  }),
} as const;

/** Options reused across several collections. */
export const OPTIONS = {
  priority: [
    { value: 'low', label: 'Low', color: '#6b7fa8', icon: '↓' },
    { value: 'normal', label: 'Normal', color: '#7aa2f7', icon: '–' },
    { value: 'high', label: 'High', color: '#f0a05a', icon: '↑' },
    { value: 'urgent', label: 'Urgent', color: '#e06c93', icon: '!!' },
  ],
  intensity: [
    { value: '1', label: 'Barely there' },
    { value: '2', label: 'Mild' },
    { value: '3', label: 'Moderate' },
    { value: '4', label: 'Strong' },
    { value: '5', label: 'Overwhelming' },
  ],
  safety: [
    { value: 'safe', label: 'Safe', color: '#5ec6a8', icon: '✓' },
    { value: 'caution', label: 'Caution', color: '#f0a05a', icon: '!' },
    { value: 'unsafe', label: 'Unsafe', color: '#e06c93', icon: '✕' },
    { value: 'unset', label: 'Not categorised', color: '#6b7fa8', icon: '–' },
  ],
  readingStatus: [
    { value: 'queued', label: 'Reading queue' },
    { value: 'reading', label: 'Currently reading' },
    { value: 'completed', label: 'Completed' },
    { value: 'paused', label: 'Paused' },
    { value: 'abandoned', label: 'Abandoned' },
  ],
} as const;
