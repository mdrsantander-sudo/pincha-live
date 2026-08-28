/* Pincha Live - service worker
   Cascarón (HTML/CSS/JS/íconos): cache primero, se sirve al instante y offline.
   datos.json: red primero con copia en cache, para que sin señal aparezca el último dato bueno. */
const CACHE = 'pincha-v1';
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
  const url = new URL(req.url);

  if (url.pathname.endsWith('datos.json') || url.pathname.endsWith('datos.demo.json')) {
    e.respondWith(
      fetch(req).then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  if (url.origin !== location.origin) return; // escudos de ESPN: directo a la red

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
      return r;
    }))
  );
});
