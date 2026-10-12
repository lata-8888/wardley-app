'use strict';
const CACHE = 'wardley-v15';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'i18n.js',
  'config.js',
  'manifest.webmanifest',
  'icons/favicon-48.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/logo.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/barlow-condensed-latin-500-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/barlow-latin-400-normal.woff2',
  'fonts/barlow-latin-500-normal.woff2',
  'fonts/barlow-latin-600-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // config.js enthält die Umgebung (lokal oder Supabase): immer zuerst vom Netz, damit nie eine alte Konfiguration hängen bleibt
  if (new URL(req.url).pathname.endsWith('/config.js')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })
        .catch(err => { console.error('config fetch failed', err); return caches.match(req); })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).catch(err => {
      console.error('fetch failed', err);
      return caches.match('index.html');
    }))
  );
});
