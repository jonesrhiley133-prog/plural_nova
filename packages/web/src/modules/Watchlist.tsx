import { useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Button, Chip, IconButton, ListRow, Stat } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import {
  DetailCover,
  DetailFacts,
  DetailProgress,
  DetailTags,
  DetailText,
  byText,
  memberNames,
  newestFirst,
} from '../ui/detailParts.js';

const STATUS_LABEL: Record<string, string> = {
  wantToWatch: 'Want to watch',
  watching: 'Watching',
  watched: 'Watched',
  onHold: 'On hold',
  dropped: 'Dropped',
};

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Next status for the one-tap progress button on a row. */
const NEXT: Record<string, { status: string; label: string }> = {
  wantToWatch: { status: 'watching', label: 'Start' },
  watching: { status: 'watched', label: 'Finished' },
  onHold: { status: 'watching', label: 'Resume' },
};

export default function Watchlist(): JSX.Element {
  const [view, setView] = useState<'open' | 'all'>('all');
  const filter = useMemo(
    () => (record: StoredRecord) => view === 'all' || record['status'] !== 'watched',
    [view],
  );

  return (
    <CollectionScreen
      collection="watchlistItems"
      description="Shows, films and anime the {{system}} wants to watch, is watching, or has watched — with ratings and notes."
      emptyTitle="Nothing queued up yet"
      emptyBody="Add a show or a movie, and track it through to watched."
      filter={filter}
      filters={[
        { field: 'status' },
        { field: 'mediaType', label: 'Type' },
        { field: 'tags' },
        { field: 'platform', label: 'Where' },
        { field: 'favorite', label: '★ Favourites' },
      ]}
      sorts={[
        { id: 'new', label: 'Recently added', compare: newestFirst('createdAt') },
        { id: 'title', label: 'Title A–Z', compare: byText('title') },
        { id: 'rating', label: 'Highest rated', compare: (a, b) => Number(b['rating'] ?? 0) - Number(a['rating'] ?? 0) },
        { id: 'year', label: 'Year', compare: (a, b) => Number(b['year'] ?? 0) - Number(a['year'] ?? 0) },
      ]}
      headerActions={
        <Button size="sm" variant="ghost" onClick={() => setView(view === 'all' ? 'open' : 'all')}>
          {view === 'all' ? 'Hide watched' : 'Show watched'}
        </Button>
      }
      stats={(all) => {
        const watched = all.filter((r) => r['status'] === 'watched');
        const rated = all.filter((r) => Number(r['rating'] ?? 0) > 0);
        const average = rated.length
          ? (rated.reduce((sum, r) => sum + Number(r['rating']), 0) / rated.length).toFixed(1)
          : '—';
        return (
          <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <Stat label="Queue" value={all.filter((r) => r['status'] === 'wantToWatch').length} />
            <Stat label="Watching" value={all.filter((r) => r['status'] === 'watching').length} />
            <Stat label="Watched" value={watched.length} detail={`of ${all.length}`} />
            <Stat label="Average rating" value={average} detail={rated.length ? `${rated.length} rated` : undefined} />
          </div>
        );
      }}
      detail={(record, helpers) => <WatchDetail record={record} helpers={helpers} />}
      renderRow={(record: StoredRecord, helpers: RowHelpers) => {
        const status = String(record['status'] ?? 'wantToWatch');
        const rating = Number(record['rating'] ?? 0);
        const next = NEXT[status];
        const seen = Number(record['currentEpisode'] ?? 0);
        const total = Number(record['totalEpisodes'] ?? 0);
        return (
          <ListRow
            key={record.id}
            onClick={helpers.open}
            title={`${record['favorite'] ? '★ ' : ''}${String(record['title'] ?? '')}`}
            meta={
              <>
                <Chip>{STATUS_LABEL[status] ?? status}</Chip>
                <span className="faint">{String(record['mediaType'] ?? '')}</span>
                {record['year'] ? <span className="faint">{String(record['year'])}</span> : null}
                {rating ? <span aria-label={`${rating} of 5`}>{stars(rating)}</span> : null}
                {total > 0 ? (
                  <span className="faint numeric">
                    {seen}/{total} ep
                  </span>
                ) : null}
              </>
            }
            trailing={
              <>
                {next ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async (event) => {
                      event.stopPropagation();
                      await helpers.update({
                        status: next.status,
                        ...(next.status === 'watched' ? { finishedOn: new Date().toISOString().slice(0, 10) } : {}),
                        ...(next.status === 'watching' && !record['startedOn']
                          ? { startedOn: new Date().toISOString().slice(0, 10) }
                          : {}),
                      });
                    }}
                  >
                    {next.label}
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
              </>
            }
          />
        );
      }}
    />
  );
}

function WatchDetail({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const rating = Number(record['rating'] ?? 0);
  const total = Number(record['totalEpisodes'] ?? 0);
  return (
    <>
      <DetailCover url={record['coverImageUrl']} />
      <div className="row">
        <Chip accent>{STATUS_LABEL[String(record['status'])] ?? String(record['status'])}</Chip>
        {rating ? <span>{stars(rating)}</span> : null}
        {record['favorite'] ? <Chip>★ Favourite</Chip> : null}
      </div>
      <DetailProgress value={Number(record['currentEpisode'] ?? 0)} max={total} label="Episodes" />
      <DetailFacts
        facts={[
          ['Type', String(record['mediaType'] ?? '')],
          ['Year', record['year'] ? String(record['year']) : ''],
          ['Genre', String(record['genre'] ?? '')],
          ['Where', String(record['platform'] ?? '')],
          ['Season', record['currentSeason'] ? String(record['currentSeason']) : ''],
          ['Started', String(record['startedOn'] ?? '')],
          ['Finished', String(record['finishedOn'] ?? '')],
          ['Added by', helpers.memberName((record['addedByMemberId'] as string) ?? null)],
          ['Watched with', memberNames(record['watchedWithIds'], helpers.memberName)],
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
      <DetailTags tags={record['tags']} />
      <DetailText title="Notes" text={record['notes']} />
    </>
  );
}
