import type { StoredRecord } from '@pluralnova/shared';
import { OPTIONS } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Button, Chip, IconButton, ListRow, Meter, Stat } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import {
  DetailFacts,
  DetailProgress,
  DetailTags,
  DetailText,
  DetailCover,
  byText,
  memberNames,
  newestFirst,
} from '../ui/detailParts.js';

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  OPTIONS.readingStatus.map((o) => [o.value, o.label]),
);
const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * A reading tracker. It keeps your own record of what you are reading rather
 * than depending on any site's API staying available — links go out, the
 * progress stays here.
 */
export default function FicTracker(): JSX.Element {
  return (
    <CollectionScreen
      collection="fics"
      description="What you are reading, where you got to, and what you thought."
      emptyTitle="Nothing tracked yet"
      emptyBody="Add a fic with its link and chapter count, and update your progress as you read."
      filters={[
        { field: 'status' },
        { field: 'fandom' },
        { field: 'platform' },
        { field: 'contentRating', label: 'Rating' },
        { field: 'tags' },
        { field: 'favorite', label: '★ Favourites' },
      ]}
      sorts={[
        { id: 'recent', label: 'Recently updated', compare: newestFirst('updatedAt') },
        { id: 'title', label: 'Title A–Z', compare: byText('title') },
        { id: 'author', label: 'Author A–Z', compare: byText('author') },
        { id: 'rating', label: 'Highest rated', compare: (a, b) => Number(b['rating'] ?? 0) - Number(a['rating'] ?? 0) },
        { id: 'words', label: 'Longest', compare: (a, b) => Number(b['wordCount'] ?? 0) - Number(a['wordCount'] ?? 0) },
      ]}
      stats={(all) => {
        const words = all
          .filter((r) => r['status'] === 'completed')
          .reduce((sum, r) => sum + Number(r['wordCount'] ?? 0), 0);
        return (
          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat label="Reading" value={all.filter((r) => r['status'] === 'reading').length} />
            <Stat label="Queue" value={all.filter((r) => r['status'] === 'queued').length} />
            <Stat label="Completed" value={all.filter((r) => r['status'] === 'completed').length} detail={`of ${all.length}`} />
            <Stat label="Words finished" value={words.toLocaleString()} />
          </div>
        );
      }}
      detail={(record, helpers) => <FicDetail record={record} helpers={helpers} />}
      renderRow={(record, helpers) => {
        const read = Number(record['chaptersRead'] ?? 0);
        const total = Number(record['chaptersTotal'] ?? 0);
        const status = String(record['status'] ?? 'queued');
        const rating = Number(record['rating'] ?? 0);
        const canAdvance = status === 'reading' || status === 'queued';
        return (
          <ListRow
            key={record.id}
            title={`${record['favorite'] ? '★ ' : ''}${String(record['title'] ?? '')}`}
            meta={
              <>
                <Chip>{STATUS_LABEL[status] ?? status}</Chip>
                {record['author'] ? <span>by {String(record['author'])}</span> : null}
                {record['fandom'] ? <Chip>{String(record['fandom'])}</Chip> : null}
                {record['platform'] ? <span className="faint">{String(record['platform'])}</span> : null}
                {rating ? <span aria-label={`${rating} of 5`}>{stars(rating)}</span> : null}
                {total > 0 ? (
                  <span className="numeric faint">
                    {read}/{total}
                  </span>
                ) : null}
              </>
            }
            trailing={
              <>
                {total > 0 ? (
                  <span style={{ width: 60 }}>
                    <Meter value={read} max={total} label={`${read} of ${total} chapters read`} />
                  </span>
                ) : null}
                {canAdvance ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      const next = read + 1;
                      const done = total > 0 && next >= total;
                      void helpers.update({
                        chaptersRead: total > 0 ? Math.min(next, total) : next,
                        lastReadAt: new Date().toISOString(),
                        status: done ? 'completed' : 'reading',
                        ...(!record['startedOn'] ? { startedOn: today() } : {}),
                        ...(done ? { finishedOn: today() } : {}),
                      });
                    }}
                  >
                    +1 ch
                  </Button>
                ) : null}
                <IconButton
                  icon="star"
                  label={record['favorite'] ? 'Remove favourite' : 'Favourite'}
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    void helpers.update({ favorite: !record['favorite'] });
                  }}
                />
                {record['url'] ? (
                  <a
                    href={String(record['url'])}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="button button--ghost button--sm"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Open ${String(record['title'])}`}
                  >
                    <Icon name="link" size={14} />
                  </a>
                ) : null}
              </>
            }
            onClick={helpers.open}
          />
        );
      }}
    />
  );
}

function FicDetail({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const rating = Number(record['rating'] ?? 0);
  const words = Number(record['wordCount'] ?? 0);
  return (
    <>
      <DetailCover url={record['coverImageUrl']} />
      <div className="row">
        <Chip accent>{STATUS_LABEL[String(record['status'])] ?? String(record['status'])}</Chip>
        {rating ? <span>{stars(rating)}</span> : null}
        {record['favorite'] ? <Chip>★ Favourite</Chip> : null}
      </div>
      <DetailProgress
        value={Number(record['chaptersRead'] ?? 0)}
        max={Number(record['chaptersTotal'] ?? 0)}
        label="Chapters"
      />
      <DetailFacts
        facts={[
          ['Author', String(record['author'] ?? '')],
          ['Fandom', String(record['fandom'] ?? '')],
          ['Series', String(record['series'] ?? '')],
          ['Platform', String(record['platform'] ?? '')],
          ['Fic status', String(record['publicationStatus'] ?? '')],
          ['Content rating', String(record['contentRating'] ?? '')],
          ['Words', words ? words.toLocaleString() : ''],
          ['Started', String(record['startedOn'] ?? '')],
          ['Finished', String(record['finishedOn'] ?? '')],
          ['Read by', memberNames(record['readerIds'], helpers.memberName)],
          [
            'Link',
            record['url'] ? (
              <a href={String(record['url'])} target="_blank" rel="noreferrer noopener">
                <Icon name="link" size={13} /> Open
              </a>
            ) : null,
          ],
        ]}
      />
      <DetailTags tags={record['ships']} />
      <DetailTags tags={record['characters']} />
      <DetailTags tags={record['tags']} />
      <DetailTags tags={record['warnings']} />
      <DetailText title="Notes" text={record['notes']} />
    </>
  );
}
