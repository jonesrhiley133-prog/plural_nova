import { useNavigate } from 'react-router-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { useActiveMemberId } from '../core/auth.js';
import { useDateFormat } from '../core/i18n.js';
import { Button, IconButton, ListRow } from '../ui/primitives.js';

const KIND_LABELS: Record<string, string> = {
  note: 'Note',
  compliment: 'Compliment',
  greeting: 'Greeting',
  recommendation: 'Recommendation',
  wasHere: 'I was here',
  surprise: 'Surprise',
};

export default function Compliments(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const activeMemberId = useActiveMemberId();

  return (
    <CollectionScreen
      collection="memberNotes"
      title="Compliments"
      description="Leave something for a specific alter, or for the whole {{system}} — mark who it's for when you write it."
      emptyTitle="Nothing here yet"
      emptyBody="Leave a note, a compliment, or a greeting. Anything scheduled for later appears once its time comes."
      newRecordDefaults={activeMemberId ? { fromMemberId: activeMemberId } : {}}
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/polls')}>
          Ask the system instead?
        </Button>
      }
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const fromName = helpers.memberName((record['fromMemberId'] as string) ?? null);
        const toIds = (record['toMemberIds'] as string[] | null) ?? [];
        const toNames = toIds.map((id) => helpers.memberName(id)).filter((name): name is string => Boolean(name));
        const toText = toIds.length === 0 ? 'the whole system' : toNames.join(', ') || 'specific alters';
        const kind = KIND_LABELS[record['kind'] as string] ?? 'Note';
        const sticker = record['sticker'] ? `${String(record['sticker'])} ` : '';

        return (
          <ListRow
            key={record.id}
            onClick={helpers.edit}
            title={`${sticker}${String(record['body'] ?? '')}`}
            meta={
              <>
                <span className="faint">
                  {fromName ?? 'Someone'} → {toText}
                </span>
                <span className="faint">{kind}</span>
                <span className="faint">{dates.relative(String(record['createdAt']))}</span>
              </>
            }
            trailing={<IconButton icon="trash" label="Delete" variant="ghost" size="sm" onClick={helpers.remove} />}
          />
        );
      }}
    />
  );
}
