import { useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { useDateFormat } from '../core/i18n.js';
import { Avatar, Chip, IconButton, ListRow } from '../ui/primitives.js';

/**
 * Five small shared boards, one collection. A post's `boardType` decides
 * which board it belongs to — switching tabs here is just a filter, not a
 * different screen, so adding a sixth kind later is one more chip.
 */

const KINDS = [
  { value: 'obsession', label: 'Obsessed with' },
  { value: 'vibe', label: "Today's vibe" },
  { value: 'insideJoke', label: 'Inside jokes' },
  { value: 'memory', label: 'Memories' },
  { value: 'fridge', label: 'Fridge' },
] as const;

export default function Boards(): JSX.Element {
  const dates = useDateFormat();
  const [kind, setKind] = useState<string | null>(null);

  return (
    <CollectionScreen
      collection="boards"
      title="Boards"
      description="Small, shared, and easy to ignore — post a thought, a vibe, or an inside joke for the {{system}} to find."
      emptyTitle="Nothing posted yet"
      emptyBody="Pick a board below and leave something for the rest of the system."
      filter={(record) => !kind || record['boardType'] === kind}
      newRecordDefaults={kind ? { boardType: kind } : {}}
      above={
        <div className="row" style={{ gap: 6, marginBottom: 'var(--space-4)' }}>
          <Chip selected={kind === null} onClick={() => setKind(null)}>
            All
          </Chip>
          {KINDS.map((item) => (
            <Chip key={item.value} selected={kind === item.value} onClick={() => setKind(item.value)}>
              {item.label}
            </Chip>
          ))}
        </div>
      }
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const authorName = helpers.memberName((record['authorMemberId'] as string) ?? null);
        const label = KINDS.find((item) => item.value === record['boardType'])?.label ?? 'Board';
        return (
          <ListRow
            key={record.id}
            onClick={helpers.edit}
            leading={<Avatar name={authorName ?? '?'} color={(record['color'] as string) ?? null} size={36} />}
            title={String(record['body'] ?? '')}
            meta={
              <>
                <span className="faint">{authorName ?? 'Someone'}</span>
                <span className="faint">{label}</span>
                <span className="faint">{dates.relative(String(record['createdAt']))}</span>
              </>
            }
            trailing={<IconButton icon="trash" label="Delete post" variant="ghost" size="sm" onClick={helpers.remove} />}
          />
        );
      }}
    />
  );
}
