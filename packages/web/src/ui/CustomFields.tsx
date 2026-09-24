import { useState, type ReactNode } from 'react';
import {
  customFieldOptions,
  newCustomFieldOption,
  parseListValue,
  valueForDefinition,
  withDefinitionValue,
  type CustomFieldOption,
  type CustomFieldType,
  type CustomFieldValueEntry,
} from '@pluralnova/shared';
import type { StoredRecord } from '@pluralnova/shared';
import { Avatar, Button, Card, Chip, IconButton, Status } from './primitives.js';
import {
  ColorField,
  DateTimeField,
  Field,
  NumberField,
  ReferenceField,
  StarField,
  SwitchRow,
  TagField,
  TextField,
} from './forms.js';
import { useDialogHeaderActions } from './overlays.js';
import { Icon } from './Icon.js';

/**
 * Typed custom fields, shared across the whole system.
 *
 * A field is defined once — its label, type and, for a choice-shaped type,
 * its preset options — in `customFieldDefinitions`. Each member keeps only
 * their own answer against those shared definitions. This file has the
 * pieces that read and write one member's answers; the definitions
 * themselves are managed from CustomFieldDefinitions.tsx, which reuses
 * `DefinitionConfigEditor` below for the type-specific setup (options,
 * bounds, unit) that both screens need.
 */

function definitionOptions(definition: StoredRecord): CustomFieldOption[] {
  return customFieldOptions(definition['options']);
}

function typeOf(definition: StoredRecord): CustomFieldType {
  return definition['type'] as CustomFieldType;
}

function labelForOption(options: CustomFieldOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

function colorForOption(options: CustomFieldOption[], id: string): string | undefined {
  return options.find((option) => option.id === id)?.color;
}

/** A small, deliberately incomplete subset — bold, italic, code and line breaks. Enough to be worth calling markdown, not a commitment to CommonMark. */
function renderMarkdown(text: string): ReactNode {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
  // eslint-disable-next-line react/no-danger -- built from four fixed, escaped patterns above, not arbitrary HTML.
  return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
}

// ── Read-only rendering ───────────────────────────────────────────────────────

function hasValue(type: CustomFieldType, value: string): boolean {
  if (type === 'group') return false;
  if (type === 'multiSelect' || type === 'checklist' || type === 'tags') return parseListValue(value).length > 0;
  return value !== '';
}

function formatValue(definition: StoredRecord, value: string, members: StoredRecord[]): ReactNode {
  const type = typeOf(definition);
  const options = definitionOptions(definition);

  switch (type) {
    case 'checkbox':
    case 'flag':
      return value === 'true' ? 'Yes' : 'No';
    case 'yesNoMaybe':
      return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Maybe';
    case 'rating':
      return `${value || 0} / ${definition['max'] ?? 5}`;
    case 'scale':
      return `${value || definition['min'] || 0} / ${definition['max'] ?? 10}`;
    case 'progress':
      return (
        <span className="row row--nowrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ width: 60 }}>
            <div className="meter" role="presentation">
              <div className="meter__fill" style={{ width: `${Math.min(100, Number(value) || 0)}%` }} />
            </div>
          </span>
          {value || 0}%
        </span>
      );
    case 'slider':
      return `${value || definition['min'] || 0}${definition['unit'] ? ` ${definition['unit']}` : ''} / ${definition['max'] ?? 100}`;
    case 'percentage':
      return `${value}%`;
    case 'currency':
      return definition['unit'] ? `${definition['unit']}${value}` : value;
    case 'counter':
    case 'number':
      return definition['unit'] ? `${value} ${definition['unit']}` : value;
    case 'color':
      return (
        <span className="row row--nowrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: value,
              border: '1px solid var(--border)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {value}
        </span>
      );
    case 'link':
      return (
        <a href={value} target="_blank" rel="noreferrer noopener">
          {value}
        </a>
      );
    case 'alterLink': {
      const member = members.find((candidate) => candidate.id === value);
      return member ? (
        <span className="row row--nowrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Avatar
            name={String(member['name'])}
            src={(member['avatarUrl'] as string) ?? null}
            color={(member['color'] as string) ?? null}
            size={20}
            round
          />
          {String(member['name'])}
        </span>
      ) : (
        <span className="faint">Someone no longer in the roster</span>
      );
    }
    case 'choice':
    case 'radio': {
      const color = colorForOption(options, value);
      return color ? <Status label={labelForOption(options, value)} color={color} /> : labelForOption(options, value);
    }
    case 'priority':
    case 'status': {
      const option = options.find((candidate) => candidate.id === value);
      return <Status label={option?.label ?? value} color={option?.color} glyph="●" />;
    }
    case 'multiSelect':
      return (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          {parseListValue(value).map((id) => (
            <Chip key={id} color={colorForOption(options, id) ?? null}>
              {labelForOption(options, id)}
            </Chip>
          ))}
        </span>
      );
    case 'tags':
      return (
        <span className="row" style={{ justifyContent: 'flex-end' }}>
          {parseListValue(value).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </span>
      );
    case 'checklist': {
      const checked = new Set(parseListValue(value));
      return (
        <span className="small">
          {checked.size} of {options.length} done
        </span>
      );
    }
    case 'markdown':
      return <span style={{ whiteSpace: 'pre-wrap' }}>{renderMarkdown(value)}</span>;
    case 'code':
      return (
        <code className="tiny" style={{ fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap' }}>
          {value}
        </code>
      );
    case 'longText':
      return <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>;
    case 'date':
      return value ? new Date(value).toLocaleDateString() : value;
    case 'datetime':
      return value ? new Date(value).toLocaleString() : value;
    default:
      return value;
  }
}

/** The same row shape whether the fields fall under a heading or not. */
function FieldGroup({
  definitions,
  values,
  members,
}: {
  definitions: StoredRecord[];
  values: CustomFieldValueEntry[];
  members: StoredRecord[];
}): JSX.Element {
  const filled = definitions.filter((definition) => hasValue(typeOf(definition), valueForDefinition(definition.id, values)));
  if (filled.length === 0) {
    return (
      <p className="small faint">Nothing filled in here. Every field is optional — a blank one is not a gap.</p>
    );
  }
  return (
    <dl className="stack stack--tight" style={{ margin: 0 }}>
      {filled.map((definition) => (
        <div key={definition.id} className="row row--between" style={{ alignItems: 'flex-start' }}>
          <dt className="small muted" style={{ minWidth: 120 }}>
            {String(definition['label'])}
          </dt>
          <dd style={{ margin: 0, textAlign: 'right', flex: 1 }}>
            {formatValue(definition, valueForDefinition(definition.id, values), members)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * `actions` is a place for the caller to put an Edit button in the main
 * card's header. A named group only appears once there is something in it
 * to show, and a definition with no answer for this member never appears at
 * all — the point of sharing definitions is not to turn every profile into
 * a form full of blanks for whatever the rest of the system fills in.
 */
export function MemberCustomFieldsView({
  definitions,
  values,
  members = [],
  actions,
}: {
  definitions: StoredRecord[];
  values: CustomFieldValueEntry[];
  members?: StoredRecord[];
  actions?: ReactNode;
}): JSX.Element {
  const ungrouped: StoredRecord[] = [];
  const groups = new Map<string, StoredRecord[]>();
  for (const definition of definitions) {
    const group = definition['group'] ? String(definition['group']) : '';
    if (group) {
      const bucket = groups.get(group);
      if (bucket) bucket.push(definition);
      else groups.set(group, [definition]);
    } else {
      ungrouped.push(definition);
    }
  }

  return (
    <>
      <Card title="Custom fields" actions={actions}>
        {definitions.length > 0 ? (
          <FieldGroup definitions={ungrouped} values={values} members={members} />
        ) : (
          <p className="small faint">No custom fields set up for this system yet.</p>
        )}
      </Card>
      {[...groups.entries()].map(([name, groupDefinitions]) => (
        <Card key={name} title={name}>
          <FieldGroup definitions={groupDefinitions} values={values} members={members} />
        </Card>
      ))}
    </>
  );
}

// ── Per-member value editing ─────────────────────────────────────────────────

function ValueInput({
  definition,
  value,
  onChange,
  members,
}: {
  definition: StoredRecord;
  value: string;
  onChange: (value: string) => void;
  members: StoredRecord[];
}): JSX.Element | null {
  const type = typeOf(definition);
  const label = String(definition['label']) || 'Value';
  const options = definitionOptions(definition);
  const numberValue = value === '' ? null : Number(value);

  switch (type) {
    case 'group':
      return null;
    case 'text':
      return <TextField label={label} value={value} onChange={onChange} />;
    case 'longText':
    case 'markdown':
    case 'code':
      return (
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          multiline
          rows={4}
          {...(type === 'markdown' ? { hint: '**bold**, *italic* and `code` are supported.' } : {})}
        />
      );
    case 'number':
    case 'counter':
      return (
        <div className="row row--nowrap" style={{ alignItems: 'flex-end' }}>
          {type === 'counter' ? (
            <IconButton
              icon="minus"
              label="Decrease"
              variant="ghost"
              onClick={() => onChange(String(Math.max(Number(definition['min'] ?? 0), (numberValue ?? 0) - 1)))}
            />
          ) : null}
          <NumberField
            label={label}
            value={numberValue}
            onChange={(next) => onChange(next === null ? '' : String(next))}
            {...(definition['min'] !== undefined ? { min: Number(definition['min']) } : {})}
          />
          {type === 'counter' ? (
            <IconButton
              icon="plus"
              label="Increase"
              variant="ghost"
              onClick={() => onChange(String((numberValue ?? 0) + 1))}
            />
          ) : null}
        </div>
      );
    case 'currency':
      return <NumberField label={label} value={numberValue} onChange={(next) => onChange(next === null ? '' : String(next))} step={0.01} />;
    case 'percentage':
    case 'progress':
      return (
        <NumberField
          label={label}
          value={numberValue}
          onChange={(next) => onChange(next === null ? '' : String(next))}
          min={Number(definition['min'] ?? 0)}
          max={Number(definition['max'] ?? 100)}
        />
      );
    case 'rating':
      return <StarField label={label} value={numberValue} onChange={(next) => onChange(next === null ? '' : String(next))} max={Number(definition['max'] ?? 5)} />;
    case 'scale': {
      const min = Number(definition['min'] ?? 1);
      const max = Number(definition['max'] ?? 10);
      const current = numberValue ?? min - 1;
      return (
        <Field label={label}>
          {() => (
            <div className="row" role="radiogroup" aria-label={label}>
              {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((step) => (
                <button
                  key={step}
                  type="button"
                  className="chip"
                  data-selected={step === current || undefined}
                  role="radio"
                  aria-checked={step === current}
                  onClick={() => onChange(step === current ? '' : String(step))}
                >
                  {step}
                </button>
              ))}
            </div>
          )}
        </Field>
      );
    }
    case 'slider':
      return (
        <Field label={label} hint={`${value || definition['min'] || 0}${definition['unit'] ? ` ${definition['unit']}` : ''}`}>
          {({ id }) => (
            <input
              id={id}
              type="range"
              min={Number(definition['min'] ?? 0)}
              max={Number(definition['max'] ?? 100)}
              value={numberValue ?? Number(definition['min'] ?? 0)}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </Field>
      );
    case 'date':
      return <DateTimeField label={label} value={value || null} onChange={(next) => onChange(next ?? '')} dateOnly />;
    case 'datetime':
      return <DateTimeField label={label} value={value || null} onChange={(next) => onChange(next ?? '')} />;
    case 'time':
      return (
        <Field label={label}>
          {({ id }) => (
            <input id={id} className="input" type="time" value={value} onChange={(event) => onChange(event.target.value)} />
          )}
        </Field>
      );
    case 'checkbox':
      return <SwitchRow label={label} checked={value === 'true'} onChange={(checked) => onChange(checked ? 'true' : 'false')} />;
    case 'flag':
      return (
        <SwitchRow
          label={label}
          hint={value === 'true' ? 'Flagged' : 'Not flagged'}
          checked={value === 'true'}
          onChange={(checked) => onChange(checked ? 'true' : 'false')}
        />
      );
    case 'yesNoMaybe':
      return (
        <Field label={label}>
          {() => (
            <div className="row" role="radiogroup" aria-label={label}>
              {(['yes', 'maybe', 'no'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="chip"
                  data-selected={value === option || undefined}
                  role="radio"
                  aria-checked={value === option}
                  onClick={() => onChange(value === option ? '' : option)}
                >
                  {option === 'yes' ? 'Yes' : option === 'no' ? 'No' : 'Maybe'}
                </button>
              ))}
            </div>
          )}
        </Field>
      );
    case 'color':
      return <ColorField label={label} value={value} onChange={onChange} />;
    case 'link':
      return <TextField label={label} type="url" value={value} onChange={onChange} placeholder="https://…" />;
    case 'alterLink':
      return (
        <ReferenceField
          label={label}
          value={value || null}
          options={members.map((member) => ({
            id: member.id,
            label: String(member['name']),
            color: (member['color'] as string) ?? null,
          }))}
          onChange={(next) => onChange((next as string) ?? '')}
        />
      );
    case 'tags':
      return <TagField label={label} values={parseListValue(value)} onChange={(next) => onChange(JSON.stringify(next))} />;
    case 'choice':
      return (
        <ReferenceField
          label={label}
          value={value || null}
          options={options.map((option) => ({ id: option.id, label: option.label, color: option.color ?? null }))}
          onChange={(next) => onChange((next as string) ?? '')}
        />
      );
    case 'multiSelect':
      return (
        <ReferenceField
          label={label}
          value={parseListValue(value)}
          options={options.map((option) => ({ id: option.id, label: option.label, color: option.color ?? null }))}
          onChange={(next) => onChange(JSON.stringify(next ?? []))}
          multiple
        />
      );
    case 'radio':
    case 'priority':
    case 'status':
      return (
        <Field label={label}>
          {() => (
            <div className="row" role="radiogroup" aria-label={label}>
              {options.length === 0 ? (
                <p className="small faint">No choices set up for this field yet.</p>
              ) : (
                options.map((option) =>
                  type === 'radio' ? (
                    <label key={option.id} className="row row--nowrap" style={{ gap: 6 }}>
                      <input
                        type="radio"
                        name={definition.id}
                        checked={value === option.id}
                        onChange={() => onChange(option.id)}
                      />
                      {option.label}
                    </label>
                  ) : (
                    <button
                      key={option.id}
                      type="button"
                      className="chip"
                      data-selected={value === option.id || undefined}
                      role="radio"
                      aria-checked={value === option.id}
                      style={option.color ? { ['--chip-color' as never]: option.color } : undefined}
                      onClick={() => onChange(value === option.id ? '' : option.id)}
                    >
                      {option.label}
                    </button>
                  ),
                )
              )}
            </div>
          )}
        </Field>
      );
    case 'checklist': {
      const checked = new Set(parseListValue(value));
      const toggle = (id: string): void => {
        const next = new Set(checked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange(JSON.stringify([...next]));
      };
      return (
        <Field label={label}>
          {() =>
            options.length === 0 ? (
              <p className="small faint">No items set up for this checklist yet.</p>
            ) : (
              <div className="stack stack--tight">
                {options.map((option) => (
                  <label key={option.id} className="row row--nowrap" style={{ gap: 8 }}>
                    <input type="checkbox" checked={checked.has(option.id)} onChange={() => toggle(option.id)} />
                    {option.label}
                  </label>
                ))}
              </div>
            )
          }
        </Field>
      );
    }
    default:
      return null;
  }
}

/**
 * One row per shared definition — filling it in, or leaving it blank, is
 * entirely this member's own; nothing here can add, remove or retype a
 * field, since that would change it for the whole system from inside one
 * profile.
 */
export function MemberCustomFieldsEditor({
  definitions,
  values,
  members = [],
  onSave,
  onCancel,
}: {
  definitions: StoredRecord[];
  values: CustomFieldValueEntry[];
  members?: StoredRecord[];
  onSave: (next: CustomFieldValueEntry[]) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<CustomFieldValueEntry[]>(values);
  const [saving, setSaving] = useState(false);

  const setValue = (definitionId: string, value: string): void => {
    setDraft((current) => withDefinitionValue(current, definitionId, value));
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
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
      {definitions.length === 0 ? (
        <p className="small faint">
          No custom fields have been set up for this system yet. Add one from the custom fields screen and it
          shows up here for every member to answer.
        </p>
      ) : (
        definitions
          .filter((definition) => typeOf(definition) !== 'group')
          .map((definition) => (
            <ValueInput
              key={definition.id}
              definition={definition}
              value={valueForDefinition(definition.id, draft)}
              onChange={(value) => setValue(definition.id, value)}
              members={members}
            />
          ))
      )}

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

// ── Definition configuration (shared with the management screen) ────────────

/**
 * The part of defining a field that depends on its type: the preset choices
 * for a choice-shaped field, or the bounds and unit for a numeric one.
 * Reused as-is by the definitions management screen — this is the same
 * configuration regardless of which screen is editing it.
 */
export function DefinitionConfigEditor({
  type,
  options,
  min,
  max,
  unit,
  onOptionsChange,
  onBoundsChange,
  onUnitChange,
}: {
  type: CustomFieldType;
  options: CustomFieldOption[];
  min?: number;
  max?: number;
  unit?: string;
  onOptionsChange: (options: CustomFieldOption[]) => void;
  onBoundsChange: (bounds: { min?: number; max?: number }) => void;
  onUnitChange: (unit: string) => void;
}): JSX.Element | null {
  const isChoiceLike = type === 'choice' || type === 'radio' || type === 'multiSelect' || type === 'priority' || type === 'status' || type === 'checklist';
  const isBounded = type === 'rating' || type === 'scale' || type === 'slider' || type === 'progress' || type === 'percentage';
  const hasUnit = type === 'number' || type === 'currency' || type === 'slider' || type === 'counter';

  if (!isChoiceLike && !isBounded && !hasUnit) return null;

  const addOption = (): void => onOptionsChange([...options, newCustomFieldOption('')]);
  const updateOption = (id: string, patch: Partial<CustomFieldOption>): void =>
    onOptionsChange(options.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  const removeOption = (id: string): void => onOptionsChange(options.filter((option) => option.id !== id));
  const moveOption = (id: string, direction: -1 | 1): void => {
    const index = options.findIndex((option) => option.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= options.length) return;
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onOptionsChange(next);
  };

  return (
    <>
      {isChoiceLike ? (
        <div className="field">
          <span className="field__label">{type === 'checklist' ? 'Items' : 'Choices'}</span>
          <div className="stack stack--tight">
            {options.map((option, index) => (
              <div key={option.id} className="row row--nowrap" style={{ alignItems: 'center' }}>
                <input
                  className="input"
                  value={option.label}
                  placeholder={`Choice ${index + 1}`}
                  aria-label={`Choice ${index + 1}`}
                  onChange={(event) => updateOption(option.id, { label: event.target.value })}
                />
                <input
                  type="color"
                  className="color-swatch-input"
                  aria-label={`Colour for ${option.label || `choice ${index + 1}`}`}
                  value={option.color ?? '#7aa2f7'}
                  onChange={(event) => updateOption(option.id, { color: event.target.value })}
                  title="Colour (optional)"
                />
                {option.color ? (
                  <IconButton
                    icon="close"
                    label="Remove colour"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateOption(option.id, { color: undefined })}
                  />
                ) : null}
                <IconButton icon="chevronUp" label="Move up" size="sm" variant="ghost" disabled={index === 0} onClick={() => moveOption(option.id, -1)} />
                <IconButton
                  icon="chevronDown"
                  label="Move down"
                  size="sm"
                  variant="ghost"
                  disabled={index === options.length - 1}
                  onClick={() => moveOption(option.id, 1)}
                />
                <IconButton icon="trash" label="Remove choice" size="sm" variant="ghost" onClick={() => removeOption(option.id)} />
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" icon="plus" onClick={addOption}>
            Add {type === 'checklist' ? 'an item' : 'a choice'}
          </Button>
        </div>
      ) : null}

      {isBounded ? (
        <div className="row">
          <NumberField label="Minimum" value={min ?? 0} onChange={(value) => onBoundsChange({ min: value ?? 0, max })} />
          <NumberField label="Maximum" value={max ?? 100} onChange={(value) => onBoundsChange({ min, max: value ?? 100 })} />
        </div>
      ) : null}

      {hasUnit ? <TextField label="Unit" value={unit ?? ''} onChange={onUnitChange} hint="kg, cm, pts, $…" /> : null}
    </>
  );
}
