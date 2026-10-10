import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { type ActionMenuPosition } from '../ui/overlays.js';

/**
 * A curated grid for dropping an emoji straight into the composer — same
 * spirit as `MessageBubble.tsx`'s `QUICK_REACTIONS` (a small fixed set
 * rather than a live system/Unicode picker), just larger and grouped into a
 * few simple categories instead of one flat row.
 */
const EMOJI_CATEGORIES: { label: string; emoji: string[] }[] = [
  {
    label: 'Smileys',
    emoji: ['😀', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤔', '😏', '😴', '🥱', '😮', '😢', '😭', '😡', '🥳', '😎', '🤗', '🤯', '🙄'],
  },
  {
    label: 'Gestures',
    emoji: ['👍', '👎', '👏', '🙌', '🙏', '👋', '✌️', '🤞', '💪', '🤝', '👌', '🫶'],
  },
  {
    label: 'Hearts',
    emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💔', '✨', '⭐'],
  },
  {
    label: 'Animals & nature',
    emoji: ['🐱', '🐶', '🦊', '🐰', '🐻', '🦋', '🌸', '🌙', '☀️', '🔥', '🌈', '🍀'],
  },
];

export function EmojiPicker({
  position,
  onClose,
  onPick,
}: {
  position: ActionMenuPosition;
  onClose: () => void;
  onPick: (emoji: string) => void;
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position.open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [position.open, onClose]);

  if (!position.open) return null;
  const style = {
    position: 'fixed' as const,
    [position.fromRight ? 'right' : 'left']: position.x,
    [position.fromBottom ? 'bottom' : 'top']: position.y,
  };

  return createPortal(
    <div className="emoji-picker" role="menu" aria-label="Emoji" style={style} ref={ref}>
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.label} className="emoji-picker__category">
          <p className="emoji-picker__category-title">{category.label}</p>
          <div className="emoji-picker__grid">
            {category.emoji.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-picker__option"
                onClick={() => {
                  onPick(emoji);
                  onClose();
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
