const CACHE = 'srkp-portal-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for API calls (script.google.com), cache-first for app shell.
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.indexOf('script.google.com') !== -1) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ ok: false, message: 'Tidak ada koneksi internet.' }), { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
