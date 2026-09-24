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
 *
 * Every route's code is loaded lazily, so without a precache step a route
 * nobody has opened yet has no cached copy of its own script to run offline.
 * `precache-manifest.json` is written by `tools/build-sw-manifest.mjs` right
 * after `vite build`, listing that build's hashed files by name, so this file
 * never has to.
 */

const VERSION = 'v1';
const SHELL = `pluralnova-shell-${VERSION}`;
const ASSETS = `pluralnova-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_MANIFEST_URL = '/precache-manifest.json';

/**
 * Only files that exist under a stable name belong here. Vite fingerprints the
 * scripts and styles, so those come from the build's own manifest instead of
 * being listed by hand and going stale.
 */
const SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

async function buildAssetUrls() {
  try {
    const response = await fetch(PRECACHE_MANIFEST_URL, { cache: 'reload' });
    if (!response.ok) return [];
    const list = await response.json();
    return Array.isArray(list) ? list.filter((url) => typeof url === 'string') : [];
  } catch {
    // No manifest (e.g. `vite dev`, or a build that predates this file) — the
    // runtime cache in `handleAsset` still covers whatever gets visited.
    return [];
  }
}

/**
 * The same "only a plain, same-origin, non-redirected response is safe to
 * hand back later" check `handleAsset` already relies on below — `cache.add`
 * skips it and stores whatever comes back, and a response that isn't
 * `basic` can read as an ordinary 200 to `fetch` while still being refused
 * by a script/module load, which is exactly what a precached route needs to
 * survive.
 */
async function precacheOne(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok && response.type === 'basic') await cache.put(url, response);
  } catch {
    // Best-effort — handleAsset's runtime cache still covers this on first visit.
  }
}

/**
 * A handful at a time rather than every file at once — this is exactly the
 * slow-connection, weak-device situation the caching is meant to survive, and
 * firing dozens of requests in one burst is the kind of thing that competes
 * with itself for the connection a phone on bad signal can least afford.
 */
async function cacheInBatches(cache, urls, batchSize = 8) {
  for (let start = 0; start < urls.length; start += batchSize) {
    await Promise.all(urls.slice(start, start + batchSize).map((url) => precacheOne(cache, url)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await cacheInBatches(shell, SHELL_URLS);

      const assets = await caches.open(ASSETS);
      await cacheInBatches(assets, await buildAssetUrls());
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
  if (cached) {
    // A Response read back from Cache Storage can carry state a script or
    // module load is pickier about than a plain `fetch` is, even when every
    // visible property — status, type, headers — reads as an ordinary
    // success. Rebuilding a plain Response from the same bytes and headers,
    // rather than handing the cache's own object back untouched, sidesteps
    // whatever that is.
    const body = await cached.clone().arrayBuffer();
    const headers = new Headers(cached.headers);
    // Express's static serving sends `.js` as the older `application/javascript`.
    // Every browser accepts that for a classic <script>, but a module load is
    // held to the current, narrower "JavaScript MIME type" list — where
    // `text/javascript` is the one IANA and the HTML spec both settled on —
    // and this is the one property of the response the last fix never tried
    // changing.
    if (/\.(?:m?js)$/.test(new URL(request.url).pathname)) {
      headers.set('content-type', 'text/javascript; charset=utf-8');
    }
    return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
  }
  return (await network) || Response.error();
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
