# -*- coding: utf-8 -*-
"""Leva o India Rec (repo autonomo, commit cff4ef3) para dentro do JatLog.

O modulo `docs/india/` do JatLog e uma copia do India Rec com uma dezena de
adaptacoes bem localizadas: a entrada (codigo + nome) passou para o menu comum,
o administrador so se le, e o Service Worker e o da raiz. Este script volta a
aplica-las por cima da versao nova, em vez de as reescrever a mao.

Cada substituicao e verificada: se o texto de partida nao aparecer exactamente
uma vez, o script pára. Assim uma alteracao futura no India Rec que mexa nestes
sitios da erro em vez de passar despercebida.
"""
import io
import os
import subprocess
import sys

IR = r'c:\Users\kazdr\OneDrive - 河村研究室\Claude_general\projects\jatmed_field_app'
JL = r'c:\Users\kazdr\OneDrive - 河村研究室\Claude_general\projects\jatlog_offline'
# Commit do India Rec de onde se traz a versao nova.
COMMIT = 'cff4ef3'

falhas = []


def ler_do_git(caminho):
    return subprocess.check_output(
        ['git', 'show', COMMIT + ':' + caminho], cwd=IR, text=True, encoding='utf-8')


def trocar(txt, velho, novo, etiqueta):
    n = txt.count(velho)
    if n != 1:
        falhas.append('%s: encontrado %d vezes (esperava 1)' % (etiqueta, n))
        return txt
    return txt.replace(velho, novo)


# ============================================================ app.js
app = ler_do_git('docs/app.js')

# --- 1. as chaves que a entrada comum guarda valem para os dois modulos
app = trocar(app, """var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem('indiarec.' + k); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem('indiarec.' + k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('indiarec.' + k); } catch (e) {} }
};""", """/* O que a entrada comum guarda vale para os dois módulos e vive com o prefixo
 * 'jat.'; o resto (ronda, progresso em cache, aparelho) é só deste módulo e
 * fica em 'indiarec.'. Mexer nesta lista significa mexer também em
 * colheita/app.js e em shell.js — as três têm de concordar. */
var PARTILHADAS = { token: 1, nome: 1, idioma: 1, admin: 1, adminPw: 1, adminAte: 1 };
function chaveDef(k) { return (PARTILHADAS[k] ? 'jat.' : 'indiarec.') + k; }

var Def = {
  get: function (k, d) {
    try { var v = localStorage.getItem(chaveDef(k)); return v === null ? d : v; }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(chaveDef(k), v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem(chaveDef(k)); } catch (e) {} }
};""", 'Def/PARTILHADAS')

# --- 2. a base fica na versao 1: aqui o service worker nao precisa da loja
#        'config' (o endereco vem do config.js e o codigo vem da base 'jatlog')
app = trocar(app, """ * Versão 2 (2026-08-14) acrescenta a loja 'config'. Uma subida de versão é
 * uma operação segura — o IndexedDB mantém as lojas que já existem — e é
 * precisa porque o service worker também envia a fila (sync em segundo plano)
 * e lá não há localStorage para ir buscar o código de activação.
 */""", """ * ⚠ Fica na versão 1, ao contrário do repositório autónomo do India Rec, que
 * subiu para a 2 por causa de uma loja 'config'. Aqui essa loja não faz falta:
 * o service worker do JatLog lê o endereço do config.js e o código de
 * activação da base 'jatlog', onde a entrada comum o deixou. Não subir a
 * versão poupa uma migração a telemóveis que podem ter 100 registos à espera —
 * e, sobretudo, o service worker abre esta base com a versão 1: se a página a
 * subisse para 2, o envio em segundo plano passava a rebentar com VersionError.
 */""", 'DB comentário')

app = trocar(app, """      var p = indexedDB.open('indiarec', 2);
      p.onupgradeneeded = function () {
        var d = p.result;
        if (!d.objectStoreNames.contains('envios')) {
          var s = d.createObjectStore('envios', { keyPath: 'uuid' });
          s.createIndex('estado', 'estado');
        }
        if (!d.objectStoreNames.contains('config')) {
          d.createObjectStore('config', { keyPath: 'chave' });
        }
      };""", """      var p = indexedDB.open('indiarec', 1);
      p.onupgradeneeded = function () {
        var d = p.result;
        if (!d.objectStoreNames.contains('envios')) {
          var s = d.createObjectStore('envios', { keyPath: 'uuid' });
          s.createIndex('estado', 'estado');
        }
      };""", 'DB abrir')

app = trocar(app, """    },
    /* O service worker precisa de saber o URL e o código para poder enviar
     * sozinho. Fica aqui uma cópia, escrita sempre que muda. */
    guardarConfig: function (chave, valor) {
      return comStore('config', 'readwrite', function (s) {
        return s.put({ chave: chave, valor: valor });
      });
    }
  };
})();

/** Mantém a cópia que o service worker lê. Barato, e evita ficar desactualizada. */
function espelharConfig() {
  return Promise.all([
    DB.guardarConfig('endpoint', CFG.ENDPOINT || ''),
    DB.guardarConfig('token', Def.get('token', ''))
  ]).catch(function () {});
}""", """    }
  };
})();""", 'guardarConfig/espelharConfig')

# --- 3. entra-se e sai-se do modo administrador no menu comum; aqui so se le
app = trocar(app, """var Admin = {
  pw: function () {
    var v = Def.get('adminPw', '');
    if (!v) return '';
    if (Date.now() > Number(Def.get('adminAte', 0))) { Admin.sair(); return ''; }
    return v;
  },
  activo: function () { return !!Admin.pw(); },
  entrar: function (pw) {
    Def.set('adminPw', pw);
    Def.set('adminAte', String(Date.now() + VALIDADE_ADMIN));
    pintarAdmin();
  },
  sair: function () { Def.del('adminPw'); Def.del('adminAte'); pintarAdmin(); }
};

function pintarAdmin() {
  var on = Admin.activo();
  $('crachaAdmin').hidden = !on;
  $('ligSairAdmin').hidden = !on;
  $('blocoAdmin').hidden = on;
}""", """/* Entra-se e sai-se do modo administrador no menu comum; aqui só se lê. O
 * prazo continua a ser o mesmo: uma fila com correcções de outra pessoa deixa
 * de poder subir se a permissão desaparecer a meio. */
var Admin = {
  activo: function () {
    if (Def.get('admin', '') !== '1') return false;
    return Date.now() <= Number(Def.get('adminAte', 0));
  },
  pw: function () { return Admin.activo() ? Def.get('adminPw', '') : ''; }
};

function pintarAdmin() {
  $('crachaAdmin').hidden = !Admin.activo();
}""", 'Admin')

# --- 4. os botoes de idioma vivem no menu comum; aqui so no ecra do levantamento
app = trocar(app, """  var caixa = $('idiomas');
  if (caixa) {
    caixa.hidden = ['ecraActivacao', 'ecraEntrada', 'ecraLevantamento'].indexOf(id) < 0;
  }""", """  var caixa = $('idiomas');
  if (caixa) caixa.hidden = id !== 'ecraLevantamento';""", 'idiomas')

# --- 5. o service worker e partilhado: a etiqueta do sync tem de ser a dele
app = trocar(app, "if (reg.sync) return reg.sync.register('enviar-fila');",
             "if (reg.sync) return reg.sync.register('indiarec-enviar');", 'etiqueta sync')

app = trocar(app, "try { navigator.serviceWorker.controller.postMessage({ tipo: 'enviar' }); } catch (e) {}",
             "try { navigator.serviceWorker.controller.postMessage({ tipo: 'enviar-agora' }); } catch (e) {}",
             'mensagem enviar')

# --- 6. nao ha ecra de entrada: volta-se ao menu comum
app = trocar(app, """function irParaEntrada() {
  $('inpNome').value = Def.get('nome', '');
  pintarAdmin();
  reiniciarPilha();
  mostrar('ecraEntrada');
}""", """/** Volta ao menu comum. O nome e o código ficam; a fila também. */
function irParaMenu() {
  location.href = '../index.html';
}""", 'irParaEntrada')

app = trocar(app, """  pintarAdmin();
  if (!Def.get('token', '')) { mostrar('ecraActivacao'); return; }
  if (!Def.get('nome', '')) { irParaEntrada(); return; }
  irParaLevantamento();""", """  pintarAdmin();
  /* Quem chega aqui sem ter passado pela entrada comum (um atalho antigo, por
   * exemplo) é mandado para lá; é lá que se pede o código e o nome. */
  if (!Def.get('token', '') || !Def.get('nome', '')) {
    location.replace('../index.html');
    return;
  }
  irParaLevantamento();""", 'arrancar')

# --- 7. os botoes da activacao, do nome e do administrador estao no menu comum
i = app.index("  $('btnActivar').onclick = function () {")
j = app.index("  $('ligHistorico').onclick = function () {")
if not (0 < i < j):
    falhas.append('ligarEventos: nao encontrei os limites do bloco a remover')
else:
    app = app[:i] + "  $('ligMenu').onclick = irParaMenu;\n\n" + app[j:]

# --- 8. um unico service worker, registado na raiz
app = trocar(app, """if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}""", """/* Um único Service Worker para a aplicação toda, registado na raiz. Este
 * módulo vive numa subpasta, por isso o âmbito é o pai — é o que permite abrir
 * qualquer das páginas sem rede. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(function () {});
  });
}""", 'registo do sw')

app = trocar(app, """  actualizarEstado();
  espelharConfig();     // o service worker precisa do URL e do código para enviar sozinho
  agendarEnvio();""", """  actualizarEstado();
  agendarEnvio();""", 'arranque espelharConfig')

# ============================================================ index.html
htm = ler_do_git('docs/index.html')

htm = trocar(htm, """<title>India Rec — NBF Tanheia</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="stylesheet" href="styles.css">
<link rel="icon" href="favicon.png">
<link rel="apple-touch-icon" href="icon-180.png">""", """<title>JatLog — Medições India</title>
<link rel="manifest" href="../manifest.webmanifest">
<link rel="stylesheet" href="styles.css">
<link rel="icon" href="../icon-192.png">
<link rel="apple-touch-icon" href="../icon-192.png">""", 'cabeçalho html')

a = htm.index('<!-- ------------------------------------------------------ 0. activação ---- -->')
b = htm.index('<!-- ---------------------------------------------------- 2. levantamento ---- -->')
if not (0 < a < b):
    falhas.append('index.html: nao encontrei os ecras de activacao/entrada')
else:
    htm = htm[:a] + """<!-- A activação e o nome são pedidos uma só vez, no menu (../index.html).
     Este módulo começa já na escolha do levantamento. -->

""" + htm[b:]

htm = trocar(htm, """  <button class="ligacao" id="ligTrocarNome" data-t="lev.trocarNome"></button>""",
             """  <button class="ligacao" id="ligMenu" data-t="geral.menu"></button>""", 'ligMenu')

htm = trocar(htm, '<script src="config.js"></script>', '<script src="../config.js"></script>',
             'config.js')

# ============================================================ i18n.js
i18 = ler_do_git('docs/i18n.js')
for velho, novo in [
    ("    'geral.voltar': 'Voltar',", "    'geral.voltar': 'Voltar',\n    'geral.menu': 'Menu (trocar de registo)',"),
    ("    'geral.voltar': 'Back',", "    'geral.voltar': 'Back',\n    'geral.menu': 'Menu (switch record)',"),
    ("    'geral.voltar': '戻る',", "    'geral.voltar': '戻る',\n    'geral.menu': 'メニュー(登録先を変える)',"),
]:
    i18 = trocar(i18, velho, novo, 'i18n ' + velho.strip()[:24])

css = ler_do_git('docs/styles.css')

# ============================================================ gravar
if falhas:
    print('NAO GRAVEI. Falhas:')
    for f in falhas:
        print('  -', f)
    sys.exit(1)

for nome, txt in [('app.js', app), ('index.html', htm), ('i18n.js', i18), ('styles.css', css)]:
    destino = os.path.join(JL, 'docs', 'india', nome)
    antes = io.open(destino, encoding='utf-8').read()
    io.open(destino, 'w', encoding='utf-8', newline='\n').write(txt)
    print('%-12s %6d -> %6d caracteres' % (nome, len(antes), len(txt)))

for proibido in ['espelharConfig', 'guardarConfig', 'irParaEntrada', 'btnActivar',
                 'ligTrocarNome', "reg.sync.register('enviar-fila')"]:
    if proibido in app:
        print('  ⚠ ainda aparece em app.js:', proibido)
print('feito.')
