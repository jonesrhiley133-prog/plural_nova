import { useSearchParams } from 'react-router-dom';
import { useCollection } from '../core/data.js';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Chip } from '../ui/primitives.js';
import { useState } from 'react';
import { useI18n } from '../core/i18n.js';

/** Notes, with folders and pinning. Everything else comes from the registry. */
export default function Notes(): JSX.Element {
  const { term } = useI18n();
  const [params] = useSearchParams();
  const folders = useCollection('noteFolders');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <CollectionScreen
      collection="notes"
      autoCreate={params.get('new') === '1'}
      filter={(note) =>
        (folderId === null || note['folderId'] === folderId) &&
        (showArchived ? note['archived'] === true : note['archived'] !== true)
      }
      sort={(a, b) =>
        Number(b['pinned'] === true) - Number(a['pinned'] === true) ||
        String(b.updatedAt).localeCompare(String(a.updatedAt))
      }
      emptyTitle="No notes yet"
      emptyBody={term('Lists, reminders, half-thoughts — anything that does not belong in the {{journal}}.')}
      above={
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip selected={folderId === null} onClick={() => setFolderId(null)}>
            All notes
          </Chip>
          {folders.items.map((folder) => (
            <Chip
              key={folder.id}
              selected={folderId === folder.id}
              onClick={() => setFolderId(folder.id)}
              color={(folder['color'] as string) ?? null}
            >
              {folder['icon'] ? `${folder['icon']} ` : ''}
              {String(folder['name'])}
            </Chip>
          ))}
          <span className="spacer" />
          <Chip selected={showArchived} onClick={() => setShowArchived((value) => !value)}>
            Archived
          </Chip>
        </div>
      }
    />
  );
}
