import { useNavigate } from 'react-router-dom';
import { IconButton } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import { ActiveChatterSwitcher } from './ActiveChatterSwitcher.js';

/**
 * Desktop-only rail to the left of the chat panes — hidden below the same
 * 900px breakpoint the panes themselves already use (see chat.css). Gives
 * "who's chatting" and "leave chat" a fixed home that doesn't depend on
 * which pane happens to be showing, instead of only living in the list
 * pane's own header the way they did before there was room for a rail.
 */
export function ChatNavRail({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useNavigate();
  return (
    <nav className="chat-nav-rail" aria-label="In-Sys Chat">
      <span className="chat-nav-rail__mark" aria-hidden="true">
        <Icon name="chat" size={22} />
      </span>
      <ActiveChatterSwitcher />
      <div className="chat-nav-rail__spacer" />
      <IconButton icon="group" label="New group" variant="ghost" onClick={() => navigate('/system/chat/new')} />
      <IconButton icon="chevronLeft" label="Back to PluralNova" variant="ghost" onClick={onClose} />
    </nav>
  );
}
