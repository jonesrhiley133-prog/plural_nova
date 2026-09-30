import { useNavigate, useParams } from 'react-router-dom';
import { useActiveMemberId } from '../core/auth.js';
import { MessagesHome } from './MessagesHome.js';
import { MessageConversationView } from './MessageConversationView.js';
import { Icon } from '../ui/Icon.js';

/**
 * Messages — online, account-to-account conversation. Full-viewport like
 * In-Sys Chat so a conversation still isn't a dashboard card, but a
 * genuinely separate data layer, routing tree, and identity (see
 * `core/messages.ts`'s doc comment): participants are PluralNova accounts,
 * never alters, and nothing in this tree imports from `core/systemChat.ts`
 * or the `systemChat/` tree.
 */
export default function MessagesPage(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams<{ threadId?: string }>();
  const speakingAsMemberId = useActiveMemberId();

  const threadId = params.threadId ?? null;
  const activePane: 'list' | 'conversation' = threadId ? 'conversation' : 'list';

  const openConversation = (nextThreadId: string): void => {
    navigate(`/social/messages/${nextThreadId}`);
  };
  // Replace, not push — opening a conversation already pushed one entry, and
  // stacking a second on the way back doubles the history depth "back to
  // PluralNova" has to unwind, landing it on the conversation just left
  // instead of wherever the account actually was before Messages opened.
  const closeConversation = (): void => navigate('/social/messages', { replace: true });

  // Messages is the other screen outside the standard shell, so leaving it
  // needs its own way back. `navigate(-1)` returns to wherever the account
  // actually was when it opened Messages; a direct link or a fresh tab has
  // no such entry, and react-router's own history index is how that is told
  // apart from a real one.
  const closeChat = (): void => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="chat-app" data-active-pane={activePane}>
      <div className="chat-pane chat-pane--list">
        <MessagesHome onOpenConversation={openConversation} onClose={closeChat} />
      </div>
      <div className="chat-pane chat-pane--conversation">
        {threadId ? (
          <MessageConversationView key={threadId} threadId={threadId} speakingAsMemberId={speakingAsMemberId} onBack={closeConversation} />
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
