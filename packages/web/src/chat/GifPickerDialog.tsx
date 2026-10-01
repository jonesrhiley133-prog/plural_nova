import { useEffect, useState } from 'react';
import { featuredGifs, fetchGifAsAttachment, searchGifs, type FetchedGif, type GifResult } from '../core/gifs.js';
import { useToast } from '../core/toast.js';
import { Dialog } from '../ui/overlays.js';
import { useDebounced } from '../ui/forms.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';

/**
 * Gallery/Camera/Files all resolve to a plain file input; GIFs is the one
 * option with somewhere to browse first. Shared between Messages and System
 * Chat the same way `ChatAttachmentView`/`ForwardDialog` already are — a
 * picked GIF comes back in the same shape `uploadMessageAttachment` and
 * `uploadSystemChatAttachment` already produce, so either caller can use it
 * as its own attachment type with no cast needed.
 */
export function GifPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (attachment: FetchedGif) => void;
}): JSX.Element {
  const toast = useToast();
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounced(rawQuery, 400);
  const [results, setResults] = useState<GifResult[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRawQuery('');
    setResults([]);
    setPickingId(null);
    setLoading(true);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const trimmed = query.trim();
    const request = trimmed ? searchGifs(trimmed) : featuredGifs();
    request
      .then((result) => {
        if (cancelled) return;
        setResults(result.gifs);
        setAvailable(result.available);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const pick = async (gif: GifResult): Promise<void> => {
    setPickingId(gif.id);
    try {
      const attachment = await fetchGifAsAttachment(gif);
      onPick(attachment);
      onClose();
    } catch (cause) {
      toast.fromError(cause, 'That GIF did not send');
    } finally {
      setPickingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="GIFs">
      {available ? (
        <div className="stack">
          <input
            className="input"
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            placeholder="Search GIFs…"
            aria-label="Search GIFs"
            autoComplete="off"
            autoFocus
          />
          {loading ? (
            <SkeletonList rows={3} />
          ) : results.length === 0 ? (
            <EmptyState icon="sparkle" title="No GIFs found" body="Try a different search." />
          ) : (
            <div className="grid grid--tight" style={{ ['--grid-min' as never]: '104px' }}>
              {results.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  className="gif-picker__tile"
                  disabled={pickingId !== null}
                  onClick={() => void pick(gif)}
                  aria-label={gif.title || 'Send this GIF'}
                >
                  <img src={gif.previewUrl} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {pickingId ? <span className="tiny faint">Sending…</span> : null}
        </div>
      ) : (
        <EmptyState
          icon="sparkle"
          title="GIF search is not set up"
          body="Ask whoever hosts this PluralNova to add a Tenor API key. Gallery, Camera and Files still work without it."
        />
      )}
    </Dialog>
  );
}
