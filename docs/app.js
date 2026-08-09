/* JatLog offline — registo de colheita que funciona sem rede.
 *
 * Fluxo (o mesmo da aplicação Streamlit):
 *   activação -> nome -> local + mês -> busca -> (candidatos) -> peso -> histórico
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
var INTERVALO_TENTATIVA = 60000;

var GRAMAS_MAX = 30000;   // acima disto pede confirmação
var GRAMAS_MIN = 5;       // abaixo disto também

var MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Acrescentar um local aqui (e no Codigo.gs) basta para ele aparecer no menu. */
var LOCAIS = {
  lines: {
    rotulo: 'Tanheia (Linhas)', curto: 'Tanheia',
    campo: 'Line Number', prefixo: 'L',
    plural: 'linhas', unico: 'Linha única',
    rotuloBusca: 'Número inicial da linha',
    naoExiste: 'Linha {v} não existe no cadastro.',
    jaRegistado: 'Esta linha já tem um registro neste mês. ' +
                 'Um novo lançamento será somado ao histórico.'
  },
  blocks: {
    rotulo: '7 de Abril (Blocos)', curto: '7 de Abril',
    campo: 'Block', prefixo: '',
    plural: 'blocos', unico: 'Bloco único',
    rotuloBusca: 'Número inicial do bloco',
    naoExiste: 'Bloco {v} não existe no cadastro.',
    jaRegistado: 'Este bloco já tem um registro neste mês. ' +
                 'Um novo lançamento será somado ao histórico.'
  }
};

// ------------------------------------------------------------------- estado

var S = {
  ecra: '',
  site: 'lines',
  nome: '',
  mes: '',
  master: {},          // site -> [{campo, saco, variedade, plantas, mae}]
  registos: [],        // o que o servidor sabe do site+mês actual
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

// ----------------------------------------------------------- armazenamento

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem('jatlog.' + k); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem('jatlog.' + k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('jatlog.' + k); } catch (e) {} }
};

var DB = (function () {
  var bd = null;

  function abrir() {
    return new Promise(function (ok, mau) {
      if (bd) return ok(bd);
      var p = indexedDB.open('jatlog', 1);
      p.onupgradeneeded = function () {
        var d = p.result;
        if (!d.objectStoreNames.contains('envios')) {
          d.createObjectStore('envios', { keyPath: 'uuid' });
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

  return {
    guardar: function (e) { return comStore('readwrite', function (s) { return s.put(e); }); },
    apagar: function (id) { return comStore('readwrite', function (s) { return s.delete(id); }); },
    todos: function () { return comStore('readonly', function (s) { return s.getAll(); }); }
  };
})();

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
  activo: function () { return Def.get('admin', '') === '1'; },
  pw: function () { return Def.get('adminPw', ''); },
  entrar: function (pw) { Def.set('admin', '1'); Def.set('adminPw', pw); },
  sair: function () { Def.del('admin'); Def.del('adminPw'); }
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

/** Converte o texto escrito pelo utilizador num número (aceita vírgula). */
function paraNumero(txt) {
  var s = String(txt === null || txt === undefined ? '' : txt)
    .normalize('NFKC').trim().replace(',', '.');
  if (!s) return NaN;
  return Number(s);
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

  var comContexto = ['ecraBusca', 'ecraCandidatos', 'ecraPeso', 'ecraConfirmar',
                     'ecraEditar', 'ecraApagar'];
  $('topo').hidden = comContexto.indexOf(id) < 0;

  var comHistorico = ['ecraBusca', 'ecraCandidatos', 'ecraPeso'];
  $('historico').hidden = comHistorico.indexOf(id) < 0;

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
  var L = local_();
  var n = numerosDoCampo(item.campo, L.prefixo);
  if (n.length >= 2) {
    return (n[n.length - 1] - n[0] + 1) + ' ' + L.plural + ' (' + n[0] + '-' + n[n.length - 1] + ')';
  }
  return L.unico;
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
    b.textContent = p
      ? 'SEM CONEXÃO — ' + p + ' registro(s) guardado(s) no aparelho'
      : 'SEM CONEXÃO — pode continuar a registar';
  } else if (S.aEnviar) {
    b.hidden = false;
    b.classList.add('enviando');
    b.textContent = 'A enviar…';
  } else if (p) {
    b.hidden = false;
    b.classList.add('enviando');
    b.textContent = p + ' registro(s) por enviar';
  } else if (maus) {
    b.hidden = false;
    b.textContent = maus + ' registro(s) recusado(s) pelo servidor';
  } else {
    b.hidden = true;
  }
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
    return carregarRegistos(true).catch(function () {});
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
        if (bons) brinde(bons === 1 ? '1 registro enviado' : bons + ' registros enviados');
        if (maus) brinde(maus + ' registro(s) recusado(s)', true);
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

// ------------------------------------------------------------------- ecrãs

function pintarTopo() {
  var cracha = Admin.activo() ? '<span class="badge-adm">ADMIN</span>' : '';
  $('topoNome').innerHTML = esc(S.nome) + cracha;
  $('topoMes').textContent = S.mes + ' · ' + local_().curto;
  $('topoNum').textContent = String(registosVisiveis().length);
}

function pintarTudo() {
  pintarTopo();
  pintarHistorico();
  pintarBarra();
}

function irParaActivacao() {
  aviso('avisoActivacao', '');
  $('inpCodigo').value = '';
  mostrar('ecraActivacao');
  setTimeout(function () { $('inpCodigo').focus(); }, 150);
}

function irParaEntrada() {
  aviso('avisoEntrada', '');
  $('inpNome').value = '';
  $('inpSenha').value = '';
  $('blocoAdmin').open = false;
  var adm = Admin.activo();
  $('avisoAdminActivo').hidden = !adm;
  $('btnSairAdmin').hidden = !adm;
  $('blocoAdmin').hidden = adm;
  mostrar('ecraEntrada');
  setTimeout(function () { $('inpNome').focus(); }, 150);
}

function irParaLocal() {
  aviso('avisoLocal', '');
  $('subLocal').innerHTML = 'Usuário: <b>' + esc(S.nome) + '</b>' +
                            (Admin.activo() ? ' · administrador' : '');

  var sel = $('selLocal');
  sel.innerHTML = '';
  Object.keys(LOCAIS).forEach(function (k) {
    var o = document.createElement('option');
    o.value = k; o.textContent = LOCAIS[k].rotulo;
    sel.appendChild(o);
  });
  sel.value = S.site;

  var agora = new Date();
  var anos = [agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1];
  var selM = $('selMes'), selA = $('selAno');
  selM.innerHTML = ''; selA.innerHTML = '';
  MESES.forEach(function (m) {
    var o = document.createElement('option'); o.value = m; o.textContent = m; selM.appendChild(o);
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

  mostrar('ecraLocal');
}

function irParaBusca() {
  aviso('avisoBusca', '');
  $('rotuloBusca').textContent = local_().rotuloBusca;
  $('inpBusca').value = '';

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
      el.value = o; el.textContent = o;
      sel.appendChild(el);
    });
    sel.value = S.mes;
  }

  if (S.ultimoGravado) {
    var g = S.ultimoGravado;
    aviso('avisoGravado', '<span class="tick">✓</span><b>' + esc(g.linha) + '</b> — ' +
          esc(g.valor) + ' ' + esc(g.unidade) + ' salvo às ' + esc(g.hora) +
          (g.local ? ' (no aparelho)' : ''));
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
  aviso('avisoBusca', esc(maus.length) + ' registro(s) recusado(s) pelo servidor. ' +
        'Primeiro erro: ' + esc(primeiro.erro || '') +
        ' <button class="btn ligacao" id="btnRetentar" style="display:inline;width:auto;' +
        'margin:0 0 0 6px">Tentar de novo</button>');
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

function buscar(valorBruto) {
  var L = local_();
  var val = String(valorBruto || '').normalize('NFKC').trim();
  aviso('avisoBusca', '');
  if (!val) return;
  S.ultimoGravado = null;
  aviso('avisoGravado', '');

  if (!/^\d+$/.test(val)) {
    aviso('avisoBusca', 'Digite apenas números.');
    return;
  }

  var lista = S.master[S.site] || [];
  if (!lista.length) {
    aviso('avisoBusca', 'O cadastro ainda não foi carregado neste aparelho. ' +
                        'Ligue-se à internet uma vez para o descarregar.');
    return;
  }

  var alvo = parseInt(val, 10);
  var achados = lista.filter(function (it) {
    return primeiroNumero(it.campo, L.prefixo) === alvo;
  });

  if (achados.length === 1) {
    abrirPeso(achados[0]);
  } else if (achados.length > 1) {
    S.candidatos = achados;
    S.numeroBuscado = val;
    irParaCandidatos();
  } else {
    aviso('avisoBusca', L.naoExiste.replace('{v}', esc(val)));
  }
}

function irParaCandidatos() {
  $('avisoCandidatos').innerHTML = 'O número <b>' + esc(S.numeroBuscado) + '</b> aparece em ' +
    S.candidatos.length + ' registros. Escolha em qual deles você vai lançar o peso.';

  var caixa = $('listaCandidatos');
  caixa.innerHTML = '';
  S.candidatos.forEach(function (it, i) {
    var feito = jaRegistado(it.campo) ? '  •  JÁ REGISTRADO' : '';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cartao';
    b.textContent = it.campo + feito + '\n' +
                    descreverLinha(it) + '  ·  Saco ' + ouTraco(it.saco) + '\n' +
                    ouTraco(it.variedade) + '  ·  ' + ouTraco(it.plantas) + ' plantas';
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
  $('pesoSub').innerHTML = esc(descreverLinha(item)) + ' &nbsp;·&nbsp; Saco ' + esc(ouTraco(item.saco));
  $('metaMae').textContent = ouTraco(item.mae);
  $('metaVariedade').textContent = ouTraco(item.variedade);
  $('metaSaco').textContent = ouTraco(item.saco);
  $('metaPlantas').textContent = ouTraco(item.plantas);

  $('avisoJaRegistado').hidden = !jaRegistado(item.campo);
  $('avisoJaRegistado').textContent = local_().jaRegistado;

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
    aviso('avisoPeso', 'Valor inválido. Use apenas números, ex: 1.5');
    return;
  }
  if (peso <= 0) {
    aviso('avisoPeso', 'O peso deve ser maior que zero.');
    return;
  }

  var g = gramas(peso, S.unidade);
  if (g > GRAMAS_MAX || g < GRAMAS_MIN) {
    S.porConfirmar = { peso: peso, unidade: S.unidade };
    $('avisoConfirmar').innerHTML = 'O valor <b>' + peso.toFixed(2) + ' ' + S.unidade +
      '</b> está fora da faixa esperada. Confirme se está correto antes de registrar.';
    $('confirmarLinha').textContent = S.seleccionado.campo;
    $('confirmarValor').textContent = peso.toFixed(2) + ' ' + S.unidade;
    mostrar('ecraConfirmar');
    return;
  }

  gravarPeso(peso, S.unidade);
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
      valor: peso.toFixed(2),
      unidade: unidade,
      hora: ts.slice(11, 16),
      local: !navigator.onLine
    };
    brinde(navigator.onLine ? item.campo + ' registrado'
                            : item.campo + ' guardado no aparelho');
    S.porConfirmar = null;
    irParaBusca();
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
    v.textContent = 'Nenhum registro em ' + S.mes + ' ainda.';
    caixa.appendChild(v);
    return;
  }

  // os oito mais recentes, do mais novo para o mais antigo
  var ultimos = lista.slice(-8).reverse();
  ultimos.forEach(function (r) {
    var carimbo = String(r.ts || '').slice(5, 16);
    var selo = r.local ? '<span class="selo">POR ENVIAR</span>' : '';

    if (podeAlterar(r.user)) {
      var quem = igual(r.user, S.nome) ? 'você' : r.user;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cartao' + (r.local ? ' porenviar' : '');
      b.innerHTML = esc(r.campo) + '    ' + esc(r.peso) + ' ' + esc(r.unidade) + selo +
                    '<span class="hs">' + esc(carimbo) + ' · ' + esc(quem) +
                    ' · toque para corrigir</span>';
      b.onclick = function () { abrirEdicao(r); };
      caixa.appendChild(b);
    } else {
      var d = document.createElement('div');
      d.className = 'histrow';
      d.innerHTML = esc(r.campo) + ' &nbsp;&nbsp; ' + esc(r.peso) + ' ' + esc(r.unidade) + selo +
                    '<span class="hs">' + esc(carimbo) + ' · ' + esc(r.user) +
                    ' · 🔒 só o autor ou o admin</span>';
      caixa.appendChild(d);
    }
  });
}

function abrirEdicao(r) {
  S.edicao = r;
  S.regressar = S.ecra;
  S.unidadeEdicao = (r.unidade === 'g') ? 'g' : 'kg';
  aviso('avisoEditar', '');

  $('cabecalhoEditar').innerHTML = 'Corrigindo o peso registrado para <b>' +
                                   esc(r.campo) + '</b>. Ajuste o valor e salve.';
  $('editarLinha').textContent = r.campo;
  $('editarSub').textContent = 'Lançado em ' + String(r.ts || '').slice(5, 16) +
                               ' por ' + ouTraco(r.user);
  $('inpEditar').value = r.peso;
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
  if (!isFinite(peso)) { aviso('avisoEditar', 'Valor inválido. Use apenas números, ex: 1.5'); return; }
  if (peso <= 0) { aviso('avisoEditar', 'O peso deve ser maior que zero.'); return; }
  if (!podeAlterar(r.user)) {
    aviso('avisoEditar', 'Somente o autor do registro ou o administrador pode alterá-lo.');
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
      site: S.site,
      month: S.mes,
      line: r.campo,
      weight: peso,
      unit: S.unidadeEdicao,
      tsLocal: agoraLocal(),
      alvo: { uuid: r.uuid || '', tsFull: r.ts || '', line: r.campo }
    });
  }

  accao.then(function () {
    brinde(r.campo + ' atualizado');
    S.edicao = null;
    pintarBarra();
    voltarDaEdicao();
  });
}

function apagarRegisto() {
  var r = S.edicao;
  if (!r) return;
  if (!podeAlterar(r.user)) {
    aviso('avisoEditar', 'Somente o autor do registro ou o administrador pode alterá-lo.');
    mostrar('ecraEditar');
    return;
  }

  var pendente = envioPendenteDe(r);
  var accao = pendente
    ? DB.apagar(pendente.uuid).then(lerFila)
    : enfileirar({
        tipo: 'apagar',
        site: S.site,
        month: S.mes,
        line: r.campo,
        tsLocal: agoraLocal(),
        alvo: { uuid: r.uuid || '', tsFull: r.ts || '', line: r.campo }
      });

  accao.then(function () {
    brinde(r.campo + ' excluído');
    S.edicao = null;
    pintarBarra();
    voltarDaEdicao();
  });
}

function voltarDaEdicao() {
  if (S.regressar === 'ecraPeso' && S.seleccionado) {
    pintarTudo();
    $('avisoJaRegistado').hidden = !jaRegistado(S.seleccionado.campo);
    mostrar('ecraPeso');
  } else {
    irParaBusca();
  }
}

// ------------------------------------------------------------------ entrada

function entrar() {
  var nome = $('inpNome').value.trim();
  var senha = $('inpSenha').value.trim();
  aviso('avisoEntrada', '');

  var jaAdmin = Admin.activo();

  function seguir() {
    S.nome = nome;
    Def.set('nome', nome);
    irParaLocal();
  }

  if (!jaAdmin && senha) {
    // com rede confirmamos já; sem rede aceitamos e o servidor decide no envio
    if (navigator.onLine && configurado()) {
      pedirGet({ action: 'admin', pw: senha }).then(function (j) {
        if (!j.admin) {
          aviso('avisoEntrada', 'Senha do administrador incorreta.');
          return;
        }
        Admin.entrar(senha);
        if (!nome) { aviso('avisoEntrada', 'Informe seu nome.'); irParaEntrada(); return; }
        seguir();
      }).catch(function () {
        aviso('avisoEntrada', 'Não foi possível verificar a senha agora. Tente com internet.');
      });
      return;
    }
    Admin.entrar(senha);
    brinde('Sem rede: a senha será verificada no envio', true);
  }

  if (!nome) { aviso('avisoEntrada', 'Informe seu nome.'); return; }
  seguir();
}

function continuarDoLocal() {
  var site = $('selLocal').value;
  var mes = $('selMes').value + '-' + String($('selAno').value).slice(-2);

  S.site = site;
  S.mes = mes;
  Def.set('site', site);
  Def.set('mes', mes);
  S.seleccionado = null;
  S.candidatos = [];
  S.ultimoGravado = null;
  S.edicao = null;

  aviso('avisoLocal', 'A carregar o cadastro…');

  carregarMaster(false).then(function () {
    aviso('avisoLocal', '');
    carregarRegistos(true);
    irParaBusca();
  }).catch(function () {
    aviso('avisoLocal', 'Não foi possível descarregar o cadastro deste local e ainda não ' +
                        'há cópia neste aparelho. Ligue-se à internet uma vez.');
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
  // activação
  $('btnActivar').onclick = function () {
    var v = $('inpCodigo').value.trim();
    if (!v) { aviso('avisoActivacao', 'Digite o código de activação.'); return; }
    Def.set('token', v);
    aviso('avisoActivacao', '');
    irParaEntrada();
  };
  $('inpCodigo').onkeydown = function (e) { if (e.key === 'Enter') $('btnActivar').click(); };

  // entrada
  $('btnComecar').onclick = entrar;
  $('inpNome').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
  $('inpSenha').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
  $('btnSairAdmin').onclick = function () { Admin.sair(); irParaEntrada(); };

  // local e mês
  $('btnContinuar').onclick = continuarDoLocal;
  $('btnTrocarUsuario2').onclick = function () { S.nome = ''; Def.del('nome'); irParaEntrada(); };

  // busca
  $('inpBusca').onkeydown = function (e) {
    if (e.key === 'Enter') { buscar($('inpBusca').value); $('inpBusca').value = ''; }
  };
  $('btnMudarLocal').onclick = function () { S.ultimoGravado = null; irParaLocal(); };
  $('btnTrocarUsuario').onclick = function () {
    S.nome = ''; Def.del('nome'); S.ultimoGravado = null; irParaEntrada();
  };
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
    $('avisoApagarTexto').innerHTML = 'Excluir definitivamente o registro de <b>' +
      esc(r.campo) + '</b> (' + esc(r.peso) + ' ' + esc(r.unidade) + ')? ' +
      'Esta ação não pode ser desfeita.';
    $('apagarLinha').textContent = r.campo;
    $('apagarSub').textContent = 'Lançado em ' + String(r.ts || '').slice(5, 16) +
                                 ' por ' + ouTraco(r.user);
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

  S.site = Def.get('site', 'lines');
  if (!LOCAIS[S.site]) S.site = 'lines';
  S.nome = Def.get('nome', '');
  S.mes = Def.get('mes', '');

  ['lines', 'blocks'].forEach(function (k) {
    var g = Def.get('master_' + k, '');
    if (g) { try { S.master[k] = JSON.parse(g); } catch (e) {} }
  });

  lerFila().then(function () {
    pintarBarra();
    if (navigator.onLine) enviarFila();

    if (!temCodigo()) { irParaActivacao(); return; }
    if (!S.nome) { irParaEntrada(); return; }
    if (!S.mes) { irParaLocal(); return; }

    var g = Def.get(chaveLog(), '');
    if (g) { try { S.registos = JSON.parse(g); } catch (e) {} }
    irParaBusca();
    carregarRegistos(true);
    actualizarSeVazio(S.site);
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {});
  });
}

arrancar();
