// Service worker do painel Forno Di Roma — rede primeiro, cache como reserva.
// Offline: mostra a última versão baixada (a senha continua sendo pedida,
// a descriptografia é toda no navegador).
const CACHE = 'fdr-v2';
const CRITICO = './';
const PRECACHE = ['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(CRITICO).then(() => Promise.allSettled(PRECACHE.map(u => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // só GET do próprio site — chamadas à API do GitHub (lançamentos) passam direto
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // navegação revalida no servidor (fura o max-age=600 do Pages; 304 quando nada mudou)
  const req = e.request.mode === 'navigate'
    ? new Request(e.request, {cache: 'no-cache'}) : e.request;
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok && !r.redirected) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      }
      return r;
    }).catch(() =>
      caches.match(e.request, {ignoreSearch: e.request.mode === 'navigate'})
        .then(m => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))
    )
  );
});
