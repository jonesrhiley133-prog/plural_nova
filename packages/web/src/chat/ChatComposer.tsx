import { useEffect, useRef, useState } from 'react';
import { useToast } from '../core/toast.js';
import { Button, IconButton } from '../ui/primitives.js';
import { ActionMenu, useActionMenu } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { PendingAttachmentChip } from './ChatAttachmentView.js';
import { GifPickerDialog } from './GifPickerDialog.js';
import { useVoiceRecorder, VoiceRecorderPanel } from './VoiceRecorder.js';

// Files keeps today's broad reach — documents included — since that option is
// deliberately the one that still opens the system file picker. Gallery and
// Camera get their own, narrower inputs below so each can carry the right
// `accept`/`capture` for what it is, which is also what lets the Android
// shell (see MainActivity.kt's onShowFileChooser) tell Gallery apart from
// Files and send it to the native photo picker instead of a generic chooser.
const FILES_ACCEPT = 'image/*,video/*,audio/*,.pdf,.txt';
const GALLERY_ACCEPT = 'image/*,video/*';

/** Grows with the text up to this many lines, then scrolls like any textarea. */
const MAX_COMPOSER_LINES = 8;

/**
 * Messages and System Chat attachments are two separately-declared types that
 * happen to be structurally identical — this is written once against that
 * shared shape rather than against either one by name, so passing either
 * type's values here needs no cast.
 */
export interface ComposerAttachment {
  id: string;
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  sizeBytes: number;
  title: string;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface ComposerReplyTarget {
  id: string;
  body: string;
  isMine: boolean;
  senderName: string | null;
}

export interface ChatComposerProps {
  replyTo: ComposerReplyTarget | null;
  onCancelReply: () => void;
  onSend: (text: string, options: { replyToId: string | null; attachments: ComposerAttachment[] }) => Promise<void> | void;
  /** Messages has a typing indicator; System Chat does not. */
  onTyping?: () => void;
  uploadAttachment: (file: Blob, name: string) => Promise<ComposerAttachment>;
  sending: boolean;
}

/**
 * The part of a conversation that changes on every keystroke, isolated into
 * its own component so typing never re-renders the message list above it —
 * previously the single biggest cause of the composer freezing on a long
 * conversation (every keystroke re-rendered every mounted row, not just this).
 */
export function ChatComposer({ replyTo, onCancelReply, onSend, onTyping, uploadAttachment, sending }: ChatComposerProps): JSX.Element {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const recorder = useVoiceRecorder();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachMenu = useActionMenu();
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  // Auto-grow: measured against the text's own scrollHeight rather than a
  // fixed line-count table, so it keeps working if the font size changes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight || '20') || 20;
    const max = lineHeight * MAX_COMPOSER_LINES;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [draft]);

  const send = async (): Promise<void> => {
    const text = draft;
    if (!text.trim() && pendingAttachments.length === 0) return;
    setDraft('');
    const attachments = pendingAttachments;
    setPendingAttachments([]);
    await onSend(text, { replyToId: replyTo?.id ?? null, attachments });
    onCancelReply();
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadAttachment(file, file.name);
        setPendingAttachments((current) => [...current, attachment]);
      }
    } catch (cause) {
      toast.fromError(cause, 'That file did not upload');
    } finally {
      setUploading(false);
    }
  };

  const sendVoiceMessage = async (blob: Blob): Promise<void> => {
    try {
      const attachment = await uploadAttachment(blob, `voice-message.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      await onSend('', { replyToId: replyTo?.id ?? null, attachments: [attachment] });
      onCancelReply();
    } catch (cause) {
      toast.fromError(cause, 'That voice message did not send');
    }
  };

  return (
    <>
      {replyTo ? (
        <div className="chat-reply-preview">
          <div className="chat-reply-preview__body">
            <span className="chat-reply-preview__author">
              Replying to {replyTo.senderName ?? (replyTo.isMine ? 'yourself' : 'them')}
            </span>
            <span className="truncate">{replyTo.body}</span>
          </div>
          <IconButton icon="close" label="Cancel reply" variant="ghost" size="sm" onClick={onCancelReply} />
        </div>
      ) : null}

      {recorder.state === 'recording' || recorder.state === 'recorded' ? (
        <div className="chat-composer">
          <VoiceRecorderPanel recorder={recorder} onSend={(blob) => void sendVoiceMessage(blob)} />
        </div>
      ) : (
        <>
          {pendingAttachments.length > 0 ? (
            <div className="chat-composer-attachments">
              {pendingAttachments.map((attachment) => (
                <PendingAttachmentChip
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                />
              ))}
              {uploading ? <span className="tiny faint">Uploading…</span> : null}
            </div>
          ) : null}

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              ref={galleryInputRef}
              type="file"
              multiple
              accept={GALLERY_ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              tabIndex={-1}
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept={FILES_ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <IconButton
              icon="attach"
              label="Attach"
              variant="ghost"
              disabled={uploading}
              onClick={(event) => attachMenu.openFrom(event)}
            />
            <textarea
              ref={textareaRef}
              className="input chat-composer__input"
              rows={1}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                onTyping?.();
              }}
              onKeyDown={(event) => {
                // IME composition (accents, CJK input, …) sends its own Enter
                // to confirm a candidate — that must only ever insert text,
                // never submit, or a composed character is silently dropped
                // and the half-finished message sends early.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Type a message…"
              aria-label="Message"
              autoComplete="off"
            />
            {draft.trim() || pendingAttachments.length > 0 ? (
              <Button variant="primary" type="submit" aria-label="Send" disabled={uploading} loading={sending}>
                <Icon name="send" size={17} />
              </Button>
            ) : (
              <IconButton icon="mic" label="Record a voice message" variant="primary" onClick={() => void recorder.start()} />
            )}
          </form>
          <ActionMenu
            position={attachMenu.position}
            onClose={attachMenu.close}
            items={[
              { key: 'gallery', label: 'Gallery', icon: 'media', onSelect: () => galleryInputRef.current?.click() },
              { key: 'camera', label: 'Camera', icon: 'camera', onSelect: () => cameraInputRef.current?.click() },
              { key: 'gifs', label: 'GIFs', icon: 'sparkle', onSelect: () => setGifPickerOpen(true) },
              { key: 'files', label: 'Files', icon: 'folder', onSelect: () => filesInputRef.current?.click() },
            ]}
          />
          <GifPickerDialog
            open={gifPickerOpen}
            onClose={() => setGifPickerOpen(false)}
            onPick={(attachment) => setPendingAttachments((current) => [...current, attachment])}
          />
          {recorder.state === 'denied' ? (
            <p className="chat-voice__denied" role="alert">
              Could not reach the microphone.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
