import { useCallback, useRef } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';

/**
 * Shared virtualization mechanics for a chat message list — Messages and
 * System Chat each have their own data layer (see messages.ts/systemChat.ts)
 * but render an identical shape of list: a tall, often long-running
 * conversation inside its own scrolling pane (not the window, unlike the
 * member grid), with rows that vary a lot in height — a one-line text bubble,
 * a photo, a voice note, a quoted reply. Rendering every message mounted at
 * once is the main cost in a long conversation; this is the mechanics half
 * of fixing that; each caller still owns its own JSX, day-heading/avatar
 * grouping, and `MessageBubble` props.
 */
export function useVirtualizedChat<T extends { id: string }>(
  items: T[],
  options: { estimateSize: number; overscan?: number },
): {
  scrollRef: (node: HTMLDivElement | null) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  userScrolledUp: { current: boolean };
  handleScroll: () => void;
  scrollToBottom: () => void;
  scrollToId: (id: string) => void;
} {
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUp = useRef(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => options.estimateSize,
    overscan: options.overscan ?? 6,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollElementRef.current = node;
    },
    [],
  );

  const handleScroll = useCallback(() => {
    const el = scrollElementRef.current;
    if (!el) return;
    userScrolledUp.current = el.scrollTop + el.clientHeight < el.scrollHeight - 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (items.length === 0) return;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [virtualizer, items.length]);

  const scrollToId = useCallback(
    (id: string) => {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return;
      virtualizer.scrollToIndex(index, { align: 'center' });
    },
    [virtualizer, items],
  );

  return { scrollRef, virtualizer, userScrolledUp, handleScroll, scrollToBottom, scrollToId };
}
