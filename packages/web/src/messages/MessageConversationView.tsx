import { useEffect, useMemo, useRef, useState } from 'react';
import { readableTextOn, resolveChatAppearance } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import {
  useMessageConversation,
  useMessageThreads,
  uploadMessageAttachment,
  type Message,
  type MessageAttachment,
} from '../core/messages.js';
import { Avatar, Button, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ActionMenu, ConfirmDialog, Dialog, useActionMenu, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { MessageBubble } from '../chat/MessageBubble.js';
import { PendingAttachmentChip, type ChatAttachmentLike } from '../chat/ChatAttachmentView.js';
import { GifPickerDialog } from '../chat/GifPickerDialog.js';
import { useVoiceRecorder, VoiceRecorderPanel } from '../chat/VoiceRecorder.js';
import { ForwardDialog, type ForwardCandidate } from '../chat/ForwardDialog.js';
import { useVirtualizedChat } from '../chat/useVirtualizedChat.js';
import { MessagesInfoDialog } from './MessagesInfoDialog.js';

// Files keeps today's broad reach — documents included — since that option is
// deliberately the one that still opens the system file picker. Gallery and
// Camera get their own, narrower inputs below so each can carry the right
// `accept`/`capture` for what it is, which is also what lets the Android
// shell (see MainActivity.kt's onShowFileChooser) tell Gallery apart from
// Files and send it to the native photo picker instead of a generic chooser.
const FILES_ACCEPT = 'image/*,video/*,audio/*,.pdf,.txt';
const GALLERY_ACCEPT = 'image/*,video/*';

/**
 * One open Messages conversation: header, history, composer — every DM is a
 * 1:1 with a friend today, so the header always shows that one person, never
 * an alter or a switcher. `data-kind="dm"` on the root is what gives this
 * screen its own accent via the shared `chat.css` rules.
 */
interface MessageConversationViewProps {
  threadId: string;
  speakingAsMemberId: string | null;
  onBack: () => void;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function MessageConversationView({ threadId, speakingAsMemberId, onBack }: MessageConversationViewProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const { settings, user } = useAuth();
  const conversation = useMessageConversation(threadId, speakingAsMemberId);
  const { threads: allThreads } = useMessageThreads();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<ChatAttachmentLike | null>(null);
  const forwardDialog = useDialog<Message>();
  const deleteDialog = useDialog<Message>();
  const recorder = useVoiceRecorder();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const attachMenu = useActionMenu();
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  const messagesByOldestFirst = conversation.messages;
  const { scrollRef, virtualizer, userScrolledUp, handleScroll, scrollToBottom, scrollToId } = useVirtualizedChat(
    messagesByOldestFirst,
    { estimateSize: 76 },
  );

  useEffect(() => {
    setReplyTo(null);
    setDraft('');
    setPendingAttachments([]);
    userScrolledUp.current = false;
  }, [threadId, userScrolledUp]);

  useEffect(() => {
    if (userScrolledUp.current) return;
    scrollToBottom();
  }, [messagesByOldestFirst.length, userScrolledUp, scrollToBottom]);

  useEffect(() => {
    conversation.markRead();
  }, [conversation]);

  const byId = useMemo(() => new Map(messagesByOldestFirst.map((message) => [message.id, message])), [messagesByOldestFirst]);

  // Grouping (day headings, whether to repeat an avatar) depends on the
  // previous message in the full, oldest-first order — computed once here,
  // over every message, rather than from whatever the virtualizer currently
  // has mounted, which is only ever a scrolled-to slice of the conversation.
  const rows = useMemo(() => {
    let lastDay = '';
    let lastSenderKey = '';
    return messagesByOldestFirst.map((message) => {
      const day = dayKey(message.sentAt);
      const senderKey = `${message.isMine}:${message.sender?.id ?? ''}`;
      const showDayHeading = day !== lastDay;
      const showAvatar = showDayHeading || senderKey !== lastSenderKey;
      lastDay = day;
      lastSenderKey = senderKey;
      return { message, showDayHeading, showAvatar, quoted: message.replyToId ? byId.get(message.replyToId) ?? null : null };
    });
  }, [messagesByOldestFirst, byId]);

  const scrollToMessage = (id: string): void => {
    scrollToId(id);
    // The target row may not exist yet — jumping the scroll position only
    // brings it into the virtualizer's rendered window; it mounts on the
    // next render, which this briefly waits out before smooth-scrolling the
    // last bit and applying the highlight, same as before virtualization.
    window.setTimeout(() => {
      const element = document.getElementById(`chat-message-${id}`);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('chat-message--highlight');
      window.setTimeout(() => element.classList.remove('chat-message--highlight'), 1200);
    }, 50);
  };

  const send = async (): Promise<void> => {
    const text = draft;
    if (!text.trim() && pendingAttachments.length === 0) return;
    setDraft('');
    const attachments = pendingAttachments;
    setPendingAttachments([]);
    const options = { replyToId: replyTo?.id ?? null, attachments };
    setReplyTo(null);
    await conversation.send(text, options);
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadMessageAttachment(file, file.name);
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
      const attachment = await uploadMessageAttachment(blob, `voice-message.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      await conversation.send('', { replyToId: replyTo?.id ?? null, attachments: [attachment] });
      setReplyTo(null);
    } catch (cause) {
      toast.fromError(cause, 'That voice message did not send');
    }
  };

  const react = (messageId: string, emoji: string): void => {
    void conversation.react(messageId, emoji).catch((cause: unknown) => toast.fromError(cause, 'That reaction did not go through'));
  };

  const copy = (message: Message): void => {
    void navigator.clipboard
      .writeText(message.body)
      .then(() => toast.success('Copied'))
      .catch(() => toast.fromError(new Error('Copy failed'), 'Could not copy that message'));
  };

  if (conversation.loading && !conversation.thread) {
    return (
      <div className="chat-conversation">
        <div className="chat-conversation__loading">
          <SkeletonList rows={6} />
        </div>
      </div>
    );
  }

  if (conversation.error && !conversation.thread) {
    return (
      <div className="chat-conversation">
        <ErrorPanel message={conversation.error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const thread = conversation.thread;

  const appearance = resolveChatAppearance(settings.messagesAppearance, thread?.settings ?? null);
  const appearanceStyle = {
    ...(appearance.wallpaper ? { '--chat-wallpaper': appearance.wallpaper } : {}),
    ...(appearance.bubbleMine
      ? { '--chat-bubble-mine': appearance.bubbleMine, '--chat-bubble-mine-text': readableTextOn(appearance.bubbleMine) }
      : {}),
    ...(appearance.bubbleTheirs ? { '--chat-bubble-theirs': appearance.bubbleTheirs } : {}),
  } as never;

  const forwardCandidates: ForwardCandidate[] = allThreads.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    avatarUrl: candidate.person?.avatarUrl,
    color: candidate.person?.color,
    icon: candidate.person?.icon,
  }));

  return (
    <div className="chat-conversation" style={appearanceStyle} data-spacing={appearance.spacing} data-kind="dm">
      <header className="chat-conversation__header">
        <IconButton icon="chevronLeft" label="Back to conversations" variant="ghost" className="chat-conversation__back" onClick={onBack} />
        <Avatar
          name={thread?.title ?? '?'}
          src={thread?.person?.avatarUrl ?? null}
          color={thread?.person?.color ?? null}
          icon={thread?.person?.icon ?? null}
          size={34}
          round
        />
        <div className="chat-conversation__title">
          <span className="chat-conversation__name">{thread?.title}</span>
          <span className="chat-conversation__status">{conversation.theirTyping ? 'Typing…' : ''}</span>
        </div>
        <IconButton icon="info" label="Conversation info" variant="ghost" onClick={() => setInfoOpen(true)} />
      </header>

      <div className="chat-conversation__messages" ref={scrollRef} onScroll={handleScroll}>
        {rows.length === 0 ? (
          <EmptyState icon="chat" title="Say hello" body="Nothing here yet — the first message starts the conversation." />
        ) : (
          <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const { message, showDayHeading, showAvatar, quoted } = rows[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  id={`chat-message-${message.id}`}
                  className={`chat-message-row ${message.isMine ? 'chat-message-row--mine' : 'chat-message-row--theirs'}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    paddingBottom: 2,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {showDayHeading ? <div className="chat-day-heading">{dates.date(message.sentAt)}</div> : null}
                  <MessageBubble
                    message={{
                      ...message,
                      // `readBy` is seeded with the sender's own id when a
                      // message is created, so "read" means someone besides
                      // the sender shows up in it — not merely a non-empty list.
                      readStatus: message.isMine
                        ? message.readBy.some((id) => id !== user?.id)
                          ? 'read'
                          : 'sent'
                        : undefined,
                    }}
                    showAvatar={showAvatar}
                    showName={false}
                    quotedMessage={quoted}
                    timeLabel={dates.time(message.sentAt)}
                    onReact={(emoji) => react(message.id, emoji)}
                    onRetry={() => void conversation.retry(message)}
                    onReply={() => setReplyTo(message)}
                    onForward={() => forwardDialog.show(message)}
                    onCopy={() => copy(message)}
                    onDelete={() => deleteDialog.show(message)}
                    onOpenAttachment={(attachment) => {
                      if (attachment.mediaType === 'image') setLightbox(attachment);
                    }}
                    onQuoteClick={quoted ? () => scrollToMessage(quoted.id) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {replyTo ? (
        <div className="chat-reply-preview">
          <div className="chat-reply-preview__body">
            <span className="chat-reply-preview__author">
              Replying to {replyTo.sender?.name ?? (replyTo.isMine ? 'yourself' : thread?.title ?? 'them')}
            </span>
            <span className="truncate">{replyTo.body}</span>
          </div>
          <IconButton icon="close" label="Cancel reply" variant="ghost" size="sm" onClick={() => setReplyTo(null)} />
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
            <input
              className="input chat-composer__input"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                conversation.sendTyping();
              }}
              placeholder="Type a message…"
              aria-label="Message"
              autoComplete="off"
            />
            {draft.trim() || pendingAttachments.length > 0 ? (
              <Button variant="primary" type="submit" aria-label="Send" disabled={uploading} loading={conversation.sending}>
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

      {thread ? (
        <MessagesInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} thread={thread} onChanged={conversation.refreshThread} />
      ) : null}

      <ForwardDialog
        open={forwardDialog.open}
        onClose={forwardDialog.hide}
        candidates={forwardCandidates}
        excludeThreadId={threadId}
        message={forwardDialog.value}
        onForward={(targetThreadIds) => conversation.forward(forwardDialog.value!.id, targetThreadIds)}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        onConfirm={async () => {
          if (!deleteDialog.value) return;
          await conversation.remove(deleteDialog.value.id);
        }}
        title="Delete this message?"
        body="It will be removed for everyone in this conversation."
        recoverable={false}
      />

      <Dialog open={lightbox !== null} onClose={() => setLightbox(null)} title={lightbox?.title || 'Image'} fullscreen>
        {lightbox ? <img className="chat-lightbox__image" src={lightbox.url} alt={lightbox.title || 'Image'} /> : null}
      </Dialog>
    </div>
  );
}
