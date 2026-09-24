import { useState, type ReactNode } from 'react';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  customFieldListValue,
  newCustomField,
  type CustomFieldDef,
  type CustomFieldType,
} from '@pluralnova/shared';
import { Button, Card, Chip, IconButton } from './primitives.js';
import { ColorField, DateTimeField, NumberField, SelectField, SwitchRow, TagField, TextField } from './forms.js';
import { useDialogHeaderActions } from './overlays.js';
import { Icon } from './Icon.js';

/**
 * Typed custom fields: a read-only view and the editor that produces the
 * array it renders. A field with a `group` clusters with its siblings under
 * that heading; a bare `type: 'group'` entry among the ungrouped fields is
 * just a divider, for anyone who wants a break in a long flat list without
 * naming a whole section.
 */

function formatFieldValue(field: CustomFieldDef): ReactNode {
  switch (field.type) {
    case 'checkbox':
      return field.value === 'true' ? 'Yes' : 'No';
    case 'rating':
      return `${field.value || 0} / ${field.max ?? 5}`;
    case 'percentage':
      return `${field.value}%`;
    case 'currency':
      return field.unit ? `${field.unit}${field.value}` : field.value;
    case 'number':
      return field.unit ? `${field.value} ${field.unit}` : field.value;
    case 'color':
      return (
        <span className="row row--nowrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: field.value,
              border: '1px solid var(--border)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {field.value}
        </span>
      );
    case 'link':
      return (
        <a href={field.value} target="_blank" rel="noreferrer noopener">
          {field.value}
        </a>
      );
    case 'tags':
    case 'multiSelect':
      return (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          {customFieldListValue(field).map((value) => (
            <Chip key={value}>{value}</Chip>
          ))}
        </span>
      );
    case 'longText':
      return <span style={{ whiteSpace: 'pre-wrap' }}>{field.value}</span>;
    default:
      return field.value;
  }
}

function hasValue(field: CustomFieldDef): boolean {
  if (field.type === 'group') return false;
  if (field.type === 'tags' || field.type === 'multiSelect') return customFieldListValue(field).length > 0;
  return field.value !== '' && field.value !== null && field.value !== undefined;
}

/** The same row shape as FieldList, but able to intersperse a group's own dividers. */
function FieldGroup({ fields }: { fields: CustomFieldDef[] }): JSX.Element {
  if (!fields.some(hasValue)) {
    return (
      <p className="small faint">Nothing filled in here. Every field is optional — a blank one is not a gap.</p>
    );
  }
  return (
    <dl className="stack stack--tight" style={{ margin: 0 }}>
      {fields.map((field) => {
        if (field.type === 'group') {
          return (
            <p key={field.id} className="section-heading__label" style={{ margin: 'var(--space-2) 0 0' }}>
              {field.label}
            </p>
          );
        }
        if (!hasValue(field)) return null;
        return (
          <div key={field.id} className="row row--between" style={{ alignItems: 'flex-start' }}>
            <dt className="small muted" style={{ minWidth: 120 }}>
              {field.label}
            </dt>
            <dd style={{ margin: 0, textAlign: 'right', flex: 1 }}>{formatFieldValue(field)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * `actions` is a place for the caller to put an Edit button in the main
 * card's header — the one shared card every profile has, whether or not
 * anything has been filled in yet. A named group only appears once there is
 * something in it to show.
 */
export function CustomFieldsView({
  fields,
  actions,
}: {
  fields: CustomFieldDef[];
  actions?: ReactNode;
}): JSX.Element {
  const ungrouped: CustomFieldDef[] = [];
  const groups = new Map<string, CustomFieldDef[]>();
  for (const field of fields) {
    if (field.group) {
      const bucket = groups.get(field.group);
      if (bucket) bucket.push(field);
      else groups.set(field.group, [field]);
    } else {
      ungrouped.push(field);
    }
  }

  return (
    <>
      <Card title="Custom fields" actions={actions}>
        {ungrouped.length > 0 ? (
          <FieldGroup fields={ungrouped} />
        ) : (
          <p className="small faint">No custom fields yet.</p>
        )}
      </Card>
      {[...groups.entries()].map(([name, groupFields]) => (
        <Card key={name} title={name}>
          <FieldGroup fields={groupFields} />
        </Card>
      ))}
    </>
  );
}

function retypedPatch(type: CustomFieldType): Partial<CustomFieldDef> {
  const fresh = newCustomField(type);
  return { type, value: '', options: fresh.options, min: fresh.min, max: fresh.max };
}

function FieldValueEditor({
  field,
  onChange,
}: {
  field: CustomFieldDef;
  onChange: (patch: Partial<CustomFieldDef>) => void;
}): JSX.Element | null {
  const numberValue = field.value === '' ? null : Number(field.value);
  const setNumber = (next: number | null): void => onChange({ value: next === null ? '' : String(next) });

  switch (field.type) {
    case 'group':
      return null;
    case 'text':
      return <TextField label="Value" value={field.value} onChange={(value) => onChange({ value })} />;
    case 'longText':
      return (
        <TextField label="Value" value={field.value} onChange={(value) => onChange({ value })} multiline rows={4} />
      );
    case 'number':
      return (
        <>
          <NumberField label="Value" value={numberValue} onChange={setNumber} />
          <TextField
            label="Unit"
            value={field.unit ?? ''}
            onChange={(unit) => onChange({ unit: unit || undefined })}
            hint="kg, cm, pts…"
          />
        </>
      );
    case 'currency':
      return (
        <>
          <NumberField label="Amount" value={numberValue} onChange={setNumber} step={0.01} />
          <TextField
            label="Currency symbol"
            value={field.unit ?? ''}
            onChange={(unit) => onChange({ unit: unit || undefined })}
            placeholder="$"
          />
        </>
      );
    case 'percentage':
      return <NumberField label="Value" value={numberValue} onChange={setNumber} min={field.min ?? 0} max={field.max ?? 100} />;
    case 'rating':
      return (
        <>
          <NumberField label="Value" value={numberValue} onChange={setNumber} min={field.min ?? 1} max={field.max ?? 5} />
          <div className="row">
            <NumberField label="Minimum" value={field.min ?? 1} onChange={(min) => onChange({ min: min ?? 1 })} />
            <NumberField label="Maximum" value={field.max ?? 5} onChange={(max) => onChange({ max: max ?? 5 })} />
          </div>
        </>
      );
    case 'date':
      return (
        <DateTimeField label="Value" value={field.value || null} onChange={(value) => onChange({ value: value ?? '' })} dateOnly />
      );
    case 'checkbox':
      return (
        <SwitchRow
          label={field.label || 'Value'}
          checked={field.value === 'true'}
          onChange={(checked) => onChange({ value: checked ? 'true' : 'false' })}
        />
      );
    case 'color':
      return <ColorField label="Value" value={field.value} onChange={(value) => onChange({ value })} />;
    case 'link':
      return (
        <TextField label="Value" type="url" value={field.value} onChange={(value) => onChange({ value })} placeholder="https://…" />
      );
    case 'tags':
      return (
        <TagField
          label="Values"
          values={customFieldListValue(field)}
          onChange={(values) => onChange({ value: JSON.stringify(values) })}
        />
      );
    case 'choice':
      return (
        <>
          <TagField
            label="Options"
            values={field.options ?? []}
            onChange={(options) => onChange({ options })}
            hint="Type an option and press enter to add it."
          />
          <SelectField
            label="Value"
            value={field.value}
            options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
            onChange={(value) => onChange({ value })}
            placeholder="Not set"
          />
        </>
      );
    case 'multiSelect':
      return (
        <>
          <TagField
            label="Options"
            values={field.options ?? []}
            onChange={(options) => onChange({ options })}
            hint="Type an option and press enter to add it."
          />
          <TagField
            label="Value"
            values={customFieldListValue(field)}
            onChange={(values) => onChange({ value: JSON.stringify(values) })}
            suggestions={field.options ?? []}
          />
        </>
      );
    default:
      return null;
  }
}

function CustomFieldRow({
  field,
  isOpen,
  canMoveUp,
  canMoveDown,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: {
  field: CustomFieldDef;
  isOpen: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<CustomFieldDef>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}): JSX.Element {
  return (
    <Card flush>
      <div className="row row--between" style={{ padding: 'var(--space-3)' }}>
        <button
          type="button"
          className="row disclosure-toggle"
          style={{ flex: 1, textAlign: 'left', minWidth: 0 }}
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={16} />
          <span className="truncate" style={{ minWidth: 0 }}>
            <strong>{field.label || 'Untitled field'}</strong>{' '}
            <span className="tiny faint">{CUSTOM_FIELD_TYPE_LABELS[field.type]}</span>
          </span>
        </button>
        <span className="row row--nowrap">
          <IconButton icon="chevronUp" label="Move up" size="sm" variant="ghost" disabled={!canMoveUp} onClick={() => onMove(-1)} />
          <IconButton icon="chevronDown" label="Move down" size="sm" variant="ghost" disabled={!canMoveDown} onClick={() => onMove(1)} />
          <IconButton icon="trash" label="Remove field" size="sm" variant="ghost" onClick={onRemove} />
        </span>
      </div>
      {isOpen ? (
        <div style={{ padding: '0 var(--space-3) var(--space-3)' }}>
          <TextField label="Label" value={field.label} onChange={(label) => onChange({ label })} autoFocus />
          <SelectField
            label="Type"
            value={field.type}
            options={CUSTOM_FIELD_TYPES.map((type) => ({ value: type, label: CUSTOM_FIELD_TYPE_LABELS[type] }))}
            onChange={(type) => onChange(retypedPatch(type as CustomFieldType))}
          />
          {field.type !== 'group' ? (
            <TextField
              label="Group"
              value={field.group ?? ''}
              onChange={(group) => onChange({ group: group || undefined })}
              hint="Fields with the same group appear together under that heading. Leave blank to keep it at the top."
            />
          ) : null}
          <FieldValueEditor field={field} onChange={onChange} />
        </div>
      ) : null}
    </Card>
  );
}

export function CustomFieldsEditor({
  value,
  onSave,
  onCancel,
}: {
  value: CustomFieldDef[];
  onSave: (next: CustomFieldDef[]) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [fields, setFields] = useState<CustomFieldDef[]>(value);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (id: string, changes: Partial<CustomFieldDef>): void => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...changes } : field)));
  };

  const remove = (id: string): void => {
    setFields((current) => current.filter((field) => field.id !== id));
    setOpenId((current) => (current === id ? null : current));
  };

  const move = (id: string, direction: -1 | 1): void => {
    setFields((current) => {
      const index = current.findIndex((field) => field.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  };

  const addField = (): void => {
    const field = newCustomField('text');
    setFields((current) => [...current, field]);
    setOpenId(field.id);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(fields.filter((field) => field.label.trim() !== ''));
    } finally {
      setSaving(false);
    }
  };

  const inDialogHeader = useDialogHeaderActions(
    <>
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
        Save
      </Button>
    </>,
  );

  return (
    <div className="stack">
      {fields.length === 0 ? (
        <p className="small faint">No custom fields yet. Add one to track anything the built-in fields don't.</p>
      ) : (
        <div className="stack stack--tight">
          {fields.map((field, index) => (
            <CustomFieldRow
              key={field.id}
              field={field}
              isOpen={openId === field.id}
              canMoveUp={index > 0}
              canMoveDown={index < fields.length - 1}
              onToggle={() => setOpenId((current) => (current === field.id ? null : field.id))}
              onChange={(changes) => patch(field.id, changes)}
              onRemove={() => remove(field.id)}
              onMove={(direction) => move(field.id, direction)}
            />
          ))}
        </div>
      )}
      <Button variant="ghost" icon="plus" onClick={addField}>
        Add field
      </Button>

      {inDialogHeader ? null : (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <span className="spacer" />
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
