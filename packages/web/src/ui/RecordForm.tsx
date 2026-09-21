import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  requireCollection,
  validateRecord,
  VISIBILITY_LEVELS,
  type CollectionDef,
  type FieldDef,
  type StoredRecord,
  type Visibility,
} from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useSettings, useSystemMode, useActiveMemberId } from '../core/auth.js';
import {
  ColorField,
  DateTimeField,
  NumberField,
  ReferenceField,
  SelectField,
  SwitchRow,
  TagField,
  TextField,
} from './forms.js';
import { Button } from './primitives.js';

/**
 * A form built from the collection registry.
 *
 * Every field's type, label, hint, options and validation already exist in one
 * place, so the form is derived rather than written out again per module. A
 * field added to a collection appears here without anything else changing,
 * and the client validates with exactly the rules the server will apply.
 *
 * Modules that need something more particular — the emotion picker, the
 * headspace canvas — build their own; this covers the many that do not.
 */

export interface RecordFormProps {
  collection: string;
  record?: StoredRecord | null;
  /** Values applied to a new record, e.g. today's date or the open folder. */
  initial?: Record<string, unknown>;
  /** Fields to show, in order. Defaults to everything the registry declares. */
  fields?: string[];
  /** Fields to leave out of the default set. */
  omit?: string[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  /** Renders without the footer, for a parent that supplies its own. */
  bare?: boolean;
  formId?: string;
}

function visibleFields(definition: CollectionDef, props: RecordFormProps): FieldDef[] {
  const byName = new Map(definition.fields.map((field) => [field.name, field]));
  if (props.fields) {
    return props.fields.map((name) => byName.get(name)).filter((field): field is FieldDef => Boolean(field));
  }
  const omit = new Set(props.omit ?? []);
  return definition.fields.filter(
    (field) =>
      !omit.has(field.name) &&
      // Hashes and derived counters are stored, not typed in.
      !['pinHash', 'frontCount', 'frontMinutes', 'lastFrontedAt', 'version'].includes(field.name),
  );
}

function initialValues(
  definition: CollectionDef,
  fields: FieldDef[],
  record: StoredRecord | null | undefined,
  initial: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const existing = record?.[field.name];
    if (existing !== undefined && existing !== null) {
      values[field.name] = existing;
    } else if (initial && field.name in initial) {
      values[field.name] = initial[field.name];
    } else if (field.defaultValue !== undefined && field.defaultValue !== null) {
      values[field.name] = field.defaultValue;
    } else {
      values[field.name] = field.kind === 'tags' || field.kind === 'refs' ? [] : '';
    }
  }
  void definition;
  return values;
}

export function RecordForm(props: RecordFormProps): JSX.Element {
  const definition = requireCollection(props.collection);
  const fields = useMemo(() => visibleFields(definition, props), [definition, props]);
  const { t, term } = useI18n();
  const settings = useSettings();
  const systemMode = useSystemMode();
  const activeMemberId = useActiveMemberId();

  const [values, setValues] = useState(() =>
    initialValues(definition, fields, props.record, props.initial),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reopening the form on a different record loads that record rather than
  // keeping whatever was half-typed for the previous one.
  useEffect(() => {
    setValues(initialValues(definition, fields, props.record, props.initial));
    setErrors({});
    setSubmitError(null);
  }, [props.record?.id, definition.name]);

  const set = useCallback((name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const submit = useCallback(async () => {
    const result = validateRecord(definition, values, { partial: Boolean(props.record) });
    if (!result.ok) {
      setErrors(result.errors);
      const firstField = Object.keys(result.errors)[0];
      document.getElementById(`field-${firstField}`)?.scrollIntoView({ block: 'center' });
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      if (!props.record) {
        payload['visibility'] =
          values['visibility'] ??
          (definition.neverPublic ? 'private' : settings.privacy.defaultVisibility);
        if (definition.memberScoped && !payload['memberId'] && activeMemberId) {
          payload['memberId'] = activeMemberId;
        }
      }
      await props.onSubmit(payload);
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      setSubmitError(
        error instanceof Error ? error.message : 'That could not be saved. Nothing was changed.',
      );
    } finally {
      setSaving(false);
    }
  }, [definition, values, props, settings.privacy.defaultVisibility, activeMemberId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, FieldDef[]>();
    for (const field of fields) {
      const key = field.group ?? '';
      const bucket = groups.get(key);
      if (bucket) bucket.push(field);
      else groups.set(key, [field]);
    }
    return [...groups.entries()];
  }, [fields]);

  return (
    <form
      id={props.formId}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
    >
      {grouped.map(([group, groupFields]) => (
        <fieldset key={group || 'main'} style={{ border: 'none', padding: 0, margin: 0 }}>
          {group ? (
            <legend className="section-heading__label" style={{ marginBottom: 'var(--space-3)' }}>
              {group}
            </legend>
          ) : null}
          {groupFields.map((field) => (
            <div key={field.name} id={`field-${field.name}`}>
              <RecordField
                collection={props.collection}
                field={field}
                value={values[field.name]}
                error={errors[field.name]}
                onChange={(value) => set(field.name, value)}
              />
            </div>
          ))}
        </fieldset>
      ))}

      {systemMode && definition.memberScoped ? (
        <MemberPicker
          value={(values['memberId'] as string) ?? null}
          onChange={(value) => set('memberId', value)}
        />
      ) : null}

      {!definition.neverPublic ? (
        <SelectField
          label="Who can see this"
          value={(values['visibility'] as string) || settings.privacy.defaultVisibility}
          options={VISIBILITY_LEVELS.map((level) => ({
            value: level,
            label: visibilityLabel(level, term),
          }))}
          onChange={(value) => set('visibility', value as Visibility)}
          hint="Private means only you. Nothing is shared unless you choose it."
        />
      ) : null}

      {submitError ? (
        <p className="field__error" role="alert">
          {submitError}
        </p>
      ) : null}

      {props.bare ? null : (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          {props.onCancel ? (
            <Button variant="ghost" onClick={props.onCancel} disabled={saving}>
              {t('action.cancel')}
            </Button>
          ) : null}
          <span className="spacer" />
          <Button variant="primary" type="submit" loading={saving}>
            {props.submitLabel ?? t('action.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

function visibilityLabel(level: Visibility, term: (text: string) => string): string {
  switch (level) {
    case 'private':
      return 'Only me';
    case 'system':
      return term('The whole {{system}}');
    case 'members':
      return term('Selected {{members}}');
    case 'friends':
      return 'Friends';
    case 'public':
      return 'Anyone';
  }
}

function MemberPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}): JSX.Element | null {
  const { items } = useCollection('members');
  const { term } = useI18n();
  if (items.length === 0) return null;

  return (
    <ReferenceField
      label={term('Which {{member}}?')}
      value={value}
      emptyLabel={term('The whole {{system}}')}
      options={items.map((member) => ({
        id: member.id,
        label: String(member['name'] ?? 'Unnamed'),
        color: (member['color'] as string) ?? null,
        icon: (member['icon'] as string) ?? null,
      }))}
      onChange={(next) => onChange(next as string | null)}
    />
  );
}

/** Renders one registry field with the control its kind calls for. */
export function RecordField({
  collection,
  field,
  value,
  error,
  onChange,
}: {
  collection: string;
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}): JSX.Element | null {
  const referenced = useCollection(field.ref ?? 'members', {
    enabled: field.kind === 'ref' || field.kind === 'refs',
  });

  const common = {
    label: field.label,
    ...(field.hint ? { hint: field.hint } : {}),
    ...(error ? { error } : {}),
    ...(field.required ? { required: true } : {}),
  };

  switch (field.kind) {
    case 'longtext':
      return (
        <TextField
          {...common}
          value={String(value ?? '')}
          onChange={onChange}
          multiline
          rows={field.name === 'body' ? 10 : 4}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          {...(field.maxLength ? { maxLength: field.maxLength } : {})}
        />
      );
    case 'int':
    case 'duration':
    case 'real':
    case 'money':
      return (
        <NumberField
          {...common}
          value={value === '' || value === null || value === undefined ? null : Number(value)}
          onChange={onChange}
          {...(field.min !== undefined ? { min: field.min } : {})}
          {...(field.max !== undefined ? { max: field.max } : {})}
          {...(field.kind === 'real' || field.kind === 'money' ? { step: 0.01 } : {})}
          {...(field.kind === 'duration' ? { suffix: 'minutes' } : {})}
        />
      );
    case 'bool':
      return (
        <SwitchRow
          label={field.label}
          {...(field.hint ? { hint: field.hint } : {})}
          checked={value === true || value === 1}
          onChange={onChange}
        />
      );
    case 'date':
      return (
        <DateTimeField
          {...common}
          value={value ? String(value) : null}
          onChange={onChange}
          dateOnly
        />
      );
    case 'datetime':
      return <DateTimeField {...common} value={value ? String(value) : null} onChange={onChange} />;
    case 'time':
      return <TextField {...common} type="time" value={String(value ?? '')} onChange={onChange} />;
    case 'enum':
      return (
        <SelectField
          {...common}
          value={String(value ?? '')}
          options={field.options ?? []}
          onChange={onChange}
        />
      );
    case 'tags':
      return (
        <TagField
          label={field.label}
          {...(field.hint ? { hint: field.hint } : {})}
          values={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );
    case 'color':
      return <ColorField {...common} value={String(value ?? '')} onChange={onChange} />;
    case 'url':
    case 'image':
      return (
        <TextField
          {...common}
          type="url"
          inputMode="url"
          value={String(value ?? '')}
          onChange={onChange}
          placeholder="https://…"
        />
      );
    case 'phone':
      return (
        <TextField
          {...common}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={String(value ?? '')}
          onChange={onChange}
        />
      );
    case 'email':
      return (
        <TextField
          {...common}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={String(value ?? '')}
          onChange={onChange}
        />
      );
    case 'ref':
      return (
        <ReferenceField
          label={field.label}
          {...(field.hint ? { hint: field.hint } : {})}
          value={value ? String(value) : null}
          options={referenced.items.map((item) => ({
            id: item.id,
            label: labelFor(item, field.ref ?? 'members'),
            color: (item['color'] as string) ?? null,
          }))}
          onChange={onChange}
          emptyLabel="Not set"
        />
      );
    case 'refs':
      return (
        <ReferenceField
          label={field.label}
          {...(field.hint ? { hint: field.hint } : {})}
          value={Array.isArray(value) ? (value as string[]) : []}
          multiple
          options={referenced.items.map((item) => ({
            id: item.id,
            label: labelFor(item, field.ref ?? 'members'),
            color: (item['color'] as string) ?? null,
          }))}
          onChange={onChange}
        />
      );
    case 'json':
      // Structured fields that have a purpose-built editor elsewhere are left
      // out of the generic form rather than shown as raw JSON.
      return null;
    default:
      void collection;
      return (
        <TextField
          {...common}
          value={String(value ?? '')}
          onChange={onChange}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          {...(field.maxLength ? { maxLength: field.maxLength } : {})}
        />
      );
  }
}

function labelFor(record: StoredRecord, collection: string): string {
  const definition = requireCollection(collection);
  return String(record[definition.titleField] ?? 'Untitled');
}
