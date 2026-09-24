import { useEffect, useRef, useState } from 'react';
import { dayKey } from '@pluralnova/shared';
import { useAuth, useSystemMode } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { CheckIn } from './CheckIn.js';

const STORAGE_KEY = 'pluralnova.frontingRitual.lastShown';

/**
 * The startup ritual.
 *
 * Once a day, the first thing the app asks is the thing it exists to answer:
 * who is out — and, from there, how it feels and where that shows up in the
 * body. Replaces the old Who's There nav page; ending, switching and browsing
 * the roster live on in the dashboard's current-front card, the fronting
 * tracker, and Quick Front. The actual check-in flow is CheckIn; this is only
 * the once-a-day decision to open it.
 *
 * The decision to show is made exactly once per mount, gated on `loadedAt`
 * rather than `loading`: a freshly mounted collection reports `loading: false`
 * with zero items for one tick before its own fetch has even started, which
 * is indistinguishable from "really has no members" if read too early.
 * `loadedAt` stays 0 until the store has a real answer — from the offline
 * cache or the network — so waiting for it to become non-zero is exact,
 * instead of guessing how long a fetch might take.
 */
export function FrontingRitual(): JSX.Element | null {
  const { user } = useAuth();
  const isSystem = useSystemMode();
  const members = useCollection('members');
  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || user?.isGuest || members.loadedAt === 0) return;
    decided.current = true;
    if (!isSystem || members.items.length === 0) return;
    const today = dayKey(new Date());
    let shownToday = false;
    try {
      shownToday = localStorage.getItem(STORAGE_KEY) === today;
      if (!shownToday) localStorage.setItem(STORAGE_KEY, today);
    } catch {
      // Private browsing or blocked storage: the ritual just shows every time.
    }
    if (!shownToday) setOpen(true);
  }, [members.loadedAt, members.items.length, user?.isGuest, isSystem]);

  return <CheckIn open={open} onClose={() => setOpen(false)} />;
}
