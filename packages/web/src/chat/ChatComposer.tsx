import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { plainTextPreview } from '@pluralnova/shared';
import { useToast } from '../core/toast.js';
import { Button, IconButton } from '../ui/primitives.js';
import { ActionMenu, useActionMenu, type ActionMenuPosition } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import {
  MentionAutocompleteList,
  mentionQueryBefore,
  useMentionAutocomplete,
  type MentionCandidate,
} from '../ui/MentionAutocomplete.js';
import { PendingAttachmentChip } from './ChatAttachmentView.js';
import { GifPickerDialog } from './GifPickerDialog.js';
import { EmojiPicker } from './EmojiPicker.js';
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

/** The message a "Edit" action re-opened the composer for. */
export interface ComposerEditTarget {
  id: string;
  body: string;
}

export interface ChatComposerProps {
  replyTo: ComposerReplyTarget | null;
  onCancelReply: () => void;
  onSend: (text: string, options: { replyToId: string | null; attachments: ComposerAttachment[] }) => Promise<void> | void;
  /** Set only while editing one of this account's own messages — mutually exclusive with `replyTo`. */
  editing?: ComposerEditTarget | null;
  onCancelEdit?: () => void;
  onEditSubmit?: (messageId: string, text: string) => Promise<void> | void;
  /** Messages has a typing indicator; System Chat does not. */
  onTyping?: () => void;
  uploadAttachment: (file: Blob, name: string) => Promise<ComposerAttachment>;
  sending: boolean;
}

type FormatAction = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'quote' | 'list' | 'spoiler';

/**
 * The part of a conversation that changes on every keystroke, isolated into
 * its own component so typing never re-renders the message list above it —
 * previously the single biggest cause of the composer freezing on a long
 * conversation (every keystroke re-rendered every mounted row, not just this).
 */
export function ChatComposer({
  replyTo,
  onCancelReply,
  onSend,
  editing = null,
  onCancelEdit,
  onEditSubmit,
  onTyping,
  uploadAttachment,
  sending,
}: ChatComposerProps): JSX.Element {
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
  const colorMenu = useActionMenu();
  const emojiMenu = useActionMenu();
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [draftColor, setDraftColor] = useState('#e53e3e');
  const mentionAutocomplete = useMentionAutocomplete();
  // Set by a toolbar/shortcut insertion, consumed by the effect right below
  // it — restoring focus and the wrapped selection has to wait until React
  // has actually re-rendered the textarea with the new `draft` value.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

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

  useEffect(() => {
    if (pendingSelection.current) {
      const { start, end } = pendingSelection.current;
      pendingSelection.current = null;
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(start, end);
    }
  }, [draft]);

  // Re-opening the composer for an edit pre-fills the raw source and hands
  // focus back, the same as clicking into any other already-drafted field.
  useEffect(() => {
    if (editing) {
      setDraft(editing.body);
      textareaRef.current?.focus();
    }
    // Keyed on the id alone: a parent re-render handing down an `editing`
    // object that is new by reference but still the same message must not
    // re-clobber whatever's since been typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  /** Replaces the in-progress `@query` the autocomplete was opened for with the real stable-id token. */
  const insertMention = (candidate: MentionCandidate): void => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? draft.length;
    const mention = mentionQueryBefore(draft, cursor);
    mentionAutocomplete.close();
    if (!mention) return;
    const token = `@[${candidate.kind}:${candidate.id}] `;
    setDraft(draft.slice(0, mention.atIndex) + token + draft.slice(cursor));
    const cursorAfter = mention.atIndex + token.length;
    pendingSelection.current = { start: cursorAfter, end: cursorAfter };
  };

  const insertAroundSelection = (before: string, after: string, placeholder: string): void => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end) || placeholder;
    setDraft(draft.slice(0, start) + before + selected + after + draft.slice(end));
    const cursorStart = start + before.length;
    pendingSelection.current = { start: cursorStart, end: cursorStart + selected.length };
  };

  const insertLinePrefix = (prefix: string): void => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const lineStart = draft.lastIndexOf('\n', start - 1) + 1;
    const prefixed = draft
      .slice(lineStart, end)
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    setDraft(draft.slice(0, lineStart) + prefixed + draft.slice(end));
    const cursor = lineStart + prefixed.length;
    pendingSelection.current = { start: cursor, end: cursor };
  };

  const applyFormat = (action: FormatAction): void => {
    switch (action) {
      case 'bold':
        insertAroundSelection('**', '**', 'bold text');
        break;
      case 'italic':
        insertAroundSelection('*', '*', 'italic text');
        break;
      case 'underline':
        insertAroundSelection('__', '__', 'underlined text');
        break;
      case 'strike':
        insertAroundSelection('~~', '~~', 'struck text');
        break;
      case 'code':
        insertAroundSelection('`', '`', 'code');
        break;
      case 'spoiler':
        insertAroundSelection('||', '||', 'spoiler');
        break;
      case 'quote':
        insertLinePrefix('> ');
        break;
      case 'list':
        insertLinePrefix('- ');
        break;
    }
  };

  const insertColor = (): void => {
    insertAroundSelection(`%${draftColor}%`, '%%', 'coloured text');
    colorMenu.close();
  };

  const insertEmoji = (emoji: string): void => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    const cursor = start + emoji.length;
    pendingSelection.current = { start: cursor, end: cursor };
  };

  const send = async (): Promise<void> => {
    const text = draft;
    if (editing) {
      if (!text.trim()) return;
      setDraft('');
      await onEditSubmit?.(editing.id, text);
      onCancelEdit?.();
      return;
    }
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
      {editing ? (
        <div className="chat-reply-preview chat-reply-preview--editing">
          <div className="chat-reply-preview__body">
            <span className="chat-reply-preview__author">Editing message</span>
          </div>
          <IconButton icon="close" label="Cancel editing" variant="ghost" size="sm" onClick={onCancelEdit} />
        </div>
      ) : replyTo ? (
        <div className="chat-reply-preview">
          <div className="chat-reply-preview__body">
            <span className="chat-reply-preview__author">
              Replying to {replyTo.senderName ?? (replyTo.isMine ? 'yourself' : 'them')}
            </span>
            <span className="truncate">{plainTextPreview(replyTo.body)}</span>
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
            {!editing ? (
              <IconButton
                icon="attach"
                label="Attach"
                variant="ghost"
                disabled={uploading}
                onClick={(event) => attachMenu.openFrom(event)}
              />
            ) : null}
            <div className="chat-composer__field">
              <div className="chat-composer__toolbar" role="toolbar" aria-label="Formatting">
                <IconButton icon="bold" label="Bold (Ctrl+B)" variant="ghost" size="sm" onClick={() => applyFormat('bold')} />
                <IconButton icon="italic" label="Italic (Ctrl+I)" variant="ghost" size="sm" onClick={() => applyFormat('italic')} />
                <IconButton icon="underline" label="Underline (Ctrl+U)" variant="ghost" size="sm" onClick={() => applyFormat('underline')} />
                <IconButton icon="strikethrough" label="Strikethrough" variant="ghost" size="sm" onClick={() => applyFormat('strike')} />
                <IconButton icon="code" label="Code" variant="ghost" size="sm" onClick={() => applyFormat('code')} />
                <IconButton icon="quote" label="Quote" variant="ghost" size="sm" onClick={() => applyFormat('quote')} />
                <IconButton icon="list" label="List" variant="ghost" size="sm" onClick={() => applyFormat('list')} />
                <IconButton icon="eyeOff" label="Spoiler" variant="ghost" size="sm" onClick={() => applyFormat('spoiler')} />
                <IconButton
                  icon="palette"
                  label="Colour"
                  variant="ghost"
                  size="sm"
                  onClick={(event) => colorMenu.openFrom(event)}
                />
                <IconButton
                  icon="emoji"
                  label="Emoji"
                  variant="ghost"
                  size="sm"
                  onClick={(event) => emojiMenu.openFrom(event)}
                />
              </div>
              <textarea
                ref={textareaRef}
                className="input chat-composer__input"
                rows={1}
                value={draft}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  onTyping?.();
                  const cursor = event.target.selectionStart ?? value.length;
                  const mention = mentionQueryBefore(value, cursor);
                  if (mention) mentionAutocomplete.search(mention.query);
                  else mentionAutocomplete.close();
                }}
                onKeyDown={(event) => {
                  if (mentionAutocomplete.open && mentionAutocomplete.results.length > 0) {
                    if (event.key === 'ArrowDown') { event.preventDefault(); mentionAutocomplete.moveHighlight(1); return; }
                    if (event.key === 'ArrowUp') { event.preventDefault(); mentionAutocomplete.moveHighlight(-1); return; }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault();
                      const picked = mentionAutocomplete.pickHighlighted();
                      if (picked) insertMention(picked);
                      return;
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      mentionAutocomplete.close();
                      return;
                    }
                  }
                  // IME composition (accents, CJK input, …) sends its own Enter
                  // to confirm a candidate — that must only ever insert text,
                  // never submit, or a composed character is silently dropped
                  // and the half-finished message sends early.
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                    return;
                  }
                  if (event.key === 'Escape' && editing) {
                    onCancelEdit?.();
                    return;
                  }
                  // Guarded on a modifier so this never fires for an ordinary
                  // keystroke — only Ctrl/Cmd+B/I/U, nothing a modifier-free
                  // "b" or "i" typed while composing should ever trigger.
                  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                    const key = event.key.toLowerCase();
                    if (key === 'b') { event.preventDefault(); applyFormat('bold'); return; }
                    if (key === 'i') { event.preventDefault(); applyFormat('italic'); return; }
                    if (key === 'u') { event.preventDefault(); applyFormat('underline'); return; }
                  }
                }}
                placeholder={editing ? 'Edit your message…' : 'Type a message…'}
                aria-label="Message"
                autoComplete="off"
              />
              <MentionAutocompleteList
                state={mentionAutocomplete}
                onHover={(index) => mentionAutocomplete.moveHighlight(index - mentionAutocomplete.highlightedIndex)}
                onPick={insertMention}
              />
            </div>
            {editing ? (
              <>
                <Button variant="ghost" type="button" onClick={onCancelEdit}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" aria-label="Save edit" disabled={!draft.trim()} loading={sending}>
                  <Icon name="check" size={17} />
                </Button>
              </>
            ) : draft.trim() || pendingAttachments.length > 0 ? (
              <Button variant="primary" type="submit" aria-label="Send" disabled={uploading} loading={sending}>
                <Icon name="send" size={17} />
              </Button>
            ) : (
              <IconButton icon="mic" label="Record a voice message" variant="primary" onClick={() => void recorder.start()} />
            )}
          </form>
          <ColorMenuPopover
            position={colorMenu.position}
            onClose={colorMenu.close}
            color={draftColor}
            onColorChange={setDraftColor}
            onInsert={insertColor}
          />
          <EmojiPicker position={emojiMenu.position} onClose={emojiMenu.close} onPick={insertEmoji} />
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

/** A native colour input is its own live swatch preview — no separate hue/saturation picker to build or keep in sync. */
function ColorMenuPopover({
  position,
  onClose,
  color,
  onColorChange,
  onInsert,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  color: string;
  onColorChange: (value: string) => void;
  onInsert: () => void;
}): JSX.Element | null {
  if (!position.open) return null;
  const style = {
    position: 'fixed' as const,
    [position.fromRight ? 'right' : 'left']: position.x,
    [position.fromBottom ? 'bottom' : 'top']: position.y,
  };

  return createPortal(
    <div className="chat-composer__color-menu" role="menu" style={style}>
      <input
        type="color"
        aria-label="Text colour"
        value={color}
        onChange={(event) => onColorChange(event.target.value)}
      />
      <Button variant="primary" size="sm" type="button" onClick={onInsert}>
        Apply
      </Button>
      <IconButton icon="close" label="Cancel" variant="ghost" size="sm" onClick={onClose} />
    </div>,
    document.body,
  );
}
