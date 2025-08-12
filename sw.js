// sw.js
// A safer, offline-friendly service worker with:
// - versioned cache
// - install/activate lifecycle
// - same-origin filtering
// - network-first for documents (with fallback)
// - cache-first for static assets (with fallback)
// - graceful error handling (no unhandled rejections)

const CACHE_NAME = 'note-pwa-v3';
const ASSETS = [
  './',               
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches + take control of clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Helper: only handle same-origin (ignore CDNs, Firebase, fonts, etc.)
const isSameOrigin = (url) => new URL(url).origin === self.location.origin;

// Fetch: route by request type
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin to avoid “Failed to fetch” when third-party requests fail
  if (!isSameOrigin(request.url)) return;

  // For navigations / HTML documents: network-first with cache fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Update cache in background
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) || caches.match('./index.html'))
    );
    return;
  }

  // For static assets: cache-first, then net
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html')); // last-resort fallback
    })
  );
});