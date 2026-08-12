const CACHE_VERSION = "v1";
const PRECACHE = `pk-precache-${CACHE_VERSION}`;
const RUNTIME = `pk-runtime-${CACHE_VERSION}`;
const CURRENT_CACHES = [PRECACHE, RUNTIME];

const PRECACHE_URLS = [
  "/offline",
  "/brand/wordmark.svg",
  "/brand/icon.svg",
  "/icons/pwa-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isRuntimeCacheable(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline")),
    );
    return;
  }

  if (isRuntimeCacheable(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, clone));
          return response;
        });
      }),
    );
  }
});
