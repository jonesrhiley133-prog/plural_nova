import { useMemo, useRef, useState } from 'react';
import { VISIBILITY_LEVELS, type StoredRecord, type Visibility } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useSettings } from '../core/auth.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { ColorField, ReferenceField, SelectField, SwitchRow, TextField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { visibilityLabel } from '../ui/RecordForm.js';
import { memberColor } from '../charts/palette.js';

const STRENGTH_OPTIONS = [
  { value: 'distant', label: 'Distant' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'close', label: 'Close' },
  { value: 'inseparable', label: 'Inseparable' },
];

/**
 * The relationship map.
 *
 * A force-free layout: members are placed around a circle so the arrangement is
 * the same every time it is opened, and the lines between them are the recorded
 * relationships. A list view sits alongside it, because a graph with thirty
 * nodes is a picture and a list is an answer.
 */

const STRENGTH_WIDTH: Record<string, number> = {
  distant: 1,
  neutral: 1.6,
  close: 2.4,
  inseparable: 3.4,
};

export default function Relationships(): JSX.Element {
  const { t, term } = useI18n();
  const toast = useToast();
  const members = useRecordMap('members');
  const contacts = useRecordMap('contacts');
  const relationships = useCollection('relationships');

  const [view, setView] = useState<'map' | 'list'>('map');
  const [focus, setFocus] = useState<string | null>(null);
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const nodes = useMemo(() => {
    const people = [...members.values()];
    const radius = 38;
    return people.map((member, index) => {
      const angle = (index / Math.max(people.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        record: member,
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
      };
    });
  }, [members]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.record.id, node])), [nodes]);

  const edges = useMemo(
    () =>
      relationships.items
        .filter((relationship) => relationship['showOnMap'] !== false)
        .map((relationship) => ({
          relationship,
          from: nodeById.get(String(relationship['fromId'])),
          to: nodeById.get(String(relationship['toId'])),
        }))
        .filter((edge) => edge.from && edge.to),
    [relationships.items, nodeById],
  );

  const nameFor = (type: string, id: string): string => {
    if (type === 'member') return String(members.get(id)?.['name'] ?? 'Someone');
    if (type === 'contact') return String(contacts.get(id)?.['name'] ?? 'A contact');
    return 'Someone';
  };

  return (
    <>
      <PageHeader
        title="Relationships"
        description={term('How the {{members}}, contacts and friends connect.')}
        actions={
          <>
            <SegmentedControl
              value={view}
              onChange={setView}
              label="View"
              options={[
                { value: 'map', label: 'Map' },
                { value: 'list', label: 'List' },
              ]}
            />
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Add a relationship
            </Button>
          </>
        }
      />

      {view === 'map' ? (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          {nodes.length < 2 ? (
            <p className="small muted prose">
              {term('A map needs at least two {{members}}. Add another and the connections appear here.')}
            </p>
          ) : (
            <svg
              ref={svg}
              viewBox="0 0 100 100"
              style={{ width: '100%', maxHeight: '62vh', aspectRatio: '1' }}
              role="img"
              aria-label={`Relationship map with ${nodes.length} people and ${edges.length} connections.`}
            >
              {edges.map(({ relationship, from, to }) => {
                const dim = focus !== null && focus !== from!.record.id && focus !== to!.record.id;
                return (
                  <line
                    key={relationship.id}
                    x1={from!.x}
                    y1={from!.y}
                    x2={to!.x}
                    y2={to!.y}
                    stroke={(relationship['color'] as string) || 'var(--border-strong)'}
                    strokeWidth={STRENGTH_WIDTH[String(relationship['strength'])] ?? 1.6}
                    strokeLinecap="round"
                    opacity={dim ? 0.15 : 0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {nodes.map((node) => {
                const dim = focus !== null && focus !== node.record.id;
                return (
                  <g
                    key={node.record.id}
                    opacity={dim ? 0.3 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setFocus(focus === node.record.id ? null : node.record.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={String(node.record['name'])}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setFocus(focus === node.record.id ? null : node.record.id);
                      }
                    }}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={4.2}
                      fill={memberColor(node.record as { id: string; color?: string | null })}
                      stroke="var(--bg)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={node.x}
                      y={node.y + 8.5}
                      textAnchor="middle"
                      fontSize={3.1}
                      fill="var(--text-muted)"
                    >
                      {String(node.record['name']).slice(0, 14)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {focus ? (
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <Chip accent onClick={() => setFocus(null)}>
                Showing {String(members.get(focus)?.['name'] ?? '')} — tap to clear
              </Chip>
            </div>
          ) : (
            <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
              Tap someone to highlight their connections. Line thickness is the closeness you recorded.
            </p>
          )}
        </Card>
      ) : null}

      <AsyncContent
        loading={relationships.loading}
        error={relationships.error}
        items={relationships.items}
        onRetry={relationships.reload}
        empty={{
          title: 'No relationships mapped',
          body: term('Who looks after whom, who is close to whom — as much or as little as is useful.'),
          icon: 'relationship',
          action: { label: 'Add a relationship', run: () => setCreating(true) },
        }}
      >
        {(items) => (
          <Card flush>
            <div className="list">
              {items.map((relationship) => {
                const fromName = nameFor(String(relationship['fromType']), String(relationship['fromId']));
                const toName = nameFor(String(relationship['toType']), String(relationship['toId']));
                const fromMember = members.get(String(relationship['fromId']));
                return (
                  <div key={relationship.id} className="list-row">
                    <Avatar
                      name={fromName}
                      color={(fromMember?.['color'] as string) ?? null}
                      icon={(fromMember?.['icon'] as string) ?? null}
                      size={28}
                      round
                    />
                    <span className="list-row__body">
                      <span className="list-row__title">
                        {fromName} <span className="faint">{String(relationship['label'])}</span> {toName}
                      </span>
                      <span className="list-row__meta">
                        <Chip>{String(relationship['strength'] ?? 'neutral')}</Chip>
                        {relationship['mutual'] === true ? <Chip>Mutual</Chip> : null}
                        {relationship['notes'] ? (
                          <span className="faint truncate">{String(relationship['notes'])}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="list-row__trailing">
                      <IconButton
                        icon="edit"
                        label="Edit relationship"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.show(relationship)}
                      />
                      <IconButton
                        icon="trash"
                        label="Delete relationship"
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm.show(relationship)}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </AsyncContent>

      <RelationshipDialog
        open={creating || editor.open}
        record={editor.value}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        onSave={async (values) => {
          if (editor.value) {
            await relationships.update(editor.value.id, values);
            toast.success('Saved');
          } else {
            await relationships.create(values);
            toast.success('Added');
          }
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this relationship?"
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await relationships.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

/**
 * From and to are polymorphic — a member or a contact, chosen by `fromType`/
 * `toType` — so the registry's generic `ref` field kind cannot express either
 * one, and `RecordForm` would otherwise render them as raw text boxes asking
 * for an internal id. This picks the collection each side points at, then
 * offers `ReferenceField`'s ordinary name-based picker into it.
 */
function RelationshipDialog({
  open,
  record,
  onClose,
  onSave,
}: {
  open: boolean;
  record: StoredRecord | null;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const { term } = useI18n();
  const settings = useSettings();
  const members = useCollection('members');
  const contacts = useCollection('contacts');

  const [fromType, setFromType] = useState('member');
  const [fromId, setFromId] = useState<string | null>(null);
  const [toType, setToType] = useState('member');
  const [toId, setToId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [reverseLabel, setReverseLabel] = useState('');
  const [strength, setStrength] = useState('neutral');
  const [mutual, setMutual] = useState(true);
  const [showOnMap, setShowOnMap] = useState(true);
  const [color, setColor] = useState('');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(settings.privacy.defaultVisibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const targetId = record?.id ?? 'new';
  if (open && loadedId !== targetId) {
    setLoadedId(targetId);
    setFromType(record ? String(record['fromType'] ?? 'member') : 'member');
    setFromId(record ? String(record['fromId'] ?? '') || null : null);
    setToType(record ? String(record['toType'] ?? 'member') : 'member');
    setToId(record ? String(record['toId'] ?? '') || null : null);
    setLabel(record ? String(record['label'] ?? '') : '');
    setReverseLabel(record ? String(record['reverseLabel'] ?? '') : '');
    setStrength(record ? String(record['strength'] ?? 'neutral') : 'neutral');
    setMutual(record ? record['mutual'] !== false : true);
    setShowOnMap(record ? record['showOnMap'] !== false : true);
    setColor(record ? String(record['color'] ?? '') : '');
    setNotes(record ? String(record['notes'] ?? '') : '');
    setVisibility(record ? ((record['visibility'] as Visibility) ?? settings.privacy.defaultVisibility) : settings.privacy.defaultVisibility);
    setError(null);
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const optionsFor = (type: string): { id: string; label: string; color?: string | null }[] =>
    (type === 'contact' ? contacts.items : members.items).map((item) => ({
      id: item.id,
      label: String(item['name'] ?? 'Unnamed'),
      color: (item['color'] as string) ?? null,
    }));

  const save = async (): Promise<void> => {
    if (!fromId || !toId) {
      setError(term('Choose who this connects — both a {{member}} or contact on each side.'));
      return;
    }
    if (!label.trim()) {
      setError('Say what the relationship is.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        fromType,
        fromId,
        toType,
        toId,
        label: label.trim(),
        reverseLabel,
        strength,
        mutual,
        showOnMap,
        color,
        notes,
        visibility,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be saved. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? 'Edit relationship' : 'Add a relationship'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="field__label">From</span>
        <SegmentedControl
          value={fromType}
          onChange={(value) => {
            setFromType(value);
            setFromId(null);
          }}
          label="From type"
          options={[
            { value: 'member', label: term('{{Member}}') },
            { value: 'contact', label: 'Contact' },
          ]}
        />
      </div>
      <ReferenceField
        label={fromType === 'contact' ? 'Which contact' : term('Which {{member}}')}
        value={fromId}
        onChange={(value) => setFromId(value as string | null)}
        options={optionsFor(fromType)}
        emptyLabel="Choose someone"
      />

      <TextField
        label="Relationship"
        value={label}
        onChange={setLabel}
        hint="How the first person describes the second — sibling, mentor, rival."
        required
      />
      <TextField
        label="Reverse label"
        value={reverseLabel}
        onChange={setReverseLabel}
        hint="How the other side describes it, if different."
      />

      <div className="field">
        <span className="field__label">To</span>
        <SegmentedControl
          value={toType}
          onChange={(value) => {
            setToType(value);
            setToId(null);
          }}
          label="To type"
          options={[
            { value: 'member', label: term('{{Member}}') },
            { value: 'contact', label: 'Contact' },
          ]}
        />
      </div>
      <ReferenceField
        label={toType === 'contact' ? 'Which contact' : term('Which {{member}}')}
        value={toId}
        onChange={(value) => setToId(value as string | null)}
        options={optionsFor(toType)}
        emptyLabel="Choose someone"
      />

      <SelectField label="Closeness" value={strength} onChange={setStrength} options={STRENGTH_OPTIONS} />
      <SwitchRow
        label="Mutual"
        hint="Both directions feel the same way about it."
        checked={mutual}
        onChange={setMutual}
      />
      <SwitchRow label="Show on the relationship map" checked={showOnMap} onChange={setShowOnMap} />
      <ColorField label="Line colour" value={color} onChange={setColor} />
      <TextField label="Notes" value={notes} onChange={setNotes} multiline rows={2} />

      <SelectField
        label="Who can see this"
        value={visibility}
        onChange={(value) => setVisibility(value as Visibility)}
        options={VISIBILITY_LEVELS.map((level) => ({ value: level, label: visibilityLabel(level, term) }))}
        hint="Private means only you. Nothing is shared unless you choose it."
      />

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
