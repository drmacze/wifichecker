const CACHE = 'wifi-checker-pro-v27-deterministic-video-profiles';
const APP_SHELL = ['./', './index.html', './styles.css', './motion.css', './quality.css', './meter-flow.css', './intelligence.css', './advanced-diagnostics.css', './result-audit.css', './video-test.css', './video-modern.css', './video-resolution-proof.css', './workspace.css', './app.js', './motion.js', './engine-v6.js', './quality.js', './meter-flow.js', './meter-performance.js', './engine-v6-ui.js', './intelligence.js', './accuracy.js', './advanced-diagnostics.js', './result-audit.js', './video-test.js', './video-connection-lab.js', './workspace.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
