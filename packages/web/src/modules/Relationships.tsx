import { useMemo, useRef, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { memberColor } from '../charts/palette.js';

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

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? 'Edit relationship' : 'Add a relationship'}
      >
        <RecordForm
          collection="relationships"
          record={editor.value}
          onSubmit={async (values) => {
            if (editor.value) {
              await relationships.update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await relationships.create(values);
              toast.success('Added');
              setCreating(false);
            }
          }}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

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
