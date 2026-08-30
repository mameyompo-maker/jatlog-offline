/* JatLog — módulo da colheita: registo do peso que funciona sem rede.
 *
 * A activação e o nome são pedidos no menu (../index.html), que é comum aos
 * dois módulos. Aqui o fluxo começa já na escolha do local:
 *   local + mês -> busca -> (candidatos) -> peso -> histórico
 *
 * Tudo o que o ecrã precisa está no aparelho: o cadastro (Master) fica em cache e
 * a busca corre localmente. Os registos vão para uma fila em IndexedDB e sobem
 * sozinhos quando a rede volta.
 *
 * Regra de conflito decidida pelo Kaz (2026-08-09): duas pessoas nunca lançam o
 * mesmo registo, portanto "quem chega depois manda". Não há verificação de
 * versão; o UUID de cada envio serve só para não duplicar em caso de reenvio.
 */

var CFG = window.JATLOG_CONFIG || {};
var LOTE_ENVIO = 25;
var INTERVALO_TENTATIVA = 20000;

var GRAMAS_MAX = 30000;   // acima disto pede confirmação
var GRAMAS_MIN = 5;       // abaixo disto também

var MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* O valor de cada mês (MESES, acima) é sempre em inglês — é o que vai para
 * S.mes e para o servidor. Isto aqui é só o rótulo mostrado no <select>,
 * por língua; o índice bate certo com MESES porque as duas listas têm a
 * mesma ordem Jan..Dec. */
var MES_ROTULOS = {
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  en: MESES,
  ja: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
};
function rotuloMes(m) {
  var lista = MES_ROTULOS[S.idioma] || MES_ROTULOS.pt;
  var i = MESES.indexOf(m);
  return i >= 0 ? lista[i] : m;
}
/** "Jan-26" -> "Jan-26"/"1月-26"/… conforme a língua (S.mes de Tanheia/7 de
 * Abril é sempre "Mon-YY"; ver MESES acima). */
function rotuloMesAno(v) {
  if (!v || v.indexOf('-') < 0) return v;
  var partes = v.split('-');
  return rotuloMes(partes[0]) + '-' + partes[1];
}

/* Mesma ideia para os meses de Índia 17 (INDIA17_MESES_POR_ANO, abaixo). */
var MES17_ROTULOS = {
  pt: { Apr: 'Abr', May: 'Mai', Jun: 'Jun', Jul: 'Jul', Aug: 'Ago', Sep: 'Set', Oct: 'Out', Nov: 'Nov', Dec: 'Dez', Jan: 'Jan', Feb: 'Fev', Mar: 'Mar' },
  en: { Apr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec', Jan: 'Jan', Feb: 'Feb', Mar: 'Mar' },
  ja: { Apr: '4月', May: '5月', Jun: '6月', Jul: '7月', Aug: '8月', Sep: '9月', Oct: '10月', Nov: '11月', Dec: '12月', Jan: '1月', Feb: '2月', Mar: '3月' }
};
function rotuloMes17(m) {
  var tabela = MES17_ROTULOS[S.idioma] || MES17_ROTULOS.pt;
  return tabela[m] || m;
}

/* Índia 17 não segue o calendário Jan..Dec + ano à volta do actual: a folha
 * "India 17 weight" tem colunas fixas, ciclo de 12 meses Apr/26..Mar/27. Por
 * agora só há as campanhas 2026/2027. O pulldown de mês/ano é o mesmo
 * #selMes/#selAno dos outros locais — só a lista de opções muda consoante o
 * local escolhido (ver popularMesAno()). */
var INDIA17_ANOS = [2026, 2027];
var INDIA17_MESES_POR_ANO = {
  2026: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  2027: ['Jan', 'Feb', 'Mar']
};

/** "Aug"+2026 -> "Aug/26" (o valor exacto que o Apps Script do Índia 17
 * espera). */
function india17Mes(mes, ano) {
  return mes + '/' + String(ano).slice(-2);
}

/* Acrescentar um local aqui (e no Codigo.gs, e em i18n.js) basta para ele
 * aparecer no menu. Os nomes dos sítios são próprios, não se traduzem. */
/* "hatena": true liga o botão "Bloco desconhecido (?)" no ecrã de busca — só
 * faz sentido onde o cadastro pode mesmo ter uma linha com Block = "?" (o
 * Kaz acrescenta essa linha à mão na folha Master; o resto é automático,
 * igual ao "?" que já existe na pesagem).
 *
 * "redirecionar": este local não participa do fluxo de busca por número desta
 * página — a estrutura da folha "Índia 17" é outra (Source ID + colunas por
 * mês, sem separador "Master" com busca), por isso continua com o seu
 * próprio módulo (../india17/), só a entrada é que passou a ser esta mesma
 * "escolha do local", lado a lado com Tanheia e 7 de Abril — não tem mais
 * cartão próprio no menu. O mês/ano escolhem-se aqui mesmo (popularMesAno());
 * ao continuar, o valor já escolhido segue na URL para o módulo próprio
 * aterrar direito na lista, sem repetir a pergunta. Ver continuarDoLocal(). */
var LOCAIS = {
  lines:   { rotulo: 'Tanheia (Linhas)',    curto: 'Tanheia',    campo: 'Line Number', prefixo: 'L', hatena: false },
  blocks:  { rotulo: '7 de Abril (Blocos)', curto: '7 de Abril', campo: 'Block',       prefixo: ''  , hatena: true  },
  india17: { rotulo: 'Índia 17 (Source ID)', curto: 'Índia 17',  redirecionar: '../india17/' }
};

// ------------------------------------------------------------------- estado

var S = {
  ecra: '',
  idioma: 'pt',
  site: 'lines',
  escolha: null,       // o local marcado no ecrã de entrada, antes de confirmar
  nome: '',
  mes: '',
  master: {},          // site -> [{campo, saco, variedade, plantas, mae}]
  registos: [],        // o que o servidor sabe do site+mês actual
  registosTodos: {},   // site -> registos de TODOS os meses (histórico do ecrã do local)
  fila: [],            // envios pendentes/erro deste aparelho
  seleccionado: null,
  candidatos: [],
  numeroBuscado: '',
  unidade: 'kg',
  unidadeEdicao: 'kg',
  edicao: null,
  porConfirmar: null,  // {peso, unidade}
  ultimoGravado: null,
  regressar: 'ecraBusca',
  aEnviar: false,
  semRede: false,      // o último pedido não chegou ao servidor
  persistente: false   // o navegador prometeu não apagar os nossos dados
};

var $ = function (id) { return document.getElementById(id); };

function local_() { return LOCAIS[S.site] || LOCAIS.lines; }

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

/** Texto próprio do local actual (rótulo da busca, plural, etc.). */
function tSitio(campo, subs) { return t('sitio.' + S.site + '.' + campo, subs); }

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
  var dicas = document.querySelectorAll('[data-tph]');
  for (var j = 0; j < dicas.length; j++) {
    dicas[j].setAttribute('placeholder', t(dicas[j].getAttribute('data-tph')));
  }
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
    case 'ecraLocal': irParaLocal(); break;
    case 'ecraBusca': irParaBusca(); break;
    case 'ecraCandidatos': irParaCandidatos(); break;
    case 'ecraPeso': if (S.seleccionado) abrirPeso(S.seleccionado); break;
    case 'ecraEditar': if (S.edicao) abrirEdicao(S.edicao); break;
    default: pintarBarra();
  }
}

// ----------------------------------------------------------- armazenamento

/* O que a entrada comum guarda vale para os dois módulos e vive com o prefixo
 * 'jat.'; o resto (cadastro em cache, local, mês) é só deste módulo e fica em
 * 'jatlog.'. Mexer nesta lista significa mexer também em india/app.js e em
 * shell.js — as três têm de concordar. */
var PARTILHADAS = { token: 1, nome: 1, idioma: 1, admin: 1, adminPw: 1, adminAte: 1 };
function chaveDef(k) { return (PARTILHADAS[k] ? 'jat.' : 'jatlog.') + k; }

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem(chaveDef(k)); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(chaveDef(k), v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(chaveDef(k)); } catch (e) {} }
};

var DB = (function () {
  var bd = null;

  function abrir() {
    return new Promise(function (ok, mau) {
      if (bd) return ok(bd);
      // v2 acrescentou 'config': o Service Worker não consegue ler o
      // localStorage, por isso o código e a senha têm de estar aqui.
      var p = indexedDB.open('jatlog', 2);
      p.onupgradeneeded = function () {
        var d = p.result;
        if (!d.objectStoreNames.contains('envios')) {
          d.createObjectStore('envios', { keyPath: 'uuid' });
        }
        if (!d.objectStoreNames.contains('config')) {
          d.createObjectStore('config', { keyPath: 'k' });
        }
      };
      p.onsuccess = function () { bd = p.result; ok(bd); };
      p.onerror = function () { mau(p.error); };
    });
  }

  /* A transacção só está viva dentro do mesmo bloco síncrono em que foi criada,
   * por isso o pedido é feito já aqui dentro e só resolvemos no oncomplete —
   * assim temos a certeza de que ficou gravado no disco. */
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

  function comConfig(modo, fn) {
    return abrir().then(function (d) {
      return new Promise(function (ok, mau) {
        var t = d.transaction('config', modo);
        var r = fn(t.objectStore('config'));
        t.oncomplete = function () { ok(r ? r.result : null); };
        t.onerror = function () { mau(t.error); };
        t.onabort = function () { mau(t.error); };
      });
    });
  }

  return {
    guardar: function (e) { return comStore('readwrite', function (s) { return s.put(e); }); },
    apagar: function (id) { return comStore('readwrite', function (s) { return s.delete(id); }); },
    todos: function () { return comStore('readonly', function (s) { return s.getAll(); }); },
    definir: function (k, v) {
      return comConfig('readwrite', function (s) { return s.put({ k: k, v: v }); });
    }
  };
})();

/** Deixa ao Service Worker o que ele precisa para enviar sozinho. */
function guardarConfigParaOSW() {
  DB.definir('token', Def.get('token', '')).catch(function () {});
  DB.definir('adminPw', Admin.pw()).catch(function () {});
}

/**
 * Pede ao Android para enviar a fila mesmo com a aplicação fechada.
 * Só existe no Chrome/Android — no iOS não há Background Sync, e por isso
 * a regra continua a ser abrir a aplicação uma vez onde há rede.
 */
function pedirSincronizacaoEmSegundoPlano() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  navigator.serviceWorker.ready.then(function (reg) {
    if (reg.sync) return reg.sync.register('jatlog-enviar');
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
    .normalize('NFKC').replace(/[\s ']/g, '');
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

  var comContexto = ['ecraBusca', 'ecraCandidatos', 'ecraPeso', 'ecraEditar', 'ecraApagar'];
  $('topo').hidden = comContexto.indexOf(id) < 0;

  var comHistorico = ['ecraBusca', 'ecraCandidatos', 'ecraPeso'];
  $('historico').hidden = comHistorico.indexOf(id) < 0;

  // a escolha do idioma só aparece no ecrã de entrada deste módulo
  $('idiomas').hidden = id !== 'ecraLocal';

  window.scrollTo(0, 0);
}

function configurado() { return !!CFG.ENDPOINT; }
function temCodigo() { return !!Def.get('token', ''); }

// ---------------------------------------------------- cadastro e registos

/** 'L586 to L593' -> [586, 593]. Sem prefixo, apanha os números soltos. */
function numerosDoCampo(txt, prefixo) {
  var re = prefixo ? new RegExp(prefixo + '\\s*(\\d+)', 'gi') : /(\d+)/g;
  var nums = [], m;
  while ((m = re.exec(String(txt || ''))) !== null) nums.push(parseInt(m[1], 10));
  return nums;
}

function primeiroNumero(txt, prefixo) {
  var n = numerosDoCampo(txt, prefixo);
  return n.length ? n[0] : null;
}

function descreverLinha(item) {
  var n = numerosDoCampo(item.campo, local_().prefixo);
  if (n.length >= 2) {
    return (n[n.length - 1] - n[0] + 1) + ' ' + tSitio('plural') +
           ' (' + n[0] + '-' + n[n.length - 1] + ')';
  }
  return tSitio('unico');
}

function ouTraco(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  return s === '' ? '-' : s;
}

/** Chave que identifica um registo, mesmo os antigos que não têm Record ID. */
function chaveRegisto(r) {
  return r.uuid ? ('u:' + r.uuid) : ('t:' + String(r.ts || '') + '|' + String(r.campo || ''));
}
function chaveAlvo(a) {
  return (a && a.uuid) ? ('u:' + a.uuid) : ('t:' + String((a && a.tsFull) || '') + '|' +
                                            String((a && a.line) || ''));
}

/**
 * O que o ecrã deve mostrar: o que veio do servidor mais o que ainda está na
 * fila deste aparelho, aplicado pela mesma ordem.
 */
function registosVisiveis() {
  var lista = S.registos.map(function (r) {
    return { ts: r[0], user: r[1], mes: r[2], campo: r[3], peso: r[4],
             unidade: r[5], uuid: r[6], local: false };
  });

  S.fila.forEach(function (e) {
    if (e.site !== S.site || e.estado === 'erro') return;
    if (e.tipo === 'criar') {
      if (e.month !== S.mes) return;
      lista.push({ ts: e.tsLocal, user: e.recorder, mes: e.month, campo: e.line,
                   peso: Number(e.weight).toFixed(2), unidade: e.unit,
                   uuid: e.uuid, local: true });
      return;
    }
    var k = chaveAlvo(e.alvo);
    for (var i = 0; i < lista.length; i++) {
      if (chaveRegisto(lista[i]) !== k) continue;
      if (e.tipo === 'apagar') { lista.splice(i, 1); }
      else {
        lista[i].peso = Number(e.weight).toFixed(2);
        lista[i].unidade = e.unit;
        lista[i].local = true;
      }
      return;
    }
  });

  return lista.filter(function (r) { return r.mes === S.mes; });
}

function jaRegistado(campo) {
  return registosVisiveis().some(function (r) { return igual(r.campo, campo); });
}

function podeAlterar(autor) {
  if (Admin.activo()) return true;
  return igual(autor, S.nome);
}

// -------------------------------------------------------------- barra de rede

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

  // o "enviar agora" do histórico só aparece quando há fila para enviar
  var btnAgora = $('btnEnviarAgora');
  if (btnAgora) btnAgora.hidden = !p;
}

// ------------------------------------------------------------------- rede

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
    // no ecrã do local o histórico é o de todos os meses: recarrega-se esse,
    // senão o registo acabado de subir sumia da lista até à próxima visita
    if (S.ecra === 'ecraLocal') carregarRegistosTodos();
    return carregarRegistos(true).catch(function () {});
  }).catch(function () {
    S.aEnviar = false;
    pintarBarra();
  });
}

/**
 * "Tentar enviar agora" (botão no histórico). Manda esta página tentar e, ao
 * mesmo tempo, acorda o Service Worker — se a página estiver a meio de outra
 * coisa, o Service Worker continua até ao fim (mesmo padrão do India Rec,
 * ver forcarEnvio() em india/app.js).
 */
function forcarEnvio() {
  if (!pendentes().length) { brinde(t('historico.jaEnviado')); return Promise.resolve(); }
  if (foraDeAlcance()) { brinde(t('rede.semRede'), true); return Promise.resolve(); }
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    try { navigator.serviceWorker.controller.postMessage({ tipo: 'enviar-agora' }); } catch (e) {}
  }
  pedirSincronizacaoEmSegundoPlano();
  return enviarFila();
}

function enviarLote(lote, token) {
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

// ------------------------------------------------------- cadastro em cache

function carregarMaster(forcar) {
  var site = S.site;
  var guardado = Def.get('master_' + site, '');
  if (guardado && !forcar) {
    try {
      S.master[site] = JSON.parse(guardado);
    } catch (e) { S.master[site] = null; }
  }

  var precisa = !S.master[site] || !S.master[site].length;
  if (!precisa && !forcar) { actualizarSeVazio(site); return Promise.resolve(S.master[site]); }

  return pedirGet({ action: 'master', site: site }).then(function (j) {
    var lista = (j.linhas || []).map(function (l) {
      return { campo: l[0], saco: l[1], variedade: l[2], plantas: l[3], mae: l[4] };
    });
    S.master[site] = lista;
    Def.set('master_' + site, JSON.stringify(lista));
    return lista;
  }).catch(function (err) {
    if (S.master[site] && S.master[site].length) return S.master[site];   // vale a cache
    throw err;
  });
}

/** Actualiza o cadastro em segundo plano, sem travar o ecrã. */
function actualizarSeVazio(site) {
  if (!navigator.onLine) return;
  pedirGet({ action: 'master', site: site }).then(function (j) {
    var lista = (j.linhas || []).map(function (l) {
      return { campo: l[0], saco: l[1], variedade: l[2], plantas: l[3], mae: l[4] };
    });
    if (!lista.length) return;
    S.master[site] = lista;
    Def.set('master_' + site, JSON.stringify(lista));
  }).catch(function () {});
}

function chaveLog() { return 'log_' + S.site + '_' + S.mes; }

function carregarRegistos(silencioso) {
  var guardado = Def.get(chaveLog(), '');
  if (guardado) {
    try { S.registos = JSON.parse(guardado); } catch (e) { S.registos = []; }
  } else if (!silencioso) {
    S.registos = [];
  }

  return pedirGet({ action: 'log', site: S.site, month: S.mes }).then(function (j) {
    S.registos = j.registos || [];
    Def.set(chaveLog(), JSON.stringify(S.registos));
    pintarTudo();
    return S.registos;
  }).catch(function (err) {
    pintarTudo();
    if (!silencioso) throw err;
  });
}

/* ---------------------------------------- histórico no ecrã do local
 *
 * Kaz (2026-08-30): mal se marca o local, aparece por baixo o histórico dele
 * com os meses todos misturados, do mais novo para o mais velho, corrigível
 * como o do mês. O servidor já respondia a isto (action=log, month vazio);
 * guarda-se a última resposta por local para o ecrã ter algo para mostrar
 * antes da rede responder (e quando ela não responde). */

var LIMITE_HIST_LOCAL = 100;

function chaveLogTodos(site) { return 'logTodos_' + site; }

function carregarRegistosTodos() {
  var site = S.escolha;
  if (!site || !LOCAIS[site] || LOCAIS[site].redirecionar) return;

  if (!S.registosTodos[site]) {
    var guardado = Def.get(chaveLogTodos(site), '');
    if (guardado) {
      try { S.registosTodos[site] = JSON.parse(guardado); } catch (e) {}
    }
  }

  pedirGet({ action: 'log', site: site, month: '' }).then(function (j) {
    S.registosTodos[site] = j.registos || [];
    Def.set(chaveLogTodos(site), JSON.stringify(S.registosTodos[site]));
    // só repinta se o utilizador ainda está a olhar para este local
    if (S.ecra === 'ecraLocal' && S.escolha === site) pintarHistoricoLocal();
  }).catch(function () {
    if (S.ecra === 'ecraLocal' && S.escolha === site) pintarHistoricoLocal(true);
  });
}

/** Como registosVisiveis(), mas sobre todos os meses de um local, do mais
 *  novo para o mais velho. Cada linha leva site e mês próprios: é com eles
 *  que uma correcção feita daqui aponta ao sítio certo. */
function registosVisiveisDoLocal(site) {
  var lista = (S.registosTodos[site] || []).map(function (r) {
    return { ts: r[0], user: r[1], mes: r[2], campo: r[3], peso: r[4],
             unidade: r[5], uuid: r[6], site: site, local: false };
  });

  S.fila.forEach(function (e) {
    if (e.site !== site || e.estado === 'erro') return;
    if (e.tipo === 'criar') {
      lista.push({ ts: e.tsLocal, user: e.recorder, mes: e.month, campo: e.line,
                   peso: Number(e.weight).toFixed(2), unidade: e.unit,
                   uuid: e.uuid, site: site, local: true });
      return;
    }
    var k = chaveAlvo(e.alvo);
    for (var i = 0; i < lista.length; i++) {
      if (chaveRegisto(lista[i]) !== k) continue;
      if (e.tipo === 'apagar') { lista.splice(i, 1); }
      else {
        lista[i].peso = Number(e.weight).toFixed(2);
        lista[i].unidade = e.unit;
        lista[i].local = true;
      }
      return;
    }
  });

  // "na ordem em que foram lançados": o carimbo local é ISO, ordena por texto
  lista.sort(function (a, b) {
    return String(b.ts || '').localeCompare(String(a.ts || ''));
  });
  return lista;
}

function pintarHistoricoLocal(semRede) {
  var bloco = $('historicoLocal');
  if (!bloco) return;

  var site = S.escolha;
  if (!site || !LOCAIS[site]) { bloco.hidden = true; return; }
  bloco.hidden = false;

  var nota = $('histLocalNota');
  var caixa = $('listaHistoricoLocal');
  caixa.innerHTML = '';

  // Índia 17 é outro módulo (outra folha, outro ecrã de correcção): o
  // histórico dele vive lá; aqui só se diz onde está.
  if (LOCAIS[site].redirecionar) {
    nota.hidden = false;
    nota.textContent = t('histLocal.india17');
    return;
  }

  var lista = registosVisiveisDoLocal(site);
  var temServidor = Array.isArray(S.registosTodos[site]);

  if (!lista.length) {
    nota.hidden = false;
    nota.textContent = t(temServidor ? 'histLocal.vazio'
                         : (semRede || foraDeAlcance()) ? 'histLocal.semRede'
                         : 'histLocal.aCarregar');
    return;
  }

  if ((semRede || foraDeAlcance()) && !temServidor) {
    nota.hidden = false;
    nota.textContent = t('histLocal.semRede');
  } else if (lista.length > LIMITE_HIST_LOCAL) {
    nota.hidden = false;
    nota.textContent = t('histLocal.maisRecentes', { n: LIMITE_HIST_LOCAL });
  } else {
    nota.hidden = true;
  }

  lista.slice(0, LIMITE_HIST_LOCAL).forEach(function (r) {
    // os meses vêm misturados, por isso cada cartão diz o seu
    caixa.appendChild(cartaoDeRegisto(r, rotuloMesAno(r.mes) + ' · ' + String(r.ts || '').slice(5, 16)));
  });
}

// ------------------------------------------------------------------- ecrãs

function pintarTopo() {
  var cracha = Admin.activo() ? '<span class="badge-adm">ADMIN</span>' : '';
  $('topoNome').innerHTML = esc(S.nome) + cracha;
  $('topoMes').textContent = rotuloMesAno(S.mes) + ' · ' + local_().curto;
  $('topoNum').textContent = String(registosVisiveis().length);
}

function pintarTudo() {
  pintarTopo();
  pintarHistorico();
  pintarBarra();
  if (S.ecra === 'ecraLocal') pintarHistoricoLocal();
}

/** Volta ao menu comum. O nome e o código ficam; a fila também. */
function irParaMenu() {
  location.href = '../index.html';
}

function irParaLocal() {
  aviso('avisoLocal', '');
  $('subLocal').innerHTML = t(Admin.activo() ? 'local.usuarioAdmin' : 'local.usuario',
                              { nome: esc(S.nome) });

  /* Dois botões em vez de uma lista: o local tem de ser uma escolha à vista,
   * não um valor que já lá estava. S.escolha só fica preenchido quando se
   * carrega num deles (ou quando se vem do "Mudar local ou mês"). */
  var caixa = $('escolhaLocal');
  caixa.innerHTML = '';
  Object.keys(LOCAIS).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'escolha-local' + (S.escolha === k ? ' activo' : '');
    b.setAttribute('data-site', k);
    b.innerHTML = '<b>' + esc(LOCAIS[k].rotulo) + '</b>' +
                  '<span>' + esc(t('local.registoPor', { o: t('sitio.' + k + '.plural') })) + '</span>';
    // tocar de novo no local já marcado desfaz a escolha (Kaz, 2026-08-30)
    b.onclick = function () { S.escolha = (S.escolha === k) ? null : k; irParaLocal(); };
    caixa.appendChild(b);
  });
  $('btnContinuar').disabled = !S.escolha;

  popularMesAno();

  mostrar('ecraLocal');
  pintarHistoricoLocal();
  carregarRegistosTodos();
}

/**
 * Preenche #selMes/#selAno consoante o local escolhido. Tanheia/7 de Abril
 * usam o calendário Jan..Dec + ano à volta do actual (como sempre); Índia 17
 * usa só as campanhas 2026/2027 e os meses reais dessa folha (ver
 * INDIA17_MESES_POR_ANO) — o pulldown é o mesmo par de <select>, só a lista
 * de opções muda. Chamada sempre que a escolha de local muda (irParaLocal())
 * e sempre que o ano de Índia 17 muda (ver ligarEventos).
 */
function popularMesAno() {
  var selM = $('selMes'), selA = $('selAno');

  if (S.escolha === 'india17') {
    var anoAntes = selA.value;
    selA.innerHTML = '';
    INDIA17_ANOS.forEach(function (a) {
      var o = document.createElement('option'); o.value = String(a); o.textContent = String(a);
      selA.appendChild(o);
    });
    selA.value = (INDIA17_ANOS.indexOf(Number(anoAntes)) >= 0) ? anoAntes : String(INDIA17_ANOS[0]);
    popularMesesIndia17();
    return;
  }

  var agora = new Date();
  var anos = [agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1];
  selM.innerHTML = ''; selA.innerHTML = '';
  MESES.forEach(function (m) {
    var o = document.createElement('option'); o.value = m; o.textContent = rotuloMes(m); selM.appendChild(o);
  });
  anos.forEach(function (a) {
    var o = document.createElement('option'); o.value = String(a); o.textContent = String(a);
    selA.appendChild(o);
  });

  // o mês já escolhido, ou o mês corrente
  var mes = MESES[agora.getMonth()], ano = String(agora.getFullYear());
  if (S.mes && S.mes.indexOf('-') > 0) {
    var partes = S.mes.split('-');
    if (MESES.indexOf(partes[0]) >= 0) mes = partes[0];
    var cheio = '20' + partes[1];
    if (anos.indexOf(Number(cheio)) >= 0) ano = cheio;
  }
  selM.value = mes;
  selA.value = ano;
}

/** Repõe as opções de #selMes para o ano escolhido de Índia 17. */
function popularMesesIndia17() {
  var selM = $('selMes');
  var ano = Number($('selAno').value) || INDIA17_ANOS[0];
  var antigo = selM.value;
  var lista = INDIA17_MESES_POR_ANO[ano] || [];

  selM.innerHTML = '';
  lista.forEach(function (m) {
    var o = document.createElement('option'); o.value = m; o.textContent = rotuloMes17(m); selM.appendChild(o);
  });

  selM.value = (lista.indexOf(antigo) >= 0) ? antigo : lista[0];
}

function irParaBusca() {
  aviso('avisoBusca', '');
  $('rotuloBusca').textContent = tSitio('busca');
  $('inpBusca').value = '';
  $('btnHatena').hidden = !local_().hatena;

  var adm = Admin.activo();
  $('linhaMesAdmin').hidden = !adm;
  if (adm) {
    var sel = $('selMesAdmin');
    var agora = new Date();
    var opcoes = [];
    [agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1].forEach(function (a) {
      MESES.forEach(function (m) { opcoes.push(m + '-' + String(a).slice(-2)); });
    });
    if (opcoes.indexOf(S.mes) < 0) opcoes.unshift(S.mes);
    sel.innerHTML = '';
    opcoes.forEach(function (o) {
      var el = document.createElement('option');
      var partes = o.split('-');
      el.value = o; el.textContent = rotuloMes(partes[0]) + '-' + partes[1];
      sel.appendChild(el);
    });
    sel.value = S.mes;
  }

  if (S.ultimoGravado) {
    var g = S.ultimoGravado;
    aviso('avisoGravado', t(g.local ? 'busca.gravadoLocal' : 'busca.gravado', {
      linha: esc(g.linha), valor: esc(mostrarNumero(g.valor)), unidade: esc(g.unidade), hora: esc(g.hora)
    }));
  } else {
    aviso('avisoGravado', '');
  }

  mostrarErrosDaFila();
  pintarTudo();
  mostrar('ecraBusca');
  setTimeout(function () { $('inpBusca').focus(); }, 150);
}

function mostrarErrosDaFila() {
  var maus = comErro();
  if (!maus.length) return;
  var primeiro = maus[0];
  aviso('avisoBusca',
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
        aviso('avisoBusca', '');
        pintarBarra();
        enviarFila();
      });
    };
  }
}

/**
 * Botão "Bloco desconhecido (?)": vai direito para o peso do Block = "?",
 * sem precisar de digitar nada (o teclado do campo de busca é numérico, "?"
 * nem dá para escrever nele). A linha "?" em si vem do cadastro (Master) tal
 * e qual as outras — nenhuma lógica especial no servidor, igual à pesagem.
 */
function buscarHatena() {
  aviso('avisoBusca', '');
  S.ultimoGravado = null;
  aviso('avisoGravado', '');

  var lista = S.master[S.site] || [];
  if (!lista.length) {
    aviso('avisoBusca', t('busca.semCadastro'));
    return;
  }

  var item = lista.filter(function (it) { return String(it.campo).trim() === '?'; })[0];
  if (!item) {
    aviso('avisoBusca', t('busca.hatenaAusente'));
    return;
  }
  abrirPeso(item);
}

function buscar(valorBruto) {
  var val = String(valorBruto || '').normalize('NFKC').trim();
  aviso('avisoBusca', '');
  if (!val) return;
  S.ultimoGravado = null;
  aviso('avisoGravado', '');

  if (!/^\d+$/.test(val)) {
    aviso('avisoBusca', t('busca.soNumeros'));
    return;
  }

  var lista = S.master[S.site] || [];
  if (!lista.length) {
    aviso('avisoBusca', t('busca.semCadastro'));
    return;
  }

  var alvo = parseInt(val, 10);
  var achados = lista.filter(function (it) {
    return primeiroNumero(it.campo, local_().prefixo) === alvo;
  });

  if (achados.length === 1) {
    abrirPeso(achados[0]);
  } else if (achados.length > 1) {
    S.candidatos = achados;
    S.numeroBuscado = val;
    irParaCandidatos();
  } else {
    aviso('avisoBusca', tSitio('naoExiste', { v: esc(val) }));
  }
}

function irParaCandidatos() {
  $('avisoCandidatos').innerHTML = t('candidatos.aviso', {
    numero: esc(S.numeroBuscado), n: S.candidatos.length
  });

  var caixa = $('listaCandidatos');
  caixa.innerHTML = '';
  S.candidatos.forEach(function (it, i) {
    var feito = jaRegistado(it.campo) ? '  •  ' + t('candidatos.jaRegistado') : '';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cartao';
    b.textContent = it.campo + feito + '\n' +
                    descreverLinha(it) + '  ·  ' + t('candidatos.saco') + ' ' + ouTraco(it.saco) + '\n' +
                    ouTraco(it.variedade) + '  ·  ' + ouTraco(it.plantas) + ' ' + t('candidatos.plantas');
    b.onclick = function () { abrirPeso(S.candidatos[i]); };
    caixa.appendChild(b);
  });

  pintarTudo();
  mostrar('ecraCandidatos');
}

function abrirPeso(item) {
  S.seleccionado = item;
  S.candidatos = [];
  S.porConfirmar = null;
  S.unidade = 'kg';
  aviso('avisoPeso', '');

  $('pesoLinha').textContent = item.campo;
  $('pesoSub').innerHTML = esc(descreverLinha(item)) + ' &nbsp;·&nbsp; ' +
                           t('peso.saco') + ' ' + esc(ouTraco(item.saco));
  $('metaMae').textContent = ouTraco(item.mae);
  $('metaVariedade').textContent = ouTraco(item.variedade);
  $('metaSaco').textContent = ouTraco(item.saco);
  $('metaPlantas').textContent = ouTraco(item.plantas);

  $('avisoJaRegistado').hidden = !jaRegistado(item.campo);
  $('avisoJaRegistado').textContent = tSitio('jaRegistado');

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

function gramas(peso, unidade) {
  return Math.round(unidade === 'kg' ? peso * 1000 : peso);
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
   * faixa e o texto do botão principal mudam, consoante haja algo a avisar
   * (mesmo formato do índia17/pesagem/India Rec). */
  var g = gramas(peso, S.unidade);
  var foraDaFaixa = (g > GRAMAS_MAX || g < GRAMAS_MIN);

  S.porConfirmar = { peso: peso, unidade: S.unidade };
  $('alvoConfirmar').innerHTML = '<b>' + esc(S.seleccionado.campo) + '</b> — ' + esc(rotuloMesAno(S.mes)) + ' — ' +
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
   * evento de teclado evita a corrida (o mesmo problema já resolvido no
   * índia17). */
  setTimeout(function () { $('dlgConfirmar').showModal(); }, 0);
}

function gravarPeso(peso, unidade) {
  var item = S.seleccionado;
  var ts = agoraLocal();

  enfileirar({
    tipo: 'criar',
    site: S.site,
    month: S.mes,
    line: item.campo,
    weight: peso,
    unit: unidade,
    tsLocal: ts
  }).then(function () {
    S.ultimoGravado = {
      linha: item.campo,
      valor: peso.toFixed(2),   // cru: quem mostra é que traduz o sinal decimal
      unidade: unidade,
      hora: ts.slice(11, 16),
      local: foraDeAlcance()
    };
    brinde(t(foraDeAlcance() ? 'brinde.guardado' : 'brinde.registado', { linha: item.campo }));
    S.porConfirmar = null;
    irParaBusca();
  });
}

// ------------------------------------------------------------- histórico

/** Um cartão de histórico: tocável quando o registo pode ser alterado por
 *  quem está a usar (autor ou administrador), estático quando não. É o mesmo
 *  desenho no histórico do mês e no do ecrã do local — só o carimbo muda. */
function cartaoDeRegisto(r, carimbo) {
  var selo = r.local ? '<span class="selo">' + t('historico.porEnviar') + '</span>' : '';

  if (podeAlterar(r.user)) {
    var quem = igual(r.user, S.nome) ? t('historico.voce') : r.user;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cartao' + (r.local ? ' porenviar' : '');
    b.innerHTML = esc(r.campo) + '    ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
                  '<span class="hs">' + esc(carimbo) + ' · ' + esc(quem) +
                  ' · ' + t('historico.toque') + '</span>';
    b.onclick = function () { abrirEdicao(r); };
    return b;
  }
  var d = document.createElement('div');
  d.className = 'histrow';
  d.innerHTML = esc(r.campo) + ' &nbsp;&nbsp; ' + esc(mostrarNumero(r.peso)) + ' ' + esc(r.unidade) + selo +
                '<span class="hs">' + esc(carimbo) + ' · ' + esc(r.user) +
                ' · ' + t('historico.trancado') + '</span>';
  return d;
}

function pintarHistorico() {
  var caixa = $('listaHistorico');
  caixa.innerHTML = '';

  var lista = registosVisiveis();
  if (!lista.length) {
    var v = document.createElement('div');
    v.className = 'empty';
    v.textContent = t('historico.vazio', { mes: rotuloMesAno(S.mes) });
    caixa.appendChild(v);
    return;
  }

  // todos os registos, do mais novo para o mais antigo
  var ultimos = lista.slice().reverse();
  ultimos.forEach(function (r) {
    caixa.appendChild(cartaoDeRegisto(r, String(r.ts || '').slice(5, 16)));
  });
}

function abrirEdicao(r) {
  S.edicao = r;
  S.regressar = S.ecra;
  S.unidadeEdicao = (r.unidade === 'g') ? 'g' : 'kg';
  aviso('avisoEditar', '');

  $('cabecalhoEditar').innerHTML = t('editar.cabecalho', { linha: esc(r.campo) });
  $('editarLinha').textContent = r.campo;
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
 *  mandar uma correcção ao servidor de uma linha que ele ainda não conhece. */
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
      // as coordenadas são as do registo, não as do ecrã: do histórico do
      // local corrige-se qualquer mês, e S.site/S.mes podem nem estar certos
      site: r.site || S.site,
      month: r.mes || S.mes,
      line: r.campo,
      weight: peso,
      unit: S.unidadeEdicao,
      tsLocal: agoraLocal(),
      alvo: { uuid: r.uuid || '', tsFull: r.ts || '', line: r.campo }
    });
  }

  accao.then(function () {
    brinde(t('brinde.actualizado', { linha: r.campo }));
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
        site: r.site || S.site,
        month: r.mes || S.mes,
        line: r.campo,
        tsLocal: agoraLocal(),
        alvo: { uuid: r.uuid || '', tsFull: r.ts || '', line: r.campo }
      });

  accao.then(function () {
    brinde(t('brinde.apagado', { linha: r.campo }));
    S.edicao = null;
    pintarBarra();
    voltarDaEdicao();
  });
}

function voltarDaEdicao() {
  // quem veio do histórico do ecrã do local volta para lá, não para a busca
  if (S.regressar === 'ecraLocal') { irParaLocal(); return; }
  if (S.regressar === 'ecraPeso' && S.seleccionado) {
    pintarTudo();
    $('avisoJaRegistado').hidden = !jaRegistado(S.seleccionado.campo);
    mostrar('ecraPeso');
  } else {
    irParaBusca();
  }
}

// ------------------------------------------------------------------ entrada

function continuarDoLocal() {
  var site = S.escolha;
  if (!site || !LOCAIS[site]) { aviso('avisoLocal', t('local.faltaLocal')); return; }
  if (LOCAIS[site].redirecionar) {
    var mesIndia = india17Mes($('selMes').value, Number($('selAno').value));
    location.href = LOCAIS[site].redirecionar + '?mes=' + encodeURIComponent(mesIndia);
    return;
  }
  var mes = $('selMes').value + '-' + String($('selAno').value).slice(-2);

  S.site = site;
  S.mes = mes;
  Def.set('site', site);
  Def.set('mes', mes);
  S.seleccionado = null;
  S.candidatos = [];
  S.ultimoGravado = null;
  S.edicao = null;

  aviso('avisoLocal', t('local.aCarregar'));

  carregarMaster(false).then(function () {
    aviso('avisoLocal', '');
    carregarRegistos(true);
    irParaBusca();
  }).catch(function () {
    aviso('avisoLocal', t('local.semCadastro'));
  });
}

/**
 * Tenta outra vez de vez em quando. Se não há nada para enviar mas o último
 * pedido falhou, faz uma leitura leve só para saber se a rede voltou — de
 * outro modo a barra "SEM CONEXÃO" ficaria presa para sempre.
 */
function voltarATentar() {
  if (pendentes().length) { enviarFila(); return; }
  if (S.semRede && S.mes) carregarRegistos(true).catch(function () {});
}

// ------------------------------------------------------------------ ligações

function ligarEventos() {
  // local e mês
  $('btnContinuar').onclick = continuarDoLocal;
  $('btnMenu2').onclick = irParaMenu;
  /* Só para Índia 17: o ano decide que meses existem (ver
   * INDIA17_MESES_POR_ANO) — nos outros locais o mês é sempre Jan..Dec,
   * independente do ano, por isso não precisa de reagir aqui. */
  $('selAno').onchange = function () {
    if (S.escolha === 'india17') popularMesesIndia17();
  };

  // busca
  $('inpBusca').onkeydown = function (e) {
    if (e.key === 'Enter') { buscar($('inpBusca').value); $('inpBusca').value = ''; }
  };
  $('btnHatena').onclick = buscarHatena;
  /* Aqui o local actual vem marcado: quem carrega neste botão costuma querer
   * mudar o mês, e já sabe onde está. À entrada do módulo é que não há nada
   * marcado. */
  $('btnMudarLocal').onclick = function () {
    S.ultimoGravado = null;
    S.escolha = S.site;
    irParaLocal();
  };
  $('btnMenu').onclick = irParaMenu;
  $('selMesAdmin').onchange = function () {
    S.mes = $('selMesAdmin').value;
    Def.set('mes', S.mes);
    S.ultimoGravado = null;
    carregarRegistos(true);
    irParaBusca();
  };

  // candidatos
  $('btnOutroNumero').onclick = function () { S.candidatos = []; irParaBusca(); };

  // peso
  $('inpPeso').onkeydown = function (e) { if (e.key === 'Enter') submeterPeso(); };
  $('btnRegistar').onclick = submeterPeso;
  $('btnCancelarPeso').onclick = function () { S.seleccionado = null; irParaBusca(); };
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
      linha: esc(r.campo), valor: esc(mostrarNumero(r.peso)), unidade: esc(r.unidade)
    });
    $('apagarLinha').textContent = r.campo;
    $('apagarSub').textContent = t('editar.lancado', {
      quando: String(r.ts || '').slice(5, 16), quem: ouTraco(r.user)
    });
    mostrar('ecraApagar');
  };
  $('btnApagarSim').onclick = apagarRegisto;
  $('btnApagarNao').onclick = function () { mostrar('ecraEditar'); };

  $('btnEnviarAgora').onclick = forcarEnvio;

  // rede
  window.addEventListener('online', function () { pintarBarra(); voltarATentar(); });
  window.addEventListener('offline', pintarBarra);
  setInterval(voltarATentar, INTERVALO_TENTATIVA);
  // Reabrir a aplicação (ou voltar a esta aba) pode ter passado por uma zona
  // com rede sem o temporizador ter tido oportunidade de correr — em Android/
  // iOS os temporizadores ficam suspensos com a página em segundo plano.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) voltarATentar();
  });
  window.addEventListener('pageshow', voltarATentar);
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
  S.site = Def.get('site', 'lines');
  if (!LOCAIS[S.site]) S.site = 'lines';
  S.nome = Def.get('nome', '');
  S.mes = Def.get('mes', '');

  ['lines', 'blocks'].forEach(function (k) {
    var g = Def.get('master_' + k, '');
    if (g) { try { S.master[k] = JSON.parse(g); } catch (e) {} }
  });

  guardarConfigParaOSW();

  /* Quem chega aqui sem ter passado pela entrada comum (um atalho antigo, por
   * exemplo) é mandado para lá; é lá que se pede o código e o nome. */
  if (!temCodigo() || !S.nome) { location.replace('../index.html'); return; }

  lerFila().then(function () {
    pintarBarra();
    if (pendentes().length) pedirSincronizacaoEmSegundoPlano();
    if (navigator.onLine) enviarFila();

    /* Começa-se sempre pela escolha do local, sem nada marcado. Antes ficava o
     * local da última vez e o ecrã seguia direito para a busca — era fácil
     * lançar no Tanheia o que se tinha pesado no 7 de Abril. O mês continua a
     * vir preenchido com o último (ou o corrente): esse não engana ninguém. */
    S.escolha = null;
    irParaLocal();
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
