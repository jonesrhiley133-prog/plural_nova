import { useCallback, useRef, useState } from 'react';
import type { AppSettings } from '@pluralnova/shared';
import { useAuth } from './auth.js';
import { useToast } from './toast.js';

/**
 * Settings that answer immediately.
 *
 * A switch bound straight to the saved settings cannot move until the server
 * has replied. On a slow connection that reads as a broken control, and with no
 * connection at all the control simply never moves — which is what "my
 * notification settings do not save" looks like from the outside, whatever the
 * request actually did.
 *
 * So the change is applied on screen first, sent, and put back with an
 * explanation only if the server refuses it. Reading `settings` from here also
 * means two quick taps compose instead of the second overwriting the first with
 * a stale copy.
 */
export function useOptimisticSettings(): {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
} {
  const { settings: saved, saveSettings } = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState<Partial<AppSettings> | null>(null);
  const inFlight = useRef(0);

  const update = useCallback(
    (patch: Partial<AppSettings>) => {
      setPending((current) => ({ ...current, ...patch }));
      inFlight.current += 1;

      void saveSettings(patch)
        .catch((cause: unknown) => {
          toast.fromError(cause, 'That setting was not saved');
        })
        .finally(() => {
          inFlight.current -= 1;
          // Only the last reply clears the optimistic copy: while another save
          // is still on its way, its value has to stay on screen.
          if (inFlight.current === 0) setPending(null);
        });
    },
    [saveSettings, toast],
  );

  return { settings: pending ? { ...saved, ...pending } : saved, update };
}
