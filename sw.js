/* Feirm Supplies service worker: fast repeat visits and offline support for the home-screen app.
   Bump VERSION on every deploy that changes catalog.js, catalog-details.js or content.js. */
const VERSION = 'feirm-v1';
const SHELL = `${VERSION}-shell`, DATA = `${VERSION}-data`, MEDIA = `${VERSION}-media`;
const PRECACHE = ['./', './index.html', './catalog.js', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];
const MEDIA_MAX = 150; // product photos and fonts kept for offline browsing

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

/* the page itself: network first so a new deploy shows at once; the cached copy when offline */
async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) c.put('./index.html', res.clone());
    return res;
  } catch {
    return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
  }
}

/* data and icons: answer from cache straight away, refresh in the background */
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

/* fonts and product photos: cache first, capped */
async function cacheFirst(req) {
  const c = await caches.open(MEDIA), hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(MEDIA, MEDIA_MAX); }
    return res;
  } catch { return Response.error(); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (req.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html')) return e.respondWith(networkFirst(req));
    if (/\.(js|webmanifest|png|svg)$/.test(u.pathname) && !u.pathname.endsWith('/sw.js')) return e.respondWith(staleWhileRevalidate(req, DATA));
    return;
  }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|fls-[\w-]+\.laravel\.cloud|feirmsupplies\.com)$/.test(u.hostname) && req.destination !== 'document')
    return e.respondWith(cacheFirst(req));
});
