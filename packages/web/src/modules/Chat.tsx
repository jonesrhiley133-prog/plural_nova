import { useNavigate, useParams } from 'react-router-dom';
import { useActiveMemberId, useSystemMode } from '../core/auth.js';
import type { ChatKind } from '../core/chat.js';
import { ChatHome } from '../chat/ChatHome.js';
import { ChatConversationView } from '../chat/ChatConversationView.js';
import { Icon } from '../ui/Icon.js';

/**
 * Chat — the whole messaging app in miniature, and the one route in
 * PluralNova that does not live inside the standard shell. It takes the full
 * viewport on purpose: a conversation is not a dashboard card.
 *
 * The list and the open conversation are the same two panes on every size —
 * mobile shows one at a time (CSS decides which, from `data-active-pane`, so
 * switching back to the list does not lose its scroll position or state);
 * desktop shows both side by side, same markup, no separate layout to keep
 * in sync.
 */
export default function Chat(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams<{ kind?: string; threadId?: string }>();
  const activeMemberId = useActiveMemberId();
  const systemModeAvailable = useSystemMode();

  const kind: ChatKind | null = params.kind === 'dm' || params.kind === 'system' ? params.kind : null;
  const threadId = params.threadId ?? null;
  const activePane: 'list' | 'conversation' = kind && threadId ? 'conversation' : 'list';

  const openConversation = (nextKind: ChatKind, nextThreadId: string): void => {
    navigate(`/chat/${nextKind}/${nextThreadId}`);
  };
  const closeConversation = (): void => navigate('/chat');

  // Chat is the one screen outside the standard shell, so leaving it needs its
  // own way back. `navigate(-1)` returns to wherever the account actually was
  // when it opened Chat; a direct link or a fresh tab has no such entry, and
  // react-router's own history index is how that is told apart from a real one.
  const closeChat = (): void => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="chat-app" data-active-pane={activePane}>
      <div className="chat-pane chat-pane--list">
        <ChatHome systemModeAvailable={systemModeAvailable} onOpenConversation={openConversation} onClose={closeChat} />
      </div>
      <div className="chat-pane chat-pane--conversation">
        {kind && threadId ? (
          <ChatConversationView
            key={`${kind}:${threadId}`}
            kind={kind}
            threadId={threadId}
            viewerMemberId={activeMemberId}
            onBack={closeConversation}
          />
        ) : (
          <div className="chat-empty-pane">
            <Icon name="chat" size={40} />
            <p>Select a conversation to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}
