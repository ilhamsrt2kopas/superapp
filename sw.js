const CACHE_NAME = 'srt2-portal-v2';
const SHELL_FILES = ['./', './index.html', './style.css', './shared.js', './landing.js', './dashboard.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.url.indexOf('https://script.google.com') !== -1) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ ok: false, message: 'Offline' }))));
    return;
  }
  e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request)));
});
