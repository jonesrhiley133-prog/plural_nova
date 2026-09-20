import { useEffect, useSyncExternalStore } from 'react';
import { syncEngine } from './sync.js';

/**
 * The page's half of the service worker relationship.
 *
 * Two things matter here. First, an update never takes effect on its own: a
 * worker that called `skipWaiting()` would reload the page underneath whoever
 * was mid-entry, so the new build waits until someone chooses it. Second, the
 * worker can only wake the app — it cannot act for it — so its messages are
 * turned into ordinary app behaviour on this side.
 */

const OUTBOX_SYNC_TAG = 'pluralnova-outbox';

let waiting: ServiceWorker | null = null;
let updateAccepted = false;
let registration: ServiceWorkerRegistration | null = null;
const updateListeners = new Set<() => void>();

function announceUpdate(worker: ServiceWorker | null): void {
  waiting = worker;
  for (const listener of updateListeners) listener();
}

function watchInstalling(incoming: ServiceWorkerRegistration): void {
  const installing = incoming.installing;
  if (!installing) return;
  installing.addEventListener('statechange', () => {
    // An install that completes while a worker is already in control is an
    // update; the very first install is just the app becoming offline-capable.
    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
      announceUpdate(installing);
    }
  });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((incoming) => {
        registration = incoming;
        if (incoming.waiting && navigator.serviceWorker.controller) {
          announceUpdate(incoming.waiting);
        }
        watchInstalling(incoming);
        incoming.addEventListener('updatefound', () => watchInstalling(incoming));
      })
      .catch((error: unknown) => {
        // Registration fails on an insecure origin or with workers disabled.
        // PluralNova still runs; it just loses offline launch and push.
        console.info('[pluralnova] service worker unavailable:', error);
      });

    // Going offline is the moment a queued write becomes worth retrying later,
    // so that is when a background sync is asked for.
    window.addEventListener('offline', () => void requestBackgroundSync());
  });

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; to?: string } | null;
    if (data?.type === 'FLUSH_OUTBOX') syncEngine.schedule(0);
    if (data?.type === 'NAVIGATE' && data.to) deepLink(data.to);
  });

  /*
   * The controller also changes the first time a worker installs, because it
   * calls `clients.claim()` — so reloading on every controller change bounces
   * every first-time visitor for no reason, mid-whatever they were doing. Only
   * an update this page asked for is worth a reload.
   */
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateAccepted) return;
    reloading = true;
    window.location.reload();
  });
}

/** Asks the browser to wake the app once it has a connection again. */
async function requestBackgroundSync(): Promise<void> {
  const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
    ?.sync;
  try {
    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // Background Sync is Chromium-only and can be switched off. Everywhere else
    // the outbox is flushed when the app is next opened, which still loses nothing.
  }
}

// ----------------------------------------------------------- update prompting

function subscribeToUpdates(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

export interface AppUpdate {
  ready: boolean;
  apply: () => void;
}

/** True once a newer build is downloaded and waiting for permission to take over. */
export function useAppUpdate(): AppUpdate {
  const ready = useSyncExternalStore(
    subscribeToUpdates,
    () => waiting !== null,
    () => false,
  );

  return {
    ready,
    apply: () => {
      if (!waiting) return;
      // `controllerchange` above does the reload, once the new worker answers.
      updateAccepted = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
  };
}

// ------------------------------------------------------- notification deep links

type DeepLinkListener = (to: string) => void;
const deepLinkListeners = new Set<DeepLinkListener>();
let pendingDeepLink: string | null = null;

function deepLink(to: string): void {
  if (deepLinkListeners.size === 0) {
    // The app is still starting up. Hold the destination rather than dropping
    // it, so a notification tapped from cold still lands in the right place.
    pendingDeepLink = to;
    return;
  }
  for (const listener of deepLinkListeners) listener(to);
}

/** Routes a notification tap that arrived as a message rather than a navigation. */
export function useNotificationDeepLinks(navigate: (to: string) => void): void {
  useEffect(() => {
    deepLinkListeners.add(navigate);
    if (pendingDeepLink) {
      const to = pendingDeepLink;
      pendingDeepLink = null;
      navigate(to);
    }
    return () => {
      deepLinkListeners.delete(navigate);
    };
  }, [navigate]);
}
