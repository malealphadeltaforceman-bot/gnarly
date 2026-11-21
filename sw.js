// gnARly service worker: network-first, offline fallback. Bump VERSION on every release.
// AR/3D model files (.usdz, .glb) are never intercepted, so Quick Look and Scene Viewer
// always fetch them straight from the server.
const VERSION = 'gnarly-v0.4.0';
const FILES = ['./', './index.html', './lab.html', './presenter.html', './app.css', './main.js', './sim.js', './walker.js',
  './lessons.json', './lesson-1.html', './lesson-2.html', './lesson-3.html', './lesson-4.html', './lesson-5.html', './learn.css', './learn.js', './config.json', './parts.json', './three.module.js', './three.core.js', './OrbitControls.js',
  './model-viewer.min.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './hero.png'];
self.addEventListener('install', (e) => {
  // tolerant: one missing file must not break install
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || /\.(usdz|glb|reality)$/i.test(url.pathname)) return; // let the browser handle it
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req)));
});
