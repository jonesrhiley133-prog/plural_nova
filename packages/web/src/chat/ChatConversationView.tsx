import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { readableTextOn } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import {
  resolveChatAppearance,
  useChatConversation,
  uploadChatAttachment,
  type ChatAttachment,
  type ChatKind,
  type ChatMessage,
} from '../core/chat.js';
import { Avatar, AvatarStack, Button, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { MessageBubble } from './MessageBubble.js';
import { PendingAttachmentChip } from './ChatAttachmentView.js';
import { useVoiceRecorder, VoiceRecorderPanel } from './VoiceRecorder.js';
import { SendAsStrip } from './SendAsStrip.js';
import { ChatInfoDialog } from './ChatInfoDialog.js';
import { ForwardDialog } from './ForwardDialog.js';

const ATTACH_ACCEPT = 'image/*,video/*,audio/*,.pdf,.txt';

/**
 * One open conversation: header, the message history, and the composer. The
 * composer itself adapts to what is happening — a plain text row normally,
 * queued attachment thumbnails above it once something is picked, and the
 * whole row replaced by the recorder while a voice message is in progress.
 */
interface ChatConversationViewProps {
  kind: ChatKind;
  threadId: string;
  viewerMemberId: string | null;
  onBack: () => void;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function ChatConversationView({
  kind,
  threadId,
  viewerMemberId,
  onBack,
}: ChatConversationViewProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const { settings } = useAuth();
  const members = useCollection('members', { enabled: kind === 'system' });
  const conversation = useChatConversation(kind, threadId, viewerMemberId);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [asMemberId, setAsMemberId] = useState<string | null>(viewerMemberId);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<ChatAttachment | null>(null);
  const forwardDialog = useDialog<ChatMessage>();
  const deleteDialog = useDialog<ChatMessage>();
  const recorder = useVoiceRecorder();
  const attachInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    setAsMemberId(viewerMemberId);
    setReplyTo(null);
    setDraft('');
    setPendingAttachments([]);
    userScrolledUp.current = false;
  }, [threadId, viewerMemberId]);

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
    const options = { replyToId: replyTo?.id ?? null, asMemberId, attachments };
    setReplyTo(null);
    await conversation.send(text, options);
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadChatAttachment(file, file.name);
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
      const attachment = await uploadChatAttachment(blob, `voice-message.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      await conversation.send('', { replyToId: replyTo?.id ?? null, asMemberId, attachments: [attachment] });
      setReplyTo(null);
    } catch (cause) {
      toast.fromError(cause, 'That voice message did not send');
    }
  };

  const react = (messageId: string, emoji: string): void => {
    void conversation.react(messageId, emoji).catch((cause: unknown) => toast.fromError(cause, 'That reaction did not go through'));
  };

  const copy = (message: ChatMessage): void => {
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
  const isGroupLike = thread?.subKind === 'group' || thread?.subKind === 'system';

  const appearance = resolveChatAppearance(settings.chatAppearance, thread?.settings ?? null);
  const appearanceStyle = {
    ...(appearance.wallpaper ? { '--chat-wallpaper': appearance.wallpaper } : {}),
    ...(appearance.bubbleMine
      ? { '--chat-bubble-mine': appearance.bubbleMine, '--chat-bubble-mine-text': readableTextOn(appearance.bubbleMine) }
      : {}),
    ...(appearance.bubbleTheirs ? { '--chat-bubble-theirs': appearance.bubbleTheirs } : {}),
  } as never;

  return (
    <div className="chat-conversation" style={appearanceStyle} data-spacing={appearance.spacing}>
      <header className="chat-conversation__header">
        <IconButton icon="chevronLeft" label="Back to conversations" variant="ghost" className="chat-conversation__back" onClick={onBack} />
        {isGroupLike ? (
          <AvatarStack
            people={(thread?.participants ?? []).map((person) => ({
              name: person.name,
              src: person.avatarUrl,
              color: person.color,
              icon: person.icon,
            }))}
            size={30}
          />
        ) : (
          <Avatar
            name={thread?.title ?? '?'}
            src={thread?.person?.avatarUrl ?? null}
            color={thread?.person?.color ?? null}
            icon={thread?.person?.icon ?? null}
            size={34}
            round
          />
        )}
        <div className="chat-conversation__title">
          <span className="chat-conversation__name">{thread?.title}</span>
          {kind === 'dm' ? (
            <span className="chat-conversation__status">
              {!conversation.cryptoSupported
                ? ''
                : conversation.encryptionReady
                  ? 'End-to-end encrypted'
                  : 'Not encrypted yet'}
            </span>
          ) : isGroupLike ? (
            <span className="chat-conversation__status">{(thread?.participants.length ?? 0) || 'Everyone'} {thread?.subKind === 'system' ? '· whole system' : ''}</span>
          ) : null}
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
              const showName = kind === 'system' && showAvatar && !message.isMine;
              lastDay = day;
              lastSenderKey = senderKey;
              const quoted = message.replyToId ? byId.get(message.replyToId) ?? null : null;

              return (
                <div key={message.id} id={`chat-message-${message.id}`}>
                  {showDayHeading ? <div className="chat-day-heading">{dates.date(message.sentAt)}</div> : null}
                  <MessageBubble
                    message={message}
                    showAvatar={showAvatar}
                    showName={showName}
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

      {kind === 'system' ? (
        <SendAsStrip members={members.items} value={asMemberId} onChange={setAsMemberId} />
      ) : null}

      {thread ? (
        <ChatInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} thread={thread} onChanged={conversation.refreshThread} />
      ) : null}

      <ForwardDialog
        open={forwardDialog.open}
        onClose={forwardDialog.hide}
        kind={kind}
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
