import { useState } from 'react';
import { api, messageFor } from '../core/api.js';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * Video.
 *
 * Collections of links, with the title and thumbnail filled in from the link
 * where the shape is recognised. Playback belongs to the provider — PluralNova
 * keeps the collection, the history and the favourites.
 */
export default function Video(): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();

  const collections = useCollection('videoCollections');
  const videos = useCollection('videoItems');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const adder = useDialog();
  const collectionDialog = useDialog();
  const confirm = useDialog<StoredRecord>();

  const shown = videos.items
    .filter((video) => collectionId === null || video['collectionId'] === collectionId)
    .filter((video) => !favouritesOnly || video['favorite'] === true);

  return (
    <>
      <PageHeader
        title="Video"
        description="Links worth keeping, grouped however you like."
        actions={
          <>
            <Button variant="ghost" icon="folder" onClick={() => collectionDialog.show()}>
              New collection
            </Button>
            <Button variant="primary" icon="plus" onClick={() => adder.show()}>
              Add a video
            </Button>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Chip selected={collectionId === null} onClick={() => setCollectionId(null)}>
          Everything
        </Chip>
        {collections.items.map((collection) => (
          <Chip
            key={collection.id}
            selected={collectionId === collection.id}
            onClick={() => setCollectionId(collection.id)}
          >
            {String(collection['name'])}
          </Chip>
        ))}
        <span className="spacer" />
        <Chip selected={favouritesOnly} onClick={() => setFavouritesOnly((value) => !value)}>
          <Icon name="star" size={11} /> Favourites
        </Chip>
      </div>

      <AsyncContent
        loading={videos.loading}
        error={videos.error}
        items={shown}
        onRetry={videos.reload}
        empty={{
          title: 'Nothing saved yet',
          body: 'Paste a link and PluralNova fills in what it can from it.',
          icon: 'video',
          action: { label: 'Add a video', run: () => adder.show() },
        }}
      >
        {(items) => (
          <div className="grid" style={{ ['--grid-min' as never]: '230px' }}>
            {items.map((video) => (
              <Card key={video.id} flush>
                <a
                  href={String(video['externalUrl'])}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ display: 'block', position: 'relative', aspectRatio: '16 / 9', background: 'var(--surface-sunken)' }}
                  aria-label={`Open ${String(video['title'])}`}
                >
                  {video['thumbnailUrl'] ? (
                    <img
                      src={String(video['thumbnailUrl'])}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-faint)' }}>
                      <Icon name="video" size={26} />
                    </span>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      background: 'color-mix(in srgb, #000 22%, transparent)',
                    }}
                  >
                    <Icon name="play" size={28} />
                  </span>
                </a>
                <div style={{ padding: 'var(--space-3)' }}>
                  <div className="truncate" style={{ fontWeight: 'var(--weight-medium)' }}>
                    {String(video['title'] || 'Untitled')}
                  </div>
                  <div className="tiny faint truncate">
                    {String(video['channel'] ?? '')}
                    {video['watchedAt'] ? ` · watched ${dates.relative(String(video['watchedAt']))}` : ''}
                  </div>
                  <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                    <IconButton
                      icon="star"
                      label="Favourite"
                      variant="ghost"
                      size="sm"
                      onClick={() => void videos.update(video.id, { favorite: video['favorite'] !== true })}
                    />
                    <IconButton
                      icon="check"
                      label="Mark as watched"
                      variant="ghost"
                      size="sm"
                      onClick={() => void videos.update(video.id, { watchedAt: new Date().toISOString() })}
                    />
                    <span className="spacer" />
                    <IconButton icon="trash" label="Remove" variant="ghost" size="sm" onClick={() => confirm.show(video)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </AsyncContent>

      <AddVideoDialog
        dialog={adder}
        collectionId={collectionId}
        onSave={async (values) => {
          await videos.create(values);
          toast.success('Saved');
        }}
      />

      <Dialog open={collectionDialog.open} onClose={collectionDialog.hide} title="New collection">
        <CollectionForm
          onSubmit={async (name) => {
            await collections.create({ name, itemCount: 0 });
            toast.success('Collection created');
            collectionDialog.hide();
          }}
          onCancel={collectionDialog.hide}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Remove this video?"
        body="The link is removed from your collection."
        onConfirm={async () => {
          if (!confirm.value) return;
          await videos.remove(confirm.value.id);
          toast.success('Removed');
        }}
      />
    </>
  );
}

function AddVideoDialog({
  dialog,
  collectionId,
  onSave,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  collectionId: string | null;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [resolved, setResolved] = useState<{ thumbnailUrl: string; channel: string; provider: string; providerVideoId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (link: string): Promise<void> => {
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ video: { thumbnailUrl: string; channel: string; provider: string; providerVideoId: string } }>(
        '/api/providers/video/resolve',
        { url: link.trim() },
      );
      setResolved(result.video);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Add a video"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!url.trim() || !title.trim()}
            loading={busy}
            onClick={() => {
              void onSave({
                externalUrl: url.trim(),
                title: title.trim(),
                collectionId,
                thumbnailUrl: resolved?.thumbnailUrl ?? '',
                channel: resolved?.channel ?? '',
                provider: resolved?.provider ?? 'link',
                providerVideoId: resolved?.providerVideoId ?? '',
                sortOrder: 0,
              })
                .then(() => {
                  setUrl('');
                  setTitle('');
                  setResolved(null);
                  dialog.hide();
                })
                .catch((cause: unknown) => toast.fromError(cause));
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="Link"
        type="url"
        value={url}
        onChange={(value) => {
          setUrl(value);
          setResolved(null);
        }}
        placeholder="https://…"
        {...(error ? { error } : {})}
        autoFocus
      />
      <Button variant="secondary" size="sm" onClick={() => void resolve(url)} loading={busy} disabled={!url.trim()}>
        Check the link
      </Button>

      {resolved ? (
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div className="row row--nowrap">
            {resolved.thumbnailUrl ? (
              <img src={resolved.thumbnailUrl} alt="" style={{ width: 96, borderRadius: 'var(--radius-sm)' }} />
            ) : null}
            <div className="small muted">
              {resolved.provider === 'link' ? 'A plain link' : `Recognised as ${resolved.provider}`}
              <div className="tiny faint">{resolved.channel}</div>
            </div>
          </div>
        </Card>
      ) : null}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <TextField label="Title" value={title} onChange={setTitle} required />
      </div>
    </Dialog>
  );
}

function CollectionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <>
      <TextField label="Name" value={name} onChange={setName} required autoFocus />
      <div className="row">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="spacer" />
        <Button
          variant="primary"
          disabled={!name.trim()}
          loading={saving}
          onClick={() => {
            setSaving(true);
            void onSubmit(name.trim()).finally(() => setSaving(false));
          }}
        >
          Create
        </Button>
      </div>
    </>
  );
}
