/* JatLog — módulo da pesagem: registo do peso real dos sacos de sementes já
 * colhidas, um saco de cada vez, por planta-mãe. Módulo pequeno e TEMPORÁRIO
 * (Tanheia, campanhas 25-26 e 26-27) — primo mais simples da colheita: aqui
 * não há busca por número nem candidatos, só uma lista fixa de ~20 planta-mãe
 * (ex.: P1, P9, P71, "?") que vem do servidor.
 *
 * A activação e o nome são pedidos no menu (../index.html), comum aos três
 * módulos. Aqui o fluxo começa já na escolha da época:
 *   época -> lista de planta-mãe -> peso -> (confirmar, se fora da faixa)
 * Cada submissão do ecrã de peso representa exactamente UM saco; a contagem
 * de sacos de cada planta-mãe é simplesmente quantas vezes se submeteu ali.
 *
 * Regra de conflito (a mesma decidida pelo Kaz para a colheita, 2026-08-09):
 * duas pessoas nunca lançam o mesmo registo, portanto "quem chega depois
 * manda". Não há verificação de versão; o UUID de cada envio serve só para
 * não duplicar em caso de reenvio.
 */

var CFG = window.PESAGEM_CONFIG || {};
var LOTE_ENVIO = 25;
var INTERVALO_TENTATIVA = 60000;

/* Faixa plausível para o peso de UM SACO de sementes (não de uma linha
 * inteira, como na colheita) — valores escolhidos por bom senso, sem tabela
 * de referência: entre 1 kg e 200 kg. Fora disto pede-se confirmação. */
var GRAMAS_MAX = 200000;
var GRAMAS_MIN = 1000;

/* Quantos registos recentes se pedem ao servidor de cada vez (o histórico só
 * mostra os últimos 8, mas guarda-se mais para as edições/eliminações ainda
 * recentes continuarem a encontrar o seu registo original). Uma época inteira
 * pode ter muito mais lançamentos do que um único mês de colheita, por isso
 * aqui — ao contrário da colheita — o pedido ao servidor vem sempre limitado. */
var LIMITE_LOG = 200;

var SEASONS = ['25-26', '26-27'];

// ------------------------------------------------------------------- estado

var S = {
  ecra: '',
  idioma: 'pt',
  season: SEASONS[0],
  escolha: null,        // a época marcada no ecrã de entrada, antes de confirmar
  nome: '',
  master: {},            // season -> [{id, sacos, pesoKg}]
  registos: [],           // o que o servidor sabe da época actual (os mais recentes)
  fila: [],               // envios pendentes/erro deste aparelho
  seleccionado: null,     // a planta-mãe escolhida, ao pesar
  filtroMae: '',           // o que se escreveu na busca da lista
  filtrados: [],           // a lista depois do filtro, para o Enter da busca
  unidade: 'kg',
  unidadeEdicao: 'kg',
  edicao: null,
  porConfirmar: null,     // {peso, unidade}
  ultimoGravado: null,
  regressar: 'ecraLista',
  aEnviar: false,
  semRede: false,         // o último pedido não chegou ao servidor
  persistente: false      // o navegador prometeu não apagar os nossos dados
};

var $ = function (id) { return document.getElementById(id); };

// --------------------------------------------------------------- idiomas

/** Texto na língua escolhida. {chave} nas frases é substituído por subs.chave. */
function t(chave, subs) {
  var tabela = TEXTOS[S.idioma] || TEXTOS.pt;
  var s = tabela[chave];
  if (s === undefined) s = (TEXTOS.pt[chave] !== undefined) ? TEXTOS.pt[chave] : chave;
  if (!subs) return s;
  return s.replace(/\{(\w+)\}/g, function (todo, k) {
    return (subs[k] === undefined) ? todo : String(subs[k]);
  });
}

function definirIdioma(cod) {
  if (!TEXTOS[cod]) cod = 'pt';
  S.idioma = cod;
  Def.set('idioma', cod);
  var info = IDIOMAS.filter(function (i) { return i.cod === cod; })[0];
  // dizer a verdade ao navegador evita que ele ofereça traduzir por cima
  document.documentElement.lang = (info && info.html) || cod;
  aplicarIdioma();
}

/** Reescreve tudo o que está marcado no HTML e volta a desenhar o que é dinâmico. */
function aplicarIdioma() {
  var fixos = document.querySelectorAll('[data-t]');
  for (var i = 0; i < fixos.length; i++) {
    fixos[i].innerHTML = t(fixos[i].getAttribute('data-t'));
  }
  var busca = $('buscaMae');
  if (busca) busca.placeholder = t('lista.buscar');
  pintarBotoesIdioma();
  redesenharEcra();
}

function pintarBotoesIdioma() {
  var caixa = $('idiomas');
  if (!caixa) return;
  caixa.innerHTML = '';
  IDIOMAS.forEach(function (i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = i.rotulo;
    b.className = (i.cod === S.idioma) ? 'activo' : '';
    b.onclick = function () { definirIdioma(i.cod); };
    caixa.appendChild(b);
  });
}

/** Volta a montar o ecrã actual, para o texto dinâmico mudar de língua também. */
function redesenharEcra() {
  switch (S.ecra) {
    case 'ecraEpoca': irParaEpoca(); break;
    case 'ecraLista': irParaLista(); break;
    case 'ecraPeso': if (S.seleccionado) abrirPeso(S.seleccionado); break;
    case 'ecraEditar': if (S.edicao) abrirEdicao(S.edicao); break;
    default: pintarBarra();
  }
}

// ----------------------------------------------------------- armazenamento

/* O que a entrada comum guarda vale para os três módulos e vive com o
 * prefixo 'jat.'; o resto (cadastro em cache, época) é só deste módulo e
 * fica em 'pesagem.'. Mexer nesta lista significa mexer também em
 * colheita/app.js, india/app.js e em shell.js — todas têm de concordar. */
var PARTILHADAS = { token: 1, nome: 1, idioma: 1, admin: 1, adminPw: 1, adminAte: 1 };
function chaveDef(k) { return (PARTILHADAS[k] ? 'jat.' : 'pesagem.') + k; }

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem(chaveDef(k)); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(chaveDef(k), v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(chaveDef(k)); } catch (e) {} }
};

/* Base própria deste módulo ('pesagem', tal como shell.js e sw.js já a
 * conhecem). Só a store 'envios' — a configuração que o Service Worker
 * precisa (código, senha) já é deixada pela entrada comum na base 'jatlog';
 * não há nada disso para fazer aqui. */
var DB = (function () {
  var bd = null;

  function abrir() {
    return new Promise(function (ok, mau) {
      if (bd) return ok(bd);
      var p = indexedDB.open('pesagem', 1);
      p.onupgradeneeded = function () {
        var d = p.result;
        if (!d.objectStoreNames.contains('envios')) {
          var s = d.createObjectStore('envios', { keyPath: 'uuid' });
          s.createIndex('estado', 'estado');
        }
      };
      p.onsuccess = function () { bd = p.result; ok(bd); };
      p.onerror = function () { mau(p.error); };
    });
  }

  function comStore(modo, fn) {
    return abrir().then(function (d) {
      return new Promise(function (ok, mau) {
        var t = d.transaction('envios', modo);
        var r = fn(t.objectStore('envios'));
        t.oncomplete = function () { ok(r ? r.result : null); };
        t.onerror = function () { mau(t.error); };
        t.onabort = function () { mau(t.error); };
      });
    });
  }

  return {
    guardar: function (e) { return comStore('readwrite', function (s) { return s.put(e); }); },
    apagar: function (id) { return comStore('readwrite', function (s) { return s.delete(id); }); },
    todos: function () { return comStore('readonly', function (s) { return s.getAll(); }); }
  };
})();

/**
 * Pede ao Android para enviar a fila mesmo com a aplicação fechada.
 * Só existe no Chrome/Android — no iOS não há Background Sync, e por isso
 * a regra continua a ser abrir a aplicação uma vez onde há rede.
 */
function pedirSincronizacaoEmSegundoPlano() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  navigator.serviceWorker.ready.then(function (reg) {
    if (reg.sync) return reg.sync.register('pesagem-enviar');
  }).catch(function () {});
}

/** Recarrega S.fila a partir do disco, por ordem de criação. */
function lerFila() {
  return DB.todos().then(function (l) {
    S.fila = (l || []).sort(function (a, b) { return a.criadoEm - b.criadoEm; });
    return S.fila;
  }).catch(function () { S.fila = []; return S.fila; });
}

function pendentes() {
  return S.fila.filter(function (e) { return e.estado === 'pendente'; });
}
function comErro() {
  return S.fila.filter(function (e) { return e.estado === 'erro'; });
}

// ------------------------------------------------------------ administrador

/* Entra-se e sai-se do modo administrador no menu; aqui só se lê. O prazo é o
 * mesmo que o menu escreve — sem ele, uma fila com correcções de outra pessoa
 * ficaria presa se a permissão desaparecesse a meio. */
var Admin = {
  activo: function () {
    if (Def.get('admin', '') !== '1') return false;
    return Date.now() <= Number(Def.get('adminAte', 0));
  },
  pw: function () { return Admin.activo() ? Def.get('adminPw', '') : ''; }
};

// ----------------------------------------------------------------- ajudantes

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

function dois(n) { return (n < 10 ? '0' : '') + n; }

/** Carimbo do aparelho no formato que a folha usa: YYYY-MM-DD HH:MM:SS */
function agoraLocal() {
  var d = new Date();
  return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()) + ' ' +
         dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':' + dois(d.getSeconds());
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function igual(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function ouTraco(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  return s === '' ? '-' : s;
}

/**
 * Lê o número escrito pela pessoa, seja qual for o idioma do ecrã.
 *
 * Aceita sempre os dois sinais decimais: em português escreve-se 1,5 e em
 * inglês 1.5, e no campo há quem tenha o teclado numa língua e a aplicação
 * noutra. Regra: o último ponto ou vírgula é o sinal decimal; se o mesmo sinal
 * aparecer mais do que uma vez, é separador de milhares (1.234.567).
 * O NFKC trata dos algarismos e sinais de largura total dos teclados japoneses.
 */
function paraNumero(txt) {
  var s = String(txt === null || txt === undefined ? '' : txt)
    .normalize('NFKC').replace(/[\s ']/g, '');
  if (!s) return NaN;

  var p = s.lastIndexOf('.');
  var v = s.lastIndexOf(',');
  var corte = p > v ? p : v;

  if (corte >= 0) {
    var sinal = s.charAt(corte);
    if (s.indexOf(sinal) !== corte) {
      s = s.split('.').join('').split(',').join('');          // só milhares
    } else {
      s = s.slice(0, corte).split('.').join('').split(',').join('') + '.' + s.slice(corte + 1);
    }
  }

  if (!/^[+-]?\d*\.?\d*$/.test(s) || !/\d/.test(s)) return NaN;
  return Number(s);
}

/** O mesmo número escrito com o sinal decimal do idioma escolhido. */
function mostrarNumero(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v);
  return t('num.separador') === ',' ? s.replace('.', ',') : s.replace(',', '.');
}

var tempoBrinde = null;
function brinde(msg, mau) {
  var b = $('brinde');
  b.textContent = msg;
  b.classList.toggle('mau', !!mau);
  b.hidden = false;
  clearTimeout(tempoBrinde);
  tempoBrinde = setTimeout(function () { b.hidden = true; }, 3200);
}

function aviso(id, texto) {
  var e = $(id);
  if (!e) return;
  if (texto) { e.innerHTML = texto; e.hidden = false; }
  else { e.textContent = ''; e.hidden = true; }
}

function mostrar(id) {
  S.ecra = id;
  var ecras = document.querySelectorAll('.ecra');
  for (var i = 0; i < ecras.length; i++) ecras[i].hidden = (ecras[i].id !== id);

  var comContexto = ['ecraLista', 'ecraPeso', 'ecraConfirmar', 'ecraEditar', 'ecraApagar'];
  $('topo').hidden = comContexto.indexOf(id) < 0;

  var comHistorico = ['ecraLista'];
  $('historico').hidden = comHistorico.indexOf(id) < 0;

  // a escolha do idioma só aparece no ecrã de entrada deste módulo
  $('idiomas').hidden = id !== 'ecraEpoca';

  window.scrollTo(0, 0);
}

function configurado() { return !!CFG.ENDPOINT; }
function temCodigo() { return !!Def.get('token', ''); }

// ------------------------------------------------------- cadastro e agregados

function gramas(peso, unidade) {
  return Math.round(unidade === 'kg' ? peso * 1000 : peso);
}

/**
 * O total (sacos, kg) de uma planta-mãe na época actual: o que o cadastro em
 * cache já sabe (o servidor, na última vez que se conseguiu perguntar) mais o
 * que ainda está na fila deste aparelho por enviar.
 *
 * Uma edição ou eliminação sobre um registo já contado no cadastro tira
 * primeiro a contribuição antiga (guardada em e._antigoPesoKg quando se pôs
 * o pedido na fila — ver guardarEdicao/apagarRegisto) e só depois soma a
 * nova, se for o caso. Isto evita contar a mesma correcção duas vezes: uma no
 * cadastro (só depois de reenviado e recarregado) e outra na fila.
 */
function agregado(season, motherId) {
  var base = (S.master[season] || []).filter(function (m) { return igual(m.id, motherId); })[0];
  var sacos = base ? Number(base.sacos) || 0 : 0;
  var pesoKg = base ? Number(base.pesoKg) || 0 : 0;

  S.fila.forEach(function (e) {
    if (e.season !== season || e.estado === 'erro') return;

    if (e.tipo === 'criar') {
      if (!igual(e.motherId, motherId)) return;
      sacos += 1;
      pesoKg += gramas(e.weight, e.unit) / 1000;
      return;
    }

    var alvoId = e.alvo && e.alvo.motherId;
    if (!igual(alvoId, motherId)) return;
    sacos -= 1;
    pesoKg -= Number(e._antigoPesoKg) || 0;
    if (e.tipo === 'editar') {
      sacos += 1;
      pesoKg += gramas(e.weight, e.unit) / 1000;
    }
  });

  return { sacos: Math.max(0, Math.round(sacos)), pesoKg: Math.max(0, pesoKg) };
}

/** Soma de sacos de todas as planta-mãe da época — o número da barra do topo. */
function totalSacosEpoca() {
  var lista = S.master[S.season] || [];
  var total = 0;
  lista.forEach(function (item) { total += agregado(S.season, item.id).sacos; });
  return total;
}

function carregarMaster(forcar) {
  var season = S.season;
  var guardado = Def.get('master_' + season, '');
  if (guardado && !forcar) {
    try { S.master[season] = JSON.parse(guardado); } catch (e) { S.master[season] = null; }
  }

  var precisa = !S.master[season] || !S.master[season].length;
  if (!precisa && !forcar) { actualizarSeVazio(season); return Promise.resolve(S.master[season]); }

  return pedirGet({ action: 'master', season: season }).then(function (j) {
    var lista = (j.linhas || []).map(function (l) {
      return { id: l[0], sacos: Number(l[1]) || 0, pesoKg: Number(l[2]) || 0 };
    });
    S.master[season] = lista;
    Def.set('master_' + season, JSON.stringify(lista));
    return lista;
  }).catch(function (err) {
    if (S.master[season] && S.master[season].length) return S.master[season];   // vale a cache
    throw err;
  });
}

/** Actualiza o cadastro em segundo plano, sem travar o ecrã. */
function actualizarSeVazio(season) {
  if (!navigator.onLine) return;
  pedirGet({ action: 'master', season: season }).then(function (j) {
    var lista = (j.linhas || []).map(function (l) {
      return { id: l[0], sacos: Number(l[1]) || 0, pesoKg: Number(l[2]) || 0 };
    });
    if (!lista.length) return;
    S.master[season] = lista;
    Def.set('master_' + season, JSON.stringify(lista));
  }).catch(function () {});
}

function chaveLog() { return 'log_' + S.season; }

function carregarRegistos(silencioso) {
  var guardado = Def.get(chaveLog(), '');
  if (guardado) {
    try { S.registos = JSON.parse(guardado); } catch (e) { S.registos = []; }
  } else if (!silencioso) {
    S.registos = [];
  }

  return pedirGet({ action: 'log', season: S.season, limite: LIMITE_LOG }).then(function (j) {
    S.registos = j.registos || [];
    Def.set(chaveLog(), JSON.stringify(S.registos));
    pintarTudo();
    return S.registos;
  }).catch(function (err) {
    pintarTudo();
    if (!silencioso) throw err;
  });
}

// ------------------------------------------------------------------- rede

/* navigator.onLine só diz se há ligação à rede local: dá "true" com wi-fi sem
 * internet, e o Chromium volta a pô-lo a true depois de recarregar a página
 * offline. Por isso contamos também com o que aconteceu ao último pedido. */
function foraDeAlcance() { return !navigator.onLine || S.semRede; }

/** Marca o resultado de um pedido e repinta a barra se o estado mudou. */
function marcarRede(chegou) {
  var antes = S.semRede;
  S.semRede = !chegou;
  if (antes !== S.semRede) pintarBarra();
}

function pintarBarra() {
  var b = $('barra');
  var p = pendentes().length;
  var maus = comErro().length;
  b.classList.remove('enviando', 'guardado');

  if (foraDeAlcance()) {
    b.hidden = false;
    b.textContent = p ? t('rede.semRedeFila', { n: p }) : t('rede.semRede');
  } else if (S.aEnviar) {
    b.hidden = false;
    b.classList.add('enviando');
    b.textContent = t('rede.aEnviar');
  } else if (p) {
    b.hidden = false;
    b.classList.add('enviando');
    b.textContent = t('rede.porEnviar', { n: p });
  } else if (maus) {
    b.hidden = false;
    b.textContent = t('rede.recusados', { n: maus });
  } else {
    b.hidden = true;
  }
}

function pedirGet(params) {
  if (!navigator.onLine || !configurado()) return Promise.reject(new Error('sem rede'));
  var token = Def.get('token', '');
  if (!token) return Promise.reject(new Error('sem código'));

  var q = ['token=' + encodeURIComponent(token)];
  for (var k in params) q.push(k + '=' + encodeURIComponent(params[k]));

  // o segundo callback só apanha a rejeição do fetch, ou seja, falha de rede
  return fetch(CFG.ENDPOINT + '?' + q.join('&'), { redirect: 'follow' })
    .then(function (r) { marcarRede(true); return r.json(); },
          function (err) { marcarRede(false); throw err; })
    .then(function (j) {
      if (!j.ok) throw new Error(j.erro || 'Erro do servidor');
      return j;
    });
}

function enviarFila() {
  if (S.aEnviar || !navigator.onLine || !configurado()) return Promise.resolve();
  var token = Def.get('token', '');
  if (!token) return Promise.resolve();

  var fila = pendentes();
  if (!fila.length) return Promise.resolve();

  S.aEnviar = true;
  pintarBarra();

  var lotes = [];
  for (var i = 0; i < fila.length; i += LOTE_ENVIO) lotes.push(fila.slice(i, i + LOTE_ENVIO));

  return lotes.reduce(function (cadeia, lote) {
    return cadeia.then(function () { return enviarLote(lote, token); });
  }, Promise.resolve()).then(function () {
    S.aEnviar = false;
    return lerFila();
  }).then(function () {
    pintarBarra();
    /* Depois de enviar, o cadastro (base do agregado()) volta a pedir-se ao
     * servidor: sem isto, um saco que acabou de sair da fila (porque já foi
     * aceite) deixava de ser contado em lado nenhum até à próxima vez que o
     * cadastro fosse recarregado — o número da lista "piscava" para trás. */
    return Promise.all([
      carregarMaster(true).catch(function () {}),
      carregarRegistos(true).catch(function () {})
    ]).then(function () { pintarTudo(); if (S.ecra === 'ecraLista') pintarLista(); });
  }).catch(function () {
    S.aEnviar = false;
    pintarBarra();
  });
}

function enviarLote(lote, token) {
  var corpo = {
    token: token,
    entries: lote.map(function (e) {
      return {
        uuid: e.uuid, tipo: e.tipo, season: e.season, motherId: e.motherId,
        weight: e.weight, unit: e.unit,
        recorder: e.recorder, tsLocal: e.tsLocal, alvo: e.alvo || null
      };
    })
  };
  var pw = Admin.pw();
  if (pw) corpo.adminPassword = pw;

  return fetch(CFG.ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita o preflight CORS
    body: JSON.stringify(corpo),
    redirect: 'follow'
  }).then(function (r) { marcarRede(true); return r.json(); },
          function (err) { marcarRede(false); throw err; })
    .then(function (resp) {
      if (!resp.ok) throw new Error(resp.erro || 'Erro do servidor');

      var porUuid = {};
      (resp.resultados || []).forEach(function (r) { porUuid[r.uuid] = r; });

      return Promise.all(lote.map(function (e) {
        var r = porUuid[e.uuid];
        if (!r) return Promise.resolve();
        if (r.ok) return DB.apagar(e.uuid);          // enviado: sai da fila
        e.estado = 'erro';
        e.erro = r.erro || 'Erro desconhecido';
        return DB.guardar(e);
      })).then(function () {
        var bons = 0, maus = 0;
        lote.forEach(function (e) {
          var r = porUuid[e.uuid];
          if (r && r.ok) bons++; else if (r) maus++;
        });
        if (bons) brinde(t('brinde.enviados', { n: bons }));
        if (maus) brinde(t('brinde.recusados', { n: maus }), true);
      });
    });
}

/** Põe um pedido na fila e tenta enviá-lo já. */
function enfileirar(item) {
  item.uuid = item.uuid || uuid();
  item.estado = 'pendente';
  item.criadoEm = Date.now();
  item.recorder = S.nome;
  return DB.guardar(item)
    .then(lerFila)
    .then(function () {
      pintarBarra();
      pedirSincronizacaoEmSegundoPlano();
      if (navigator.onLine) enviarFila();
    });
}

// ------------------------------------------------------------------- registos

/** Chave que identifica um registo, mesmo os antigos que não têm Record ID. */
function chaveRegisto(r) {
  return r.uuid ? ('u:' + r.uuid) : ('t:' + String(r.ts || '') + '|' + String(r.motherId || ''));
}
function chaveAlvo(a) {
  return (a && a.uuid) ? ('u:' + a.uuid) : ('t:' + String((a && a.tsFull) || '') + '|' +
                                            String((a && a.motherId) || ''));
}

/**
 * O que o ecrã deve mostrar: o que veio do servidor mais o que ainda está na
 * fila deste aparelho, aplicado pela mesma ordem. Usado só para o histórico
 * (o agregado por planta-mãe vem de agregado(), não daqui).
 */
function registosVisiveis() {
  var lista = S.registos.map(function (r) {
    return { ts: r[0], user: r[1], season: r[2], motherId: r[3], peso: r[4],
             unidade: r[5], pesoKg: r[6], uuid: r[7], local: false };
  });

  S.fila.forEach(function (e) {
    if (e.season !== S.season || e.estado === 'erro') return;
    if (e.tipo === 'criar') {
      lista.push({ ts: e.tsLocal, user: e.recorder, season: e.season, motherId: e.motherId,
                   peso: Number(e.weight).toFixed(2), unidade: e.unit,
                   pesoKg: gramas(e.weight, e.unit) / 1000, uuid: e.uuid, local: true });
      return;
    }
    var k = chaveAlvo(e.alvo);
    for (var i = 0; i < lista.length; i++) {
      if (chaveRegisto(lista[i]) !== k) continue;
      if (e.tipo === 'apagar') { lista.splice(i, 1); }
      else {
        lista[i].peso = Number(e.weight).toFixed(2);
        lista[i].unidade = e.unit;
        lista[i].pesoKg = gramas(e.weight, e.unit) / 1000;
        lista[i].local = true;
      }
      return;
    }
  });

  return lista.filter(function (r) { return r.season === S.season; });
}

function podeAlterar(autor) {
  if (Admin.activo()) return true;
  return igual(autor, S.nome);
}

// ------------------------------------------------------------------- ecrãs

function pintarTopo() {
  var cracha = Admin.activo() ? '<span class="badge-adm">ADMIN</span>' : '';
  $('topoNome').innerHTML = esc(S.nome) + cracha;
  $('topoEpoca').textContent = t('epoca.rotulo.' + S.season);
  $('topoNum').textContent = String(totalSacosEpoca());
}

function pintarTudo() {
  pintarTopo();
  pintarHistorico();
  pintarBarra();
}

/** Volta ao menu comum. O nome e o código ficam; a fila também. */
function irParaMenu() {
  location.href = '../index.html';
}

function irParaEpoca() {
  aviso('avisoEpoca', '');
  $('subEpoca').innerHTML = t(Admin.activo() ? 'epoca.usuarioAdmin' : 'epoca.usuario',
                              { nome: esc(S.nome) });

  /* Dois botões em vez de uma lista, sem nada pré-marcado: a época tem de ser
   * uma escolha à vista, não um valor que já lá estava (mesma razão da
   * colheita para o local). S.escolha só fica preenchido quando se carrega
   * num deles (ou quando se vem do "Mudar época"). */
  var caixa = $('escolhaEpoca');
  caixa.innerHTML = '';
  SEASONS.forEach(function (code) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'escolha-local' + (S.escolha === code ? ' activo' : '');
    b.setAttribute('data-season', code);
    b.innerHTML = '<b>' + esc(t('epoca.rotulo.' + code)) + '</b>';
    b.onclick = function () { S.escolha = code; irParaEpoca(); };
    caixa.appendChild(b);
  });
  $('btnContinuar').disabled = !S.escolha;

  mostrar('ecraEpoca');
}

function irParaLista() {
  aviso('avisoLista', '');

  if (S.ultimoGravado) {
    var g = S.ultimoGravado;
    aviso('avisoGravado', t(g.local ? 'lista.gravadoLocal' : 'lista.gravado', {
      id: esc(g.id), valor: esc(mostrarNumero(g.valor)), unidade: esc(g.unidade), hora: esc(g.hora)
    }));
  } else {
    aviso('avisoGravado', '');
  }

  var busca = $('buscaMae');
  if (busca) busca.value = S.filtroMae || '';

  mostrarErrosDaFila();
  pintarLista();
  pintarTudo();
  mostrar('ecraLista');
}

/**
 * Filtra a lista pelo que está escrito em S.filtroMae — substring, sem
 * distinguir maiúsculas — antes de desenhar os cartões. Com ~20 planta-mãe
 * por época, escrever "71" já chega a um só cartão (P71) sem tocar no ecrã;
 * S.filtrados guarda o resultado para o Enter da busca poder abrir esse
 * único cartão directamente (ver ligarEventos).
 */
function pintarLista() {
  var caixa = $('listaMaes');
  caixa.innerHTML = '';

  var todas = S.master[S.season] || [];
  if (!todas.length) {
    S.filtrados = [];
    var v = document.createElement('div');
    v.className = 'empty';
    v.textContent = t('lista.semCadastro');
    caixa.appendChild(v);
    return;
  }

  var filtro = (S.filtroMae || '').trim().toLowerCase();
  var lista = filtro
    ? todas.filter(function (item) { return String(item.id).toLowerCase().indexOf(filtro) >= 0; })
    : todas;
  S.filtrados = lista;

  if (!lista.length) {
    var s = document.createElement('div');
    s.className = 'empty';
    s.textContent = t('lista.semResultado', { filtro: S.filtroMae });
    caixa.appendChild(s);
    return;
  }

  lista.forEach(function (item) {
    var ag = agregado(S.season, item.id);
    var badge = ag.sacos > 0
      ? t('lista.badge', { n: ag.sacos, kg: mostrarNumero(ag.pesoKg.toFixed(1)) })
      : t('lista.semRegisto');

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cartao';
    b.innerHTML = '<span class="idMae">' + esc(item.id) + '</span>' +
                  '<span class="totalMae' + (ag.sacos > 0 ? '' : ' vazio') + '">' + esc(badge) + '</span>';
    b.onclick = function () { abrirPeso(item); };
    caixa.appendChild(b);
  });
}

function mostrarErrosDaFila() {
  var maus = comErro();
  if (!maus.length) return;
  var primeiro = maus[0];
  aviso('avisoLista',
        t('rede.erroFila', { n: maus.length, erro: esc(primeiro.erro || '') }) +
        ' <button class="btn ligacao" id="btnRetentar" style="display:inline;width:auto;' +
        'margin:0 0 0 6px">' + t('rede.tentarDeNovo') + '</button>');
  var b = $('btnRetentar');
  if (b) {
    b.onclick = function () {
      Promise.all(comErro().map(function (e) {
        e.estado = 'pendente'; e.erro = '';
        return DB.guardar(e);
      })).then(lerFila).then(function () {
        aviso('avisoLista', '');
        pintarBarra();
        enviarFila();
      });
    };
  }
}

function abrirPeso(item) {
  S.seleccionado = item;
  S.porConfirmar = null;
  S.unidade = 'kg';
  aviso('avisoPeso', '');

  $('pesoMae').textContent = item.id;
  $('pesoSub').textContent = t('peso.subEpoca', { epoca: t('epoca.rotulo.' + S.season) });

  $('inpPeso').value = '';
  pintarSegmento('segPeso', S.unidade);

  pintarTudo();
  mostrar('ecraPeso');
  setTimeout(function () { $('inpPeso').focus(); }, 150);
}

function pintarSegmento(id, unidade) {
  var bs = $(id).querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) {
    bs[i].classList.toggle('activo', bs[i].getAttribute('data-unidade') === unidade);
  }
}

function submeterPeso() {
  var peso = paraNumero($('inpPeso').value);
  if (!$('inpPeso').value.trim()) return;

  if (!isFinite(peso)) {
    aviso('avisoPeso', t('peso.invalido'));
    return;
  }
  if (peso <= 0) {
    aviso('avisoPeso', t('peso.maiorQueZero'));
    return;
  }

  /* Todo registo passa por aqui antes de ir para o servidor — não só o que
   * está fora da faixa. O ecrã é o mesmo dos dois casos; só o aviso de faixa
   * e o texto do botão principal mudam, consoante haja ou não algo a avisar. */
  var g = gramas(peso, S.unidade);
  var foraDaFaixa = (g > GRAMAS_MAX || g < GRAMAS_MIN);

  S.porConfirmar = { peso: peso, unidade: S.unidade };
  if (foraDaFaixa) {
    aviso('avisoConfirmar', t('confirmar.aviso', {
      valor: mostrarNumero(peso.toFixed(2)), unidade: S.unidade
    }));
  } else {
    aviso('avisoConfirmar', '');
  }
  $('btnRegistarAssim').textContent = t(foraDaFaixa ? 'confirmar.assim' : 'confirmar.registar');
  $('confirmarMae').textContent = S.seleccionado.id;
  $('confirmarValor').textContent = mostrarNumero(peso.toFixed(2)) + ' ' + S.unidade;
  mostrar('ecraConfirmar');
}

function gravarPeso(peso, unidade) {
  var item = S.seleccionado;
  var ts = agoraLocal();

  enfileirar({
    tipo: 'criar',
    season: S.season,
    motherId: item.id,
    weight: peso,
    unit: unidade,
    tsLocal: ts
  }).then(function () {
    S.ultimoGravado = {
      id: item.id,
      valor: peso.toFixed(2),   // cru: quem mostra é que traduz o sinal decimal
      unidade: unidade,
      hora: ts.slice(11, 16),
      local: foraDeAlcance()
    };
    brinde(t(foraDeAlcance() ? 'brinde.guardado' : 'brinde.registado', { id: item.id }));
    S.porConfirmar = null;
    irParaLista();
  });
}

// ------------------------------------------------------------- histórico

function pintarHistorico() {
  var caixa = $('listaHistorico');
  caixa.innerHTML = '';

  var lista = registosVisiveis();
  if (!lista.length) {
    var v = document.createElement('div');
    v.className = 'empty';
    v.textContent = t('historico.vazio', { epoca: t('epoca.rotulo.' + S.season) });
    caixa.appendChild(v);
    return;
  }

  // os oito mais recentes, do mais novo para o mais antigo
  var ultimos = lista.slice(-8).reverse();
  ultimos.forEach(function (r) {
    var carimbo = String(r.ts || '').slice(5, 16);
    var selo = r.local ? '<span class="selo">' + t('historico.porEnviar') + '</span>' : '';

    if (podeAlterar(r.user)) {
      var quem = igual(r.user, S.nome) ? t('historico.voce') : r.user;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cartao' + (r.local ? ' porenviar' : '');
      b.innerHTML = esc(r.motherId) + '    ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
                    '<span class="hs">' + esc(carimbo) + ' · ' + esc(quem) +
                    ' · ' + t('historico.toque') + '</span>';
      b.onclick = function () { abrirEdicao(r); };
      caixa.appendChild(b);
    } else {
      var d = document.createElement('div');
      d.className = 'histrow';
      d.innerHTML = esc(r.motherId) + ' &nbsp;&nbsp; ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
                    '<span class="hs">' + esc(carimbo) + ' · ' + esc(r.user) +
                    ' · ' + t('historico.trancado') + '</span>';
      caixa.appendChild(d);
    }
  });
}

function abrirEdicao(r) {
  S.edicao = r;
  S.regressar = S.ecra;
  S.unidadeEdicao = (r.unidade === 'g') ? 'g' : 'kg';
  aviso('avisoEditar', '');

  $('cabecalhoEditar').innerHTML = t('editar.cabecalho', { id: esc(r.motherId) });
  $('editarMae').textContent = r.motherId;
  $('editarSub').textContent = t('editar.lancado', {
    quando: String(r.ts || '').slice(5, 16), quem: ouTraco(r.user)
  });
  $('inpEditar').value = mostrarNumero(r.peso);
  pintarSegmento('segEditar', S.unidadeEdicao);

  pintarTudo();
  mostrar('ecraEditar');
  setTimeout(function () { $('inpEditar').focus(); }, 150);
}

/** Se o registo ainda está na fila deste aparelho, mexe-se nela em vez de
 *  mandar uma correcção ao servidor de um saco que ele ainda não conhece. */
function envioPendenteDe(r) {
  if (!r.uuid) return null;
  for (var i = 0; i < S.fila.length; i++) {
    var e = S.fila[i];
    if (e.uuid === r.uuid && e.tipo === 'criar' && e.estado === 'pendente') return e;
  }
  return null;
}

function guardarEdicao() {
  var r = S.edicao;
  if (!r) return;

  var peso = paraNumero($('inpEditar').value);
  if (!isFinite(peso)) { aviso('avisoEditar', t('peso.invalido')); return; }
  if (peso <= 0) { aviso('avisoEditar', t('peso.maiorQueZero')); return; }
  if (!podeAlterar(r.user)) {
    aviso('avisoEditar', t('editar.semPermissao'));
    return;
  }

  var pendente = envioPendenteDe(r);
  var accao;
  if (pendente) {
    pendente.weight = peso;
    pendente.unit = S.unidadeEdicao;
    accao = DB.guardar(pendente).then(lerFila);
  } else {
    accao = enfileirar({
      tipo: 'editar',
      season: S.season,
      motherId: r.motherId,
      weight: peso,
      unit: S.unidadeEdicao,
      tsLocal: agoraLocal(),
      alvo: { uuid: r.uuid || '', tsFull: r.ts || '', motherId: r.motherId },
      // só para agregado() não contar a correcção duas vezes — não vai no envio
      _antigoPesoKg: Number(r.pesoKg) || 0
    });
  }

  accao.then(function () {
    brinde(t('brinde.actualizado', { id: r.motherId }));
    S.edicao = null;
    pintarBarra();
    voltarDaEdicao();
  });
}

function apagarRegisto() {
  var r = S.edicao;
  if (!r) return;
  if (!podeAlterar(r.user)) {
    aviso('avisoEditar', t('editar.semPermissao'));
    mostrar('ecraEditar');
    return;
  }

  var pendente = envioPendenteDe(r);
  var accao = pendente
    ? DB.apagar(pendente.uuid).then(lerFila)
    : enfileirar({
        tipo: 'apagar',
        season: S.season,
        motherId: r.motherId,
        tsLocal: agoraLocal(),
        alvo: { uuid: r.uuid || '', tsFull: r.ts || '', motherId: r.motherId },
        _antigoPesoKg: Number(r.pesoKg) || 0
      });

  accao.then(function () {
    brinde(t('brinde.apagado', { id: r.motherId }));
    S.edicao = null;
    pintarBarra();
    voltarDaEdicao();
  });
}

function voltarDaEdicao() {
  if (S.regressar === 'ecraPeso' && S.seleccionado) {
    pintarTudo();
    mostrar('ecraPeso');
  } else {
    irParaLista();
  }
}

// ------------------------------------------------------------------ entrada

function continuarDaEpoca() {
  var season = S.escolha;
  if (!season || SEASONS.indexOf(season) < 0) { aviso('avisoEpoca', t('epoca.falta')); return; }

  S.season = season;
  Def.set('season', season);
  S.seleccionado = null;
  S.ultimoGravado = null;
  S.edicao = null;
  S.filtroMae = '';

  aviso('avisoEpoca', t('epoca.aCarregar'));

  carregarMaster(false).then(function () {
    aviso('avisoEpoca', '');
    carregarRegistos(true);
    irParaLista();
  }).catch(function () {
    aviso('avisoEpoca', t('epoca.semCadastro'));
  });
}

/**
 * Tenta outra vez de vez em quando. Se não há nada para enviar mas o último
 * pedido falhou, faz uma leitura leve só para saber se a rede voltou — de
 * outro modo a barra "SEM CONEXÃO" ficaria presa para sempre.
 */
function voltarATentar() {
  if (pendentes().length) { enviarFila(); return; }
  if (S.semRede && S.season) carregarRegistos(true).catch(function () {});
}

// ------------------------------------------------------------------ ligações

function ligarEventos() {
  // época
  $('btnContinuar').onclick = continuarDaEpoca;
  $('btnMenu2').onclick = irParaMenu;

  // lista de planta-mãe
  /* Aqui a época actual vem marcada: quem carrega neste botão já sabe onde
   * está e costuma querer só mudar de campanha. À entrada do módulo é que não
   * há nada marcado. */
  $('btnMudarEpoca').onclick = function () {
    S.ultimoGravado = null;
    S.escolha = S.season;
    irParaEpoca();
  };
  $('btnMenu').onclick = irParaMenu;

  /* Busca da lista: filtra a cada tecla; Enter com um só cartão visível abre-o
   * logo, sem precisar de tocar — escrever "71" e Enter chega directo a P71. */
  $('buscaMae').oninput = function (e) {
    S.filtroMae = e.target.value;
    pintarLista();
  };
  $('buscaMae').onkeydown = function (e) {
    if (e.key !== 'Enter') return;
    if (S.filtrados.length === 1) abrirPeso(S.filtrados[0]);
  };

  // peso
  $('inpPeso').onkeydown = function (e) { if (e.key === 'Enter') submeterPeso(); };
  $('btnRegistar').onclick = submeterPeso;
  $('btnCancelarPeso').onclick = function () { S.seleccionado = null; irParaLista(); };
  $('segPeso').onclick = function (e) {
    var u = e.target.getAttribute && e.target.getAttribute('data-unidade');
    if (!u) return;
    S.unidade = u;
    pintarSegmento('segPeso', u);
  };

  // confirmação de valor fora da faixa
  $('btnRegistarAssim').onclick = function () {
    if (!S.porConfirmar) return;
    gravarPeso(S.porConfirmar.peso, S.porConfirmar.unidade);
  };
  $('btnCorrigir').onclick = function () {
    S.porConfirmar = null;
    mostrar('ecraPeso');
    $('inpPeso').value = '';
    setTimeout(function () { $('inpPeso').focus(); }, 150);
  };

  // edição
  $('btnGuardarEdicao').onclick = guardarEdicao;
  $('inpEditar').onkeydown = function (e) { if (e.key === 'Enter') guardarEdicao(); };
  $('btnCancelarEdicao').onclick = function () { S.edicao = null; voltarDaEdicao(); };
  $('segEditar').onclick = function (e) {
    var u = e.target.getAttribute && e.target.getAttribute('data-unidade');
    if (!u) return;
    S.unidadeEdicao = u;
    pintarSegmento('segEditar', u);
  };
  $('btnApagar').onclick = function () {
    var r = S.edicao;
    if (!r) return;
    $('avisoApagarTexto').innerHTML = t('apagar.aviso', {
      id: esc(r.motherId), valor: esc(mostrarNumero(r.peso)), unidade: esc(r.unidade)
    });
    $('apagarMae').textContent = r.motherId;
    $('apagarSub').textContent = t('editar.lancado', {
      quando: String(r.ts || '').slice(5, 16), quem: ouTraco(r.user)
    });
    mostrar('ecraApagar');
  };
  $('btnApagarSim').onclick = apagarRegisto;
  $('btnApagarNao').onclick = function () { mostrar('ecraEditar'); };

  // rede
  window.addEventListener('online', function () { pintarBarra(); voltarATentar(); });
  window.addEventListener('offline', pintarBarra);
  setInterval(voltarATentar, INTERVALO_TENTATIVA);
}

// ------------------------------------------------------------------ arranque

/**
 * Pede ao navegador para não apagar os nossos dados quando o telemóvel ficar
 * com pouco espaço. Sem isto, a fila de envio é apagável como qualquer cache.
 * O Chrome concede sozinho às aplicações instaladas no ecrã principal, e o
 * Safari também. Não há prompt: ou é concedido em silêncio, ou negado.
 */
function pedirArmazenamentoPersistente() {
  if (!navigator.storage || !navigator.storage.persist) return;
  navigator.storage.persisted()
    .then(function (ja) { return ja ? true : navigator.storage.persist(); })
    .then(function (ok) { S.persistente = !!ok; })
    .catch(function () {});
}

function arrancar() {
  ligarEventos();
  pedirArmazenamentoPersistente();

  definirIdioma(Def.get('idioma', 'pt'));
  S.season = Def.get('season', SEASONS[0]);
  if (SEASONS.indexOf(S.season) < 0) S.season = SEASONS[0];
  S.nome = Def.get('nome', '');

  SEASONS.forEach(function (code) {
    var g = Def.get('master_' + code, '');
    if (g) { try { S.master[code] = JSON.parse(g); } catch (e) {} }
  });

  /* Quem chega aqui sem ter passado pela entrada comum (um atalho antigo, por
   * exemplo) é mandado para lá; é lá que se pede o código e o nome. */
  if (!temCodigo() || !S.nome) { location.replace('../index.html'); return; }

  lerFila().then(function () {
    pintarBarra();
    if (pendentes().length) pedirSincronizacaoEmSegundoPlano();
    if (navigator.onLine) enviarFila();

    /* Começa-se sempre pela escolha da época, sem nada marcado — mesma razão
     * da colheita para o local: com um valor por omissão era fácil pesar na
     * campanha errada sem dar por isso. */
    S.escolha = null;
    irParaEpoca();
  });
}

/* Um único Service Worker para a aplicação toda, registado na raiz. Este
 * módulo vive numa subpasta, por isso o âmbito é o pai — é o que permite abrir
 * qualquer das páginas sem rede. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(function () {});
  });
}

arrancar();
