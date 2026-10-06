import type { StoredRecord } from '@pluralnova/shared';
import { CollectionScreen, type RowHelpers } from '../ui/CollectionScreen.js';
import { Card, Chip, IconButton, ListRow, Stat } from '../ui/primitives.js';
import { useI18n } from '../core/i18n.js';
import { useCollection } from '../core/data.js';
import { DetailCover, DetailFacts, DetailTags, DetailText, byText, newestFirst } from '../ui/detailParts.js';

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/**
 * A dictionary the system writes itself: plurality vocabulary plus whatever
 * words this system coined or redefined. Nothing is supplied as fact.
 */
export default function Dictionary(): JSX.Element {
  const { term } = useI18n();

  return (
    <CollectionScreen
      collection="dictionaryTerms"
      description={term('Words this {{system}} uses, defined by this {{system}}.')}
      emptyTitle="No terms yet"
      emptyBody="Add a word you use and what it means to you — plurality vocabulary, or something you coined."
      filters={[
        { field: 'definitionType', label: 'Kind' },
        { field: 'category' },
        { field: 'tags' },
        { field: 'systemSpecific', label: term('Our own terms') },
        { field: 'favorite', label: '★ Favourites' },
      ]}
      sorts={[
        { id: 'az', label: 'A–Z', compare: byText('term') },
        { id: 'new', label: 'Recently added', compare: newestFirst('createdAt') },
        { id: 'order', label: 'Custom order', compare: (a, b) => Number(a['sortOrder'] ?? 0) - Number(b['sortOrder'] ?? 0) },
      ]}
      stats={(all) => (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
          <Stat label="Terms" value={all.length} />
          <Stat label={term('Our own terms')} value={all.filter((r) => r['systemSpecific'] === true).length} />
          <Stat label="Imported" value={all.filter((r) => r['isImported'] === true).length} />
          <Stat label="Favourites" value={all.filter((r) => r['favorite'] === true).length} />
        </div>
      )}
      above={
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <p className="small muted prose">
            Plurality vocabulary is not standardised, and PluralNova does not try to settle it.
            What is here is what you wrote.
          </p>
        </Card>
      }
      detail={(record, helpers) => <TermDetail record={record} helpers={helpers} />}
      renderRow={(record, helpers) => {
        const definition = String(record['definition'] ?? '');
        const kind = String(record['definitionType'] ?? '');
        return (
          <ListRow
            key={record.id}
            onClick={helpers.open}
            title={`${record['favorite'] ? '★ ' : ''}${String(record['term'] ?? '')}`}
            meta={
              <>
                {record['systemSpecific'] ? <Chip accent>{term('Ours')}</Chip> : null}
                {kind ? <Chip>{kind}</Chip> : null}
                {record['category'] ? <span className="faint">{String(record['category'])}</span> : null}
                {definition ? (
                  <span className="muted">
                    {definition.length > 110 ? `${definition.slice(0, 110)}…` : definition}
                  </span>
                ) : null}
              </>
            }
            trailing={
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
            }
          />
        );
      }}
    />
  );
}

function TermDetail({ record, helpers }: { record: StoredRecord; helpers: RowHelpers }): JSX.Element {
  const all = useCollection('dictionaryTerms');
  const byId = new Map(all.all.map((r) => [r.id, String(r['term'] ?? '')]));
  const related = asList(record['relatedTermIds']).map((id) => byId.get(id)).filter(Boolean) as string[];
  const synonyms = asList(record['synonyms']);
  const aliases = asList(record['aliases']);
  return (
    <>
      <DetailCover url={record['coverImageUrl']} />
      <DetailText text={record['definition']} />
      <DetailFacts
        facts={[
          ['Pronounced', String(record['pronunciation'] ?? '')],
          ['Kind', String(record['definitionType'] ?? '')],
          ['Category', String(record['category'] ?? '')],
          ['Also known as', aliases.join(', ')],
          ['Synonyms', synonyms.join(', ')],
          ['About', helpers.memberName((record['memberId'] as string) ?? null)],
          ['Related', related.join(', ')],
          ['Source', String(record['sourceName'] ?? '')],
          [
            'Status',
            record['isImported'] ? (record['isLocallyEdited'] ? 'Imported, edited here' : 'Imported') : '',
          ],
        ]}
      />
      <DetailText title="Example" text={record['example']} />
      <DetailTags tags={record['tags']} />
    </>
  );
}
