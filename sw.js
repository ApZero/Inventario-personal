// sw.js — cachea los archivos de la app para que funcione sin conexión.
// IMPORTANTE: subí el número de versión (CACHE_NAME) cada vez que edites
// la app, o el teléfono va a seguir usando la versión vieja en caché.

const CACHE_NAME = 'inventario-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/seed.js',
  './js/db.js',
  './js/excel.js',
  './js/charts.js',
  './js/forms.js',
  './js/ui.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Las librerías de CDN (SheetJS, Chart.js): siempre intenta la red primero,
  // y si no hay conexión, no rompe la app (solo fallarán exportar/gráficos).
  if (event.request.url.startsWith('http') && !event.request.url.includes(self.location.origin)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
