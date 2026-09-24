import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * The music player.
 *
 * One `<audio>` element, created once and never remounted, so switching pages
 * is invisible to whatever is playing — the mini bar and the full-screen view
 * are just two ways of looking at the same state, not two players.
 */

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  /** A full-length file plays start to finish; a 30-second catalogue preview
   *  is exactly that, and the player has no way to make it longer. */
  url: string;
  isFullLength: boolean;
}

interface MusicPlayerContextValue {
  current: MusicTrack | null;
  queue: MusicTrack[];
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  playbackRate: number;
  shuffle: boolean;
  repeat: boolean;
  expanded: boolean;
  play: (track: MusicTrack, queue?: MusicTrack[]) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  next: () => void;
  previous: () => void;
  addToQueue: (track: MusicTrack) => void;
  setVolume: (value: number) => void;
  setPlaybackRate: (value: number) => void;
  setShuffle: (value: boolean) => void;
  setRepeat: (value: boolean) => void;
  setExpanded: (value: boolean) => void;
  close: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export { RATES as PLAYBACK_RATES };

export function MusicPlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== 'undefined') audioRef.current = new Audio();

  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [history, setHistory] = useState<MusicTrack[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = (): void => setPosition(audio.currentTime);
    const onDuration = (): void => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = (): void => setPlaying(true);
    const onPause = (): void => setPlaying(false);
    const onEnded = (): void => advance(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTrack = useCallback((track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrent(track);
    setPosition(0);
    setDuration(0);
    audio.src = track.url;
    audio.playbackRate = playbackRate;
    audio.volume = volume;
    void audio.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(
    (track: MusicTrack, nextQueue?: MusicTrack[]) => {
      if (current) setHistory((existing) => [...existing, current]);
      setQueue(nextQueue ?? []);
      startTrack(track);
    },
    [current, startTrack],
  );

  const advance = useCallback(
    (fromEnded: boolean) => {
      const audio = audioRef.current;
      if (fromEnded && repeat && current) {
        if (audio) {
          audio.currentTime = 0;
          void audio.play().catch(() => undefined);
        }
        return;
      }
      setQueue((currentQueue) => {
        if (currentQueue.length === 0) {
          if (current) setHistory((existing) => [...existing, current]);
          setCurrent(null);
          setPlaying(false);
          return currentQueue;
        }
        const index = shuffle ? Math.floor(Math.random() * currentQueue.length) : 0;
        const nextTrack = currentQueue[index];
        if (!nextTrack) return currentQueue;
        if (current) setHistory((existing) => [...existing, current]);
        startTrack(nextTrack);
        return currentQueue.filter((_, position_) => position_ !== index);
      });
    },
    [current, repeat, shuffle, startTrack],
  );

  const previous = useCallback(() => {
    setHistory((existing) => {
      if (existing.length === 0) return existing;
      const last = existing[existing.length - 1]!;
      if (current) setQueue((currentQueue) => [current, ...currentQueue]);
      startTrack(last);
      return existing.slice(0, -1);
    });
  }, [current, startTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [current]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setPosition(seconds);
  }, []);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    setVolumeState(value);
    if (audio) audio.volume = value;
  }, []);

  const setPlaybackRate = useCallback((value: number) => {
    const audio = audioRef.current;
    setPlaybackRateState(value);
    if (audio) audio.playbackRate = value;
  }, []);

  const addToQueue = useCallback((track: MusicTrack) => {
    setQueue((existing) => [...existing, track]);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
    }
    setCurrent(null);
    setQueue([]);
    setPlaying(false);
    setExpanded(false);
  }, []);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      current,
      queue,
      playing,
      position,
      duration,
      volume,
      playbackRate,
      shuffle,
      repeat,
      expanded,
      play,
      toggle,
      seek,
      next: () => advance(false),
      previous,
      addToQueue,
      setVolume,
      setPlaybackRate,
      setShuffle,
      setRepeat,
      setExpanded,
      close,
    }),
    [
      current,
      queue,
      playing,
      position,
      duration,
      volume,
      playbackRate,
      shuffle,
      repeat,
      expanded,
      play,
      toggle,
      seek,
      advance,
      previous,
      addToQueue,
      setVolume,
      setPlaybackRate,
      close,
    ],
  );

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const context = useContext(MusicPlayerContext);
  if (!context) throw new Error('useMusicPlayer must be used inside <MusicPlayerProvider>.');
  return context;
}
