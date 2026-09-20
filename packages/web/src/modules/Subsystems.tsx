import { useMemo } from 'react';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card, Chip } from '../ui/primitives.js';
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

  const tree = useMemo(() => buildTree(subsystems.items), [subsystems.items]);
  const membersIn = (id: string): StoredRecord[] =>
    members.items.filter((member) => member['subsystemId'] === id);

  return (
    <CollectionScreen
      collection="subsystems"
      description={term('Groups inside the {{system}}. A {{subsystem}} can hold others.')}
      emptyTitle={term('No {{subsystems}} yet')}
      emptyBody={term('Useful when the {{system}} has clusters that make sense together.')}
      above={
        tree.length > 0 ? (
          <Card title="How it is arranged" style={{ marginBottom: 'var(--space-4)' }}>
            <SubsystemTree nodes={tree} membersIn={membersIn} depth={0} />
            {members.items.some((member) => !member['subsystemId']) ? (
              <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
                {members.items.filter((member) => !member['subsystemId']).length}{' '}
                {term('{{members}} are not in a {{subsystem}} — that is a normal state, not a gap.')}
              </p>
            ) : null}
          </Card>
        ) : null
      }
    />
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
                  {people.length} {people.length === 1 ? 'member' : 'members'}
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
