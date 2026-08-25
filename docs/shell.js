/* JatLog — entrada comum aos dois registos.
 *
 *   activação -> nome (+ administrador) -> menu -> colheita/ ou india/
 *
 * Esta página não regista nada: só guarda quem está a usar o aparelho e manda
 * a pessoa para o módulo certo. Os módulos vivem em pastas separadas porque
 * cada um tem o seu ecrã, os seus textos e a sua fila de envio; juntá-los num
 * único documento obrigaria a renomear metade das funções dos dois.
 *
 * O que é partilhado fica em localStorage com o prefixo 'jat.':
 *   token, nome, idioma, admin, adminPw, adminAte
 * Os módulos lêem exactamente estas chaves (ver Def em colheita/app.js e
 * india/app.js), por isso o código de activação e o nome pedem-se uma só vez.
 */

var CFG_COLHEITA = window.JATLOG_CONFIG || {};
var CFG_INDIA = window.INDIAREC_CONFIG || {};
var CFG_PESAGEM = window.PESAGEM_CONFIG || {};

/* O modo administrador expira sozinho: uma fila por enviar com correcções de
 * outra pessoa deixa de poder subir se a permissão desaparecer a meio, por
 * isso guarda-se com prazo em vez de se perder ao fechar a aplicação. */
var VALIDADE_ADMIN = 12 * 60 * 60 * 1000;

var S = { ecra: '', idioma: 'pt', nome: '' };

var $ = function (id) { return document.getElementById(id); };

// ----------------------------------------------------------- armazenamento

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem('jat.' + k); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem('jat.' + k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('jat.' + k); } catch (e) {} }
};

/* A senha do administrador vale para os dois módulos: o mesmo valor está nas
 * propriedades dos dois scripts (ADMIN_PASSWORD). Se um dia deixarem de ser
 * iguais, é aqui e no Codigo.gs de cada um que se acerta. */
var Admin = {
  activo: function () {
    if (Def.get('admin', '') !== '1') return false;
    if (Date.now() > Number(Def.get('adminAte', 0))) { Admin.sair(); return false; }
    return true;
  },
  pw: function () { return Admin.activo() ? Def.get('adminPw', '') : ''; },
  entrar: function (pw) {
    Def.set('admin', '1');
    Def.set('adminPw', pw);
    Def.set('adminAte', String(Date.now() + VALIDADE_ADMIN));
    guardarConfigParaOSW();
  },
  sair: function () {
    Def.del('admin'); Def.del('adminPw'); Def.del('adminAte');
    guardarConfigParaOSW();
  }
};

// -------------------------------------------------------------- IndexedDB
/* Duas bases, uma por módulo, tal como cada um a criou. Aqui só se lê (para
 * contar o que falta enviar) e se escreve a configuração que o Service Worker
 * precisa para enviar sozinho. */

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

function basePesagem() {
  return abrirBase('pesagem', 1, function (d) {
    if (!d.objectStoreNames.contains('envios')) {
      var s = d.createObjectStore('envios', { keyPath: 'uuid' });
      s.createIndex('estado', 'estado');
    }
  });
}

function lerTudo(base, loja) {
  return new Promise(function (ok, mau) {
    var tx = base.transaction(loja, 'readonly');
    var r = tx.objectStore(loja).getAll();
    tx.oncomplete = function () { ok(r.result || []); };
    tx.onerror = function () { mau(tx.error); };
    tx.onabort = function () { mau(tx.error); };
  });
}

/**
 * O Service Worker não chega ao localStorage, por isso o código de activação e
 * a senha ficam também na store 'config' da base 'jatlog' — é de lá que ele os
 * lê para enviar as duas filas com a aplicação fechada.
 */
function guardarConfigParaOSW() {
  baseColheita().then(function (d) {
    return new Promise(function (ok, mau) {
      var tx = d.transaction('config', 'readwrite');
      var s = tx.objectStore('config');
      s.put({ k: 'token', v: Def.get('token', '') });
      s.put({ k: 'adminPw', v: Admin.activo() ? Def.get('adminPw', '') : '' });
      tx.oncomplete = function () { ok(); };
      tx.onerror = function () { mau(tx.error); };
    });
  }).catch(function () {});
}

// --------------------------------------------------------------- idiomas

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
  if (S.ecra === 'ecraMenu') pintarMenu();
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

// ----------------------------------------------------------------- ajudantes

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  $('idiomas').hidden = false;
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------- rede

/** Pergunta ao Apps Script indicado. Rejeita se não houver rede. */
function pedirGet(endpoint, params) {
  if (!navigator.onLine || !endpoint) return Promise.reject(new Error('sem rede'));
  var token = Def.get('token', '');
  if (!token) return Promise.reject(new Error('sem código'));

  var q = ['token=' + encodeURIComponent(token)];
  for (var k in params) q.push(k + '=' + encodeURIComponent(params[k]));

  return fetch(endpoint + '?' + q.join('&'), { redirect: 'follow' })
    .then(function (r) { return r.json(); });
}

/* ------------------------------------------------- código de activação
 *
 * O código não é uma senha: é o que cada envio leva consigo. Se estiver mal
 * escrito, a aplicação funciona toda — regista, guarda, mostra a fila — e o
 * servidor recusa tudo em silêncio. Foi o que aconteceu a 13/08/2026: treze
 * registos ficaram parados um dia inteiro por causa de uma letra.
 *
 * Por isso pergunta-se ao servidor logo na activação, e não só no primeiro
 * envio. Usa-se 'action=admin' com a senha vazia porque é a única pergunta que
 * os dois scripts respondem sem abrir a folha de cálculo: aqui só interessa
 * saber se o código passou a porta, e a resposta é sempre {ok:false} quando não
 * passou.
 *
 * Distinguir "código errado" de "servidor fora do ar" é o ponto delicado: um
 * erro de HTTP ou uma resposta que não é JSON não dizem nada sobre o código, e
 * tratá-los como recusa deixaria o aparelho preso no ecrã de activação sem
 * motivo. Nesses casos devolve-se 'sem-resposta'.
 */

var MODULOS = [
  { chave: 'colheita', endpoint: CFG_COLHEITA.ENDPOINT, nome: 'menu.colheita' },
  { chave: 'india', endpoint: CFG_INDIA.ENDPOINT, nome: 'menu.india' },
  { chave: 'pesagem', endpoint: CFG_PESAGEM.ENDPOINT, nome: 'menu.pesagem' }
];

function provarCodigo(endpoint, codigo) {
  if (!endpoint) return Promise.resolve('aceite');
  var url = endpoint + '?token=' + encodeURIComponent(codigo) + '&action=admin&pw=';
  return fetch(url, { redirect: 'follow' })
    .then(function (r) {
      // avaria do servidor não é código errado: não sabemos, logo não julgamos
      if (!r.ok) throw new Error('servidor ' + r.status);
      return r.json();
    })
    .then(function (j) { return (j && j.ok) ? 'aceite' : 'recusado'; });
}

/**
 * Pergunta aos dois scripts. Devolve {estado, modulos} onde estado é
 * 'aceite' | 'recusado' | 'sem-resposta'. Basta um recusar para ser recusa:
 * um código que só serve metade da aplicação deixa a outra metade a acumular
 * registos que nunca sobem — exactamente o que se quer evitar.
 */
function verificarCodigo(codigo) {
  return Promise.all(MODULOS.map(function (m) {
    return provarCodigo(m.endpoint, codigo)
      .catch(function () { return 'sem-resposta'; })
      .then(function (r) { return { modulo: m, resultado: r }; });
  })).then(function (rs) {
    var maus = rs.filter(function (r) { return r.resultado === 'recusado'; });
    var mudos = rs.filter(function (r) { return r.resultado === 'sem-resposta'; });
    if (maus.length) {
      return {
        estado: 'recusado',
        todos: maus.length === rs.length,
        modulos: maus.map(function (r) { return t(r.modulo.nome); }).join(' / ')
      };
    }
    if (mudos.length) return { estado: 'sem-resposta' };
    return { estado: 'aceite' };
  });
}

function textoRecusa(r) {
  return r.todos ? t('activacao.recusado') : t('activacao.recusadoNum', { modulos: r.modulos });
}

function guardarCodigo(codigo, porConfirmar) {
  Def.set('token', codigo);
  if (porConfirmar) Def.set('tokenPorVerificar', '1');
  else Def.del('tokenPorVerificar');
  guardarConfigParaOSW();
}

/**
 * Confirma em segundo plano o código já guardado, a cada arranque da entrada.
 * Corre também nos aparelhos activados antes desta verificação existir — são
 * precisamente os que podem ter um código errado sem ninguém saber. Só se age
 * quando o servidor recusa mesmo; sem rede fica para a próxima vez.
 */
function confirmarCodigoGuardado() {
  var codigo = Def.get('token', '');
  if (!codigo) return;
  verificarCodigo(codigo).then(function (r) {
    if (r.estado === 'aceite') { Def.del('tokenPorVerificar'); return; }
    if (r.estado !== 'recusado') return;
    Def.set('tokenPorVerificar', '1');
    irParaActivacao();
    aviso('avisoActivacao', textoRecusa(r));
  }).catch(function () {});
}

/**
 * A senha é a mesma nos dois scripts, mas cada um tem a sua propriedade. Basta
 * um deles reconhecer para se entrar em modo administrador — o outro decide
 * por si quando os registos lá chegarem.
 */
function verificarAdmin(pw) {
  return pedirGet(CFG_COLHEITA.ENDPOINT, { action: 'admin', pw: pw })
    .then(function (j) {
      if (j && j.admin) return true;
      return pedirGet(CFG_INDIA.ENDPOINT, { action: 'admin', pw: pw })
        .then(function (k) { return !!(k && k.admin); })
        .catch(function () { return false; });
    })
    .then(function (ok) {
      if (ok) return true;
      return pedirGet(CFG_PESAGEM.ENDPOINT, { action: 'admin', pw: pw })
        .then(function (m) { return !!(m && m.admin); })
        .catch(function () { return false; });
    });
}

// -------------------------------------------------------------------- ecrãs

function irParaActivacao() {
  aviso('avisoActivacao', '');
  $('estadoActivacao').hidden = true;
  $('btnActivar').disabled = false;
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

function irParaMenu() {
  pintarMenu();
  mostrar('ecraMenu');
  contarFilas();
}

function pintarMenu() {
  $('subMenu').innerHTML = t(Admin.activo() ? 'menu.usuarioAdmin' : 'menu.usuario',
                             { nome: esc(S.nome) });
  $('btnSairAdmin2').hidden = !Admin.activo();
}

/** Quantos registos de cada módulo ainda não subiram — visível já no menu. */
function contarFilas() {
  function contar(promessaBase, id) {
    return promessaBase
      .then(function (d) { return lerTudo(d, 'envios'); })
      .then(function (l) {
        var n = l.filter(function (e) { return e.estado === 'pendente'; }).length;
        var el = $(id);
        el.hidden = n === 0;
        el.textContent = t('menu.porEnviar', { n: n });
      })
      .catch(function () { $(id).hidden = true; });
  }
  contar(baseColheita(), 'filaColheita');
  contar(baseIndia(), 'filaIndia');
  contar(basePesagem(), 'filaPesagem');
}

// ------------------------------------------------------------------ entrada

function entrar() {
  var nome = $('inpNome').value.trim();
  var senha = $('inpSenha').value.trim();
  aviso('avisoEntrada', '');

  function seguir() {
    S.nome = nome;
    Def.set('nome', nome);
    irParaMenu();
  }

  if (!Admin.activo() && senha) {
    // com rede confirmamos já; sem rede aceitamos e o servidor decide no envio
    if (navigator.onLine) {
      verificarAdmin(senha).then(function (ok) {
        if (!ok) { aviso('avisoEntrada', t('entrada.senhaErrada')); return; }
        Admin.entrar(senha);
        if (!nome) { aviso('avisoEntrada', t('entrada.faltaNome')); return; }
        seguir();
      }).catch(function () {
        aviso('avisoEntrada', t('entrada.semVerificar'));
      });
      return;
    }
    Admin.entrar(senha);
    brinde(t('entrada.senhaDepois'), true);
  }

  if (!nome) { aviso('avisoEntrada', t('entrada.faltaNome')); return; }
  seguir();
}

// ------------------------------------------------------------------ ligações

function ligarEventos() {
  $('btnActivar').onclick = function () {
    var botao = $('btnActivar');
    if (botao.disabled) return;
    var v = $('inpCodigo').value.trim();
    if (!v) { aviso('avisoActivacao', t('activacao.falta')); return; }

    aviso('avisoActivacao', '');
    $('estadoActivacao').hidden = false;
    botao.disabled = true;

    verificarCodigo(v).then(function (r) {
      botao.disabled = false;
      $('estadoActivacao').hidden = true;

      // um código recusado não se guarda: o aparelho não sai daqui
      if (r.estado === 'recusado') { aviso('avisoActivacao', textoRecusa(r)); return; }

      // sem resposta guarda-se na mesma — ninguém fica parado por falta de rede
      guardarCodigo(v, r.estado !== 'aceite');
      if (r.estado !== 'aceite') brinde(t('activacao.semRede'), true);
      irParaEntrada();
    });
  };
  $('inpCodigo').onkeydown = function (e) { if (e.key === 'Enter') $('btnActivar').click(); };

  $('btnComecar').onclick = entrar;
  $('inpNome').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
  $('inpSenha').onkeydown = function (e) { if (e.key === 'Enter') entrar(); };
  $('btnSairAdmin').onclick = function () { Admin.sair(); irParaEntrada(); };

  $('btnSairAdmin2').onclick = function () { Admin.sair(); pintarMenu(); };
  $('btnTrocarUsuario').onclick = function () {
    S.nome = ''; Def.del('nome'); irParaEntrada();
  };
  $('btnDesactivar').onclick = function () {
    if (!confirm(t('menu.confirmarDesactivar'))) return;
    Def.del('token');
    Def.del('tokenPorVerificar');
    guardarConfigParaOSW();
    irParaActivacao();
  };

  // ao voltar de um módulo (ou do fundo do ecrã) os contadores podem ter mudado
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.ecra === 'ecraMenu') contarFilas();
  });
  window.addEventListener('pageshow', function () {
    if (S.ecra === 'ecraMenu') contarFilas();
  });
}

// ------------------------------------------------------------------ arranque

function arrancar() {
  ligarEventos();
  definirIdioma(Def.get('idioma', 'pt'));
  S.nome = Def.get('nome', '');
  guardarConfigParaOSW();

  if (!Def.get('token', '')) { irParaActivacao(); return; }

  if (!S.nome) irParaEntrada();
  else irParaMenu();

  // não trava o arranque: se o servidor recusar, o ecrã muda sozinho a seguir
  confirmarCodigoGuardado();
}

/* O Service Worker é um só para a aplicação toda (âmbito './'), por isso
 * apanha também as páginas de colheita/ e india/. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {});
  });
}

arrancar();
