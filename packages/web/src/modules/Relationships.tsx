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

/*
 * Random relationships, kept deliberately light.
 *
 * The pool sticks to warm, ordinary labels rather than plurality-specific
 * clinical terms (persecutor, gatekeeper, and the like) — those carry real
 * weight for an actual system, and a coin flip is the wrong way to assign
 * one to somebody. Age only ever narrows the pool, never assigns an age.
 */
type AgeBand = 'child' | 'teen' | 'adult';
const AGE_RANK: Record<AgeBand, number> = { child: 0, teen: 1, adult: 2 };

/** Free text ("27", "teen", "ageless", "somewhere around 8") to a rough band. Unreadable text is treated as adult. */
function ageBand(raw: unknown): AgeBand {
  const text = String(raw ?? '').trim().toLowerCase();
  const match = text.match(/\d+/);
  if (!match) return 'adult';
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 'adult';
  if (value < 13) return 'child';
  if (value < 18) return 'teen';
  return 'adult';
}

interface RelationshipTemplate {
  label: string;
  reverseLabel?: string;
  strength: string;
  /** `from` is the age band of whoever ends up in the `fromId` slot. */
  allowed: (from: AgeBand, to: AgeBand) => boolean;
}

const RANDOM_TEMPLATES: RelationshipTemplate[] = [
  { label: 'Friend', strength: 'close', allowed: () => true },
  { label: 'Best friend', strength: 'inseparable', allowed: () => true },
  { label: 'Sibling', reverseLabel: 'Sibling', strength: 'close', allowed: () => true },
  { label: 'Confidant', strength: 'close', allowed: () => true },
  { label: 'Housemate', strength: 'neutral', allowed: () => true },
  { label: 'Rival', strength: 'distant', allowed: () => true },
  { label: 'Partner in crime', strength: 'inseparable', allowed: () => true },
  { label: 'Twin', reverseLabel: 'Twin', strength: 'inseparable', allowed: (a, b) => a === b },
  {
    label: 'Protector',
    reverseLabel: 'Protected by',
    strength: 'close',
    allowed: (a, b) => AGE_RANK[a] >= AGE_RANK[b],
  },
  {
    label: 'Caretaker',
    reverseLabel: 'Cared for by',
    strength: 'close',
    allowed: (a, b) => AGE_RANK[a] >= AGE_RANK[b],
  },
  {
    label: 'Parent-figure',
    reverseLabel: 'Child-figure',
    strength: 'close',
    allowed: (a, b) => a === 'adult' && b !== 'adult',
  },
  {
    label: 'Mentor',
    reverseLabel: 'Mentee',
    strength: 'close',
    allowed: (a, b) => AGE_RANK[a] >= AGE_RANK[b] && a !== b,
  },
];

/** Every template that could plausibly connect these two, in either direction. */
function optionsFor(
  bandA: AgeBand,
  bandB: AgeBand,
): { template: RelationshipTemplate; aIsFrom: boolean }[] {
  const options: { template: RelationshipTemplate; aIsFrom: boolean }[] = [];
  for (const template of RANDOM_TEMPLATES) {
    if (template.allowed(bandA, bandB)) options.push({ template, aIsFrom: true });
    if (bandA !== bandB && template.allowed(bandB, bandA)) options.push({ template, aIsFrom: false });
  }
  return options;
}

/**
 * A proposed pairing, shown before anything is saved.
 *
 * `locked` survives a shuffle; `key` is the unordered pair so a shuffle can
 * tell "already spoken for" (an existing relationship, or another proposal in
 * this same batch) from a pair that's still fair game.
 */
interface RelationshipProposal {
  key: string;
  from: StoredRecord;
  to: StoredRecord;
  template: RelationshipTemplate;
  locked: boolean;
}

function pairKey(a: StoredRecord, b: StoredRecord): string {
  return [a.id, b.id].sort().join('|');
}

function proposeFor(a: StoredRecord, b: StoredRecord): RelationshipProposal | null {
  const options = optionsFor(ageBand(a['age']), ageBand(b['age']));
  if (options.length === 0) return null;
  const choice = options[Math.floor(Math.random() * options.length)]!;
  const [from, to] = choice.aIsFrom ? [a, b] : [b, a];
  return { key: pairKey(a, b), from, to, template: choice.template, locked: false };
}

/** Tops `keep` (locked proposals a reshuffle must not touch) up to `count`, from pairs neither already related nor already proposed. */
function buildRelationshipBatch(
  people: StoredRecord[],
  alreadyRelated: Set<string>,
  keep: RelationshipProposal[],
  count: number,
): RelationshipProposal[] {
  const spokenFor = new Set([...alreadyRelated, ...keep.map((p) => p.key)]);
  const candidates: [StoredRecord, StoredRecord][] = [];
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      if (!spokenFor.has(pairKey(people[i]!, people[j]!))) candidates.push([people[i]!, people[j]!]);
    }
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  const fresh: RelationshipProposal[] = [];
  for (const [a, b] of candidates) {
    if (keep.length + fresh.length >= count) break;
    const proposal = proposeFor(a, b);
    if (proposal) fresh.push(proposal);
  }
  return [...keep, ...fresh];
}

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
  const [proposals, setProposals] = useState<RelationshipProposal[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  const randomCount = Math.min(8, Math.max(0, Math.round([...members.values()].length * 0.75)));

  const alreadyRelatedPairs = (): Set<string> =>
    new Set(
      relationships.items
        .filter((r) => r['fromType'] === 'member' && r['toType'] === 'member')
        .map((r) => [String(r['fromId']), String(r['toId'])].sort().join('|')),
    );

  const openRandomizer = (): void => {
    setProposals(buildRelationshipBatch([...members.values()], alreadyRelatedPairs(), [], randomCount));
  };

  const shuffleProposals = (): void => {
    setProposals((current) =>
      buildRelationshipBatch(
        [...members.values()],
        alreadyRelatedPairs(),
        (current ?? []).filter((p) => p.locked),
        randomCount,
      ),
    );
  };

  const toggleLock = (key: string): void => {
    setProposals((current) => (current ?? []).map((p) => (p.key === key ? { ...p, locked: !p.locked } : p)));
  };

  const removeProposal = (key: string): void => {
    setProposals((current) => (current ?? []).filter((p) => p.key !== key));
  };

  const applyProposals = async (): Promise<void> => {
    const batch = proposals ?? [];
    if (batch.length === 0) return;
    setApplying(true);
    try {
      const created = await Promise.all(
        batch.map((p) =>
          relationships.create({
            fromType: 'member',
            fromId: p.from.id,
            toType: 'member',
            toId: p.to.id,
            label: p.template.label,
            reverseLabel: p.template.reverseLabel ?? p.template.label,
            strength: p.template.strength,
            mutual: !p.template.reverseLabel,
            showOnMap: true,
          }),
        ),
      );
      setProposals(null);
      const createdIds = created.map((record) => record.id);
      toast.show({
        tone: 'success',
        title: `Added ${createdIds.length} relationship${createdIds.length === 1 ? '' : 's'}`,
        action: {
          label: 'Undo',
          run: () => {
            void Promise.all(createdIds.map((id) => relationships.remove(id))).catch((cause: unknown) =>
              toast.fromError(cause, 'Could not undo all of them'),
            );
          },
        },
      });
    } catch (cause) {
      toast.fromError(cause, 'Some relationships did not save');
    } finally {
      setApplying(false);
    }
  };

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
            {[...members.values()].length >= 2 ? (
              <Button variant="secondary" icon="refresh" onClick={openRandomizer}>
                Generate random relationships
              </Button>
            ) : null}
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Add a relationship
            </Button>
          </>
        }
      />

      <Dialog
        open={proposals !== null}
        onClose={() => setProposals(null)}
        title="Random relationships"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposals(null)} disabled={applying}>
              Cancel
            </Button>
            <Button variant="secondary" icon="refresh" onClick={shuffleProposals} disabled={applying}>
              Shuffle
            </Button>
            <Button
              variant="primary"
              onClick={() => void applyProposals()}
              loading={applying}
              disabled={(proposals ?? []).length === 0}
            >
              Add {(proposals ?? []).length} relationship{(proposals ?? []).length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        {proposals && proposals.length > 0 ? (
          <>
            <p className="small muted prose">
              Nothing is saved yet. Lock the ones worth keeping, remove the rest, then shuffle for new
              suggestions in their place.
            </p>
            <div className="list">
              {proposals.map((p) => (
                <div key={p.key} className="list-row">
                  <span className="list-row__body">
                    <span className="list-row__title">
                      {String(p.from['name'])} <span className="faint">{p.template.label}</span> {String(p.to['name'])}
                    </span>
                  </span>
                  <span className="list-row__trailing">
                    <IconButton
                      icon={p.locked ? 'lock' : 'unlock'}
                      label={p.locked ? 'Unlock, so shuffling can replace this one' : 'Lock, so shuffling leaves this one alone'}
                      variant={p.locked ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => toggleLock(p.key)}
                    />
                    <IconButton
                      icon="close"
                      label="Remove this suggestion"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeProposal(p.key)}
                    />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="small muted prose">
            {term('Nobody is left to pair — everyone who could be matched already has a recorded relationship.')}
          </p>
        )}
      </Dialog>

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
                      src={(fromMember?.['avatarUrl'] as string) || null}
                      color={(fromMember?.['color'] as string) ?? null}
                      icon={(fromMember?.['icon'] as string) ?? null}
                      size={28}
                      round
                    />
                    <span className="list-row__body">
                      <span className="list-row__title list-row__title--wrap">
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
