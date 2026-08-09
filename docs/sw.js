/* Service Worker do JatLog offline.
 *
 * Duas regras apenas:
 *   1. Os ficheiros da própria aplicação são servidos da cache (é isto que
 *      permite abrir sem rede). Actualizam-se em segundo plano.
 *   2. Tudo o resto — em especial o Apps Script — vai sempre à rede.
 *      NUNCA cachear as respostas da API: já aconteceu no India Rec e os
 *      dados deixaram de actualizar.
 *
 * As fontes do Google são cacheadas à parte para o desenho não mudar quando
 * o telemóvel fica sem rede.
 */

var CACHE = 'jatlog-offline-v2';
var CACHE_FONTES = 'jatlog-fontes-v1';

var FICHEIROS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

var HOSTS_FONTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* Só estes caminhos é que podem sair da cache. Tudo o resto vai à rede, mesmo
 * sendo do mesmo domínio: se a API for servida da mesma origem (acontece no
 * ambiente de teste), cachear as respostas congela os dados no ecrã. */
var RAIZ = new URL('./', self.location).pathname;
var NOMES = ['', 'index.html', 'app.js', 'config.js', 'styles.css',
             'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
             'icon-512-maskable.png'];

function ehFicheiroDaApp(url) {
  if (url.search) return false;
  if (url.pathname.indexOf(RAIZ) !== 0) return false;
  return NOMES.indexOf(url.pathname.slice(RAIZ.length)) >= 0;
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FICHEIROS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) {
        return n !== CACHE && n !== CACHE_FONTES;
      }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // fontes: cache primeiro, para o aspecto se manter sem rede
  if (HOSTS_FONTES.indexOf(url.hostname) >= 0) {
    e.respondWith(
      caches.match(req).then(function (guardado) {
        return guardado || fetch(req).then(function (res) {
          var copia = res.clone();
          caches.open(CACHE_FONTES).then(function (c) { c.put(req, copia); });
          return res;
        }).catch(function () { return guardado; });
      })
    );
    return;
  }

  // a API (e tudo o que não seja ficheiro da aplicação) vai sempre à rede
  if (url.origin !== self.location.origin || !ehFicheiroDaApp(url)) return;

  // ficheiros da aplicação: cache primeiro + actualização silenciosa
  e.respondWith(
    caches.match(req).then(function (guardado) {
      var daRede = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return res;
      }).catch(function () { return guardado; });
      return guardado || daRede;
    })
  );
});
