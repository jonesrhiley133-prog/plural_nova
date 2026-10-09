import { useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { RecordForm } from './RecordForm.js';
import { TagField } from './forms.js';

/**
 * The alter editor's simplified standard field set: name, pronouns, roles,
 * origin and age, plus birthday and the non-text appearance/fronting
 * settings RecordForm already renders generically. Everything else that
 * used to be a standard text field now lives in Custom Fields, copied over
 * for existing members by the server-side migration
 * (`customFieldMigration.ts`'s `migrateMemberFieldsToCustomFields`) rather
 * than lost. Symbol (`icon`) is dropped outright rather than migrated — it
 * had no picker and nothing else reads it. `roles`/`source` are listed here
 * too even though RecordForm already renders no control for a `tags`-kind
 * field; it's explicit so this array reads as the complete picture of what
 * the standard editor leaves out. The deeper astrology inputs (birth time,
 * place, latitude/longitude, UTC offset) stay out of this simplified form
 * entirely — Astro's own "Add birth details" dialog is where those belong;
 * this editor only ever needs the birthday itself, which Astro already
 * reads straight from this same record.
 */
export const MEMBER_EDITOR_OMIT_FIELDS = [
  'frontStatus',
  'customStatus',
  'isDormant',
  'archived',
  'privacy',
  'preferences',
  'icon',
  'roles',
  'source',
  'birthTime',
  'birthPlace',
  'birthLatitude',
  'birthLongitude',
  'birthUtcOffset',
  'privateName',
  'nicknames',
  'mentalAge',
  'physicalAge',
  'species',
  'gender',
  'sexuality',
  'nationality',
  'ethnicity',
  'race',
  'identityLabels',
  'chatPrefix',
  'bio',
  'tags',
  'notes',
  'boundaries',
  'comforts',
  'triggers',
  'lore',
  'likes',
  'dislikes',
  'interests',
  'hobbies',
  'personality',
];

/**
 * `RecordForm` for `members`, with `roles` composed alongside it the same
 * way School Life's `GradeCategoriesEditor` sits next to its own
 * `RecordForm` — a sibling for a field the generic renderer skips, merged
 * into the payload on submit rather than replacing it. Used by both the
 * quick "new member" dialog and the full profile editor, so the standard
 * editor is one definition instead of two that can quietly drift apart.
 */
export function MemberEditorForm({
  member,
  initial,
  onSubmit,
  onCancel,
}: {
  member: StoredRecord | null;
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [roles, setRoles] = useState<string[]>(() =>
    Array.isArray(member?.['roles']) ? (member!['roles'] as string[]) : [],
  );
  const [origin, setOrigin] = useState<string[]>(() =>
    Array.isArray(member?.['source']) ? (member!['source'] as string[]) : [],
  );
  const color = (member?.['color'] as string) || (initial?.['color'] as string) || null;

  return (
    <>
      <RecordForm
        collection="members"
        record={member}
        {...(initial ? { initial } : {})}
        omit={MEMBER_EDITOR_OMIT_FIELDS}
        onSubmit={(values) => onSubmit({ ...values, roles, source: origin })}
        onCancel={onCancel}
      />
      <TagField label="Roles" values={roles} onChange={setRoles} chipColor={color} />
      <TagField
        label="Origin"
        values={origin}
        onChange={setOrigin}
        chipColor="var(--info)"
        hint="Only if this concept applies to them."
      />
    </>
  );
}
