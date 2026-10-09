import {
  customFieldValues,
  newId,
  parseListValue,
  upgradeLegacyCustomFields,
  valueForDefinition,
  withDefinitionValue,
  type CustomFieldDef,
  type CustomFieldType,
} from '@pluralnova/shared';
import { createRecord, listRecords, updateRecord, type Scope } from '../db/repository.js';

/**
 * The one-time move from per-member custom fields to shared ones.
 *
 * Before, a member's `customFields` held its own type, options and value
 * together — asking two members the same question meant building the same
 * field twice, and their option lists could drift apart. Now the field is
 * defined once, in `customFieldDefinitions`, and each member keeps only
 * their own answer, in `customFieldValues`.
 *
 * This never touches the legacy `customFields` column. Two members with a
 * field sharing a label and type are folded into the one definition their
 * combined options describe; a label reused with a different type gets a
 * definition of its own rather than losing one side's shape. Run again on an
 * account that already has definitions, it does nothing — that is the whole
 * idempotency story, not a flag to track separately.
 */

interface OptionBucket {
  definitionId: string;
  optionIdByLabel: Map<string, string>;
}

export interface MigrationResult {
  migrated: boolean;
  definitions: number;
  values: number;
}

export function migrateLegacyCustomFields(scope: Scope): MigrationResult {
  const already = listRecords('customFieldDefinitions', scope, { limit: 1 }).items;
  if (already.length > 0) return { migrated: false, definitions: 0, values: 0 };

  const members = listRecords('members', scope, { limit: 500 }).items;
  const withLegacyFields = members
    .map((member) => ({ member, fields: upgradeLegacyCustomFields(member['customFields']) }))
    .filter((entry) => entry.fields.some((field) => field.type !== 'group' && field.label.trim()));

  if (withLegacyFields.length === 0) return { migrated: false, definitions: 0, values: 0 };

  const buckets = new Map<string, OptionBucket>();
  let sortOrder = 0;
  let definitionCount = 0;
  let valueCount = 0;

  const bucketFor = (field: CustomFieldDef): OptionBucket => {
    const key = `${field.label.trim().toLowerCase()}::${field.type}`;
    const existing = buckets.get(key);
    if (existing) return existing;

    const optionIdByLabel = new Map<string, string>();
    for (const label of field.options ?? []) {
      if (!optionIdByLabel.has(label)) optionIdByLabel.set(label, newId('opt'));
    }
    const created = createRecord('customFieldDefinitions', scope, {
      label: field.label.trim(),
      type: field.type,
      ...(field.group ? { group: field.group } : {}),
      ...(field.options
        ? { options: [...optionIdByLabel.entries()].map(([label, id]) => ({ id, label })) }
        : {}),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.unit ? { unit: field.unit } : {}),
      sortOrder: sortOrder++,
    });
    const bucket: OptionBucket = { definitionId: created.id, optionIdByLabel };
    buckets.set(key, bucket);
    definitionCount += 1;
    return bucket;
  };

  /** A later member can offer an option the first one who defined this field never had. */
  const growOptions = (bucket: OptionBucket, labels: string[]): void => {
    const added = labels.filter((label) => !bucket.optionIdByLabel.has(label));
    if (added.length === 0) return;
    for (const label of added) bucket.optionIdByLabel.set(label, newId('opt'));
    updateRecord('customFieldDefinitions', scope, bucket.definitionId, {
      options: [...bucket.optionIdByLabel.entries()].map(([label, id]) => ({ id, label })),
    });
  };

  const isChoiceLike = (type: CustomFieldDef['type']): boolean => type === 'choice';
  const isMultiLike = (type: CustomFieldDef['type']): boolean => type === 'multiSelect';

  for (const { member, fields } of withLegacyFields) {
    const values = new Map<string, string>();

    for (const field of fields) {
      if (field.type === 'group' || !field.label.trim() || !field.value) continue;

      const bucket = bucketFor(field);
      if (isChoiceLike(field.type) || isMultiLike(field.type)) {
        const picked = isMultiLike(field.type) ? parseListValue(field.value) : [field.value];
        // Unions this member's own declared preset list too, not just what they
        // picked — otherwise an option nobody happened to choose never survives
        // past whichever member's field was folded into the definition first.
        growOptions(bucket, [...(field.options ?? []), ...picked]);
      }

      const value = isChoiceLike(field.type)
        ? (bucket.optionIdByLabel.get(field.value) ?? field.value)
        : isMultiLike(field.type)
          ? JSON.stringify(parseListValue(field.value).map((label) => bucket.optionIdByLabel.get(label) ?? label))
          : field.value;

      values.set(bucket.definitionId, value);
      valueCount += 1;
    }

    if (values.size > 0) {
      updateRecord(
        'members',
        scope,
        member.id,
        { customFieldValues: [...values.entries()].map(([definitionId, value]) => ({ definitionId, value })) },
        { trusted: true },
      );
    }
  }

  return { migrated: true, definitions: definitionCount, values: valueCount };
}

interface FieldMigrationSpec {
  memberField: string;
  label: string;
  type: CustomFieldType;
  group: string;
}

/**
 * Everything the alter editor used to render as its own field, beyond the
 * five kept as dedicated fields (name, pronouns, roles, source/"origin",
 * age) plus birthday (kept for the Calendar/Birthdays integration it already
 * powers). Grouped the same way the schema itself already grouped them —
 * this reuses that curation rather than re-deciding it.
 */
const MEMBER_FIELD_MIGRATIONS: FieldMigrationSpec[] = [
  { memberField: 'privateName', label: 'Private name', type: 'text', group: 'Identity' },
  { memberField: 'nicknames', label: 'Nicknames', type: 'tags', group: 'Identity' },
  { memberField: 'mentalAge', label: 'Mental age', type: 'text', group: 'Identity' },
  { memberField: 'physicalAge', label: 'Physical age', type: 'text', group: 'Identity' },
  { memberField: 'species', label: 'Species', type: 'text', group: 'Identity' },
  { memberField: 'gender', label: 'Gender', type: 'text', group: 'Identity' },
  { memberField: 'sexuality', label: 'Sexuality', type: 'text', group: 'Identity' },
  { memberField: 'nationality', label: 'Nationality', type: 'text', group: 'Identity' },
  { memberField: 'ethnicity', label: 'Ethnicity', type: 'text', group: 'Identity' },
  { memberField: 'race', label: 'Race', type: 'text', group: 'Identity' },
  { memberField: 'identityLabels', label: 'Identity labels', type: 'tags', group: 'Identity' },
  { memberField: 'chatPrefix', label: 'Chat prefix', type: 'text', group: 'Chat' },
  { memberField: 'bio', label: 'Biography', type: 'longText', group: 'About' },
  { memberField: 'tags', label: 'Tags', type: 'tags', group: 'About' },
  { memberField: 'notes', label: 'Notes', type: 'longText', group: 'About' },
  { memberField: 'boundaries', label: 'Boundaries', type: 'longText', group: 'About' },
  { memberField: 'comforts', label: 'Comforts', type: 'longText', group: 'About' },
  { memberField: 'triggers', label: 'Triggers', type: 'longText', group: 'About' },
  { memberField: 'lore', label: 'Lore', type: 'longText', group: 'About' },
  { memberField: 'likes', label: 'Likes', type: 'longText', group: 'Interests' },
  { memberField: 'dislikes', label: 'Dislikes', type: 'longText', group: 'Interests' },
  { memberField: 'interests', label: 'Interests', type: 'tags', group: 'Interests' },
  { memberField: 'hobbies', label: 'Hobbies', type: 'tags', group: 'Interests' },
  { memberField: 'personality', label: 'Personality', type: 'longText', group: 'Interests' },
];

function hasMigratableValue(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length > 0;
  return typeof raw === 'string' && raw.trim() !== '';
}

/**
 * Idempotent per field and per member, not behind one flag: a definition
 * already carrying one of these labels is reused rather than duplicated, and
 * a member who already has a value for that definition — whether from this
 * migration running before, or from answering it directly afterward through
 * the normal custom-fields editor — is never overwritten. Every field in
 * `MEMBER_FIELD_MIGRATIONS` gets its definition created regardless of
 * whether any existing member has a legacy value to carry forward — these
 * are meant to be the standing set of fields every profile can answer, not
 * just a vehicle for moving old data, so a brand-new system still gets a
 * Biography field to fill in. A blank one never clutters a *view*
 * (`FieldGroup` already hides a definition nobody has answered there); it
 * only shows up where editing happens, same as any other optional field.
 * The old columns on `members` are left exactly as they are; once the
 * editor stops rendering them there is nothing left to read them, so there
 * is nothing to keep in sync — the same place `cardStyle` already sits in
 * this schema.
 */
export function migrateMemberFieldsToCustomFields(scope: Scope): MigrationResult {
  const existingDefinitions = listRecords('customFieldDefinitions', scope, { limit: 500 }).items;
  const definitionIdByLabel = new Map(
    existingDefinitions.map((def) => [String(def['label']).trim().toLowerCase(), def.id]),
  );
  let sortOrder = existingDefinitions.length;
  let definitionCount = 0;
  let valueCount = 0;

  const members = listRecords('members', scope, { limit: 500 }).items;
  const valuesByMember = new Map(members.map((member) => [member.id, customFieldValues(member['customFieldValues'])]));

  for (const spec of MEMBER_FIELD_MIGRATIONS) {
    const key = spec.label.trim().toLowerCase();
    let definitionId = definitionIdByLabel.get(key);

    if (!definitionId) {
      const created = createRecord('customFieldDefinitions', scope, {
        label: spec.label,
        type: spec.type,
        group: spec.group,
        sortOrder: sortOrder++,
      });
      definitionId = created.id;
      definitionIdByLabel.set(key, definitionId);
      definitionCount += 1;
    }

    for (const member of members) {
      const raw = member[spec.memberField];
      if (!hasMigratableValue(raw)) continue;

      const current = valuesByMember.get(member.id) ?? [];
      if (valueForDefinition(definitionId, current) !== '') continue;

      const value = spec.type === 'tags' ? JSON.stringify(raw) : String(raw);
      valuesByMember.set(member.id, withDefinitionValue(current, definitionId, value));
      valueCount += 1;
    }
  }

  // One write per member who actually changed, not one per field copied.
  for (const member of members) {
    const next = valuesByMember.get(member.id);
    const original = customFieldValues(member['customFieldValues']);
    if (next && next.length !== original.length) {
      updateRecord('members', scope, member.id, { customFieldValues: next }, { trusted: true });
    }
  }

  return { migrated: definitionCount > 0 || valueCount > 0, definitions: definitionCount, values: valueCount };
}
