import type { CSSProperties } from 'react';

/** A chat's circular icon: an emoji, a symbol, an uploaded image, or a generated colour + glyph. */
export interface ChatIconValue {
  type: 'emoji' | 'symbol' | 'image' | 'generated';
  value: string;
  /** Background colour for emoji / symbol / generated icons. */
  color?: string;
}

export const CHAT_EMOJI = ['💬', '🌌', '☀️', '🌙', '⭐', '🔥', '🌈', '🦖', '🐈', '🌸', '🍵', '📚', '🎨', '🎮', '🎧', '🏠', '💼', '🎓', '❤️', '🫶', '🧩', '🪐', '🌿', '🦋'];
export const CHAT_SYMBOLS = ['✦', '◈', '❀', '▲', '♪', '◐', '✿', '☾', '☼', '❖', '✧', '♥', '⚑', '☂', '✎', '⌘'];
export const CHAT_COLORS = ['#7aa2f7', '#a78bfa', '#5ec6a8', '#f0a85a', '#ec7392', '#8bd5ff', '#fb923c', '#c084fc'];

export function generatedIcon(seed: string): ChatIconValue {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { type: 'generated', value: CHAT_SYMBOLS[h % CHAT_SYMBOLS.length] as string, color: CHAT_COLORS[(h >> 3) % CHAT_COLORS.length] as string };
}

export function readChatIcon(settings: Record<string, unknown> | null | undefined): ChatIconValue | null {
  const raw = settings?.['icon'];
  if (!raw || typeof raw !== 'object') return null;
  const icon = raw as Partial<ChatIconValue>;
  return typeof icon.value === 'string' && icon.type ? (icon as ChatIconValue) : null;
}

export function ChatIcon({ icon, size = 44 }: { icon: ChatIconValue; size?: number }): JSX.Element {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    fontSize: size * 0.5,
    lineHeight: 1,
    background: icon.color ?? 'var(--surface-raised)',
    color: icon.type === 'emoji' ? undefined : '#0b1020',
  };
  if (icon.type === 'image') {
    return <img src={icon.value} alt="" style={{ ...base, objectFit: 'cover' }} loading="lazy" />;
  }
  return (
    <span style={base} aria-hidden="true">
      {icon.value}
    </span>
  );
}
