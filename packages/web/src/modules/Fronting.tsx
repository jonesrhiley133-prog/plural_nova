import { useMemo, useState } from 'react';
import { dayKey, formatDuration, eventMinutes, type FrontEventLike } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';
import { memberColor } from '../charts/palette.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * The front tracker.
 *
 * Four views over the same events: a timeline, and day, week and month
 * summaries. Historical entries are editable — including reopening one that was
 * closed by mistake — because a tracker nobody can correct stops being used.
 */

type View = 'timeline' | 'day' | 'week' | 'month';

export default function Fronting(): JSX.Element {
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const members = useRecordMap('members');
  const [view, setView] = useState<View>('timeline');
  const [memberFilter, setMemberFilter] = useState<string | null>(null);

  const { items, loading, error, reload, update, remove } = useCollection('frontEvents', {
    ...(memberFilter
      ? {
          filter: (record) =>
            record['memberId'] === memberFilter ||
            (Array.isArray(record['coFronterIds']) &&
              (record['coFronterIds'] as string[]).includes(memberFilter)),
        }
      : {}),
  });

  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();

  const grouped = useMemo(() => groupByPeriod(items, view), [items, view]);
  const memberList = useMemo(() => [...members.values()], [members]);

  const nameOf = (id: string | null): string =>
    id ? String(members.get(id)?.['name'] ?? 'Unknown') : term('Unknown');

  return (
    <>
      <PageHeader
        title={term('{{Fronting}}')}
        description={term('Every {{front}} recorded, and every one editable.')}
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <SegmentedControl
          value={view}
          onChange={setView}
          label="View"
          options={(['timeline', 'day', 'week', 'month'] as const).map((option) => ({
            value: option,
            label: option === 'timeline' ? 'Timeline' : `By ${option}`,
          }))}
        />
        <span className="spacer" />
        {memberList.length > 1 ? (
          <div className="row">
            <Chip selected={memberFilter === null} onClick={() => setMemberFilter(null)}>
              Everyone
            </Chip>
            {memberList.slice(0, 6).map((member) => (
              <Chip
                key={member.id}
                selected={memberFilter === member.id}
                onClick={() => setMemberFilter(member.id)}
                color={(member['color'] as string) ?? null}
              >
                {String(member['name'])}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        items={grouped}
        onRetry={reload}
        empty={{
          title: term('No {{fronts}} recorded'),
          body: term('Record one from Quick {{Front}} and it will show up here.'),
          icon: 'front',
        }}
      >
        {(groups) => (
          <div className="stack">
            {groups.map((group) => (
              <Card key={group.key} flush>
                <div
                  className="row row--between"
                  style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: 'var(--border-width) solid var(--border)' }}
                >
                  <div>
                    <div className="card__title">{group.label}</div>
                    <div className="card__subtitle">
                      {group.events.length} {group.events.length === 1 ? term('{{front}}') : term('{{fronts}}')}
                      {' · '}
                      {formatDuration(group.minutes)}
                    </div>
                  </div>
                  {group.shares.length > 0 ? (
                    <div
                      className="row row--nowrap"
                      style={{ gap: 2, width: 120, height: 8 }}
                      aria-hidden="true"
                    >
                      {group.shares.map((share) => (
                        <span
                          key={share.memberId}
                          title={`${nameOf(share.memberId)} · ${formatDuration(share.minutes)}`}
                          style={{
                            flex: share.minutes,
                            background: memberColor(
                              members.get(share.memberId) as { id: string; color?: string | null },
                            ),
                            borderRadius: 'var(--radius-xs)',
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="list">
                  {group.events.map((event) => {
                    const coFronters = ((event['coFronterIds'] as string[]) ?? [])
                      .map((id) => members.get(id))
                      .filter(Boolean) as StoredRecord[];
                    const open = !event['endedAt'];

                    return (
                      <div key={event.id} className="list-row">
                        <Avatar
                          name={nameOf((event['memberId'] as string) ?? null)}
                          src={(members.get(String(event['memberId']))?.['avatarUrl'] as string) ?? null}
                          color={(members.get(String(event['memberId']))?.['color'] as string) ?? null}
                          icon={(members.get(String(event['memberId']))?.['icon'] as string) ?? null}
                          size={34}
                          round
                        />
                        <span className="list-row__body">
                          <span className="list-row__title">
                            {event['unknownFronter'] === true
                              ? t('front.unknown')
                              : nameOf((event['memberId'] as string) ?? null)}
                            {coFronters.length > 0 ? (
                              <span className="faint"> + {coFronters.map((m) => String(m['name'])).join(', ')}</span>
                            ) : null}
                          </span>
                          <span className="list-row__meta">
                            <span>{dates.time(String(event['startedAt']))}</span>
                            {event['endedAt'] ? (
                              <span>→ {dates.time(String(event['endedAt']))}</span>
                            ) : (
                              <Chip accent>Still open</Chip>
                            )}
                            <span className="faint numeric">
                              {formatDuration(eventMinutes(toEventLike(event)))}
                            </span>
                            {event['activity'] ? <Chip>{String(event['activity'])}</Chip> : null}
                            {event['mood'] ? <Chip>{String(event['mood'])}</Chip> : null}
                          </span>
                        </span>
                        <span className="list-row__trailing">
                          {open ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const endedAt = new Date().toISOString();
                                void update(event.id, {
                                  endedAt,
                                  durationMinutes: Math.max(
                                    0,
                                    Math.round(
                                      (Date.parse(endedAt) - Date.parse(String(event['startedAt']))) / 60000,
                                    ),
                                  ),
                                })
                                  .then(() => toast.success(term('{{Front}} ended')))
                                  .catch((cause: unknown) => toast.fromError(cause));
                              }}
                            >
                              {t('front.end')}
                            </Button>
                          ) : null}
                          <IconButton
                            icon="edit"
                            label={term('Edit this {{front}}')}
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.show(event)}
                          />
                          <IconButton
                            icon="trash"
                            label={term('Delete this {{front}}')}
                            variant="ghost"
                            size="sm"
                            onClick={() => confirm.show(event)}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </AsyncContent>

      <Dialog open={editor.open} onClose={editor.hide} title={term('Edit this {{front}}')}>
        <RecordForm
          collection="frontEvents"
          record={editor.value}
          fields={[
            'startedAt',
            'endedAt',
            'coFronterIds',
            'activity',
            'mood',
            'locationIds',
            'note',
          ]}
          onSubmit={async (values) => {
            if (!editor.value) return;
            const startedAt = String(values['startedAt'] ?? editor.value['startedAt']);
            const endedAt = values['endedAt'] ? String(values['endedAt']) : null;
            await update(editor.value.id, {
              ...values,
              durationMinutes: endedAt
                ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000))
                : null,
            });
            toast.success('Saved');
            editor.hide();
          }}
          onCancel={editor.hide}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title={term('Delete this {{front}}?')}
        body={term('The {{front}} is removed from the timeline and from the statistics.')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function toEventLike(record: StoredRecord): FrontEventLike {
  return {
    id: record.id,
    memberId: (record['memberId'] as string) ?? null,
    coFronterIds: (record['coFronterIds'] as string[]) ?? [],
    startedAt: String(record['startedAt']),
    endedAt: (record['endedAt'] as string) ?? null,
    durationMinutes: (record['durationMinutes'] as number) ?? null,
  };
}

interface Group {
  key: string;
  label: string;
  events: StoredRecord[];
  minutes: number;
  shares: { memberId: string; minutes: number }[];
}

function groupByPeriod(records: StoredRecord[], view: View): Group[] {
  const groups = new Map<string, StoredRecord[]>();

  for (const record of records) {
    const startedAt = String(record['startedAt']);
    const key =
      view === 'month'
        ? startedAt.slice(0, 7)
        : view === 'week'
          ? weekLabelKey(startedAt)
          : dayKey(startedAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, events]) => {
      const shares = new Map<string, number>();
      let minutes = 0;
      for (const event of events) {
        const duration = eventMinutes(toEventLike(event));
        minutes += duration;
        for (const id of [event['memberId'], ...((event['coFronterIds'] as string[]) ?? [])]) {
          if (typeof id !== 'string' || !id) continue;
          shares.set(id, (shares.get(id) ?? 0) + duration);
        }
      }
      return {
        key,
        label: periodLabel(key, view),
        events: [...events].sort((a, b) =>
          String(b['startedAt']).localeCompare(String(a['startedAt'])),
        ),
        minutes,
        shares: [...shares.entries()]
          .map(([memberId, value]) => ({ memberId, minutes: value }))
          .sort((a, b) => b.minutes - a.minutes),
      };
    });
}

function weekLabelKey(value: string): string {
  const date = new Date(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dayKey(date);
}

function periodLabel(key: string, view: View): string {
  if (view === 'month') {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  const date = new Date(`${key}T00:00:00`);
  if (view === 'week') {
    return `Week of ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export { Icon };
