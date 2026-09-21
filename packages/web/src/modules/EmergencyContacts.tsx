import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card, ListRow } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';

/**
 * Kept separate from ordinary contacts and ordered by priority, because the
 * moment this screen is needed is the moment nobody wants to search. It never
 * appears in a shared profile or a notification preview.
 */
export default function EmergencyContacts(): JSX.Element {
  return (
    <CollectionScreen
      collection="emergencyContacts"
      description="Ordered by priority, and never shown anywhere outside this account."
      emptyTitle="No emergency contacts yet"
      emptyBody="Someone to reach first, and how to reach them."
      sort={(a, b) => Number(a['priority'] ?? 99) - Number(b['priority'] ?? 99)}
      above={
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <p className="small muted prose">
            If you are in immediate danger, your local emergency number will always be faster than
            an app. This list is for the people you would call after that.
          </p>
        </Card>
      }
      renderRow={(record, helpers) => (
        <ListRow
          title={String(record['name'])}
          leading={
            <span
              className="avatar"
              style={{ ['--avatar-size' as never]: '32px', fontSize: 13 }}
              aria-hidden="true"
            >
              {String(record['priority'] ?? '·')}
            </span>
          }
          meta={
            <>
              {record['relationship'] ? <span>{String(record['relationship'])}</span> : null}
              {record['availability'] ? (
                <span className="faint">{String(record['availability'])}</span>
              ) : null}
            </>
          }
          trailing={
            record['phone'] ? (
              <a
                href={`tel:${String(record['phone']).replace(/\s/g, '')}`}
                className="button button--secondary button--sm"
                onClick={(event) => event.stopPropagation()}
              >
                <Icon name="emergency" size={14} /> Call
              </a>
            ) : null
          }
          onClick={helpers.edit}
        />
      )}
    />
  );
}
