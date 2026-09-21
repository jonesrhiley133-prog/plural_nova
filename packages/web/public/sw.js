/* eslint-env serviceworker */
/**
 * PluralNova's service worker.
 *
 * An installed PluralNova has to behave like an application and not a bookmark:
 * it opens without a network, it receives notifications while it is closed, and
 * tapping one lands on the thing the notification was about. That is what this
 * file is for. Three rules cover every request:
 *
 *   navigations  → network first, falling back to the cached shell, then to the
 *                  offline page. The app itself reads from IndexedDB, so a
 *                  cached shell is a working app rather than a holding screen.
 *   /api/*       → network only. A stale answer here would be worse than none;
 *                  the client's outbox is what makes writes survive being
 *                  offline.
 *   everything   → cache first, revalidated in the background, so a second
 *   else           launch paints immediately even on a slow connection.
 */

const VERSION = 'v1';
const SHELL = `pluralnova-shell-${VERSION}`;
const ASSETS = `pluralnova-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/**
 * Only files that exist under a stable name belong here. Vite fingerprints the
 * scripts and styles, so those are picked up by the runtime cache on first use
 * instead of being listed and going stale.
 */
const SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Added one at a time: a single missing file must not fail the install and
      // leave the app with no worker at all.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('pluralnova-') && !keep.has(name)).map((name) => caches.delete(name)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * The page asks for the update rather than the worker forcing it: reloading
 * mid-sentence would lose whatever someone was writing. `main.tsx` prompts, and
 * only then does the waiting worker take over.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ------------------------------------------------------------------- fetching

function isAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|svg|webp|jpg|jpeg|ico)$/.test(url.pathname)
  );
}

async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    // Keep the shell fresh so the next offline launch is the current build.
    const cache = await caches.open(SHELL);
    cache.put('/', response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match('/')) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function handleAsset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  // A fingerprinted file never changes under its name, so the cached copy is
  // always correct to serve; the refetch is only for files that can change.
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (isAsset(url)) event.respondWith(handleAsset(request));
});

// --------------------------------------------------------------- notifications

/**
 * Push payloads are built by the server's notification service, which has
 * already decided the account allows this category and has left private content
 * out. The worker's job is only to render it.
 */
self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { title: 'PluralNova', body: event.data ? event.data.text() : '' };
    }
  })();

  const title = payload.title || 'PluralNova';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    tag: payload.tag || payload.category || 'pluralnova',
    // Replacing a same-tag notification keeps a busy day from filling the
    // shade, but a replacement should still be noticed.
    renotify: Boolean(payload.tag),
    timestamp: Date.now(),
    data: { link: payload.link || '/notifications', category: payload.category || 'system' },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof payload.badgeCount === 'number' && 'setAppBadge' in self.navigator) {
        try {
          if (payload.badgeCount > 0) await self.navigator.setAppBadge(payload.badgeCount);
          else await self.navigator.clearAppBadge();
        } catch {
          // Badging is a nicety and is not worth failing the notification over.
        }
      }
    })(),
  );
});

/**
 * Tapping a notification lands on what it was about. An already-open PluralNova
 * is reused and navigated rather than opened a second time, which matches the
 * manifest's `navigate-existing` launch handler.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(link, self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          await client.navigate(target.href).catch(() => undefined);
        } else {
          client.postMessage({ type: 'NAVIGATE', to: `${target.pathname}${target.search}` });
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * Background Sync wakes the open pages rather than replaying the outbox here:
 * the session token lives in the page's storage, which a worker cannot read, so
 * a worker-side replay would have to hold a second copy of someone's
 * credentials. Waking a backgrounded tab covers the common case honestly, and
 * anything still queued is sent the moment the app is opened.
 */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'pluralnova-outbox') return;
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) client.postMessage({ type: 'FLUSH_OUTBOX' });
    })(),
  );
});
