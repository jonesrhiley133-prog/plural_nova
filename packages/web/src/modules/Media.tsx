import { useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { useCollection, useRecordMap } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { FileButton, SearchField, useDebounced } from '../ui/forms.js';
import { AsyncContent, SkeletonCards } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * The media library.
 *
 * Uploads go to the server and come back as a media record, so a file is in the
 * library, the backup and the member's gallery from the moment it lands. Grid
 * and list are the same data; the grid is for recognising, the list is for
 * finding.
 */

const TYPES = [
  { value: 'image', label: 'Images', icon: 'media' as const },
  { value: 'video', label: 'Video', icon: 'video' as const },
  { value: 'audio', label: 'Audio', icon: 'music' as const },
  { value: 'document', label: 'Documents', icon: 'note' as const },
];

export default function Media(): JSX.Element {
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const members = useRecordMap('members');

  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [type, setType] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [uploading, setUploading] = useState(false);

  const media = useCollection('mediaItems', {
    search,
    filter: (item) =>
      (type === null || item['mediaType'] === type) &&
      (folder === null || item['folder'] === folder) &&
      (!favouritesOnly || item['favorite'] === true) &&
      item['inVault'] !== true,
  });

  const viewer = useDialog<StoredRecord>();
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();

  const folders = useMemo(
    () => [...new Set(media.all.map((item) => String(item['folder'] ?? '')).filter(Boolean))].sort(),
    [media.all],
  );

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      await api.post(
        '/api/media/upload',
        undefined,
        {
          raw: {
            body: file,
            contentType: file.type || 'application/octet-stream',
            headers: { 'x-file-name': encodeURIComponent(file.name).slice(0, 180) },
          },
          timeoutMs: 120_000,
        },
      );
      await media.reload();
      toast.success('Uploaded', file.name);
    } catch (cause) {
      toast.error('That file did not upload', messageFor(cause));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader
        title={term('Media library')}
        description={term('Everything you have added, sorted however you like.')}
        actions={
          <>
            <SegmentedControl
              value={layout}
              onChange={setLayout}
              label="Layout"
              options={[
                { value: 'grid', label: <Icon name="grid" size={13} />, srLabel: 'Grid layout' },
                { value: 'list', label: <Icon name="list" size={13} />, srLabel: 'List layout' },
              ]}
            />
            <FileButton label={uploading ? 'Uploading…' : 'Upload'} onFile={(file) => void upload(file)} variant="primary" />
          </>
        }
      />

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <SearchField value={rawSearch} onChange={setRawSearch} placeholder="Search media…" />
        <div className="row">
          <Chip selected={type === null} onClick={() => setType(null)}>
            Everything
          </Chip>
          {TYPES.map((option) => (
            <Chip key={option.value} selected={type === option.value} onClick={() => setType(option.value)}>
              <Icon name={option.icon} size={11} /> {option.label}
            </Chip>
          ))}
          <span className="spacer" />
          <Chip selected={favouritesOnly} onClick={() => setFavouritesOnly((value) => !value)}>
            <Icon name="star" size={11} /> Favourites
          </Chip>
        </div>
        {folders.length > 0 ? (
          <div className="row">
            <Chip selected={folder === null} onClick={() => setFolder(null)}>
              All folders
            </Chip>
            {folders.map((name) => (
              <Chip key={name} selected={folder === name} onClick={() => setFolder(name)}>
                <Icon name="folder" size={11} /> {name}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <AsyncContent
        loading={media.loading}
        error={media.error}
        items={media.items}
        onRetry={media.reload}
        skeleton={<SkeletonCards count={8} />}
        empty={
          search || type || folder
            ? { title: t('list.noResults'), body: t('list.noResultsBody'), icon: 'search' }
            : {
                title: 'Nothing in the library yet',
                body: 'Upload an image, a recording, a document — anything worth keeping.',
                icon: 'media',
              }
        }
      >
        {(items) =>
          layout === 'grid' ? (
            <div className="grid grid--tight" style={{ ['--grid-min' as never]: '130px' }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="card card--interactive card--flush"
                  style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative', padding: 0 }}
                  onClick={() => viewer.show(item)}
                >
                  {item['mediaType'] === 'image' ? (
                    <img
                      src={String(item['url'])}
                      alt={String(item['title'] ?? '')}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        height: '100%',
                        color: 'var(--text-faint)',
                        gap: 6,
                      }}
                    >
                      <Icon
                        name={item['mediaType'] === 'video' ? 'video' : item['mediaType'] === 'audio' ? 'music' : 'note'}
                        size={24}
                      />
                      <span className="tiny truncate" style={{ maxWidth: '90%' }}>
                        {String(item['title'] ?? 'Untitled')}
                      </span>
                    </span>
                  )}
                  {item['favorite'] === true ? (
                    <span style={{ position: 'absolute', top: 6, right: 6, color: 'var(--caution)' }}>
                      <Icon name="star" size={13} label="Favourite" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <Card flush>
              <div className="list">
                {items.map((item) => {
                  const member = item['memberId'] ? members.get(String(item['memberId'])) : null;
                  return (
                    <div key={item.id} className="list-row">
                      <span style={{ color: 'var(--text-faint)' }}>
                        <Icon
                          name={item['mediaType'] === 'video' ? 'video' : item['mediaType'] === 'audio' ? 'music' : 'media'}
                          size={18}
                        />
                      </span>
                      <span className="list-row__body">
                        <span className="list-row__title">{String(item['title'] ?? 'Untitled')}</span>
                        <span className="list-row__meta">
                          <span>{dates.date(String(item.createdAt))}</span>
                          {item['folder'] ? <Chip>{String(item['folder'])}</Chip> : null}
                          {member ? (
                            <Avatar
                              name={String(member['name'])}
                              color={(member['color'] as string) ?? null}
                              size={16}
                              round
                            />
                          ) : null}
                          {item['sizeBytes'] ? (
                            <span className="faint numeric">{formatBytes(Number(item['sizeBytes']))}</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        <IconButton icon="eye" label="Open" variant="ghost" size="sm" onClick={() => viewer.show(item)} />
                        <IconButton icon="edit" label="Edit details" variant="ghost" size="sm" onClick={() => editor.show(item)} />
                        <IconButton icon="trash" label="Delete" variant="ghost" size="sm" onClick={() => confirm.show(item)} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )
        }
      </AsyncContent>

      <Dialog
        open={viewer.open}
        onClose={viewer.hide}
        title={String(viewer.value?.['title'] ?? 'Media')}
        wide
        footer={
          <>
            <Button
              variant="ghost"
              icon="star"
              onClick={() => {
                if (!viewer.value) return;
                void media
                  .update(viewer.value.id, { favorite: viewer.value['favorite'] !== true })
                  .then(() => toast.success('Saved'))
                  .catch((cause: unknown) => toast.fromError(cause));
              }}
            >
              {viewer.value?.['favorite'] === true ? 'Remove favourite' : 'Favourite'}
            </Button>
            <Button variant="ghost" icon="edit" onClick={() => {
              const item = viewer.value;
              viewer.hide();
              if (item) editor.show(item);
            }}>
              Edit details
            </Button>
            <span className="spacer" />
            <Button variant="secondary" onClick={viewer.hide}>
              Close
            </Button>
          </>
        }
      >
        {viewer.value ? <MediaPreview item={viewer.value} /> : null}
      </Dialog>

      <Dialog open={editor.open} onClose={editor.hide} title="Media details">
        <RecordForm
          collection="mediaItems"
          record={editor.value}
          fields={['title', 'description', 'folder', 'tags', 'favorite', 'pinned', 'inVault', 'memberId']}
          onSubmit={async (values) => {
            if (!editor.value) return;
            await media.update(editor.value.id, values);
            toast.success('Saved');
            editor.hide();
          }}
          onCancel={editor.hide}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this file?"
        body="The file is removed from the server as well as the library."
        recoverable={false}
        onConfirm={async () => {
          if (!confirm.value) return;
          await api.delete(`/api/media/${confirm.value.id}`);
          await media.reload();
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function MediaPreview({ item }: { item: StoredRecord }): JSX.Element {
  const url = String(item['url']);
  const type = String(item['mediaType']);

  if (type === 'image') {
    return (
      <img
        src={url}
        alt={String(item['title'] ?? '')}
        style={{ width: '100%', borderRadius: 'var(--radius)', maxHeight: '60vh', objectFit: 'contain' }}
      />
    );
  }
  if (type === 'video') {
    return <video src={url} controls style={{ width: '100%', borderRadius: 'var(--radius)' }} />;
  }
  if (type === 'audio') {
    return <audio src={url} controls style={{ width: '100%' }} />;
  }
  return (
    <div className="stack">
      <p className="small muted">{String(item['mimeType'] ?? 'Document')}</p>
      <a href={url} target="_blank" rel="noreferrer noopener" className="button button--secondary">
        <Icon name="download" size={15} /> Open the file
      </a>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
