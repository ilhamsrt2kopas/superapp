const CACHE_NAME = 'portal-sr-v1';
const SHELL_FILES = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first untuk panggilan API (Apps Script), cache-first untuk shell app.
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.indexOf('script.google.com') !== -1) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ ok: false, message: 'Offline' }))));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
