import { useState } from 'react';
import { OPTIONS } from '@pluralnova/shared';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Avatar, Chip, ListRow, Status } from '../ui/primitives.js';
import { useI18n } from '../core/i18n.js';

/**
 * People outside the system. The safety field is the one that earns its place:
 * it is the thing a member who has not met someone needs to know first.
 */
export default function Contacts(): JSX.Element {
  const { term } = useI18n();
  const [safety, setSafety] = useState('all');

  return (
    <CollectionScreen
      collection="contacts"
      description={term('People outside the {{system}}, and what each {{member}} needs to know about them.')}
      emptyTitle="No contacts yet"
      emptyBody={term('Add someone, note how they are with you, and who in the {{system}} knows them.')}
      filter={(record) => safety === 'all' || record['safety'] === safety}
      above={
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip selected={safety === 'all'} onClick={() => setSafety('all')}>
            Everyone
          </Chip>
          {OPTIONS.safety.map((option) => (
            <Chip
              key={option.value}
              selected={safety === option.value}
              onClick={() => setSafety(option.value)}
              color={option.color}
            >
              {option.icon} {option.label}
            </Chip>
          ))}
        </div>
      }
      renderRow={(record, helpers) => {
        const level = OPTIONS.safety.find((option) => option.value === record['safety']);
        return (
          <ListRow
            title={String(record['name'])}
            leading={
              <Avatar
                name={String(record['name'])}
                src={(record['avatarUrl'] as string) ?? null}
                size={36}
                round
              />
            }
            meta={
              <>
                {record['relationship'] ? <span>{String(record['relationship'])}</span> : null}
                {record['currentlyWith'] === true ? <Chip accent>With them now</Chip> : null}
              </>
            }
            trailing={
              level && level.value !== 'unset' ? (
                <Status label={level.label} color={level.color} glyph={level.icon} />
              ) : null
            }
            onClick={helpers.edit}
          />
        );
      }}
    />
  );
}
