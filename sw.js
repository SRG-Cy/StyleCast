// Lets StyleCast open and tag photos without a connection after the first visit.
//
// - The app's own files: network first so updates show up straight away, cache when offline.
// - The AI library on cdn.jsdelivr.net: cache first, since the URL pins an exact version.
// - The model files from Hugging Face are cached by Transformers.js itself.
// - The weather and shopping searches are never cached here.

const APP = "stylecast-app-v3";
const LIBS = "stylecast-libs-v1";
const SHELL = [
  "./", "index.html", "style.css", "manifest.webmanifest",
  "js/app.js", "js/store.js", "js/tagger.js", "js/weather.js", "js/outfit.js",
  "js/chat.js", "js/shop.js", "js/gemma.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("stylecast-") && ![APP, LIBS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? caches.match("index.html"))),
    );
  } else if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(LIBS).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
