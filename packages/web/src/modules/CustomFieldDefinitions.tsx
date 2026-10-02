import { useState } from 'react';
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_CATEGORIES,
  CUSTOM_FIELD_TYPE_ICONS,
  CUSTOM_FIELD_TYPE_LABELS,
  customFieldOptions,
  newCustomFieldDefinitionInput,
  type CustomFieldCategory,
  type CustomFieldOption,
  type CustomFieldType,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useToast } from '../core/toast.js';
import { useI18n } from '../core/i18n.js';
import { Button, Card, IconButton } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { DefinitionConfigEditor, groupCustomFieldDefinitions } from '../ui/CustomFields.js';
import { Icon, iconOr } from '../ui/Icon.js';

/**
 * The custom fields themselves.
 *
 * Defined once here, they show up the same way on every member's profile —
 * change a field's choices in one place and everyone answering it sees the
 * new list. This screen only ever touches the definitions; each member's own
 * answer is edited from their own profile.
 */

const CATEGORY_ORDER: CustomFieldCategory[] = ['Text', 'Numbers', 'Selection', 'Date & time', 'Visual', 'Links', 'Structure'];

/**
 * `group` ("Section header") is a leftover type from before a definition's
 * own `group` text field could do the same job — it never renders a value
 * (`hasValue()` in CustomFields.tsx always calls it empty), so it is left out
 * of the type picker rather than offered as if it still did something. Kept
 * in the shared type union itself: a definition already using it from before
 * this still needs a valid label and icon wherever one is read.
 */
const CREATABLE_FIELD_TYPES = CUSTOM_FIELD_TYPES.filter((type) => type !== 'group');

/** A starter set for the "Favourites" group button below — plain text, so they work the moment they're added. */
const FAVOURITES_STARTER_FIELDS: readonly string[] = [
  'Favourite constellation or star',
  'Favourite activity',
  'Favourite food',
  'Favourite song',
  'Favourite quote',
];

/** Distinct group names already in use, trimmed and de-duplicated by case, keeping whichever casing was typed first — offered as autocomplete so a new field joins an existing section instead of quietly forking it. */
function existingGroupNames(definitions: StoredRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const definition of definitions) {
    const raw = definition['group'] ? String(definition['group']).trim() : '';
    if (raw && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
  }
  return [...seen.values()];
}

export default function CustomFieldDefinitions(): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();
  const definitions = useCollection('customFieldDefinitions', {
    sort: (a, b) => Number(a['sortOrder'] ?? 0) - Number(b['sortOrder'] ?? 0),
  });
  const typePicker = useDialog();
  const editor = useDialog<StoredRecord>();
  const confirmRemove = useDialog<StoredRecord>();

  const addField = async (type: CustomFieldType): Promise<void> => {
    typePicker.hide();
    try {
      const created = await definitions.create(newCustomFieldDefinitionInput(type, definitions.items.length));
      editor.show(created);
    } catch (cause) {
      toast.fromError(cause, 'Could not add that field');
    }
  };

  const hasFavouritesGroup = existingGroupNames(definitions.items).some(
    (name) => name.toLowerCase() === 'favourites',
  );

  /** Opt-in per system — never run automatically, and never for an account that already has the group. */
  const addStarterFavourites = async (): Promise<void> => {
    try {
      await Promise.all(
        FAVOURITES_STARTER_FIELDS.map((label, index) =>
          definitions.create({
            ...newCustomFieldDefinitionInput('text', definitions.items.length + index),
            label,
            group: 'Favourites',
          }),
        ),
      );
      toast.success('Added the Favourites fields');
    } catch (cause) {
      toast.fromError(cause, 'Could not add those fields');
    }
  };

  /**
   * `siblings` is the one section's own ordered list — ungrouped, or one
   * named group — not the full flat collection. A field's up/down arrows
   * only ever trade places with another field in the same section, so
   * reordering can never quietly walk a field out of the group it is
   * displayed under on a profile.
   */
  const move = async (siblings: StoredRecord[], definition: StoredRecord, direction: -1 | 1): Promise<void> => {
    const index = siblings.findIndex((item) => item.id === definition.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const other = siblings[target]!;
    try {
      await Promise.all([
        definitions.update(definition.id, { sortOrder: Number(other['sortOrder'] ?? target) }),
        definitions.update(other.id, { sortOrder: Number(definition['sortOrder'] ?? index) }),
      ]);
    } catch (cause) {
      toast.fromError(cause, 'Could not reorder that');
    }
  };

  return (
    <>
      {/* No PageHeader of its own: this lives inside the Settings shell, which
          already has one, and the sidebar it is opened from already says
          "Custom fields" — a second title here would just repeat both. */}
      <Card title="Custom fields">
        <p className="small muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          {term(
            'Defined once for the whole system — every {{member}} sees the same fields, and the same choices for one that offers a pick list.',
          )}
        </p>
        <div className="row">
          <Button variant="primary" icon="plus" onClick={() => typePicker.show()}>
            Add field
          </Button>
          {!hasFavouritesGroup ? (
            <Button variant="ghost" icon="sparkle" onClick={() => void addStarterFavourites()}>
              Add starter Favourites fields
            </Button>
          ) : null}
        </div>
      </Card>

      <AsyncContent
        loading={definitions.loading}
        error={definitions.error}
        items={definitions.items}
        onRetry={definitions.reload}
        empty={{
          icon: 'tag',
          title: 'No custom fields yet',
          body: 'Add one to ask every member the same question — a species, a role, a favourite colour, anything the built-in fields do not cover.',
          action: { label: 'Add a field', run: () => typePicker.show() },
        }}
      >
        {(items) => {
          const { ungrouped, groups } = groupCustomFieldDefinitions(items);
          const section = (sectionItems: StoredRecord[]): JSX.Element => (
            <div className="stack stack--tight">
              {sectionItems.map((definition, index) => (
                <DefinitionRow
                  key={definition.id}
                  definition={definition}
                  canMoveUp={index > 0}
                  canMoveDown={index < sectionItems.length - 1}
                  onEdit={() => editor.show(definition)}
                  onMove={(direction) => void move(sectionItems, definition, direction)}
                  onRemove={() => confirmRemove.show(definition)}
                />
              ))}
            </div>
          );
          return (
            <div className="stack">
              {ungrouped.length > 0 ? section(ungrouped) : null}
              {groups.map(({ key, label, definitions: groupDefinitions }) => (
                <div key={key}>
                  <p className="section-heading__label">{label}</p>
                  {section(groupDefinitions)}
                </div>
              ))}
            </div>
          );
        }}
      </AsyncContent>

      <Dialog open={typePicker.open} onClose={typePicker.hide} title="Add a field" wide>
        <div className="stack">
          {CATEGORY_ORDER.filter((category) =>
            CREATABLE_FIELD_TYPES.some((type) => CUSTOM_FIELD_TYPE_CATEGORIES[type] === category),
          ).map((category) => (
            <div key={category}>
              <p className="section-heading__label">{category}</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {CREATABLE_FIELD_TYPES.filter((type) => CUSTOM_FIELD_TYPE_CATEGORIES[type] === category).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="card card--interactive"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                      width: 92,
                      padding: 'var(--space-3)',
                    }}
                    onClick={() => void addField(type)}
                  >
                    <Icon name={iconOr(CUSTOM_FIELD_TYPE_ICONS[type])} size={20} />
                    <span className="tiny" style={{ textAlign: 'center' }}>
                      {CUSTOM_FIELD_TYPE_LABELS[type]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog open={editor.open} onClose={editor.hide} title={editor.value ? CUSTOM_FIELD_TYPE_LABELS[editor.value['type'] as CustomFieldType] : 'Edit field'} wide>
        {editor.value ? (
          <DefinitionEditor
            definition={editor.value}
            existingGroups={existingGroupNames(definitions.items.filter((item) => item.id !== editor.value!.id))}
            onCancel={editor.hide}
            onSave={async (patch) => {
              await definitions.update(editor.value!.id, patch);
              toast.success('Saved');
              editor.hide();
            }}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirmRemove.open}
        onClose={confirmRemove.hide}
        title="Remove this field?"
        body={`Members' answers for "${String(confirmRemove.value?.['label'] ?? '')}" stay recorded but stop showing on any profile unless you restore it from the trash.`}
        confirmLabel="Remove"
        recoverable
        onConfirm={async () => {
          if (!confirmRemove.value) return;
          await definitions.remove(confirmRemove.value.id);
          toast.success('Removed');
        }}
      />
    </>
  );
}

function DefinitionRow({
  definition,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMove,
  onRemove,
}: {
  definition: StoredRecord;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}): JSX.Element {
  const type = definition['type'] as CustomFieldType;
  return (
    <Card flush>
      <div className="row row--between" style={{ padding: 'var(--space-3)' }}>
        <button
          type="button"
          className="row"
          style={{ flex: 1, textAlign: 'left', minWidth: 0, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          onClick={onEdit}
        >
          <Icon name={iconOr(CUSTOM_FIELD_TYPE_ICONS[type])} size={18} />
          <span className="truncate" style={{ minWidth: 0 }}>
            <strong>{String(definition['label'])}</strong>{' '}
            <span className="tiny faint">
              {CUSTOM_FIELD_TYPE_LABELS[type]}
              {definition['group'] ? ` · ${String(definition['group'])}` : ''}
            </span>
          </span>
        </button>
        <span className="row row--nowrap">
          <IconButton icon="chevronUp" label="Move up" size="sm" variant="ghost" disabled={!canMoveUp} onClick={() => onMove(-1)} />
          <IconButton icon="chevronDown" label="Move down" size="sm" variant="ghost" disabled={!canMoveDown} onClick={() => onMove(1)} />
          <IconButton icon="trash" label="Remove field" size="sm" variant="ghost" onClick={onRemove} />
        </span>
      </div>
    </Card>
  );
}

function DefinitionEditor({
  definition,
  existingGroups,
  onSave,
  onCancel,
}: {
  definition: StoredRecord;
  existingGroups: string[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const type = definition['type'] as CustomFieldType;
  const [label, setLabel] = useState(String(definition['label'] ?? ''));
  const [group, setGroup] = useState(String(definition['group'] ?? ''));
  const [options, setOptions] = useState<CustomFieldOption[]>(customFieldOptions(definition['options']));
  const [min, setMin] = useState<number | undefined>(definition['min'] as number | undefined);
  const [max, setMax] = useState<number | undefined>(definition['max'] as number | undefined);
  const [unit, setUnit] = useState(String(definition['unit'] ?? ''));
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave({
        label: label.trim() || 'Untitled field',
        group: group.trim() || undefined,
        options,
        min,
        max,
        unit: unit.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <DescriptiveNote>
        A field's type is set when it is added and cannot be changed afterwards — remove it and add it again as a
        different type if you need to.
      </DescriptiveNote>
      <TextField label="Label" value={label} onChange={setLabel} autoFocus />
      <TextField
        label="Group"
        value={group}
        onChange={setGroup}
        hint="Fields sharing a group appear together under that heading on a profile. Leave blank to keep it at the top."
        list="custom-field-group-options"
      />
      {existingGroups.length > 0 ? (
        <datalist id="custom-field-group-options">
          {existingGroups.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
      <DefinitionConfigEditor
        type={type}
        options={options}
        min={min}
        max={max}
        unit={unit}
        onOptionsChange={setOptions}
        onBoundsChange={(bounds) => {
          setMin(bounds.min);
          setMax(bounds.max);
        }}
        onUnitChange={setUnit}
      />
      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <span className="spacer" />
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
