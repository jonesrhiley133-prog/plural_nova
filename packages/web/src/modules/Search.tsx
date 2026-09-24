import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SEARCHABLE_COLLECTIONS, requireCollection, searchableFields, type StoredRecord } from '@pluralnova/shared';
import { api, isOffline, messageFor } from '../core/api.js';
import { useSystemMode } from '../core/auth.js';
import { recordStore } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { PageHeader } from '../app/PageHeader.js';
import { Card, Chip } from '../ui/primitives.js';
import { SearchField, useDebounced } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon, iconOr } from '../ui/Icon.js';

/**
 * Global search.
 *
 * Across every collection that declared searchable fields, scoped to this
 * account. The vault is absent while locked — refused by the server, not
 * filtered here.
 */

interface Hit {
  collection: string;
  collectionLabel: string;
  id: string;
  title: string;
  snippet: string;
  icon: string;
  updatedAt: string;
}

const ROUTES: Record<string, string> = {
  members: '/members',
  journalEntries: '/journal',
  notes: '/notes',
  tasks: '/tasks',
  calendarEvents: '/calendar',
  mediaItems: '/media',
  contacts: '/contacts',
  stories: '/stories',
  characters: '/characters',
  fics: '/fics',
  resources: '/resources',
  dictionaryTerms: '/dictionary',
  frontEvents: '/fronting',
  emotionEntries: '/emotions',
  sleepEntries: '/sleep',
  relationships: '/relationships',
  bulletinPosts: '/bulletin',
  polls: '/polls',
  systemHistory: '/system-history',
  locationEntries: '/locations',
  musicTracks: '/music',
  videoItems: '/video',
  workplaces: '/work',
  templates: '/templates',
};

export default function Search(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const isSystem = useSystemMode();

  const [raw, setRaw] = useState(params.get('q') ?? '');
  const query = useDebounced(raw, 300);

  const [hits, setHits] = useState<Hit[]>([]);
  const [byCollection, setByCollection] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setByCollection({});
      return;
    }
    setParams(query ? { q: query } : {}, { replace: true });
    setLoading(true);

    void api
      .get<{ hits: Hit[]; byCollection: Record<string, number> }>('/api/search', { q: query })
      .then((result) => {
        setHits(result.hits);
        setByCollection(result.byCollection);
        setError(null);
      })
      .catch(async (cause: unknown) => {
        if (isOffline(cause)) {
          // The same records already live on this device; a dropped
          // connection is not a reason search should come back empty.
          const local = await searchLocally(query, isSystem);
          setHits(local.hits);
          setByCollection(local.byCollection);
          setError(null);
          return;
        }
        setError(messageFor(cause));
      })
      .finally(() => setLoading(false));
  }, [query, setParams, isSystem]);

  const shown = filter ? hits.filter((hit) => hit.collection === filter) : hits;

  return (
    <>
      <PageHeader title="Search" description={term('Across everything in this account.')} />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SearchField
          value={raw}
          onChange={setRaw}
          placeholder={term('{{Members}}, {{journal}} entries, notes, tasks, anything…')}
        />
      </div>

      {Object.keys(byCollection).length > 1 ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip selected={filter === null} onClick={() => setFilter(null)}>
            Everything · {hits.length}
          </Chip>
          {Object.entries(byCollection)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => (
              <Chip key={name} selected={filter === name} onClick={() => setFilter(filter === name ? null : name)}>
                {labelFor(name)} · {count}
              </Chip>
            ))}
        </div>
      ) : null}

      {loading && hits.length === 0 ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => setRaw((value) => `${value} `.trim())} />
      ) : query.trim().length < 2 ? (
        <Card>
          <EmptyState
            icon="search"
            title="Type at least two letters"
            body={term(
              'Search runs over {{members}}, {{journal}} entries, notes, tasks, events, media, contacts, stories and the rest. The vault is only included while it is unlocked.',
            )}
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon="search" title={t('list.noResults')} body={t('list.noResultsBody')} />
        </Card>
      ) : (
        <Card flush>
          <div className="list">
            {shown.map((hit) => (
              <button
                key={`${hit.collection}-${hit.id}`}
                type="button"
                className="list-row"
                onClick={() => navigate(ROUTES[hit.collection] ?? '/')}
              >
                <span style={{ color: 'var(--text-faint)' }}>
                  <Icon name={iconOr(hit.icon)} size={17} />
                </span>
                <span className="list-row__body">
                  <span className="list-row__title">{hit.title}</span>
                  <span className="list-row__meta">
                    <Chip>{hit.collectionLabel}</Chip>
                    {hit.snippet ? <span className="faint truncate">{hit.snippet}</span> : null}
                    <span className="faint">{dates.relative(hit.updatedAt)}</span>
                  </span>
                </span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/**
 * The same search the server runs, over whatever this device already has
 * synced locally. Used only once the network call has failed and offline is
 * confirmed — the server stays the primary path since it can see rows this
 * device may not have pulled yet.
 */
async function searchLocally(
  query: string,
  isSystem: boolean,
): Promise<{ hits: Hit[]; byCollection: Record<string, number> }> {
  const needle = query.trim().toLowerCase();
  const candidates = SEARCHABLE_COLLECTIONS.filter(
    (collection) =>
      (!collection.systemOnly || isSystem) && (!collection.serverManaged || collection.name === 'notifications'),
  );

  // recordStore only holds a collection once something has asked it to load,
  // so a search reached without visiting any of those screens first would
  // otherwise run over nothing. Asking now is safe and fast: the network half
  // of each load fails immediately, since this only runs once offline is
  // already confirmed, leaving just a local IndexedDB read per collection.
  await Promise.all(candidates.map((collection) => recordStore.load(collection.name)));

  const hits: Hit[] = [];
  const byCollection: Record<string, number> = {};

  for (const collection of candidates) {
    const fields = searchableFields(collection);
    const matches = recordStore.snapshot(collection.name).records.filter((record) =>
      fields.some((field) => {
        const value = record[field.name];
        if (typeof value === 'string') return value.toLowerCase().includes(needle);
        if (Array.isArray(value)) return value.some((item) => String(item).toLowerCase().includes(needle));
        return false;
      }),
    );
    if (matches.length === 0) continue;
    byCollection[collection.name] = matches.length;

    for (const record of matches.slice(0, 5)) {
      const title = String(record[collection.titleField] ?? '').trim();
      hits.push({
        collection: collection.name,
        collectionLabel: collection.label,
        id: record.id,
        title: title || `Untitled ${collection.singular.toLowerCase()}`,
        snippet: snippetFor(record, needle, fields.map((field) => field.name)),
        icon: collection.icon,
        updatedAt: record.updatedAt,
      });
    }
  }

  hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { hits, byCollection };
}

/** Pulls the matching phrase out of whichever field contains it, with context. */
function snippetFor(record: StoredRecord, needle: string, fields: string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const index = value.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    const start = Math.max(0, index - 40);
    const end = Math.min(value.length, index + needle.length + 60);
    return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
  }
  return '';
}

function labelFor(collection: string): string {
  try {
    return requireCollection(collection).label;
  } catch {
    return collection;
  }
}
