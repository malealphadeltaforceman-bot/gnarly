// Offline cache for the prototype. Bump VERSION whenever you change files.
const VERSION = 'gnarly-v0.2.0';
const FILES = ['./', './index.html', './lab.html', './presenter.html', './assets/img/hero.png', './assets/models/gnarly_walker.usdz', './assets/models/gnarly_walker_static.usdz', './css/app.css', './js/main.js', './js/sim.js', './js/walker.js', './data/lessons.json', './data/config.json', './assets/parts.json',
  './assets/models/gnarly_walker.glb', './vendor/three/three.module.js', './vendor/three/three.core.js',
  './vendor/three/addons/controls/OrbitControls.js', './vendor/three/addons/loaders/GLTFLoader.js', './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/utils/SkeletonUtils.js', './vendor/model-viewer/model-viewer.min.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// network first (so edits show up while developing), cache fallback when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
