const CACHE_NAME = 'srt2-portal-v2';
const SHELL_FILES = [
  './', 
  './index.html', 
  './style.css', 
  './shared.js', 
  './landing.js', 
  './dashboard.js', 
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(SHELL_FILES))
      // .catch() dihilangkan agar jika ada file 404, Anda bisa melihat errornya di tab Console/Application
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

self.addEventListener('fetch', (e) => {
  // 1. Lewati cache untuk semua request POST (wajib untuk form ke GAS)
  if (e.request.method !== 'GET') {
    return; // Biarkan browser yang mengurus langsung melalui jaringan
  }

  // 2. Tangkap URL script.google.com DAN domain redirect-nya (googleusercontent.com)
  if (e.request.url.includes('script.google.com') || e.request.url.includes('googleusercontent.com')) {
    e.respondWith(
      fetch(e.request).catch(() => 
        // Tambahkan header application/json agar frontend tidak error saat parsing
        new Response(JSON.stringify({ ok: false, message: 'Anda sedang offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // 3. Strategi Cache-First untuk file statis (HTML, CSS, JS)
  e.respondWith(
    caches.match(e.request).then((c) => c || fetch(e.request))
  );
});
