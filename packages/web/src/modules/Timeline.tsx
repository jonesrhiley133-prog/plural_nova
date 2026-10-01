import { useMemo, useState } from 'react';
import { emotionIdsOf, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useAllEmotions } from '../core/emotions.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Card, Chip } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon, type IconName } from '../ui/Icon.js';

/**
 * The timeline.
 *
 * Fronting, journal entries, moods and emotions all keep their own screen for
 * actually working with one of them — this is the other view, the one that
 * answers "what happened, in what order" across all four at once, which no
 * single collection's own list can show. Each source already sorts by recency
 * on its own, so merging the four is just that: a merge, not a re-derivation
 * of what "recent" means for any of them.
 */

type TimelineType = 'front' | 'journal' | 'mood' | 'emotion';

interface TimelineEntry {
  id: string;
  type: TimelineType;
  timestamp: string;
  memberId: string | null;
  title: string;
  subtitle: string;
}

const FETCH_LIMIT = 40;

/** "happy", "happy and excited", "happy, excited, and nervous" — for an entry that recorded more than one of something. */
function joinWithAnd(items: string[]): string {
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items);
}

export default function Timeline(): JSX.Element {
  const { term } = useI18n();
  const dates = useDateFormat();
  const members = useRecordMap('members');
  const { findEmotion } = useAllEmotions();

  const front = useCollection('frontEvents', { limit: FETCH_LIMIT });
  const journal = useCollection('journalEntries', { limit: FETCH_LIMIT });
  const moods = useCollection('moodEntries', { limit: FETCH_LIMIT });
  const emotions = useCollection('emotionEntries', { limit: FETCH_LIMIT });

  const [activeTypes, setActiveTypes] = useState<Set<TimelineType> | null>(null);

  const typeMeta: Record<TimelineType, { icon: IconName; label: string }> = {
    front: { icon: 'front', label: term('{{Fronting}}') },
    journal: { icon: 'journal', label: term('{{Journal}}') },
    mood: { icon: 'mood', label: 'Moods' },
    emotion: { icon: 'emotion', label: 'Emotions' },
  };

  const memberName = (id: string | null): string | null =>
    id ? (members.get(id)?.['name'] as string | undefined) ?? null : null;

  const entries = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [];

    for (const record of front.items) {
      const startedAt = String(record['startedAt'] ?? '');
      if (!startedAt) continue;
      const name = memberName((record['memberId'] as string) ?? null) ?? 'Someone';
      const coFronters = ((record['coFronterIds'] as string[]) ?? [])
        .map((id) => memberName(id))
        .filter((value): value is string => Boolean(value));
      list.push({
        id: `front-${record.id}`,
        type: 'front',
        timestamp: startedAt,
        memberId: (record['memberId'] as string) ?? null,
        title: coFronters.length > 0 ? `${name} and ${coFronters.join(', ')} started fronting` : `${name} started fronting`,
        subtitle: String(record['activity'] ?? ''),
      });
    }

    for (const record of journal.items) {
      const entryDate = String(record['entryDate'] ?? '');
      if (!entryDate) continue;
      list.push({
        id: `journal-${record.id}`,
        type: 'journal',
        timestamp: entryDate,
        memberId: (record['memberId'] as string) ?? null,
        title: String(record['title'] ?? '').trim() || 'Untitled entry',
        subtitle: String(record['body'] ?? '').replace(/\s+/g, ' ').slice(0, 140),
      });
    }

    for (const record of moods.items) {
      const recordedAt = String(record['recordedAt'] ?? '');
      if (!recordedAt) continue;
      const name = memberName((record['memberId'] as string) ?? null);
      list.push({
        id: `mood-${record.id}`,
        type: 'mood',
        timestamp: recordedAt,
        memberId: (record['memberId'] as string) ?? null,
        title: name ? `${name} logged a mood` : 'A mood was logged',
        subtitle: `${String(record['label'] ?? '')}${record['score'] ? ` · ${String(record['score'])}/10` : ''}`,
      });
    }

    for (const record of emotions.items) {
      const recordedAt = String(record['recordedAt'] ?? '');
      if (!recordedAt) continue;
      const name = memberName((record['memberId'] as string) ?? null);
      const recordedEmotions = emotionIdsOf(record)
        .map((id) => findEmotion(id))
        .filter((item): item is NonNullable<typeof item> => item != null);
      const emotionNames = recordedEmotions.length > 0 ? recordedEmotions.map((item) => item.name) : [String(record['emotionId'] ?? 'an emotion')];
      const felt = joinWithAnd(emotionNames.map((value) => value.toLowerCase()));
      list.push({
        id: `emotion-${record.id}`,
        type: 'emotion',
        timestamp: recordedAt,
        memberId: (record['memberId'] as string) ?? null,
        title: name ? `${name} felt ${felt}` : `Felt ${felt}`,
        subtitle: recordedEmotions.map((item) => item.emoji).join(' '),
      });
    }

    return list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [front.items, journal.items, moods.items, emotions.items, members, findEmotion]);

  const visible = activeTypes ? entries.filter((entry) => activeTypes.has(entry.type)) : entries;

  const groups = useMemo(() => {
    const byDay = new Map<string, TimelineEntry[]>();
    for (const entry of visible) {
      const key = entry.timestamp.slice(0, 10);
      const bucket = byDay.get(key) ?? [];
      bucket.push(entry);
      byDay.set(key, bucket);
    }
    return [...byDay.entries()];
  }, [visible]);

  const toggleType = (type: TimelineType): void => {
    setActiveTypes((current) => {
      const base = current ?? new Set(Object.keys(typeMeta) as TimelineType[]);
      const next = new Set(base);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const loading = front.loading && journal.loading && moods.loading && emotions.loading;
  const error = front.error ?? journal.error ?? moods.error ?? emotions.error;

  return (
    <>
      <PageHeader
        title="Timeline"
        description={term('{{Fronting}}, {{journal}} entries, moods and emotions, in the order they happened.')}
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {(Object.keys(typeMeta) as TimelineType[]).map((type) => (
          <Chip
            key={type}
            selected={!activeTypes || activeTypes.has(type)}
            onClick={() => toggleType(type)}
          >
            <Icon name={typeMeta[type].icon} size={13} /> {typeMeta[type].label}
          </Chip>
        ))}
      </div>

      {loading && entries.length === 0 ? (
        <SkeletonList rows={6} />
      ) : error && entries.length === 0 ? (
        <ErrorPanel
          message={error}
          onRetry={() => {
            void front.reload();
            void journal.reload();
            void moods.reload();
            void emotions.reload();
          }}
        />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="clock"
            title="Nothing here yet"
            body="As fronting, journal entries, moods and emotions get logged, they'll line up here in the order they happened."
          />
        </Card>
      ) : (
        <div className="stack">
          {groups.map(([day, dayEntries]) => (
            <Card key={day} title={dates.date(`${day}T12:00:00`)} flush>
              <div className="list">
                {dayEntries.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} icon={typeMeta[entry.type].icon} time={dates.time(entry.timestamp)} member={entry.memberId ? members.get(entry.memberId) ?? null : null} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function TimelineRow({
  entry,
  icon,
  time,
  member,
}: {
  entry: TimelineEntry;
  icon: IconName;
  time: string;
  member: StoredRecord | null;
}): JSX.Element {
  return (
    <div className="list-row">
      {member ? (
        <Avatar
          name={String(member['name'])}
          color={(member['color'] as string) ?? null}
          size={32}
          round
        />
      ) : (
        <span className="list-row__icon">
          <Icon name={icon} size={16} />
        </span>
      )}
      <span className="list-row__body">
        <span className="list-row__title">{entry.title}</span>
        {entry.subtitle ? <span className="list-row__meta faint truncate">{entry.subtitle}</span> : null}
      </span>
      <span className="faint tiny">{time}</span>
    </div>
  );
}
