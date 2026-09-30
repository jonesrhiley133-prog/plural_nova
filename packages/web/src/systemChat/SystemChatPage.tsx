import { useNavigate, useParams } from 'react-router-dom';
import { useActiveChatterId } from '../core/systemChat.js';
import { SystemChatHome } from './SystemChatHome.js';
import { SystemChatConversationView } from './SystemChatConversationView.js';
import { Icon } from '../ui/Icon.js';

/**
 * In-Sys Chat — alter-to-alter conversation, entirely internal to the
 * account. Full-viewport like Messages so a conversation still isn't a
 * dashboard card, but a genuinely separate data layer, routing tree, and
 * identity (see `core/systemChat.ts`'s doc comment) — never the same
 * conversations, participants, or notifications as Messages.
 */
export default function SystemChatPage(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams<{ threadId?: string }>();
  const activeChatterId = useActiveChatterId();

  const threadId = params.threadId ?? null;
  const activePane: 'list' | 'conversation' = threadId ? 'conversation' : 'list';

  const openConversation = (nextThreadId: string): void => {
    navigate(`/system/chat/${nextThreadId}`);
  };
  // Replace, not push — opening a conversation already pushed one entry, and
  // stacking a second on the way back doubles the history depth "back to
  // PluralNova" has to unwind, landing it on the conversation just left
  // instead of wherever the account actually was before chat opened.
  const closeConversation = (): void => navigate('/system/chat', { replace: true });

  // In-Sys Chat is the one screen outside the standard shell, so leaving it
  // needs its own way back. `navigate(-1)` returns to wherever the account
  // actually was when it opened chat; a direct link or a fresh tab has no
  // such entry, and react-router's own history index is how that is told
  // apart from a real one.
  const closeChat = (): void => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="chat-app" data-active-pane={activePane}>
      <div className="chat-pane chat-pane--list">
        <SystemChatHome activeChatterId={activeChatterId} onOpenConversation={openConversation} onClose={closeChat} />
      </div>
      <div className="chat-pane chat-pane--conversation">
        {threadId ? (
          <SystemChatConversationView key={threadId} threadId={threadId} viewerMemberId={activeChatterId} onBack={closeConversation} />
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
