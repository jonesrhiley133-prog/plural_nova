import { useState } from 'react';
import { OPTIONS } from '@pluralnova/shared';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Chip, ListRow, Meter } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';

/**
 * A reading tracker. It keeps your own record of what you are reading rather
 * than depending on any site's API staying available — links go out, the
 * progress stays here.
 */
export default function FicTracker(): JSX.Element {
  const [status, setStatus] = useState<string>('reading');

  return (
    <CollectionScreen
      collection="fics"
      description="What you are reading, where you got to, and what you thought."
      filter={(record) => status === 'all' || record['status'] === status}
      emptyTitle="Nothing tracked yet"
      emptyBody="Add a fic with its link and chapter count, and update your progress as you read."
      above={
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip selected={status === 'all'} onClick={() => setStatus('all')}>
            Everything
          </Chip>
          {OPTIONS.readingStatus.map((option) => (
            <Chip
              key={option.value}
              selected={status === option.value}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      }
      renderRow={(record, helpers) => {
        const read = Number(record['chaptersRead'] ?? 0);
        const total = Number(record['chaptersTotal'] ?? 0);
        return (
          <ListRow
            title={String(record['title'])}
            meta={
              <>
                {record['author'] ? <span>by {String(record['author'])}</span> : null}
                {record['fandom'] ? <Chip>{String(record['fandom'])}</Chip> : null}
                {record['platform'] ? <span className="faint">{String(record['platform'])}</span> : null}
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
            onClick={helpers.edit}
          />
        );
      }}
    />
  );
}
