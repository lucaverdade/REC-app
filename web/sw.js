// Cache só do app (HTML/CSS/JS/ícones). Dados de /api nunca ficam em cache.
const CACHE = 'rec-shell-v63';
const SHELL = ['/', '/index.html', '/app.css', '/app.js', '/charts.js', '/trends.js', '/train.js', '/race.js', '/review.js', '/share.js', '/activity.js', '/zones.js', '/fit.js', '/manifest.webmanifest', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    // no-cache: sempre confere com o servidor se o arquivo mudou (evita JS antigo depois de um deploy)
    fetch(new Request(e.request, { cache: 'no-cache' })).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});
