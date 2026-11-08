const CACHE_NAME = "usul-web-v4";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.webmanifest",
  "/assets/site.css",
  "/assets/site.js",
  "/assets/usul-logo.png",
  "/assets/usul-background.png",
  "/assets/kudum-pair.png",
  "/assets/bendir.png",
  "/assets/wood-metronome.png",
  "/assets/audio/kudum_dum.wav",
  "/assets/audio/kudum_tek.wav",
  "/assets/audio/bendir_dum.wav",
  "/assets/audio/bendir_tek.wav",
  "/assets/audio/mechanical_tick.wav",
  "/assets/audio/mechanical_tock.wav"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/gizlilik.html" || url.pathname.startsWith("/veri/")) return;
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached || new Response("Çevrimdışı", { status: 503, statusText: "Offline" }));
    return cached || network;
  }));
});
