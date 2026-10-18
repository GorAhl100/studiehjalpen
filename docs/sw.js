// Gör att appen fungerar utan internet. Öka VERSION när filerna ändras.
const VERSION = "studie-v6";
const FILER = ["./", "./index.html", "./app.js", "./ljud.js", "./style.css", "./manifest.webmanifest", "./ikon.svg", "./ikon-180.png", "./ikon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILER)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nycklar) => Promise.all(nycklar.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Först från cachen (snabbt och offline), uppdatera cachen i bakgrunden.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const sparad = await cache.match(e.request, { ignoreSearch: true });
      const hämtning = fetch(e.request)
        .then((svar) => { if (svar.ok) cache.put(e.request, svar.clone()); return svar; })
        .catch(() => sparad);
      return sparad || hämtning;
    })
  );
});
