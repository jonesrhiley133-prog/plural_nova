import type { StoredRecord } from '@pluralnova/shared';
import { now, traditionDue } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { Button, Chip, ListRow } from '../ui/primitives.js';

/**
 * Things the system does together on a rhythm. Due dates are computed, not
 * stored, from the same recurrence shape Calendar events use — and shown
 * here, never pushed as a notification, since the whole point is that
 * nothing about this is an obligation.
 */
export default function Traditions(): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();

  return (
    <CollectionScreen
      collection="traditions"
      description="Things the {{system}} does together on a rhythm — a movie night, a monthly check-in, whatever yours looks like."
      emptyTitle="No traditions yet"
      emptyBody="Start one below — pick a template or write your own, and say how often it comes around."
      sort={(a, b) => {
        const dueA = traditionDue(toDueInput(a)).dueDate;
        const dueB = traditionDue(toDueInput(b)).dueDate;
        if (!dueA && !dueB) return 0;
        if (!dueA) return 1;
        if (!dueB) return -1;
        return dueA.getTime() - dueB.getTime();
      }}
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const due = traditionDue(toDueInput(record));
        return (
          <ListRow
            key={record.id}
            onClick={helpers.edit}
            title={String(record['title'] ?? '')}
            meta={
              <>
                {record['description'] ? (
                  <span className="faint truncate">{String(record['description'])}</span>
                ) : null}
                {due.dueDate ? (
                  <Chip color={due.isDueNow ? 'var(--positive)' : null}>
                    {due.isDueNow ? 'Due now' : `Due ${dates.date(due.dueDate)}`}
                  </Chip>
                ) : (
                  <span className="faint">Done</span>
                )}
              </>
            }
            trailing={
              <Button
                variant={due.isDueNow ? 'primary' : 'ghost'}
                size="sm"
                onClick={async (event) => {
                  event.stopPropagation();
                  await helpers.update({ lastCelebratedAt: now() });
                  toast.success('We did it!');
                }}
              >
                We did it!
              </Button>
            }
          />
        );
      }}
    />
  );
}

function toDueInput(record: StoredRecord): Parameters<typeof traditionDue>[0] {
  return {
    anchorDate: String(record['anchorDate'] ?? ''),
    isRecurring: record['isRecurring'] === true,
    recurrenceType: (record['recurrenceType'] as string) ?? null,
    recurrenceInterval: (record['recurrenceInterval'] as number) ?? null,
    recurrenceWeekdays: (record['recurrenceWeekdays'] as number[]) ?? null,
    lastCelebratedAt: (record['lastCelebratedAt'] as string) ?? null,
  };
}
