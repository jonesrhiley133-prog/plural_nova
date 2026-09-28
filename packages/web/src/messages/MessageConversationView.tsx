import { useEffect, useRef, useState } from 'react';
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
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { MessageBubble } from '../chat/MessageBubble.js';
import { PendingAttachmentChip, type ChatAttachmentLike } from '../chat/ChatAttachmentView.js';
import { useVoiceRecorder, VoiceRecorderPanel } from '../chat/VoiceRecorder.js';
import { ForwardDialog, type ForwardCandidate } from '../chat/ForwardDialog.js';
import { MessagesInfoDialog } from './MessagesInfoDialog.js';

const ATTACH_ACCEPT = 'image/*,video/*,audio/*,.pdf,.txt';

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
  const { settings } = useAuth();
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
  const attachInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    setReplyTo(null);
    setDraft('');
    setPendingAttachments([]);
    userScrolledUp.current = false;
  }, [threadId]);

  useEffect(() => {
    if (userScrolledUp.current) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.messages.length]);

  useEffect(() => {
    conversation.markRead();
  }, [conversation]);

  const messagesByOldestFirst = conversation.messages;
  const byId = new Map(messagesByOldestFirst.map((message) => [message.id, message]));

  const scrollToMessage = (id: string): void => {
    const element = document.getElementById(`chat-message-${id}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('chat-message--highlight');
    window.setTimeout(() => element.classList.remove('chat-message--highlight'), 1200);
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
          <span className="chat-conversation__status">
            {!conversation.cryptoSupported ? '' : conversation.encryptionReady ? 'End-to-end encrypted' : 'Not encrypted yet'}
          </span>
        </div>
        <IconButton icon="info" label="Conversation info" variant="ghost" onClick={() => setInfoOpen(true)} />
      </header>

      <div
        className="chat-conversation__messages"
        onScroll={(event) => {
          const target = event.currentTarget;
          userScrolledUp.current = target.scrollTop + target.clientHeight < target.scrollHeight - 80;
        }}
      >
        {messagesByOldestFirst.length === 0 ? (
          <EmptyState icon="chat" title="Say hello" body="Nothing here yet — the first message starts the conversation." />
        ) : (
          (() => {
            let lastDay = '';
            let lastSenderKey = '';
            return messagesByOldestFirst.map((message) => {
              const day = dayKey(message.sentAt);
              const senderKey = `${message.isMine}:${message.sender?.id ?? ''}`;
              const showDayHeading = day !== lastDay;
              const showAvatar = showDayHeading || senderKey !== lastSenderKey;
              lastDay = day;
              lastSenderKey = senderKey;
              const quoted = message.replyToId ? byId.get(message.replyToId) ?? null : null;

              return (
                <div key={message.id} id={`chat-message-${message.id}`}>
                  {showDayHeading ? <div className="chat-day-heading">{dates.date(message.sentAt)}</div> : null}
                  <MessageBubble
                    message={message}
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
            });
          })()
        )}
        <div ref={bottomRef} />
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
              ref={attachInputRef}
              type="file"
              multiple
              accept={ATTACH_ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              onChange={(event) => {
                void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <IconButton
              icon="attach"
              label="Attach a file"
              variant="ghost"
              disabled={uploading}
              onClick={() => attachInputRef.current?.click()}
            />
            <input
              className="input chat-composer__input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
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
