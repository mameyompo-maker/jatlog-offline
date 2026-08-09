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

importScripts('./config.js');

var CFG = self.JATLOG_CONFIG || {};
var CACHE = 'jatlog-offline-v4';
var CACHE_FONTES = 'jatlog-fontes-v1';

var FICHEIROS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './i18n.js',
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
var NOMES = ['', 'index.html', 'app.js', 'config.js', 'i18n.js', 'styles.css',
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

// ------------------------------------------------ envio em segundo plano
/* Background Sync: o Android acorda o Service Worker quando a rede volta e
 * envia a fila mesmo com a aplicação fechada. No iOS isto não existe, por isso
 * lá continua a valer a regra de abrir a aplicação uma vez onde há rede.
 *
 * O código de activação não pode vir do localStorage (o Service Worker não lhe
 * chega), por isso a aplicação deixa-o na store 'config' do IndexedDB.
 *
 * Não faz mal que a página e o Service Worker enviem ao mesmo tempo: o servidor
 * despreza os UUID que já processou. */

var LOTE_ENVIO = 25;

function abrirBase() {
  return new Promise(function (ok, mau) {
    var p = indexedDB.open('jatlog', 2);
    p.onupgradeneeded = function () {
      var d = p.result;
      if (!d.objectStoreNames.contains('envios')) d.createObjectStore('envios', { keyPath: 'uuid' });
      if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'k' });
    };
    p.onsuccess = function () { ok(p.result); };
    p.onerror = function () { mau(p.error); };
  });
}

function comLoja(d, nome, modo, fn) {
  return new Promise(function (ok, mau) {
    var t = d.transaction(nome, modo);
    var r = fn(t.objectStore(nome));
    t.oncomplete = function () { ok(r ? r.result : null); };
    t.onerror = function () { mau(t.error); };
    t.onabort = function () { mau(t.error); };
  });
}

function lerConfig(d, k) {
  return comLoja(d, 'config', 'readonly', function (s) { return s.get(k); })
    .then(function (r) { return (r && r.v) || ''; });
}

function enviarFilaEmSegundoPlano() {
  if (!CFG.ENDPOINT) return Promise.resolve();
  var base;

  return abrirBase().then(function (d) {
    base = d;
    return Promise.all([
      lerConfig(d, 'token'),
      lerConfig(d, 'adminPw'),
      comLoja(d, 'envios', 'readonly', function (s) { return s.getAll(); })
    ]);
  }).then(function (r) {
    var token = r[0], adminPw = r[1];
    var fila = (r[2] || [])
      .filter(function (e) { return e.estado === 'pendente'; })
      .sort(function (a, b) { return a.criadoEm - b.criadoEm; });
    if (!token || !fila.length) return;

    var lotes = [];
    for (var i = 0; i < fila.length; i += LOTE_ENVIO) lotes.push(fila.slice(i, i + LOTE_ENVIO));

    return lotes.reduce(function (cadeia, lote) {
      return cadeia.then(function () { return enviarLoteSW(base, lote, token, adminPw); });
    }, Promise.resolve());
  });
}

function enviarLoteSW(base, lote, token, adminPw) {
  var corpo = {
    token: token,
    entries: lote.map(function (e) {
      return {
        uuid: e.uuid, tipo: e.tipo, site: e.site, month: e.month,
        line: e.line, weight: e.weight, unit: e.unit,
        recorder: e.recorder, tsLocal: e.tsLocal, alvo: e.alvo || null
      };
    })
  };
  if (adminPw) corpo.adminPassword = adminPw;

  return fetch(CFG.ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo),
    redirect: 'follow'
  }).then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro || 'Erro do servidor');
      var porUuid = {};
      (resp.resultados || []).forEach(function (x) { porUuid[x.uuid] = x; });

      return Promise.all(lote.map(function (e) {
        var x = porUuid[e.uuid];
        if (!x) return Promise.resolve();
        if (x.ok) {
          return comLoja(base, 'envios', 'readwrite', function (s) { return s.delete(e.uuid); });
        }
        e.estado = 'erro';
        e.erro = x.erro || 'Erro desconhecido';
        return comLoja(base, 'envios', 'readwrite', function (s) { return s.put(e); });
      }));
    });
}

self.addEventListener('sync', function (e) {
  if (e.tag === 'jatlog-enviar') e.waitUntil(enviarFilaEmSegundoPlano());
});

// atalho para a própria página (e para os testes) mandarem tentar já
self.addEventListener('message', function (e) {
  if (e.data && e.data.tipo === 'enviar-agora') e.waitUntil(enviarFilaEmSegundoPlano());
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
