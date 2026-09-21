import { useEffect, useState } from 'react';
import { api } from './api.js';
import { realtime } from './realtime.js';
import { setAppBadge } from './push.js';
import { getToken } from './api.js';

/**
 * Unread counts.
 *
 * Fetched once, then kept current by realtime notices rather than polling. The
 * total is mirrored onto the installed app's icon where the platform supports
 * it, and clears as soon as the content is read.
 */

export interface Badges {
  notifications: number;
  messages: number;
  friendRequests: number;
  flux: number;
  total: number;
}

const EMPTY: Badges = { notifications: 0, messages: 0, friendRequests: 0, flux: 0, total: 0 };

let current: Badges = EMPTY;
const listeners = new Set<(badges: Badges) => void>();
let inFlight: Promise<void> | null = null;

export async function refreshBadges(): Promise<Badges> {
  if (!getToken()) return EMPTY;
  if (inFlight) {
    await inFlight;
    return current;
  }

  inFlight = api
    .get<Badges>('/api/notifications/badges')
    .then((badges) => {
      current = badges;
      void setAppBadge(badges.total);
      for (const listener of listeners) listener(badges);
    })
    .catch(() => {
      // A failed count is not worth interrupting anyone over; the last known
      // value stays on screen.
    })
    .finally(() => {
      inFlight = null;
    });

  await inFlight;
  return current;
}

export function useBadges(): Badges {
  const [badges, setBadges] = useState(current);

  useEffect(() => {
    listeners.add(setBadges);
    void refreshBadges();

    const unsubscribe = realtime.on((event) => {
      if (
        event.type === 'notification.new' ||
        event.type === 'message.new' ||
        event.type === 'friend.request' ||
        event.type === 'flux.activity'
      ) {
        void refreshBadges();
      }
    });

    return () => {
      listeners.delete(setBadges);
      unsubscribe();
    };
  }, []);

  return badges;
}

/** Called after something is read, so the badge clears without a round trip. */
export function decrementBadge(key: keyof Omit<Badges, 'total'>, by: number): void {
  current = {
    ...current,
    [key]: Math.max(0, current[key] - by),
    total: Math.max(0, current.total - by),
  };
  void setAppBadge(current.total);
  for (const listener of listeners) listener(current);
}
