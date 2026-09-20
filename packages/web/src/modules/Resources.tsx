import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Chip, ListRow } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';

/** Saved links, guides and references, grouped by the category you give them. */
export default function Resources(): JSX.Element {
  return (
    <CollectionScreen
      collection="resources"
      emptyTitle="Nothing saved yet"
      emptyBody="Guides, references, support contacts, articles worth keeping."
      sort={(a, b) =>
        Number(b['favorite'] === true) - Number(a['favorite'] === true) ||
        String(a['title']).localeCompare(String(b['title']))
      }
      renderRow={(record, helpers) => (
        <ListRow
          title={
            <span className="row row--nowrap" style={{ gap: 'var(--space-2)' }}>
              {record['favorite'] === true ? (
                <span style={{ color: 'var(--caution)' }}>
                  <Icon name="star" size={13} label="Favourite" />
                </span>
              ) : null}
              {String(record['title'])}
            </span>
          }
          meta={
            <>
              {record['category'] ? <Chip>{String(record['category'])}</Chip> : null}
              {record['summary'] ? (
                <span className="truncate" style={{ maxWidth: 380 }}>
                  {String(record['summary'])}
                </span>
              ) : null}
            </>
          }
          trailing={
            record['url'] ? (
              <a
                href={String(record['url'])}
                target="_blank"
                rel="noreferrer noopener"
                className="button button--ghost button--sm"
                onClick={(event) => event.stopPropagation()}
                aria-label={`Open ${String(record['title'])} in a new tab`}
              >
                <Icon name="link" size={14} />
              </a>
            ) : null
          }
          onClick={helpers.edit}
        />
      )}
    />
  );
}
