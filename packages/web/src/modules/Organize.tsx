import { useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * Organise.
 *
 * Moving members between groups and subsystems, and setting orbit order.
 * Drag-and-drop where a pointer supports it, arrow buttons everywhere — the
 * keyboard path is not a fallback, it is the same operation.
 */

type Bucket = { id: string | null; name: string; color: string | null; icon: string | null; kind: 'group' | 'subsystem' | 'none' };

export default function Organize(): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();

  const members = useCollection('members', { filter: (member) => member['archived'] !== true });
  const groups = useCollection('memberGroups');
  const subsystems = useCollection('subsystems');

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [mode, setMode] = useState<'group' | 'subsystem'>('group');
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groupEditor = useDialog<StoredRecord>();

  const buckets: Bucket[] = useMemo(() => {
    const source = mode === 'group' ? groups.items : subsystems.items;
    return [
      ...source.map((record) => ({
        id: record.id,
        name: String(record['name']),
        color: (record['color'] as string) ?? null,
        icon: (record['icon'] as string) ?? null,
        kind: mode,
      })),
      { id: null, name: mode === 'group' ? 'No group' : 'No subsystem', color: null, icon: null, kind: 'none' as const },
    ];
  }, [mode, groups.items, subsystems.items]);

  const field = mode === 'group' ? 'groupId' : 'subsystemId';

  const inBucket = (bucketId: string | null): StoredRecord[] => {
    const term = search.trim().toLowerCase();
    return members.items
      .filter((member) => (member[field] ?? null) === bucketId)
      .filter((member) => !term || String(member['name']).toLowerCase().includes(term))
      .sort((a, b) => Number(a['orbitOrder'] ?? 0) - Number(b['orbitOrder'] ?? 0));
  };

  const move = async (memberId: string, bucketId: string | null): Promise<void> => {
    setBusy(true);
    try {
      await api.post('/api/system/organize', {
        moves: [{ memberId, [field]: bucketId }],
      });
      await members.reload();
    } catch (cause) {
      toast.error('Could not move that', messageFor(cause));
    } finally {
      setBusy(false);
      setDragging(null);
    }
  };

  const reorder = async (bucketId: string | null, memberId: string, direction: -1 | 1): Promise<void> => {
    const list = inBucket(bucketId);
    const index = list.findIndex((member) => member.id === memberId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;

    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);

    setBusy(true);
    try {
      await api.post('/api/system/organize', {
        moves: next.map((member, position) => ({ memberId: member.id, orbitOrder: position })),
      });
      await members.reload();
    } catch (cause) {
      toast.error('Could not reorder', messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  if (members.loading) {
    return (
      <>
        <PageHeader title="Organise" />
        <SkeletonList rows={4} />
      </>
    );
  }

  if (members.items.length === 0) {
    return (
      <>
        <PageHeader title="Organise" />
        <Card>
          <EmptyState
            icon="organize"
            title={term('Nothing to organise yet')}
            body={term('Add a few {{members}} and this becomes useful.')}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Organise"
        description={term('Move {{members}} between groups and {{subsystems}}, and set the orbit order.')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => groupEditor.show()}>
            New {mode === 'group' ? 'group' : term('{{subsystem}}')}
          </Button>
        }
      />

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          label="Organise by"
          options={[
            { value: 'group', label: 'Groups' },
            { value: 'subsystem', label: term('{{Subsystems}}') },
          ]}
        />
        <SearchField value={rawSearch} onChange={setRawSearch} placeholder={term('Find a {{member}}…')} />
      </div>

      <div className="grid" style={{ ['--grid-min' as never]: '260px' }}>
        {buckets.map((bucket) => {
          const people = inBucket(bucket.id);
          return (
            <Card
              key={bucket.id ?? 'none'}
              title={
                <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
                  <span style={{ color: bucket.color ?? 'var(--text-faint)' }}>
                    <Icon name={bucket.kind === 'subsystem' ? 'subsystem' : 'group'} size={15} />
                  </span>
                  {bucket.icon ? `${bucket.icon} ` : ''}
                  {bucket.name}
                </span>
              }
              subtitle={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) void move(dragging, bucket.id);
              }}
              style={{ borderStyle: dragging ? 'dashed' : undefined }}
            >
              {people.length === 0 ? (
                <p className="tiny faint">Nobody here yet.</p>
              ) : (
                <div className="stack stack--tight">
                  {people.map((member, index) => (
                    <div
                      key={member.id}
                      className="row row--nowrap"
                      draggable
                      onDragStart={() => setDragging(member.id)}
                      onDragEnd={() => setDragging(null)}
                      style={{
                        padding: 'var(--space-2)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-sunken)',
                        cursor: 'grab',
                        opacity: dragging === member.id ? 0.5 : 1,
                      }}
                    >
                      <Avatar
                        name={String(member['name'])}
                        src={(member['avatarUrl'] as string) ?? null}
                        color={(member['color'] as string) ?? null}
                        icon={(member['icon'] as string) ?? null}
                        size={26}
                        round
                      />
                      <span className="small truncate" style={{ flex: 1 }}>
                        {String(member['name'])}
                      </span>
                      <IconButton
                        icon="chevronUp"
                        label={`Move ${String(member['name'])} up`}
                        variant="ghost"
                        size="sm"
                        disabled={index === 0 || busy}
                        onClick={() => void reorder(bucket.id, member.id, -1)}
                      />
                      <IconButton
                        icon="chevronDown"
                        label={`Move ${String(member['name'])} down`}
                        variant="ghost"
                        size="sm"
                        disabled={index === people.length - 1 || busy}
                        onClick={() => void reorder(bucket.id, member.id, 1)}
                      />
                      <select
                        className="select"
                        value={String(member[field] ?? '')}
                        aria-label={`Move ${String(member['name'])} to another ${mode}`}
                        onChange={(event) => void move(member.id, event.target.value || null)}
                        style={{ width: 34, padding: 4, minHeight: 30, backgroundImage: 'none' }}
                      >
                        {buckets.map((option) => (
                          <option key={option.id ?? 'none'} value={option.id ?? ''}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="tiny faint" style={{ marginTop: 'var(--space-4)' }}>
        Drag a card between columns, or use the dropdown beside it — both do the same thing.
      </p>

      <Dialog
        open={groupEditor.open}
        onClose={groupEditor.hide}
        title={mode === 'group' ? 'New group' : term('New {{subsystem}}')}
      >
        <RecordForm
          collection={mode === 'group' ? 'memberGroups' : 'subsystems'}
          onSubmit={async (values) => {
            if (mode === 'group') await groups.create(values);
            else await subsystems.create(values);
            toast.success('Created');
            groupEditor.hide();
          }}
          onCancel={groupEditor.hide}
        />
      </Dialog>
    </>
  );
}
