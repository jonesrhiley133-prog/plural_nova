import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { now, type StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Chip, ListRow, Stat } from '../ui/primitives.js';
import { useDateFormat } from '../core/i18n.js';
import { useRecordMap } from '../core/data.js';
import { Markdown } from '../ui/Markdown.js';
import {
  DetailCover,
  DetailFacts,
  DetailTags,
  DetailText,
  byText,
  newestFirst,
  memberNames,
} from '../ui/detailParts.js';

/**
 * The journal.
 *
 * Built on the shared CollectionScreen, so it gets the same unified toolbar —
 * search, filter by mood / emotions / tags / author, and sort by date — as
 * every other list module. Daily entries are one tap: the "New entry" button
 * pre-fills today's date.
 */
export default function Journal(): JSX.Element {
  const [params] = useSearchParams();
  const dates = useDateFormat();
  const members = useRecordMap('members');

  const prefillMemberId = params.get('memberId');
  const prefillTag = params.get('tag');

  const newRecordDefaults = useMemo(
    () => ({
      entryDate: now(),
      ...(prefillMemberId ? { memberId: prefillMemberId } : {}),
      ...(prefillTag ? { tags: [prefillTag] } : {}),
    }),
    [prefillMemberId, prefillTag],
  );

  return (
    <CollectionScreen
      collection="journalEntries"
      description="Daily entries, sorted by date, tagged with moods and emotions."
      emptyTitle="No entries yet"
      emptyBody={'Write your first entry — tap "New entry" and today\'s date is already filled in.'}
      autoCreate={params.get('new') === '1'}
      newRecordDefaults={newRecordDefaults}
      formOmit={['attachmentIds', 'moodScore']}
      filters={[
        { field: 'mood', label: 'Mood' },
        { field: 'emotions', label: 'Emotions' },
        { field: 'tags', label: 'Tags' },
        { field: 'memberId', label: 'Author' },
        { field: 'pinned', label: '📌 Pinned' },
      ]}
      sorts={[
        { id: 'newest', label: 'Newest first', compare: newestFirst('entryDate') },
        { id: 'oldest', label: 'Oldest first', compare: (a, b) => String(a['entryDate'] ?? '').localeCompare(String(b['entryDate'] ?? '')) },
        { id: 'title', label: 'Title A–Z', compare: byText('title') },
      ]}
      stats={(all) => {
        const moods = new Set<string>();
        for (const r of all) if (r['mood']) moods.add(String(r['mood']));
        return (
          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat label="Entries" value={all.length} />
            <Stat label="Moods used" value={moods.size} />
            <Stat label="Pinned" value={all.filter((r) => r['pinned'] === true).length} />
            <Stat label="Drafts" value={all.filter((r) => r['isDraft'] === true).length} />
          </div>
        );
      }}
      detail={(record, helpers) => <JournalDetail record={record} helpers={helpers} />}
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const author = record['memberId'] ? members.get(String(record['memberId'])) : null;
        const authorName = author ? String(author['name']) : null;
        const emotions = (record['emotions'] as string[] | undefined) ?? [];
        return (
          <ListRow
            key={record.id}
            onClick={helpers.open}
            title={`${record['pinned'] === true ? '📌 ' : ''}${String(record['title'] || 'Untitled')}`}
            meta={
              <>
                {authorName ? <Chip>{authorName}</Chip> : null}
                <span className="faint">{dates.dateTime(String(record['entryDate']))}</span>
                {record['mood'] ? <Chip>😊 {String(record['mood'])}</Chip> : null}
                {emotions.slice(0, 3).map((e) => (
                  <Chip key={e}>{e}</Chip>
                ))}
              </>
            }
          />
        );
      }}
    />
  );
}

function JournalDetail({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const dates = useDateFormat();
  const emotions = (record['emotions'] as string[] | undefined) ?? [];
  const sensations = (record['sensations'] as string[] | undefined) ?? [];
  const authors = memberNames(record['authorIds'], helpers.memberName);
  const fronting = memberNames(record['frontingMemberIds'], helpers.memberName);

  return (
    <>
      <DetailCover url={record['coverImageUrl']} />
      <DetailText text={record['body']} />
      <DetailFacts
        facts={[
          ['Date', dates.dateTime(String(record['entryDate']))],
          ['Mood', record['mood'] ? `😊 ${String(record['mood'])}` : ''],
          ['Energy', record['energy'] ? `${String(record['energy'])} / 5` : ''],
          ['Author', helpers.memberName((record['memberId'] as string) ?? null)],
          ['Written by', authors],
          ['Fronting at the time', fronting],
          ['Series', String(record['collection'] ?? '')],
          ['Visibility', String(record['privacy'] ?? '')],
        ]}
      />
      {emotions.length > 0 ? (
        <div>
          <h3 className="small faint" style={{ marginBottom: 'var(--space-1)' }}>Emotions</h3>
          <div className="row">
            {emotions.map((e) => (
              <Chip key={e}>{e}</Chip>
            ))}
          </div>
        </div>
      ) : null}
      {sensations.length > 0 ? (
        <div>
          <h3 className="small faint" style={{ marginBottom: 'var(--space-1)' }}>Sensations</h3>
          <div className="row">
            {sensations.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>
      ) : null}
      <DetailTags tags={record['tags']} />
    </>
  );
}
