/* Service Worker do JatLog (entrada comum + os dois módulos).
 *
 * Duas regras apenas:
 *   1. Os ficheiros da própria aplicação são servidos da cache (é isto que
 *      permite abrir sem rede). Actualizam-se em segundo plano.
 *   2. Tudo o resto — em especial os dois Apps Script — vai sempre à rede.
 *      NUNCA cachear as respostas da API: já aconteceu no India Rec e os
 *      dados deixaram de actualizar.
 *
 * As fontes do Google são cacheadas à parte para o desenho não mudar quando
 * o telemóvel fica sem rede.
 *
 * IMPORTANTE: subir CACHE sempre que se altera qualquer ficheiro em docs/,
 * caso contrário os telemóveis continuam a usar a versão antiga.
 */

importScripts('./config.js');

var CFG_COLHEITA = self.JATLOG_CONFIG || {};
var CFG_INDIA = self.INDIAREC_CONFIG || {};

var CACHE = 'jatlog-v10';
var CACHE_FONTES = 'jatlog-fontes-v1';

var FICHEIROS = [
  './',
  './index.html',
  './shell.js',
  './shell_i18n.js',
  './config.js',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',

  './colheita/',
  './colheita/index.html',
  './colheita/app.js',
  './colheita/i18n.js',

  './india/',
  './india/index.html',
  './india/app.js',
  './india/i18n.js',
  './india/styles.css',
  './india/plants.json'
];

var HOSTS_FONTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* Só estes caminhos é que podem sair da cache. Tudo o resto vai à rede, mesmo
 * sendo do mesmo domínio: se a API for servida da mesma origem (acontece no
 * ambiente de teste), cachear as respostas congela os dados no ecrã. */
var RAIZ = new URL('./', self.location).pathname;
var NOMES = FICHEIROS.map(function (f) { return f.replace(/^\.\//, ''); });

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
 * Há duas filas, uma por módulo, em duas bases de dados diferentes — cada uma
 * fala com o seu Apps Script e o formato dos registos não é o mesmo.
 *
 * O código de activação não pode vir do localStorage (o Service Worker não lhe
 * chega), por isso a entrada comum deixa-o na store 'config' da base 'jatlog'.
 * Serve as duas filas: o nome da base é histórico, não quer dizer que só valha
 * para a colheita.
 *
 * Não faz mal que a página e o Service Worker enviem ao mesmo tempo: os
 * servidores desprezam os UUID que já processaram. */

var LOTE_ENVIO = 25;

function abrirBase(nome, versao, criar) {
  return new Promise(function (ok, mau) {
    var p = indexedDB.open(nome, versao);
    p.onupgradeneeded = function () { criar(p.result); };
    p.onsuccess = function () { ok(p.result); };
    p.onerror = function () { mau(p.error); };
  });
}

function baseColheita() {
  return abrirBase('jatlog', 2, function (d) {
    if (!d.objectStoreNames.contains('envios')) d.createObjectStore('envios', { keyPath: 'uuid' });
    if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'k' });
  });
}

function baseIndia() {
  return abrirBase('indiarec', 1, function (d) {
    if (!d.objectStoreNames.contains('envios')) {
      var s = d.createObjectStore('envios', { keyPath: 'uuid' });
      s.createIndex('estado', 'estado');
    }
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

/** Código de activação e senha do administrador, guardados pela entrada comum. */
function credenciais() {
  return baseColheita().then(function (d) {
    return Promise.all([lerConfig(d, 'token'), lerConfig(d, 'adminPw')]);
  });
}

/* Com 100 registos à espera, o telemóvel fica um minuto a dizer "A enviar…"
 * sem mostrar se está a andar. Cada lote avisa as páginas abertas, que põem a
 * conta na barra. A página da colheita não escuta estas mensagens e ignora-as. */
function avisarPaginas(dados) {
  return self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage(dados); });
  }).catch(function () {});
}

function porLotes(fila, fn) {
  var lotes = [];
  for (var i = 0; i < fila.length; i += LOTE_ENVIO) lotes.push(fila.slice(i, i + LOTE_ENVIO));
  return lotes.reduce(function (cadeia, lote) {
    return cadeia.then(function () { return fn(lote); });
  }, Promise.resolve());
}

/**
 * Desiste da tentativa, dizendo porquê às páginas abertas e REJEITANDO.
 *
 * ⚠ A rejeição não é um detalhe. O Android dá o evento de sincronização por
 * cumprido assim que a promessa resolve e deita o registo fora; a fila fica
 * então à espera de alguém abrir a aplicação — exactamente o que não queremos.
 * Até 2026-08-14 isto resolvia em silêncio quando faltava o código de
 * activação, e uma tentativa dessas gastava a única oportunidade de reenvio.
 */
function desistir(motivo, enviados, total) {
  return avisarPaginas({
    tipo: 'fila', fim: true, enviados: enviados, total: total, erro: motivo
  }).then(function () { throw new Error(motivo); });
}

function pendentesDe(base) {
  return comLoja(base, 'envios', 'readonly', function (s) { return s.getAll(); })
    .then(function (l) {
      return (l || [])
        .filter(function (e) { return e.estado === 'pendente'; })
        .sort(function (a, b) { return a.criadoEm - b.criadoEm; });
    });
}

function postar(endpoint, corpo) {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita o preflight CORS
    body: JSON.stringify(corpo),
    redirect: 'follow'
  }).then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro || 'Erro do servidor');
      var porUuid = {};
      (resp.resultados || []).forEach(function (x) { porUuid[x.uuid] = x; });
      return porUuid;
    });
}

// ------------------------------------------------------------- colheita

function enviarColheitaEmSegundoPlano() {
  if (!CFG_COLHEITA.ENDPOINT) return Promise.resolve();
  var base;

  return baseColheita().then(function (d) {
    base = d;
    return Promise.all([credenciais(), pendentesDe(d)]);
  }).then(function (r) {
    var token = r[0][0], adminPw = r[0][1], fila = r[1];
    if (!fila.length) return;
    if (!token) return desistir('sem código de activação', 0, fila.length);

    return porLotes(fila, function (lote) {
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

      return postar(CFG_COLHEITA.ENDPOINT, corpo).then(function (porUuid) {
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
    }).then(function () {
      /* Os que o servidor recusou ficam marcados 'erro' e já não contam: não se
       * insiste com esses. Sobrar pendentes quer dizer que nem foram tentados. */
      return pendentesDe(base).then(function (sobram) {
        if (sobram.length) throw new Error('ficaram ' + sobram.length + ' por enviar');
      });
    }, function (e) {
      return desistir((e && e.message) || 'falhou o envio', 0, fila.length);
    });
  });
}

// ---------------------------------------------------------------- india

function enviarIndiaEmSegundoPlano() {
  if (!CFG_INDIA.ENDPOINT) return Promise.resolve();
  var base;

  return baseIndia().then(function (d) {
    base = d;
    return Promise.all([credenciais(), pendentesDe(d)]);
  }).then(function (r) {
    var token = r[0][0], adminPw = r[0][1], fila = r[1];
    if (!fila.length) return;
    if (!token) return desistir('sem código de activação', 0, fila.length);

    /* Já não se retém nada à espera do modo administrador. Até 2026-08-12 as
     * correcções a registos de outra pessoa ficavam no telemóvel sem nunca
     * subirem, e desde então o servidor aceita-as de qualquer maneira.
     * ⚠ Há registos antigos na fila que ainda trazem `precisaAdmin: true`; se
     * o filtro voltasse, esses ficavam presos para sempre. */

    var enviados = 0;
    return porLotes(fila, function (lote) {
      var corpo = {
        token: token,
        entries: lote.map(function (e) {
          return {
            uuid: e.uuid, tsLocal: e.tsLocal, ts: e.tsIso,
            recorder: e.recorder, device: e.device,
            mode: e.mode, ronda: e.ronda, substitui: e.substitui || '',
            accao: e.accao || '',
            seq: e.seq, pid: e.pid, row: e.row,
            noFileira: e.noFileira, noFolha: e.noFolha, source: e.source,
            /* Campo de 2026-08-12. Os registos que já estavam na fila não o
             * têm — daí o valor por omissão em vez de o assumir presente. */
            notas: e.notas || '',
            values: e.values
          };
        })
      };
      if (adminPw) corpo.adminPassword = adminPw;

      return postar(CFG_INDIA.ENDPOINT, corpo).then(function (porUuid) {
        return Promise.all(lote.map(function (e) {
          var x = porUuid[e.uuid];
          if (!x) return Promise.resolve();
          if (x.ok) {
            /* Aqui os registos enviados ficam na base — é deles que sai o
             * histórico do aparelho. Campo separado de propósito: `accao` é a
             * intenção do aparelho e o progresso local depende dela. */
            e.estado = 'enviado';
            e.enviadoEm = Date.now();
            e.celulas = x.celulas || [];
            e.accaoServidor = x.accao || '';
            enviados++;
          } else {
            e.estado = 'erro';
            e.erro = x.erro || 'Erro desconhecido';
          }
          return comLoja(base, 'envios', 'readwrite', function (s) { return s.put(e); });
        }));
        /* Cada lote é gravado antes de o seguinte começar: se a rede cair a
         * meio dos 100, o que já passou fica marcado e só o resto volta. */
      }).then(function () {
        return avisarPaginas({ tipo: 'fila', enviados: enviados, total: fila.length });
      });
    }).then(function () {
      return pendentesDe(base).then(function (sobram) {
        if (sobram.length) return desistir('ficaram ' + sobram.length + ' por enviar',
                                           enviados, fila.length);
        return avisarPaginas({ tipo: 'fila', fim: true, enviados: enviados, total: fila.length });
      });
    }, function (e) {
      return desistir((e && e.message) || 'falhou o envio', enviados, fila.length);
    });
  });
}

function enviarTudoEmSegundoPlano() {
  return Promise.all([
    enviarColheitaEmSegundoPlano().catch(function () {}),
    enviarIndiaEmSegundoPlano().catch(function () {})
  ]);
}

self.addEventListener('sync', function (e) {
  if (e.tag === 'jatlog-enviar') e.waitUntil(enviarColheitaEmSegundoPlano());
  if (e.tag === 'indiarec-enviar') e.waitUntil(enviarIndiaEmSegundoPlano());
});

// atalho para a própria página (e para os testes) mandarem tentar já
self.addEventListener('message', function (e) {
  if (e.data && e.data.tipo === 'enviar-agora') e.waitUntil(enviarTudoEmSegundoPlano());
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
