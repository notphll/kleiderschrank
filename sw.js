// Offline-Cache: holt bei Verbindung immer die aktuelle Version, offline aus dem Cache.
const CACHE = 'kleiderschrank-v24';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './db.js', './fit.js', './backup.js', './pflege.js', './kalender.js', './view3d.js', './vendor/three.module.min.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst (damit Updates sofort ankommen), Cache nur als Offline-Rückfall.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Seitenaufrufe über die Adresse holen: Mit dem Original-Request umgeht der Browser den Cache nicht
  // zuverlässig, und nach einem Update käme beim ersten Laden noch die alte index.html.
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    net
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
