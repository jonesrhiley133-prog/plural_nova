import { useState } from 'react';
import { useAuth } from '../core/auth.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useChatThreads, updateChatThread, deleteChatThread, type ChatKind, type ChatThreadSummary } from '../core/chat.js';
import { Avatar, Badge, IconButton, Tabs } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { ActionMenu, ConfirmDialog, useActionMenu, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { NewChatDialog } from './NewChatDialog.js';

/**
 * Chat Home: the conversation list, both kinds. One "New chat" button opens
 * the picker for whichever tab is active, so starting System Chat with an
 * alter and starting a dm with a friend feel like the same gesture.
 */
interface ChatHomeProps {
  systemModeAvailable: boolean;
  onOpenConversation: (kind: ChatKind, threadId: string) => void;
}

export function ChatHome({ systemModeAvailable, onOpenConversation }: ChatHomeProps): JSX.Element {
  const { user, settings } = useAuth();
  const { term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const [tab, setTab] = useState<ChatKind>(systemModeAvailable ? 'system' : 'dm');
  const [query, setQuery] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const deleteDialog = useDialog<ChatThreadSummary>();

  const system = useChatThreads('system');
  const dm = useChatThreads('dm');
  const active = tab === 'system' ? system : dm;

  const needle = query.trim().toLowerCase();
  const filtered = needle ? active.threads.filter((thread) => thread.title.toLowerCase().includes(needle)) : active.threads;
  const pinned = filtered.filter((thread) => thread.pinned);
  const rest = filtered.filter((thread) => !thread.pinned);

  const reloadFor = (thread: ChatThreadSummary): Promise<void> => (thread.kind === 'system' ? system.reload() : dm.reload());

  const togglePin = (thread: ChatThreadSummary): void => {
    void updateChatThread(thread.kind, thread.id, { pinned: !thread.pinned })
      .then(() => reloadFor(thread))
      .catch((cause: unknown) => toast.fromError(cause, 'Could not update that conversation'));
  };

  const toggleMute = (thread: ChatThreadSummary): void => {
    void updateChatThread(thread.kind, thread.id, { muted: !thread.muted })
      .then(() => reloadFor(thread))
      .catch((cause: unknown) => toast.fromError(cause, 'Could not update that conversation'));
  };

  return (
    <div className="chat-home">
      <header className="chat-home__header">
        <Avatar name={settings.mode === 'system' ? term('The {{system}}') : user?.displayName ?? 'Me'} size={36} round />
        <h1 className="chat-home__title">Chat</h1>
        <IconButton icon="create" label="New chat" variant="ghost" onClick={() => setNewChatOpen(true)} />
      </header>

      {systemModeAvailable ? (
        <Tabs
          value={tab}
          onChange={setTab}
          label="Conversation type"
          options={[
            { value: 'system', label: <>{term('System')}{system.threads.some((t) => t.unread) ? ' •' : ''}</> },
            { value: 'dm', label: <>Direct{dm.threads.some((t) => t.unread) || dm.requests.length > 0 ? ' •' : ''}</> },
          ]}
        />
      ) : null}

      <div className="chat-home__search">
        <SearchField value={query} onChange={setQuery} placeholder="Search conversations" />
      </div>

      <div className="chat-home__list">
        <AsyncContent
          loading={active.loading}
          error={active.error}
          items={filtered}
          onRetry={active.reload}
          empty={{
            icon: 'chat',
            title: 'No conversations yet',
            body: tab === 'system' ? 'Start a chat with an alter, a group, or the whole system.' : 'Message a friend to start a conversation.',
            action: { label: 'New chat', run: () => setNewChatOpen(true) },
          }}
        >
          {() => (
            <>
              {tab === 'dm' && dm.requests.length > 0 ? (
                <ChatSection
                  title="Message requests"
                  threads={dm.requests}
                  dates={dates}
                  onOpen={onOpenConversation}
                  onTogglePin={togglePin}
                  onToggleMute={toggleMute}
                  onDelete={deleteDialog.show}
                />
              ) : null}
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
                title={pinned.length > 0 || (tab === 'dm' && dm.requests.length > 0) ? 'Uncategorized' : undefined}
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

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        kind={tab}
        onCreated={(kind, threadId) => {
          setNewChatOpen(false);
          onOpenConversation(kind, threadId);
        }}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onClose={deleteDialog.hide}
        onConfirm={async () => {
          if (!deleteDialog.value) return;
          await deleteChatThread(deleteDialog.value.kind, deleteDialog.value.id);
          await reloadFor(deleteDialog.value);
        }}
        title="Delete this conversation?"
        body={
          deleteDialog.value?.kind === 'dm'
            ? 'It leaves your list. If they message you again, it comes back.'
            : 'It will be removed for the whole system.'
        }
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
  threads: ChatThreadSummary[];
  dates: ReturnType<typeof useDateFormat>;
  onOpen: (kind: ChatKind, threadId: string) => void;
  onTogglePin: (thread: ChatThreadSummary) => void;
  onToggleMute: (thread: ChatThreadSummary) => void;
  onDelete: (thread: ChatThreadSummary) => void;
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
  thread: ChatThreadSummary;
  dates: ReturnType<typeof useDateFormat>;
  onOpen: (kind: ChatKind, threadId: string) => void;
  onTogglePin: (thread: ChatThreadSummary) => void;
  onToggleMute: (thread: ChatThreadSummary) => void;
  onDelete: (thread: ChatThreadSummary) => void;
}): JSX.Element {
  const isGroupLike = thread.subKind === 'group' || thread.subKind === 'system';
  const menu = useActionMenu();

  return (
    <div className="chat-conversation-row">
      <button type="button" className="chat-conversation-row__main" onClick={() => onOpen(thread.kind, thread.id)}>
        <Avatar
          name={thread.title || '?'}
          src={thread.person?.avatarUrl ?? null}
          color={thread.person?.color ?? (isGroupLike ? 'var(--accent)' : null)}
          icon={isGroupLike ? 'group' : thread.person?.icon ?? null}
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
              {thread.lastMessagePreview || (thread.isRequest ? 'Wants to message you' : 'No messages yet')}
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
      <IconButton
        icon="more"
        label="More options"
        variant="ghost"
        size="sm"
        onClick={(event) => menu.openFrom(event)}
      />
      <ActionMenu
        position={menu.position}
        onClose={menu.close}
        items={[
          {
            key: 'mute',
            label: thread.muted ? 'Unmute' : 'Mute',
            icon: 'mute',
            onSelect: () => onToggleMute(thread),
          },
          { key: 'delete', label: 'Delete', icon: 'trash', tone: 'danger', onSelect: () => onDelete(thread) },
        ]}
      />
    </div>
  );
}
