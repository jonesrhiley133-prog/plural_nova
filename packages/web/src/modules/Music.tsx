import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { ApiRequestError, api, messageFor } from '../core/api.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { SearchField, TextField, useDebounced } from '../ui/forms.js';
import { AsyncContent, EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Music.
 *
 * Search runs against a provider adapter on the server; what comes back is
 * metadata and whatever the provider publishes for playback — an official
 * preview, or a link out. PluralNova does not host or scrape audio.
 *
 * The search is debounced and the results only replace the list once a response
 * arrives, so typing does not make the page flicker between states.
 */

interface ProviderTrack {
  providerTrackId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  previewUrl: string;
  externalUrl: string;
  durationSeconds: number;
  provider: string;
}

export default function Music(): JSX.Element {
  const { term } = useI18n();
  const toast = useToast();

  const playlists = useCollection('musicPlaylists');
  const tracks = useCollection('musicTracks');

  const [tab, setTab] = useState<'library' | 'search'>('library');
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounced(rawQuery, 450);

  const [results, setResults] = useState<ProviderTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [queue, setQueue] = useState<StoredRecord[]>([]);
  const [playing, setPlaying] = useState<{ title: string; artist: string; url: string } | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  const playlistEditor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();

  const runSearch = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    try {
      const result = await api.get<{ tracks: ProviderTrack[] }>('/api/providers/music/search', {
        q: text,
        provider: 'itunes',
      });
      // Results are swapped in only once they arrive, so the list never blanks
      // and refills while someone is still typing.
      setResults(result.tracks);
      setSearchError(null);
    } catch (cause) {
      setSearchError(
        cause instanceof ApiRequestError ? cause.message : 'The music service could not be reached.',
      );
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'search') void runSearch(query);
  }, [query, tab, runSearch]);

  const inPlaylist = playlistId
    ? tracks.items.filter((track) => track['playlistId'] === playlistId)
    : tracks.items;

  const play = (track: { title: string; artist: string; url: string }): void => {
    if (!track.url) {
      toast.info('No preview for this track', 'The provider does not publish one. Use the link to open it there.');
      return;
    }
    setPlaying(track);
    window.setTimeout(() => void audio.current?.play().catch(() => undefined), 0);
  };

  const playNext = (): void => {
    if (queue.length === 0) {
      if (repeat && playing) void audio.current?.play();
      return;
    }
    const index = shuffle ? Math.floor(Math.random() * queue.length) : 0;
    const next = queue[index];
    if (!next) return;
    setQueue((current) => current.filter((_, position) => position !== index));
    play({
      title: String(next['title']),
      artist: String(next['artist'] ?? ''),
      url: String(next['previewUrl'] ?? ''),
    });
  };

  const save = async (track: ProviderTrack): Promise<void> => {
    try {
      await tracks.create({
        playlistId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artworkUrl,
        previewUrl: track.previewUrl,
        externalUrl: track.externalUrl,
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        durationSeconds: track.durationSeconds,
        sortOrder: inPlaylist.length,
      });
      toast.success('Saved to your library');
    } catch (cause) {
      toast.fromError(cause, 'Could not save that track');
    }
  };

  return (
    <>
      <PageHeader
        title="Music"
        description="Search a public catalogue, keep what you like, and build playlists."
        actions={
          <Button variant="primary" icon="plus" onClick={() => playlistEditor.show()}>
            New playlist
          </Button>
        }
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          label="Section"
          options={[
            { value: 'library', label: 'Your library' },
            { value: 'search', label: 'Search' },
          ]}
        />
      </div>

      {tab === 'search' ? (
        <>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <SearchField
              value={rawQuery}
              onChange={setRawQuery}
              placeholder="Search for a track, artist or album…"
            />
          </div>

          {searchError ? (
            <ErrorPanel message={searchError} onRetry={() => void runSearch(query)} />
          ) : searching && results.length === 0 ? (
            <SkeletonList rows={5} />
          ) : results.length === 0 ? (
            <Card>
              <EmptyState
                icon="music"
                title={query.trim().length >= 2 ? 'Nothing found' : 'Search for something'}
                body={
                  query.trim().length >= 2
                    ? 'Try a different spelling, or an artist rather than a track.'
                    : 'Results come from a public catalogue. Where a preview exists, it plays here; otherwise the link opens the provider.'
                }
              />
            </Card>
          ) : (
            <Card flush>
              <div className="list">
                {results.map((track) => (
                  <div key={track.providerTrackId} className="list-row">
                    <Avatar name={track.title} src={track.artworkUrl || null} size={40} />
                    <span className="list-row__body">
                      <span className="list-row__title">{track.title}</span>
                      <span className="list-row__meta">
                        <span>{track.artist}</span>
                        {track.album ? <span className="faint truncate">{track.album}</span> : null}
                        {!track.previewUrl ? <Chip>No preview</Chip> : null}
                      </span>
                    </span>
                    <span className="list-row__trailing">
                      <IconButton
                        icon="play"
                        label={`Play a preview of ${track.title}`}
                        variant="ghost"
                        size="sm"
                        disabled={!track.previewUrl}
                        onClick={() => play({ title: track.title, artist: track.artist, url: track.previewUrl })}
                      />
                      <IconButton
                        icon="plus"
                        label={`Save ${track.title}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => void save(track)}
                      />
                      {track.externalUrl ? (
                        <a
                          href={track.externalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="button button--ghost button--sm button--icon"
                          aria-label={`Open ${track.title} in the provider`}
                        >
                          <Icon name="link" size={14} />
                        </a>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          {playlists.items.length > 0 ? (
            <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
              <Chip selected={playlistId === null} onClick={() => setPlaylistId(null)}>
                Everything
              </Chip>
              {playlists.items.map((playlist) => (
                <Chip
                  key={playlist.id}
                  selected={playlistId === playlist.id}
                  color={(playlist['color'] as string) ?? null}
                  onClick={() => setPlaylistId(playlist.id)}
                >
                  {String(playlist['name'])}
                </Chip>
              ))}
            </div>
          ) : null}

          <AsyncContent
            loading={tracks.loading}
            error={tracks.error}
            items={inPlaylist}
            onRetry={tracks.reload}
            empty={{
              title: 'Nothing saved yet',
              body: term('Search for a track, or add one by hand. Playlists can belong to the {{system}} or to one {{member}}.'),
              icon: 'music',
              action: { label: 'Search', run: () => setTab('search') },
            }}
          >
            {(items) => (
              <Card flush>
                <div className="list">
                  {items.map((track) => (
                    <div key={track.id} className="list-row">
                      <Avatar name={String(track['title'])} src={(track['artworkUrl'] as string) || null} size={38} />
                      <span className="list-row__body">
                        <span className="list-row__title">{String(track['title'])}</span>
                        <span className="list-row__meta">
                          <span>{String(track['artist'] ?? '')}</span>
                          {track['favorite'] === true ? (
                            <span style={{ color: 'var(--caution)' }}>
                              <Icon name="star" size={11} label="Favourite" />
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        <IconButton
                          icon="play"
                          label={`Play ${String(track['title'])}`}
                          variant="ghost"
                          size="sm"
                          disabled={!track['previewUrl']}
                          onClick={() =>
                            play({
                              title: String(track['title']),
                              artist: String(track['artist'] ?? ''),
                              url: String(track['previewUrl'] ?? ''),
                            })
                          }
                        />
                        <IconButton
                          icon="list"
                          label={`Queue ${String(track['title'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setQueue((current) => [...current, track]);
                            toast.success('Added to the queue');
                          }}
                        />
                        <IconButton
                          icon="star"
                          label={`Favourite ${String(track['title'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => void tracks.update(track.id, { favorite: track['favorite'] !== true })}
                        />
                        <IconButton
                          icon="trash"
                          label={`Remove ${String(track['title'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show(track)}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </AsyncContent>
        </>
      )}

      {playing ? (
        <Card raised style={{ position: 'sticky', bottom: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <div className="row row--between row--nowrap">
            <div style={{ minWidth: 0 }}>
              <div className="truncate small" style={{ fontWeight: 'var(--weight-medium)' }}>
                {playing.title}
              </div>
              <div className="tiny faint truncate">{playing.artist}</div>
            </div>
            <div className="row row--nowrap">
              <IconButton
                icon="shuffle"
                label="Shuffle the queue"
                variant={shuffle ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShuffle((value) => !value)}
              />
              <IconButton
                icon="repeat"
                label="Repeat this track"
                variant={repeat ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setRepeat((value) => !value)}
              />
              <IconButton icon="skipNext" label="Next in queue" variant="ghost" size="sm" onClick={playNext} />
            </div>
          </div>
          <audio
            ref={audio}
            src={playing.url}
            controls
            onEnded={playNext}
            style={{ width: '100%', marginTop: 'var(--space-3)' }}
          />
          {queue.length > 0 ? (
            <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
              {queue.length} in the queue
            </p>
          ) : null}
        </Card>
      ) : null}

      <PlaylistDialog dialog={playlistEditor} playlists={playlists} />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Remove this track?"
        body="It is removed from your library. Nothing happens to the provider."
        onConfirm={async () => {
          if (!confirm.value) return;
          await tracks.remove(confirm.value.id);
          toast.success('Removed');
        }}
      />

      <p className="tiny faint" style={{ marginTop: 'var(--space-5)' }}>
        Track information comes from a public catalogue and playback uses the previews that provider
        publishes. PluralNova does not store or stream audio itself.
      </p>
    </>
  );
}

function PlaylistDialog({
  dialog,
  playlists,
}: {
  dialog: ReturnType<typeof useDialog<StoredRecord>>;
  playlists: ReturnType<typeof useCollection>;
}): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="New playlist"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={saving}
            onClick={() => {
              setSaving(true);
              void playlists
                .create({ name: name.trim(), description, isSystemPlaylist: true, trackCount: 0 })
                .then(() => {
                  setName('');
                  setDescription('');
                  dialog.hide();
                  toast.success('Playlist created');
                })
                .catch((cause: unknown) => toast.fromError(cause))
                .finally(() => setSaving(false));
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <TextField label="Name" value={name} onChange={setName} required autoFocus />
      <TextField label="Description" value={description} onChange={setDescription} multiline rows={2} />
    </Dialog>
  );
}
