// Service worker: rende l'app utilizzabile offline.
// Aumenta VERSIONE ad ogni rilascio per aggiornare la cache.
const VERSIONE = 'ore-commesse-v3';
const FILE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'sync.js',
  'firebase-config.js',
  'vendor/firebase.js',
  'manifest.webmanifest',
  'vendor/xlsx.mini.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSIONE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Prima la rete (così gli aggiornamenti arrivano subito), poi la cache se offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copia = res.clone();
        caches.open(VERSIONE).then(c => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// Pulsanti della notifica «Stai ancora lavorando?».
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const azione = e.action || '';
  e.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = finestre.find(c => new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (app) {
      await app.focus().catch(() => {});
      if (azione) app.postMessage({ tipo: 'promemoria', azione });
    } else {
      await self.clients.openWindow('./' + (azione ? '?promemoria=' + azione : ''));
    }
  })());
});
