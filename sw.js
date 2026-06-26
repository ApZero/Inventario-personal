// Service worker de Vestidor — estrategia stale-while-revalidate.
// IMPORTANTE: subí CACHE_VERSION cada vez que publiques cambios,
// si no el navegador puede seguir sirviendo archivos viejos desde caché.
const CACHE_VERSION = "v2";
const CACHE_NAME = `vestidor-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./seed-data.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // stale-while-revalidate: devolvé lo cacheado de inmediato si existe,
      // y actualizá la caché en segundo plano para la próxima vez.
      if (cached) {
        networkFetch; // se ejecuta en background, no se espera
        return cached;
      }
      const fresh = await networkFetch;
      return fresh || cached || Response.error();
    })
  );
});
