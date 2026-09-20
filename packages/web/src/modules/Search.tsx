import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { requireCollection } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
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
      .catch((cause: unknown) => setError(messageFor(cause)))
      .finally(() => setLoading(false));
  }, [query, setParams]);

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

function labelFor(collection: string): string {
  try {
    return requireCollection(collection).label;
  } catch {
    return collection;
  }
}
