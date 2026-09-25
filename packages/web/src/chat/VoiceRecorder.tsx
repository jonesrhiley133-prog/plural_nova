import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '../ui/primitives.js';

type RecorderState = 'idle' | 'recording' | 'recorded' | 'denied';

const MAX_LEVELS = 28;

export interface VoiceRecorder {
  state: RecorderState;
  elapsedMs: number;
  levels: number[];
  blob: Blob | null;
  start: () => Promise<void>;
  stop: () => void;
  discard: () => void;
}

/**
 * Records a voice message from the microphone, with a live amplitude read-out
 * while recording and a real audio element to review before it sends. Nothing
 * here uploads anything — the composer does that once "send" is pressed,
 * through the same attachment pipeline a photo goes through.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [blob, setBlob] = useState<Blob | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const activeStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const raf = useRef(0);
  const timer = useRef(0);
  const discarding = useRef(false);

  const tick = useCallback(() => {
    if (!analyser.current) return;
    const data = new Uint8Array(analyser.current.frequencyBinCount);
    analyser.current.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    setLevels((current) => [...current, average / 255].slice(-MAX_LEVELS));
    raf.current = requestAnimationFrame(tick);
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(timer.current);
    activeStream.current?.getTracks().forEach((track) => track.stop());
    void audioContext.current?.close().catch(() => {});
    activeStream.current = null;
    audioContext.current = null;
    analyser.current = null;
  }, []);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('denied');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream.current = media;
      chunks.current = [];
      setBlob(null);
      setLevels([]);

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(media);
      const node = ctx.createAnalyser();
      node.fftSize = 64;
      source.connect(node);
      audioContext.current = ctx;
      analyser.current = node;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        if (!discarding.current) setBlob(new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' }));
        discarding.current = false;
      };
      mediaRecorder.current = recorder;
      recorder.start();

      startedAt.current = Date.now();
      setElapsedMs(0);
      timer.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 200);
      raf.current = requestAnimationFrame(tick);
      setState('recording');
    } catch {
      setState('denied');
    }
  }, [tick]);

  const stop = useCallback(() => {
    discarding.current = false;
    mediaRecorder.current?.stop();
    cleanup();
    setState('recorded');
  }, [cleanup]);

  const discard = useCallback(() => {
    discarding.current = true;
    mediaRecorder.current?.stop();
    cleanup();
    setBlob(null);
    setState('idle');
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { state, elapsedMs, levels, blob, start, stop, discard };
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The recording and review UI, in place of the rest of the composer while
 * either is happening. Renders nothing while idle — the caller owns the
 * `useVoiceRecorder()` instance, so it can swap its own text input and mic
 * trigger back in the moment there is nothing to show here.
 */
export function VoiceRecorderPanel({
  recorder,
  onSend,
}: {
  recorder: VoiceRecorder;
  onSend: (blob: Blob) => void;
}): JSX.Element | null {
  const objectUrl = useMemo(() => (recorder.blob ? URL.createObjectURL(recorder.blob) : null), [recorder.blob]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  if (recorder.state === 'idle' || recorder.state === 'denied') {
    return null;
  }

  if (recorder.state === 'recording') {
    return (
      <div className="chat-voice chat-voice--recording">
        <span className="chat-voice__dot" aria-hidden="true" />
        <span className="chat-voice__time">{formatElapsed(recorder.elapsedMs)}</span>
        <span className="chat-voice__levels" aria-hidden="true">
          {recorder.levels.map((level, index) => (
            <span key={index} className="chat-voice__level" style={{ height: `${Math.max(15, level * 100)}%` }} />
          ))}
        </span>
        <IconButton icon="trash" label="Cancel recording" variant="ghost" onClick={recorder.discard} />
        <IconButton icon="check" label="Stop recording" variant="primary" onClick={recorder.stop} />
      </div>
    );
  }

  return (
    <div className="chat-voice chat-voice--review">
      {objectUrl ? <audio className="chat-voice__player" src={objectUrl} controls /> : null}
      <IconButton icon="trash" label="Discard recording" variant="ghost" onClick={recorder.discard} />
      <IconButton
        icon="send"
        label="Send voice message"
        variant="primary"
        onClick={() => {
          if (recorder.blob) onSend(recorder.blob);
          recorder.discard();
        }}
      />
    </div>
  );
}
