import { useState } from 'react';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import {
  useSystemChatThreads,
  updateSystemChatThread,
  deleteSystemChatThread,
  type SystemChatThreadSummary,
} from '../core/systemChat.js';
import { Avatar, Badge, IconButton } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ActionMenu, ConfirmDialog, useActionMenu, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { ActiveChatterSwitcher } from './ActiveChatterSwitcher.js';
import { NewSystemChatDialog } from './NewSystemChatDialog.js';

/**
 * In-Sys Chat's conversation list. Unlike Messages, there is no tab to
 * switch — this is the whole screen — and the header avatar is not a static
 * "you," it is the active chatter switcher: tapping it changes whose
 * conversations the list below shows (`useSystemChatThreads` already asked
 * the server to filter by that active member).
 */
interface SystemChatHomeProps {
  activeChatterId: string | null;
  onOpenConversation: (threadId: string) => void;
  onClose: () => void;
}

export function SystemChatHome({ activeChatterId, onOpenConversation, onClose }: SystemChatHomeProps): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const deleteDialog = useDialog<SystemChatThreadSummary>();

  const { threads, loading, error, reload } = useSystemChatThreads();

  const needle = query.trim().toLowerCase();
  const filtered = needle ? threads.filter((thread) => thread.title.toLowerCase().includes(needle)) : threads;
  const pinned = filtered.filter((thread) => thread.pinned);
  const rest = filtered.filter((thread) => !thread.pinned);

  const togglePin = (thread: SystemChatThreadSummary): void => {
    void updateSystemChatThread(thread.id, { pinned: !thread.pinned })
      .then(reload)
      .catch((cause: unknown) => toast.fromError(cause, 'Could not update that conversation'));
  };

  const toggleMute = (thread: SystemChatThreadSummary): void => {
    void updateSystemChatThread(thread.id, { muted: !thread.muted })
      .then(reload)
      .catch((cause: unknown) => toast.fromError(cause, 'Could not update that conversation'));
  };

  return (
    <div className="chat-home">
      <header className="chat-home__header">
        <IconButton icon="chevronLeft" label="Back to PluralNova" variant="ghost" onClick={onClose} />
        <ActiveChatterSwitcher />
        <h1 className="chat-home__title">In-Sys Chat</h1>
        <IconButton icon="create" label="New chat" variant="ghost" onClick={() => setNewChatOpen(true)} />
      </header>

      {activeChatterId === null ? (
        <div className="chat-home__notice">
          <span>No one's set as the active profile, so personal chats are hidden.</span>
          <ActiveChatterSwitcher
            renderTrigger={({ onClick }) => (
              <button type="button" className="chat-home__notice-action" onClick={onClick}>
                Choose who's chatting
              </button>
            )}
          />
        </div>
      ) : null}

      <div className="chat-home__search">
        <SearchField value={query} onChange={setQuery} placeholder="Search conversations" />
      </div>

      <div className="chat-home__list">
        <AsyncContent
          loading={loading}
          error={error}
          items={filtered}
          onRetry={reload}
          empty={{
            icon: 'chat',
            title: 'No conversations yet',
            body: 'Start a chat with an alter, a group, or the whole system.',
            action: { label: 'New chat', run: () => setNewChatOpen(true) },
          }}
        >
          {() => (
            <>
              {pinned.length > 0 ? (
                <ChatSection
                  title="✦ Important ✦"
                  threads={pinned}
                  dates={dates}
                  onOpen={onOpenConversation}
                  onTogglePin={togglePin}
                  onToggleMute={toggleMute}
                  onDelete={deleteDialog.show}
                />
              ) : null}
              <ChatSection
                title={pinned.length > 0 ? 'Uncategorized' : undefined}
                threads={rest}
                dates={dates}
                onOpen={onOpenConversation}
                onTogglePin={togglePin}
                onToggleMute={toggleMute}
                onDelete={deleteDialog.show}
              />
            </>
          )}
        </AsyncContent>
      </div>

      <NewSystemChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={(threadId) => {
          setNewChatOpen(false);
          onOpenConversation(threadId);
        }}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        onConfirm={async () => {
          if (!deleteDialog.value) return;
          await deleteSystemChatThread(deleteDialog.value.id);
          await reload();
        }}
        title="Delete this conversation?"
        body="It will be removed for the whole system."
        recoverable={false}
      />
    </div>
  );
}

function ChatSection({
  title,
  threads,
  dates,
  onOpen,
  onTogglePin,
  onToggleMute,
  onDelete,
}: {
  title?: string;
  threads: SystemChatThreadSummary[];
  dates: ReturnType<typeof useDateFormat>;
  onOpen: (threadId: string) => void;
  onTogglePin: (thread: SystemChatThreadSummary) => void;
  onToggleMute: (thread: SystemChatThreadSummary) => void;
  onDelete: (thread: SystemChatThreadSummary) => void;
}): JSX.Element | null {
  if (threads.length === 0) return null;
  return (
    <div className="chat-section">
      {title ? <div className="chat-section__title">{title}</div> : null}
      {threads.map((thread) => (
        <ConversationRow
          key={thread.id}
          thread={thread}
          dates={dates}
          onOpen={onOpen}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ConversationRow({
  thread,
  dates,
  onOpen,
  onTogglePin,
  onToggleMute,
  onDelete,
}: {
  thread: SystemChatThreadSummary;
  dates: ReturnType<typeof useDateFormat>;
  onOpen: (threadId: string) => void;
  onTogglePin: (thread: SystemChatThreadSummary) => void;
  onToggleMute: (thread: SystemChatThreadSummary) => void;
  onDelete: (thread: SystemChatThreadSummary) => void;
}): JSX.Element {
  const isGroupLike = thread.kind === 'group' || thread.kind === 'system';
  const menu = useActionMenu();

  return (
    <div className="chat-conversation-row">
      <button type="button" className="chat-conversation-row__main" onClick={() => onOpen(thread.id)}>
        <Avatar
          name={thread.title || '?'}
          src={thread.person?.avatarUrl ?? null}
          color={thread.person?.color ?? (isGroupLike ? 'var(--accent)' : null)}
          icon={isGroupLike ? 'group' : (thread.person?.icon ?? null)}
          size={44}
          round
        />
        <span className="chat-conversation-row__body">
          <span className="chat-conversation-row__top">
            <span className="chat-conversation-row__title truncate">{thread.title || 'Untitled'}</span>
            {thread.lastMessageAt ? <span className="chat-conversation-row__time">{dates.relative(thread.lastMessageAt)}</span> : null}
          </span>
          <span className="chat-conversation-row__bottom">
            <span className="chat-conversation-row__preview truncate">
              {thread.muted ? <Icon name="mute" size={12} label="Muted" /> : null}
              {thread.lastMessagePreview || 'No messages yet'}
            </span>
            {thread.unreadCount > 1 ? <Badge count={thread.unreadCount} /> : thread.unread ? <span className="chat-unread-dot" aria-label="Unread" /> : null}
          </span>
        </span>
      </button>
      <IconButton
        icon="pin"
        label={thread.pinned ? 'Unpin conversation' : 'Pin conversation'}
        variant="ghost"
        size="sm"
        className={thread.pinned ? 'chat-conversation-row__pin chat-conversation-row__pin--active' : 'chat-conversation-row__pin'}
        onClick={() => onTogglePin(thread)}
      />
      <IconButton icon="more" label="More options" variant="ghost" size="sm" onClick={(event) => menu.openFrom(event)} />
      <ActionMenu
        position={menu.position}
        onClose={menu.close}
        items={[
          { key: 'mute', label: thread.muted ? 'Unmute' : 'Mute', icon: 'mute', onSelect: () => onToggleMute(thread) },
          { key: 'delete', label: 'Delete', icon: 'trash', tone: 'danger', onSelect: () => onDelete(thread) },
        ]}
      />
    </div>
  );
}
