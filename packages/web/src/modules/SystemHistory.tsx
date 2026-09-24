import { useMemo, useState } from 'react';
import { addDays, HISTORY_CATEGORIES, startOfDay } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useQuery, useRecordMap } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, SectionHeading } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * System history.
 *
 * Written by the server as things happen, so the record cannot disagree with
 * what changed. Filterable by member, by kind of event, and by how far back to
 * look.
 */

interface HistoryItem {
  id: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  memberId: string | null;
  note: string;
  automatic: boolean;
  category: string;
  entityType: string;
  previousValue: string;
  newValue: string;
  restorable: boolean;
}

const CATEGORY_LABELS = new Map<string, string>(
  HISTORY_CATEGORIES.map((category) => [category.value, category.label]),
);

function parseHistoryValue(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatHistoryScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return 'updated';
  return String(value);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * A restorable diff's stored values are JSON. Some settings are a single
 * value — a plain "lexend → serif" — but a setting like the whole theme is
 * one object with a dozen keys, and only ever one or two actually change.
 * Diffing those key by key says what happened instead of dumping both
 * copies of the object side by side.
 */
function summarizeHistoryDiff(previousRaw: string, newRaw: string): string {
  const previous = parseHistoryValue(previousRaw);
  const next = parseHistoryValue(newRaw);

  if (isPlainObject(previous) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const changes: string[] = [];
    for (const key of keys) {
      if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
      changes.push(`${key}: ${formatHistoryScalar(previous[key])} → ${formatHistoryScalar(next[key])}`);
    }
    if (changes.length === 0) return '';
    return changes.length > 3 ? `${changes.slice(0, 3).join(', ')}, …` : changes.join(', ');
  }

  return `${formatHistoryScalar(previous)} → ${formatHistoryScalar(next)}`;
}

const RANGES = [
  { days: 7, label: 'Last week' },
  { days: 30, label: 'Last month' },
  { days: 90, label: 'Three months' },
  { days: 0, label: 'Everything' },
];

export default function SystemHistory(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const { restoreHistoryEntry } = useAuth();
  const members = useRecordMap('members');

  const [days, setDays] = useState(30);
  const [eventType, setEventType] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  /*
   * The window starts at the beginning of a day rather than at "now minus N
   * days". That is what "last week" means to a reader, and it also gives
   * `useQuery` a value that is identical across renders — a start time that
   * moved by a millisecond each time would change the query and refetch
   * forever.
   */
  const from = useMemo(
    () => (days > 0 ? startOfDay(addDays(new Date(), -days)).toISOString() : null),
    [days],
  );

  const history = useQuery<{
    items: HistoryItem[];
    total: number;
    eventTypes: { key: string; count: number }[];
    categories: { key: string; count: number }[];
  }>('/api/stats/activity', {
    limit: 150,
    ...(eventType ? { eventType } : {}),
    ...(category ? { category } : {}),
    ...(memberId ? { memberId } : {}),
    ...(from ? { from } : {}),
  });

  const restore = async (item: HistoryItem): Promise<void> => {
    setRestoringId(item.id);
    try {
      await restoreHistoryEntry(item.id);
      toast.success('Restored', `${CATEGORY_LABELS.get(item.category) ?? 'That value'} is back to what it was.`);
      history.reload();
    } catch (cause) {
      toast.fromError(cause, 'Could not restore that');
    } finally {
      setRestoringId(null);
    }
  };

  const grouped = (history.data?.items ?? []).reduce<Map<string, HistoryItem[]>>((map, item) => {
    const key = item.occurredAt.slice(0, 10);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
    return map;
  }, new Map());

  return (
    <>
      <PageHeader
        title={term('{{System}} history')}
        description={term('What changed in the {{system}} and when, recorded as it happened.')}
      />

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="row">
          {RANGES.map((range) => (
            <Chip key={range.days} selected={days === range.days} onClick={() => setDays(range.days)}>
              {range.label}
            </Chip>
          ))}
        </div>

        {(history.data?.categories.length ?? 0) > 1 ? (
          <div className="row">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              Every category
            </Chip>
            {(history.data?.categories ?? []).map((entry) => (
              <Chip
                key={entry.key}
                selected={category === entry.key}
                onClick={() => setCategory(category === entry.key ? null : entry.key)}
              >
                {CATEGORY_LABELS.get(entry.key) ?? entry.key} · {entry.count}
              </Chip>
            ))}
          </div>
        ) : null}

        {(history.data?.eventTypes.length ?? 0) > 0 ? (
          <div className="row">
            <Chip selected={eventType === null} onClick={() => setEventType(null)}>
              All events
            </Chip>
            {(history.data?.eventTypes ?? []).slice(0, 10).map((type) => (
              <Chip
                key={type.key}
                selected={eventType === type.key}
                onClick={() => setEventType(eventType === type.key ? null : type.key)}
              >
                {friendlyEventName(type.key)} · {type.count}
              </Chip>
            ))}
          </div>
        ) : null}

        {members.size > 0 ? (
          <div className="row">
            <Chip selected={memberId === null} onClick={() => setMemberId(null)}>
              Everyone
            </Chip>
            {[...members.values()].map((member) => (
              <Chip
                key={member.id}
                selected={memberId === member.id}
                color={(member['color'] as string) ?? null}
                onClick={() => setMemberId(memberId === member.id ? null : member.id)}
              >
                {String(member['name'])}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {history.loading && !history.data ? (
        <SkeletonList rows={6} />
      ) : history.error ? (
        <ErrorPanel message={history.error} onRetry={history.reload} />
      ) : grouped.size === 0 ? (
        <Card>
          <EmptyState
            icon="history"
            title="Nothing in this range"
            body={term('History starts when the {{system}} does. Try a wider range, or clear the filters.')}
          />
        </Card>
      ) : (
        <div className="stack stack--loose">
          {[...grouped.entries()].map(([day, items]) => (
            <section key={day}>
              <SectionHeading label={dates.date(`${day}T12:00:00`)} />
              <Card flush>
                <div className="list">
                  {items.map((item) => {
                    const member = item.memberId ? members.get(item.memberId) : null;
                    const diff =
                      item.previousValue || item.newValue
                        ? summarizeHistoryDiff(item.previousValue, item.newValue)
                        : '';
                    return (
                      <div key={item.id} className="list-row">
                        {member ? (
                          <Avatar
                            name={String(member['name'])}
                            color={(member['color'] as string) ?? null}
                            icon={(member['icon'] as string) ?? null}
                            size={26}
                            round
                          />
                        ) : (
                          <span style={{ color: 'var(--text-faint)' }}>
                            <Icon name={iconFor(item.eventType)} size={16} />
                          </span>
                        )}
                        <span className="list-row__body">
                          <span className="list-row__title">{item.summary}</span>
                          <span className="list-row__meta">
                            <span>{dates.time(item.occurredAt)}</span>
                            <Chip>{CATEGORY_LABELS.get(item.category) ?? item.category}</Chip>
                            <span className="faint">{friendlyEventName(item.eventType)}</span>
                            {item.note ? <span className="faint">{item.note}</span> : null}
                          </span>
                          {diff ? (
                            <span className="small faint" style={{ overflowWrap: 'anywhere' }}>
                              {diff}
                            </span>
                          ) : null}
                        </span>
                        {item.restorable ? (
                          <span className="list-row__trailing">
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={restoringId === item.id}
                              onClick={() => void restore(item)}
                            >
                              Restore
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function friendlyEventName(eventType: string): string {
  const [area, action] = eventType.split('.');
  if (!action) return eventType;
  return `${area!.replace(/([A-Z])/g, ' $1').toLowerCase()} ${action}`.trim();
}

function iconFor(eventType: string): 'front' | 'member' | 'system' | 'poll' | 'settings' | 'backup' | 'history' {
  if (eventType.startsWith('front')) return 'front';
  if (eventType.startsWith('member')) return 'member';
  if (eventType.startsWith('system')) return 'system';
  if (eventType.startsWith('poll')) return 'poll';
  if (eventType.startsWith('settings')) return 'settings';
  if (eventType.startsWith('data')) return 'backup';
  return 'history';
}
