// Banana Arc zero-maintenance Service Worker
// Strategy:
// - HTML navigations & manifest: Network-First (never traps installed WebAPKs on stale versions)
// - Vite content-hashed /assets/* & /icons/*: Cache-First with background cache fill
// - Cross-origin traffic (e.g. PeerJS WebRTC signaling): untouched pass-through

const CACHE_NAME = 'banana-arc-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['./', './manifest.webmanifest', './icons/icon-192.png']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isHtmlNav =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('/manifest.webmanifest');

  if (isHtmlNav) {
    // Network-First so new GitHub Pages deploys take effect automatically on next open
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./')),
        ),
    );
    return;
  }

  // Immutable hashed bundles (/assets/*) and icons: Cache-First with network fallback
  const isImmutableAsset =
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('/favicon.svg');

  if (isImmutableAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
