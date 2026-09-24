import { useEffect } from 'react';
import { useMusicPlayer, PLAYBACK_RATES } from '../core/musicPlayer.js';
import { Avatar, Button, Chip, IconButton } from '../ui/primitives.js';
import { Dialog } from '../ui/overlays.js';

/**
 * The music mini-bar and its full-screen now-playing view.
 *
 * One player, two windows onto it: a bar that survives every navigation, and a
 * full-screen stage that is just that same state shown larger. Closing the
 * stage returns to the bar; only the bar's own close button stops playback.
 */

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function MusicPlayerBar(): JSX.Element | null {
  const player = useMusicPlayer();
  const { current } = player;

  // The page's own bottom padding only grows while there is a bar to clear —
  // a class rather than an inline style, so every screen picks it up for free.
  useEffect(() => {
    document.documentElement.classList.toggle('has-music-bar', current !== null);
    return () => document.documentElement.classList.remove('has-music-bar');
  }, [current]);

  if (!current) return null;

  const percent = player.duration > 0 ? (player.position / player.duration) * 100 : 0;

  return (
    <>
      <div className="music-bar">
        <button
          type="button"
          className="music-bar__body"
          onClick={() => player.setExpanded(true)}
          aria-label={`Open the now-playing view for ${current.title}`}
        >
          <span style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Avatar name={current.title} src={current.artworkUrl || null} size={40} />
            <span style={{ minWidth: 0 }}>
              <span className="music-bar__title truncate" style={{ display: 'block' }}>
                {current.title}
              </span>
              <span className="music-bar__artist truncate" style={{ display: 'block' }}>
                {current.artist || 'Unknown artist'}
              </span>
            </span>
          </span>
        </button>

        <div className="music-bar__controls">
          <IconButton
            icon={player.playing ? 'pause' : 'play'}
            label={player.playing ? 'Pause' : 'Play'}
            variant="ghost"
            onClick={player.toggle}
          />
          <IconButton icon="skipNext" label="Next" variant="ghost" onClick={player.next} />
          <IconButton icon="close" label="Stop playing" variant="ghost" size="sm" onClick={player.close} />
        </div>

        <span className="music-bar__progress" aria-hidden="true">
          <span className="music-bar__progress-fill" style={{ width: `${percent}%` }} />
        </span>
      </div>

      <Dialog
        open={player.expanded}
        onClose={() => player.setExpanded(false)}
        title={current.title}
        description={current.artist || 'Unknown artist'}
        fullscreen
      >
        <div className="music-stage">
          <div className="music-stage__art">
            {current.artworkUrl ? (
              <img src={current.artworkUrl} alt="" />
            ) : (
              <svg viewBox="0 0 24 24" width={64} height={64} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden="true">
                <path d="M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" />
              </svg>
            )}
          </div>

          <Chip>{current.isFullLength ? 'Full track' : '30-second preview'}</Chip>

          <div className="music-stage__scrub">
            <input
              type="range"
              className="music-scrub"
              min={0}
              max={player.duration || 0}
              step={1}
              value={Math.min(player.position, player.duration || 0)}
              disabled={!player.duration}
              onChange={(event) => player.seek(Number(event.target.value))}
              style={{ ['--music-scrub-fill' as never]: `${percent}%` }}
              aria-label="Seek"
            />
            <div className="music-stage__times">
              <span>{formatTime(player.position)}</span>
              <span>{formatTime(player.duration)}</span>
            </div>
          </div>

          <div className="music-transport">
            <IconButton
              icon="shuffle"
              label="Shuffle the queue"
              variant={player.shuffle ? 'secondary' : 'ghost'}
              onClick={() => player.setShuffle(!player.shuffle)}
            />
            <IconButton icon="skipPrev" label="Previous" variant="ghost" onClick={player.previous} />
            <IconButton
              icon={player.playing ? 'pause' : 'play'}
              label={player.playing ? 'Pause' : 'Play'}
              variant="primary"
              className="music-transport__play"
              onClick={player.toggle}
            />
            <IconButton icon="skipNext" label="Next" variant="ghost" onClick={player.next} />
            <IconButton
              icon="repeat"
              label="Repeat this track"
              variant={player.repeat ? 'secondary' : 'ghost'}
              onClick={() => player.setRepeat(!player.repeat)}
            />
          </div>

          <div className="music-stage__rates">
            {PLAYBACK_RATES.map((rate) => (
              <Chip key={rate} selected={player.playbackRate === rate} onClick={() => player.setPlaybackRate(rate)}>
                {rate}×
              </Chip>
            ))}
          </div>

          {player.queue.length > 0 ? (
            <div className="music-stage__queue">
              <p className="tiny faint" style={{ marginBottom: 'var(--space-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Up next
              </p>
              <div className="list">
                {player.queue.map((track) => (
                  <div key={track.id} className="list-row">
                    <Avatar name={track.title} src={track.artworkUrl || null} size={32} />
                    <span className="list-row__body">
                      <span className="list-row__title">{track.title}</span>
                      <span className="list-row__meta">
                        <span>{track.artist || 'Unknown artist'}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button variant="ghost" size="sm" icon="close" onClick={player.close}>
            Stop playing
          </Button>
        </div>
      </Dialog>
    </>
  );
}
