import { newId, parseListValue, upgradeLegacyCustomFields, type CustomFieldDef } from '@pluralnova/shared';
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
