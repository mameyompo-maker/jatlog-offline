/* JatLog — módulo do peso da colheita (Índia 17): registo do peso colhido por
 * mês, um lançamento de cada vez, por Source ID. Módulo pequeno, primo da
 * pesagem: aqui também não há busca por número nem candidatos, só uma lista
 * fixa de 17 Source ID (ex.: "India #bag01", "India#S-2A") que vem do
 * servidor — mas ao contrário da pesagem (que escolhe a época), aqui
 * escolhe-se o MÊS, porque a folha "India 17 weight" tem uma coluna por mês
 * (Apr/26 .. Mar/27, ciclo de 12 meses) em vez de um separador por época.
 *
 * A activação e o nome são pedidos no menu (../index.html), comum aos quatro
 * módulos. Aqui o fluxo começa já na escolha do mês:
 *   mês -> lista de Source ID -> peso -> confirmar -> volta à lista
 * Cada submissão do ecrã de peso representa exactamente UM lançamento; o
 * "N registos" de cada Source ID é simplesmente quantas vezes se submeteu
 * ali NAQUELE mês.
 *
 * Regra de conflito (a mesma decidida pelo Kaz para a colheita, 2026-08-09):
 * duas pessoas nunca lançam o mesmo registo, portanto "quem chega depois
 * manda". Não há verificação de versão; o UUID de cada envio serve só para
 * não duplicar em caso de reenvio.
 */

var CFG = window.INDIA17_CONFIG || {};
var LOTE_ENVIO = 25;
var INTERVALO_TENTATIVA = 60000;

/* Faixa plausível para UM lançamento de peso colhido de uma linha, num mês —
 * valores escolhidos por bom senso, sem tabela de referência: entre 100 g e
 * 300 kg. Fora disto pede-se confirmação (tal como na pesagem). */
var GRAMAS_MAX = 300000;
var GRAMAS_MIN = 100;

/* Quantos registos recentes se pedem ao servidor de cada vez — mesmo motivo
 * da pesagem: o histórico mostra tudo, mas o pedido ao servidor vem sempre
 * limitado, para as edições/eliminações ainda recentes continuarem a
 * encontrar o seu registo original. */
var LIMITE_LOG = 200;

/* Os meses da folha "India 17 weight": ciclo de 12 meses, Apr/26..Mar/27,
 * cada um com coluna própria. O VALOR de cada um é o que o Apps Script
 * espera para resolver a coluna certa (colunasDados_ do Codigo.gs) e por
 * isso não muda com o idioma — só o RÓTULO mostrado no ecrã é que se traduz
 * (ver rotuloMes(), abaixo). Lista fixa por agora: quando a folha ganhar
 * novas colunas (nova campanha), acrescenta-se aqui, em MES_ROTULOS e no
 * Codigo.gs. */
var MESES = ['Apr/26', 'May/26', 'Jun/26', 'Jul/26', 'Aug/26', 'Sep/26', 'Oct/26', 'Nov/26', 'Dec/26', 'Jan/27', 'Feb/27', 'Mar/27'];

var MES_ROTULOS = {
  pt: { 'Apr/26': 'Abr/26', 'May/26': 'Mai/26', 'Jun/26': 'Jun/26', 'Jul/26': 'Jul/26',
        'Aug/26': 'Ago/26', 'Sep/26': 'Set/26', 'Oct/26': 'Out/26', 'Nov/26': 'Nov/26',
        'Dec/26': 'Dez/26', 'Jan/27': 'Jan/27', 'Feb/27': 'Fev/27', 'Mar/27': 'Mar/27' },
  en: { 'Apr/26': 'Apr/26', 'May/26': 'May/26', 'Jun/26': 'Jun/26', 'Jul/26': 'Jul/26',
        'Aug/26': 'Aug/26', 'Sep/26': 'Sep/26', 'Oct/26': 'Oct/26', 'Nov/26': 'Nov/26',
        'Dec/26': 'Dec/26', 'Jan/27': 'Jan/27', 'Feb/27': 'Feb/27', 'Mar/27': 'Mar/27' },
  ja: { 'Apr/26': '2026年4月', 'May/26': '2026年5月', 'Jun/26': '2026年6月', 'Jul/26': '2026年7月',
        'Aug/26': '2026年8月', 'Sep/26': '2026年9月', 'Oct/26': '2026年10月', 'Nov/26': '2026年11月',
        'Dec/26': '2026年12月', 'Jan/27': '2027年1月', 'Feb/27': '2027年2月', 'Mar/27': '2027年3月' }
};
/** Rótulo do mês na língua do ecrã. */
function rotuloMes(m) {
  var tabela = MES_ROTULOS[S.idioma] || MES_ROTULOS.pt;
  return tabela[m] || m;
}

// ------------------------------------------------------------------- estado

var S = {
  ecra: '',
  idioma: 'pt',
  mes: MESES[1],
  escolha: null,        // o mês marcado no ecrã de entrada, antes de confirmar
  nome: '',
  master: {},            // mes -> [{id, rowNumber, totalPlantas, registos, pesoKg}]
  registos: [],           // o que o servidor sabe do mês actual (os mais recentes)
  fila: [],               // envios pendentes/erro deste aparelho
  seleccionado: null,     // o Source ID escolhido, ao pesar
  filtroId: '',            // o que se escreveu na busca da lista
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
  document.documentElement.lang = (info && info.html) || cod;
  aplicarIdioma();
}

function aplicarIdioma() {
  var fixos = document.querySelectorAll('[data-t]');
  for (var i = 0; i < fixos.length; i++) {
    fixos[i].innerHTML = t(fixos[i].getAttribute('data-t'));
  }
  var busca = $('buscaId');
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
    case 'ecraMes': irParaMes(); break;
    case 'ecraLista': irParaLista(); break;
    case 'ecraPeso': if (S.seleccionado) abrirPeso(S.seleccionado); break;
    case 'ecraEditar': if (S.edicao) abrirEdicao(S.edicao); break;
    default: pintarBarra();
  }
}

// ----------------------------------------------------------- armazenamento

/* O que a entrada comum guarda vale para os quatro módulos e vive com o
 * prefixo 'jat.'; o resto (cadastro em cache, mês) é só deste módulo e fica
 * em 'india17.'. Mexer nesta lista significa mexer também em colheita/app.js,
 * india/app.js e pesagem/app.js — todas têm de concordar. */
var PARTILHADAS = { token: 1, nome: 1, idioma: 1, admin: 1, adminPw: 1, adminAte: 1 };
function chaveDef(k) { return (PARTILHADAS[k] ? 'jat.' : 'india17.') + k; }

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem(chaveDef(k)); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(chaveDef(k), v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(chaveDef(k)); } catch (e) {} }
};

/* Base própria deste módulo ('india17', tal como shell.js e sw.js já a
 * conhecem). Só a store 'envios' — a configuração que o Service Worker
 * precisa (código, senha) já é deixada pela entrada comum na base 'jatlog';
 * não há nada disso para fazer aqui. */
var DB = (function () {
  var bd = null;

  function abrir() {
    return new Promise(function (ok, mau) {
      if (bd) return ok(bd);
      var p = indexedDB.open('india17', 1);
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
    if (reg.sync) return reg.sync.register('india17-enviar');
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
 * Regra: o último ponto ou vírgula é o sinal decimal; se o mesmo sinal
 * aparecer mais do que uma vez, é separador de milhares (1.234.567).
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

  var comContexto = ['ecraLista', 'ecraPeso', 'ecraEditar', 'ecraApagar'];
  $('topo').hidden = comContexto.indexOf(id) < 0;

  var comHistorico = ['ecraLista'];
  $('historico').hidden = comHistorico.indexOf(id) < 0;

  // a escolha do idioma só aparece no ecrã de entrada deste módulo
  $('idiomas').hidden = id !== 'ecraMes';

  window.scrollTo(0, 0);
}

function configurado() { return !!CFG.ENDPOINT; }
function temCodigo() { return !!Def.get('token', ''); }

// ------------------------------------------------------- cadastro e agregados

function gramas(peso, unidade) {
  return Math.round(unidade === 'kg' ? peso * 1000 : peso);
}

/**
 * O total (registos, kg) de um Source ID no mês actual: o que o cadastro em
 * cache já sabe (o servidor, na última vez que se conseguiu perguntar) mais o
 * que ainda está na fila deste aparelho por enviar.
 *
 * Uma edição ou eliminação sobre um registo já contado no cadastro tira
 * primeiro a contribuição antiga (guardada em e._antigoPesoKg quando se pôs
 * o pedido na fila — ver guardarEdicao/apagarRegisto) e só depois soma a
 * nova, se for o caso. Isto evita contar a mesma correcção duas vezes: uma no
 * cadastro (só depois de reenviado e recarregado) e outra na fila.
 */
function agregado(mes, sourceId) {
  var base = (S.master[mes] || []).filter(function (m) { return igual(m.id, sourceId); })[0];
  var contagem = base ? Number(base.registos) || 0 : 0;
  var pesoKg = base ? Number(base.pesoKg) || 0 : 0;

  S.fila.forEach(function (e) {
    if (e.mes !== mes || e.estado === 'erro') return;

    if (e.tipo === 'criar') {
      if (!igual(e.sourceId, sourceId)) return;
      contagem += 1;
      pesoKg += gramas(e.weight, e.unit) / 1000;
      return;
    }

    var alvoId = e.alvo && e.alvo.sourceId;
    if (!igual(alvoId, sourceId)) return;
    contagem -= 1;
    pesoKg -= Number(e._antigoPesoKg) || 0;
    if (e.tipo === 'editar') {
      contagem += 1;
      pesoKg += gramas(e.weight, e.unit) / 1000;
    }
  });

  return { contagem: Math.max(0, Math.round(contagem)), pesoKg: Math.max(0, pesoKg) };
}

/** Soma de registos de todos os Source ID do mês — o número da barra do topo. */
function totalRegistosMes() {
  var lista = S.master[S.mes] || [];
  var total = 0;
  lista.forEach(function (item) { total += agregado(S.mes, item.id).contagem; });
  return total;
}

function carregarMaster(forcar) {
  var mes = S.mes;
  var guardado = Def.get('master_' + mes, '');
  if (guardado && !forcar) {
    try { S.master[mes] = JSON.parse(guardado); } catch (e) { S.master[mes] = null; }
  }

  var precisa = !S.master[mes] || !S.master[mes].length;
  if (!precisa && !forcar) { actualizarSeVazio(mes); return Promise.resolve(S.master[mes]); }

  return pedirGet({ action: 'master', mes: mes }).then(function (j) {
    var lista = mapearMaster(j.linhas || []);
    S.master[mes] = lista;
    Def.set('master_' + mes, JSON.stringify(lista));
    return lista;
  }).catch(function (err) {
    if (S.master[mes] && S.master[mes].length) return S.master[mes];   // vale a cache
    throw err;
  });
}

/* Cada linha vem do servidor como
 * [sourceId, rowNumber, totalPlantas, registos, pesoKg]. rowNumber e
 * totalPlantas são só contexto (mostrados nos cartões) — este módulo nunca
 * os escreve, só os lê. */
function mapearMaster(linhas) {
  return linhas.map(function (l) {
    return {
      id: l[0], rowNumber: l[1], totalPlantas: Number(l[2]) || 0,
      registos: Number(l[3]) || 0, pesoKg: Number(l[4]) || 0
    };
  });
}

/** Actualiza o cadastro em segundo plano, sem travar o ecrã. */
function actualizarSeVazio(mes) {
  if (!navigator.onLine) return;
  pedirGet({ action: 'master', mes: mes }).then(function (j) {
    var lista = mapearMaster(j.linhas || []);
    if (!lista.length) return;
    S.master[mes] = lista;
    Def.set('master_' + mes, JSON.stringify(lista));
  }).catch(function () {});
}

function chaveLog() { return 'log_' + S.mes; }

function carregarRegistos(silencioso) {
  var guardado = Def.get(chaveLog(), '');
  if (guardado) {
    try { S.registos = JSON.parse(guardado); } catch (e) { S.registos = []; }
  } else if (!silencioso) {
    S.registos = [];
  }

  return pedirGet({ action: 'log', mes: S.mes, limite: LIMITE_LOG }).then(function (j) {
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
        uuid: e.uuid, tipo: e.tipo, mes: e.mes, sourceId: e.sourceId,
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
  return r.uuid ? ('u:' + r.uuid) : ('t:' + String(r.ts || '') + '|' + String(r.sourceId || ''));
}
function chaveAlvo(a) {
  return (a && a.uuid) ? ('u:' + a.uuid) : ('t:' + String((a && a.tsFull) || '') + '|' +
                                            String((a && a.sourceId) || ''));
}

/**
 * O que o ecrã deve mostrar: o que veio do servidor mais o que ainda está na
 * fila deste aparelho, aplicado pela mesma ordem. Usado só para o histórico
 * (o agregado por Source ID vem de agregado(), não daqui).
 */
function registosVisiveis() {
  var lista = S.registos.map(function (r) {
    return { ts: r[0], user: r[1], mes: r[2], sourceId: r[3], peso: r[4],
             unidade: r[5], pesoKg: r[6], uuid: r[7], local: false };
  });

  S.fila.forEach(function (e) {
    if (e.mes !== S.mes || e.estado === 'erro') return;
    if (e.tipo === 'criar') {
      lista.push({ ts: e.tsLocal, user: e.recorder, mes: e.mes, sourceId: e.sourceId,
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

  return lista.filter(function (r) { return r.mes === S.mes; });
}

function podeAlterar(autor) {
  if (Admin.activo()) return true;
  return igual(autor, S.nome);
}

// ------------------------------------------------------------------- ecrãs

function pintarTopo() {
  var cracha = Admin.activo() ? '<span class="badge-adm">ADMIN</span>' : '';
  $('topoNome').innerHTML = esc(S.nome) + cracha;
  $('topoMes').textContent = rotuloMes(S.mes);
  $('topoNum').textContent = String(totalRegistosMes());
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

function irParaMes() {
  aviso('avisoMes', '');
  $('subMes').innerHTML = t(Admin.activo() ? 'mes.usuarioAdmin' : 'mes.usuario',
                            { nome: esc(S.nome) });

  /* Pulldown com os meses da folha (Apr/26 primeiro, depois em diante) —
   * sem nada pré-marcado da primeira vez: a mesma razão da pesagem para a
   * época, com um valor por omissão era fácil registar no mês errado sem
   * dar por isso. Da segunda vez em diante, fica no que já estava. */
  var sel = $('selMes');
  sel.innerHTML = '';
  MESES.forEach(function (m) {
    var o = document.createElement('option');
    o.value = m;
    o.textContent = rotuloMes(m);
    sel.appendChild(o);
  });
  sel.value = S.escolha || S.mes || MESES[1];
  S.escolha = sel.value;
  $('btnContinuar').disabled = !S.escolha;

  mostrar('ecraMes');
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

  var busca = $('buscaId');
  if (busca) busca.value = S.filtroId || '';

  mostrarErrosDaFila();
  pintarLista();
  pintarTudo();
  mostrar('ecraLista');
}

/**
 * Filtra a lista pelo que está escrito em S.filtroId — substring, sem
 * distinguir maiúsculas — antes de desenhar os cartões. Com 17 Source ID,
 * escrever "bag05" já chega a um só cartão sem tocar no ecrã; S.filtrados
 * guarda o resultado para o Enter da busca poder abrir esse único cartão
 * directamente (ver ligarEventos).
 */
function pintarLista() {
  var caixa = $('listaIds');
  caixa.innerHTML = '';

  var todas = S.master[S.mes] || [];
  if (!todas.length) {
    S.filtrados = [];
    var v = document.createElement('div');
    v.className = 'empty';
    v.textContent = t('lista.semCadastro');
    caixa.appendChild(v);
    return;
  }

  var filtro = (S.filtroId || '').trim().toLowerCase();
  var lista = filtro
    ? todas.filter(function (item) { return String(item.id).toLowerCase().indexOf(filtro) >= 0; })
    : todas;
  S.filtrados = lista;

  if (!lista.length) {
    var s = document.createElement('div');
    s.className = 'empty';
    s.textContent = t('lista.semResultado', { filtro: S.filtroId });
    caixa.appendChild(s);
    return;
  }

  lista.forEach(function (item) {
    var ag = agregado(S.mes, item.id);
    var badge = ag.contagem > 0
      ? t('lista.badge', { n: ag.contagem, kg: mostrarNumero(ag.pesoKg.toFixed(1)) })
      : t('lista.semRegisto');
    var contexto = t('lista.contexto', { linha: esc(ouTraco(item.rowNumber)) });
    var rotuloId = esc(item.id) + ' (' + esc(ouTraco(item.totalPlantas)) + ')';

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cartao';
    b.innerHTML = '<span class="idSrc">' + rotuloId + '</span>' +
                  '<span class="ctxSrc">' + contexto + '</span>' +
                  '<span class="totalSrc' + (ag.contagem > 0 ? '' : ' vazio') + '">' + esc(badge) + '</span>';
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

/**
 * Botão "Source ID desconhecido (?)": vai direito ao peso de um Source ID
 * "?", sem precisar de existir na folha "India 17 weight" — ao contrário do
 * "?" da colheita (que é uma linha do Master), aqui o Kaz pediu para NÃO
 * mexer nessa folha. O Harvest17_Log já aceita qualquer texto em Source ID
 * (não há validação contra a lista), por isso não é preciso nada especial
 * do lado do cliente para o registo em si — só este atalho, já que "?" não
 * está em S.master[mes] e não apareceria na lista. O Codigo.gs, ao ver
 * sourceId="?", actualiza a folha à parte Harvest17_Hatena (uma linha por
 * mês) em vez de tentar (em vão) encontrá-lo em "India 17 weight".
 */
function buscarHatena() {
  abrirPeso({ id: '?', rowNumber: '', totalPlantas: '' });
}

function abrirPeso(item) {
  S.seleccionado = item;
  S.porConfirmar = null;
  S.unidade = 'kg';
  aviso('avisoPeso', '');

  $('pesoId').textContent = item.id +
      (item.totalPlantas !== '' && item.totalPlantas != null ? ' (' + item.totalPlantas + ')' : '');
  $('pesoSub').textContent = t('peso.subMes', { mes: rotuloMes(S.mes) });

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
   * está fora da faixa. A janela é a mesma dos dois casos; só o aviso de
   * faixa e o texto do botão principal mudam, consoante haja algo a avisar. */
  var g = gramas(peso, S.unidade);
  var foraDaFaixa = (g > GRAMAS_MAX || g < GRAMAS_MIN);

  S.porConfirmar = { peso: peso, unidade: S.unidade };
  $('alvoConfirmar').innerHTML = '<b>' + esc(S.seleccionado.id) + '</b> — ' + esc(rotuloMes(S.mes)) + ' — ' +
    esc(mostrarNumero(peso.toFixed(2))) + ' ' + esc(S.unidade);
  if (foraDaFaixa) {
    aviso('avisoConfirmar', t('confirmar.aviso', {
      valor: mostrarNumero(peso.toFixed(2)), unidade: S.unidade
    }));
  } else {
    aviso('avisoConfirmar', '');
  }
  $('btnRegistarAssim').textContent = t(foraDaFaixa ? 'confirmar.assim' : 'confirmar.registar');

  /* Adiado: chamado a partir do Enter no campo de peso, showModal() move o
   * foco para o primeiro botão do dialog logo no keydown — e o keyup da
   * mesma tecla Enter, já a atingir esse botão, activa-o sozinho (fecha-se
   * a janela sem ninguém ter tocado em nada). Um passo de fora do ciclo do
   * evento de teclado evita a corrida. */
  setTimeout(function () { $('dlgConfirmar').showModal(); }, 0);
}

function gravarPeso(peso, unidade) {
  var item = S.seleccionado;
  var ts = agoraLocal();

  enfileirar({
    tipo: 'criar',
    mes: S.mes,
    sourceId: item.id,
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
    v.textContent = t('historico.vazio', { mes: rotuloMes(S.mes) });
    caixa.appendChild(v);
    return;
  }

  // todos os registos, do mais novo para o mais antigo
  var ultimos = lista.slice().reverse();
  ultimos.forEach(function (r) {
    var carimbo = String(r.ts || '').slice(5, 16);
    var selo = r.local ? '<span class="selo">' + t('historico.porEnviar') + '</span>' : '';

    if (podeAlterar(r.user)) {
      var quem = igual(r.user, S.nome) ? t('historico.voce') : r.user;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cartao' + (r.local ? ' porenviar' : '');
      b.innerHTML = esc(r.sourceId) + '    ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
                    '<span class="hs">' + esc(carimbo) + ' · ' + esc(quem) +
                    ' · ' + t('historico.toque') + '</span>';
      b.onclick = function () { abrirEdicao(r); };
      caixa.appendChild(b);
    } else {
      var d = document.createElement('div');
      d.className = 'histrow';
      d.innerHTML = esc(r.sourceId) + ' &nbsp;&nbsp; ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
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

  $('cabecalhoEditar').innerHTML = t('editar.cabecalho', { id: esc(r.sourceId) });
  $('editarId').textContent = r.sourceId;
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
 *  mandar uma correcção ao servidor de um lançamento que ele ainda não conhece. */
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
      mes: S.mes,
      sourceId: r.sourceId,
      weight: peso,
      unit: S.unidadeEdicao,
      tsLocal: agoraLocal(),
      alvo: { uuid: r.uuid || '', tsFull: r.ts || '', sourceId: r.sourceId },
      // só para agregado() não contar a correcção duas vezes — não vai no envio
      _antigoPesoKg: Number(r.pesoKg) || 0
    });
  }

  accao.then(function () {
    brinde(t('brinde.actualizado', { id: r.sourceId }));
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
        mes: S.mes,
        sourceId: r.sourceId,
        tsLocal: agoraLocal(),
        alvo: { uuid: r.uuid || '', tsFull: r.ts || '', sourceId: r.sourceId },
        _antigoPesoKg: Number(r.pesoKg) || 0
      });

  accao.then(function () {
    brinde(t('brinde.apagado', { id: r.sourceId }));
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

/**
 * Entra num mês concreto e vai direito à lista — usado tanto pelo botão
 * Continuar deste ecrã (continuarDoMes) como pela entrada directa vinda da
 * colheita, que já traz o mês escolhido na URL (ver arrancar()). Mostra
 * sempre ecraMes primeiro (mesmo vindo de fora) para a mensagem "a
 * carregar…" ter onde aparecer — o mesmo padrão do ecraLocal da colheita
 * enquanto o cadastro carrega.
 */
function entrarNoMes(mes) {
  S.mes = mes;
  Def.set('mes', mes);
  S.seleccionado = null;
  S.ultimoGravado = null;
  S.edicao = null;
  S.filtroId = '';

  aviso('avisoMes', t('mes.aCarregar'));
  mostrar('ecraMes');

  carregarMaster(false).then(function () {
    aviso('avisoMes', '');
    carregarRegistos(true);
    irParaLista();
  }).catch(function () {
    aviso('avisoMes', t('mes.semCadastro'));
  });
}

function continuarDoMes() {
  var mes = $('selMes').value;
  if (!mes || MESES.indexOf(mes) < 0) { aviso('avisoMes', t('mes.falta')); return; }
  entrarNoMes(mes);
}

/**
 * Tenta outra vez de vez em quando. Se não há nada para enviar mas o último
 * pedido falhou, faz uma leitura leve só para saber se a rede voltou.
 */
function voltarATentar() {
  if (pendentes().length) { enviarFila(); return; }
  if (S.semRede && S.mes) carregarRegistos(true).catch(function () {});
}

// ------------------------------------------------------------------ ligações

function ligarEventos() {
  // mês
  $('btnContinuar').onclick = continuarDoMes;
  $('btnMenu2').onclick = irParaMenu;
  $('selMes').onchange = function () { S.escolha = $('selMes').value; };

  // lista de Source ID
  $('btnMudarMes').onclick = function () {
    S.ultimoGravado = null;
    S.escolha = S.mes;
    irParaMes();
  };
  $('btnMenu').onclick = irParaMenu;
  $('btnHatena').onclick = buscarHatena;

  /* Busca da lista: filtra a cada tecla; Enter com um só cartão visível abre-o
   * logo, sem precisar de tocar. */
  $('buscaId').oninput = function (e) {
    S.filtroId = e.target.value;
    pintarLista();
  };
  $('buscaId').onkeydown = function (e) {
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

  // confirmação antes de gravar
  $('btnRegistarAssim').onclick = function () {
    $('dlgConfirmar').close();
    if (!S.porConfirmar) return;
    gravarPeso(S.porConfirmar.peso, S.porConfirmar.unidade);
  };
  $('btnCorrigir').onclick = function () {
    $('dlgConfirmar').close();
    S.porConfirmar = null;
    setTimeout(function () { $('inpPeso').focus(); }, 100);
  };
  // Esc fecha a janela sem gravar, tal como o botão Corrigir.
  $('dlgConfirmar').addEventListener('cancel', function () {
    $('dlgConfirmar').close();
    S.porConfirmar = null;
  });

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
      id: esc(r.sourceId), valor: esc(mostrarNumero(r.peso)), unidade: esc(r.unidade)
    });
    $('apagarId').textContent = r.sourceId;
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
  S.mes = Def.get('mes', MESES[1]);
  if (MESES.indexOf(S.mes) < 0) S.mes = MESES[1];
  S.nome = Def.get('nome', '');

  MESES.forEach(function (m) {
    var g = Def.get('master_' + m, '');
    if (g) { try { S.master[m] = JSON.parse(g); } catch (e) {} }
  });

  /* Quem chega aqui sem ter passado pela entrada comum é mandado para lá; é
   * lá que se pede o código e o nome. */
  if (!temCodigo() || !S.nome) { location.replace('../index.html'); return; }

  lerFila().then(function () {
    pintarBarra();
    if (pendentes().length) pedirSincronizacaoEmSegundoPlano();
    if (navigator.onLine) enviarFila();

    /* Vindo da escolha de local da colheita (Índia 17 é a 3ª opção lá — ver
     * colheita/app.js): o mês/ano já foram escolhidos naquele ecrã e seguem
     * na URL, por isso salta-se direito para a lista, tal como Tanheia/7 de
     * Abril vão direito à busca — sem repetir a pergunta aqui.
     * ⚠ Tira-se o "?mes=" da URL logo a seguir (history.replaceState): senão
     * um simples recarregar da página (F5, ou o arranque sem rede) voltava
     * sempre a saltar a escolha do mês, mesmo sem ter vindo da colheita. */
    var mesUrl = new URLSearchParams(location.search).get('mes');
    if (mesUrl) history.replaceState(null, '', location.pathname);
    if (mesUrl && MESES.indexOf(mesUrl) >= 0) {
      entrarNoMes(mesUrl);
      return;
    }

    /* Sem mês na URL (ex.: "Mudar mês" dentro do próprio módulo, ou recarregar
     * a página): começa-se pela escolha do mês, sem nada marcado — mesma
     * razão da pesagem: com um valor por omissão era fácil registar no mês
     * errado sem dar por isso. */
    S.escolha = null;
    irParaMes();
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
