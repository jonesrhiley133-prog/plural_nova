import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Avatar, Card, Chip } from '../ui/primitives.js';
import { useI18n } from '../core/i18n.js';

/** A character database, separate from members and linkable to stories. */
export default function Characters(): JSX.Element {
  const { term } = useI18n();
  return (
    <CollectionScreen
      collection="characters"
      layout="grid"
      description={term("People you write, draw or keep track of. Separate from your {{system}}'s {{members}}.")}
      emptyTitle="No characters yet"
      emptyBody="Add one, then link them to the stories they appear in."
      renderRow={(record, helpers) => (
        <Card interactive onClick={helpers.edit}>
          <div className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
            <Avatar
              name={String(record['name'])}
              src={(record['imageUrl'] as string) ?? null}
              color={(record['color'] as string) ?? null}
              size={44}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="card__title truncate">{String(record['name'])}</div>
              {record['role'] || record['source'] ? (
                <div className="card__subtitle truncate">
                  {[record['role'], record['source']].filter(Boolean).join(' · ')}
                </div>
              ) : null}
            </div>
          </div>
          {record['biography'] ? (
            <p className="small muted clamp-3" style={{ marginTop: 'var(--space-3)' }}>
              {String(record['biography'])}
            </p>
          ) : null}
          {Array.isArray(record['traits']) && record['traits'].length > 0 ? (
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              {(record['traits'] as string[]).slice(0, 4).map((trait) => (
                <Chip key={trait}>{trait}</Chip>
              ))}
            </div>
          ) : null}
        </Card>
      )}
    />
  );
}
