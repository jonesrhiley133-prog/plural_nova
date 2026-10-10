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
  getScrollMetrics: () => { scrollTop: number; scrollHeight: number; clientHeight: number } | null;
} {
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUp = useRef(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => options.estimateSize,
    overscan: options.overscan ?? 6,
    getItemKey: (index) => items[index]?.id ?? index,
    // A chat window is bottom-anchored: the newest message sits at the end,
    // and loading older history prepends at the start while the user is
    // scrolled away from it. `anchorTo: 'end'` is virtual-core's own support
    // for exactly that shape — when a prepend shifts every index, it resolves
    // the scroll offset against the item the user was actually looking at
    // (tracked internally, off its own scroll-offset state) before the new
    // range renders, and it keeps the bottom pinned as estimated row heights
    // settle to their measured ones. A hand-rolled version of this (capture
    // the top item's id, prepend, scroll back to that id's new index) was
    // tried first and was racy: it read the virtualizer's visible range from
    // the DOM's scrollTop at a moment the virtualizer's own scroll listener
    // hadn't yet caught up to, capturing the wrong anchor.
    anchorTo: 'end',
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

  const getScrollMetrics = useCallback(() => {
    const el = scrollElementRef.current;
    if (!el) return null;
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  }, []);

  return {
    scrollRef,
    virtualizer,
    userScrolledUp,
    handleScroll,
    scrollToBottom,
    scrollToId,
    getScrollMetrics,
  };
}
