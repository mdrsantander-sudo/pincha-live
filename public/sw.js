/* Pincha Live - service worker
   Red primero, cache como respaldo. Así una versión nueva se ve enseguida
   y sin señal igual aparece lo último que se descargó. */
const CACHE = 'pincha-v2';
const CASCARA = [
  './', './index.html', './estilos.css', './app.js', './manifest.json',
  './iconos/icono-180.png', './iconos/icono-192.png', './iconos/icono-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCARA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // escudos de ESPN: directo a la red

  e.respondWith(
    fetch(req)
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
