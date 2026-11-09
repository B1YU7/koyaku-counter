// 初回のオンライン読み込み後、PWAをオフラインでも動かす。
// バージョン更新時はCACHE_NAMEを更新する。
const CACHE_NAME = "slot-counter-offline-v23";
const CACHE_PREFIX = "slot-counter-offline-";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./theme.css",
  "./script.js",
  "./theme.js",
  "./manifest.json",
  "./icons/favicon.ico",
  "./icons/favicon-64.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // このPWAの配置ディレクトリ内の同一オリジンのリソースだけを処理する。
  if (url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match(new URL("./index.html", self.registration.scope).href)) ||
            Response.error();
        }
        return Response.error();
      })
  );
});
