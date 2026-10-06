import { useMemo, useState } from 'react';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Avatar, Card, Chip } from '../ui/primitives.js';
import { useDialog } from '../ui/overlays.js';
import { ProfilePreviewDialog, ProfileTile } from '../ui/ProfileParts.js';
import { Icon } from '../ui/Icon.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * Subsystems nest: a subsystem can contain another, and a member belongs to one
 * while still belonging to the system as a whole. The tree below shows the
 * arrangement as it actually is rather than flattening it into a list.
 */
export default function Subsystems(): JSX.Element {
  const { term } = useI18n();
  const subsystems = useCollection('subsystems');
  const members = useCollection('members');
  const fronts = useCollection('frontEvents');
  const [level, setLevel] = useState<'all' | 'top' | 'nested' | 'private'>('all');

  const tree = useMemo(() => buildTree(subsystems.items), [subsystems.items]);
  const membersIn = (id: string): StoredRecord[] =>
    members.items.filter((member) => member['subsystemId'] === id);
  const byId = useMemo(() => new Map(subsystems.items.map((record) => [record.id, record])), [subsystems.items]);

  return (
    <CollectionScreen
      collection="subsystems"
      description={term('Groups inside the {{system}}. A {{subsystem}} can hold others.')}
      emptyTitle={term('No {{subsystems}} yet')}
      emptyBody={term('Useful when the {{system}} has clusters that make sense together.')}
      layout="grid"
      gridMinWidth={260}
      filter={(record) =>
        level === 'all' ||
        (level === 'top' ? !record['parentId'] : level === 'nested' ? Boolean(record['parentId']) : record['privacy'] === 'private')
      }
      renderRow={(record, helpers) => (
        <SubsystemTile
          record={record}
          helpers={helpers}
          people={membersIn(record.id)}
          children={subsystems.items.filter((item) => item['parentId'] === record.id)}
          parent={byId.get(String(record['parentId'] ?? '')) ?? null}
          fronts={fronts.items}
        />
      )}
      above={
        <>
          <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
            {(
              [
                ['all', 'All'],
                ['top', 'Top level'],
                ['nested', 'Nested'],
                ['private', 'Private'],
              ] as const
            ).map(([value, label]) => (
              <Chip key={value} selected={level === value} onClick={() => setLevel(value)}>
                {label}
              </Chip>
            ))}
          </div>
          {tree.length > 0 ? (
            <Card title="How it is arranged" style={{ marginBottom: 'var(--space-4)' }}>
              <SubsystemTree nodes={tree} membersIn={membersIn} depth={0} />
              {members.items.some((member) => !member['subsystemId']) ? (
                <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
                  {members.items.filter((member) => !member['subsystemId']).length}{' '}
                  {term('{{members}} are not in a {{subsystem}} — that is a normal state, not a gap.')}
                </p>
              ) : null}
            </Card>
          ) : null}
        </>
      }
    />
  );
}

/** A subsystem in the list. Clicking opens its preview; editing is a deliberate second step. */
function SubsystemTile({
  record,
  helpers,
  people,
  children: nested,
  parent,
  fronts,
}: {
  record: StoredRecord;
  helpers: RowHelpers;
  people: StoredRecord[];
  children: StoredRecord[];
  parent: StoredRecord | null;
  fronts: StoredRecord[];
}): JSX.Element {
  const { term } = useI18n();
  const preview = useDialog();
  const name = String(record['name']);
  const ids = new Set(people.map((member) => member.id));
  const mine = fronts.filter((event) => ids.has(String(event['memberId'])));
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recent = mine.filter((event) => Date.parse(String(event['startedAt'])) >= monthAgo);
  const hours = Math.round(
    mine.reduce((sum, event) => {
      const start = Date.parse(String(event['startedAt']));
      const end = event['endedAt'] ? Date.parse(String(event['endedAt'])) : Date.now();
      return sum + Math.max(0, end - start) / 3_600_000;
    }, 0),
  );
  const count = `${people.length} ${term(people.length === 1 ? '{{member}}' : '{{members}}')}`;

  return (
    <>
      <ProfileTile
        name={name}
        subtitle={count}
        avatarUrl={(record['avatarUrl'] as string) || null}
        bannerUrl={(record['bannerUrl'] as string) || null}
        color={(record['color'] as string) || null}
        icon={(record['icon'] as string) || null}
        badge={record['privacy'] === 'private' ? <Chip>Private</Chip> : null}
        onOpen={() => preview.show()}
      />
      <ProfilePreviewDialog
        open={preview.open}
        onClose={preview.hide}
        name={name}
        subtitle={[count, parent ? `inside ${String(parent['name'])}` : 'top level'].join(' · ')}
        bio={(record['description'] as string) || null}
        avatarUrl={(record['avatarUrl'] as string) || null}
        bannerUrl={(record['bannerUrl'] as string) || null}
        color={(record['color'] as string) || null}
        icon={(record['icon'] as string) || null}
        customInfo={record['customInfo']}
        customSections={record['customSections']}
        stats={[
          { label: term('{{members}}'), value: people.length },
          { label: 'Nested', value: nested.length },
          { label: 'Fronts (30 days)', value: recent.length },
          { label: 'Hours fronting', value: hours },
          { label: 'Privacy', value: record['privacy'] === 'private' ? 'Only me' : 'Whole system' },
        ]}
        onEdit={() => {
          preview.hide();
          helpers.edit();
        }}
        onDelete={() => {
          preview.hide();
          helpers.remove();
        }}
      >
        {people.length > 0 ? (
          <Card title={term('{{members}}')}>
            <div className="row">
              {people.map((member) => (
                <span key={member.id} className="row row--nowrap" style={{ gap: 6 }}>
                  <Avatar
                    name={String(member['name'])}
                    src={(member['avatarUrl'] as string) || null}
                    color={(member['color'] as string) ?? null}
                    icon={(member['icon'] as string) ?? null}
                    size={28}
                    round
                  />
                  <span className="small">{String(member['name'])}</span>
                </span>
              ))}
            </div>
          </Card>
        ) : null}
        {parent || nested.length > 0 ? (
          <Card title="Relationships">
            <div className="row">
              {parent ? <Chip>Part of {String(parent['name'])}</Chip> : null}
              {nested.map((child) => (
                <Chip key={child.id}>Contains {String(child['name'])}</Chip>
              ))}
            </div>
          </Card>
        ) : null}
      </ProfilePreviewDialog>
    </>
  );
}

interface TreeNode {
  record: StoredRecord;
  children: TreeNode[];
}

function buildTree(records: StoredRecord[]): TreeNode[] {
  const byParent = new Map<string, StoredRecord[]>();
  for (const record of records) {
    const parent = (record['parentId'] as string) || '';
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(record);
    else byParent.set(parent, [record]);
  }

  const build = (parentId: string, seen: Set<string>): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      // A cycle in the data must not become an infinite render.
      .filter((record) => !seen.has(record.id))
      .map((record) => ({
        record,
        children: build(record.id, new Set([...seen, record.id])),
      }));

  return build('', new Set());
}

function SubsystemTree({
  nodes,
  membersIn,
  depth,
}: {
  nodes: TreeNode[];
  membersIn: (id: string) => StoredRecord[];
  depth: number;
}): JSX.Element {
  const { term } = useI18n();
  return (
    <ul style={{ listStyle: 'none', paddingLeft: depth === 0 ? 0 : 'var(--space-5)', margin: 0 }}>
      {nodes.map((node) => {
        const people = membersIn(node.record.id);
        return (
          <li key={node.record.id} style={{ padding: 'var(--space-2) 0' }}>
            <div className="row row--nowrap">
              <span style={{ color: (node.record['color'] as string) ?? 'var(--accent)' }}>
                <Icon name="subsystem" size={15} />
              </span>
              <strong className="small">{String(node.record['name'])}</strong>
              {people.length > 0 ? (
                <span className="tiny faint">
                  {people.length} {term(people.length === 1 ? '{{member}}' : '{{members}}')}
                </span>
              ) : null}
            </div>
            {people.length > 0 ? (
              <div className="row" style={{ marginTop: 'var(--space-1)', paddingLeft: 'var(--space-5)' }}>
                {people.map((member) => (
                  <Chip key={member.id} color={(member['color'] as string) ?? null}>
                    {String(member['name'])}
                  </Chip>
                ))}
              </div>
            ) : null}
            {node.children.length > 0 ? (
              <SubsystemTree nodes={node.children} membersIn={membersIn} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
