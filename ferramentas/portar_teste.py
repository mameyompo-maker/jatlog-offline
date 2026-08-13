# -*- coding: utf-8 -*-
"""Leva o teste do India Rec (cff4ef3) para dentro do JatLog, como o codigo.

As mesmas adaptacoes de sempre: a activacao, o nome e o administrador vivem na
entrada comum, o log das medicoes vem noutra chave, e a base de dados fica na
versao 1 porque aqui a configuracao do Service Worker esta noutro sitio.
"""
import io
import os
import subprocess
import sys

IR = r'c:\Users\kazdr\OneDrive - 河村研究室\Claude_general\projects\jatmed_field_app'
JL = r'c:\Users\kazdr\OneDrive - 河村研究室\Claude_general\projects\jatlog_offline'
# Commit do India Rec de onde se traz a versao nova.
COMMIT = 'HEAD'

falhas = []
t = subprocess.check_output(['git', 'show', COMMIT + ':tests/teste.py'],
                            cwd=IR, text=True, encoding='utf-8')


def trocar(velho, novo, etiqueta):
    global t
    n = t.count(velho)
    if n != 1:
        falhas.append('%s: encontrado %d vezes (esperava 1)' % (etiqueta, n))
        return
    t = t.replace(velho, novo)


# --- cabecalho e ligacao ao servidor unificado
trocar('"""Teste ponta-a-ponta do India Rec com Playwright (viewport de telemovel)."""',
       '"""Teste ponta-a-ponta do modulo das medicoes dentro do JatLog unificado.\n'
       '\n'
       'A activacao, o nome e o administrador passaram para a entrada comum\n'
       '(/index.html); o resto do fluxo e o mesmo do India Rec autonomo."""',
       'docstring')

trocar('BASE = "http://127.0.0.1:8765"\nTOKEN = "TESTE-123456"\nADMIN_PW = "adm-2026"',
       'BASE = "http://127.0.0.1:8810"\nTOKEN = "jatropha"\nADMIN_PW = "JatRD2026"',
       'constantes')

trocar('    return bater("/__estado")["log"]',
       '    # no servidor unificado o log das medicoes vem em "india" ("log" e o da colheita)\n'
       '    return bater("/__estado")["india"]',
       'log_servidor')

# --- a entrada e a troca de utilizador fazem-se na pagina do menu
trocar('''def entrar(pag, nome):
    pag.fill("#inpNome", nome)
    pag.click("#btnEntrar")
    pag.wait_for_selector("#ecraLevantamento:not([hidden])")''',
       '''def ir_entrada(pag):
    """Abre a entrada comum, ja no ecra do nome."""
    pag.goto(BASE + "/index.html")
    pag.wait_for_timeout(700)
    if not pag.locator("#ecraMenu").is_hidden():
        pag.click("#btnTrocarUsuario")
        pag.wait_for_selector("#ecraEntrada:not([hidden])")


def abrir_modulo(pag):
    pag.wait_for_selector("#ecraMenu:not([hidden])")
    pag.click("#cartaoIndia")
    pag.wait_for_load_state("load")
    pag.wait_for_selector("#ecraLevantamento:not([hidden])")


def entrar(pag, nome):
    """Troca de utilizador na entrada comum e volta ao modulo das medicoes."""
    ir_entrada(pag)
    pag.fill("#inpNome", nome)
    pag.click("#btnComecar")
    abrir_modulo(pag)''',
       'entrar')

# --- [1] activacao: e da entrada comum, nao deste modulo
trocar('''        print("\\n[1] activacao e entrada")
        pag.goto(BASE + "/index.html")
        pag.wait_for_selector("#ecraActivacao:not([hidden])", timeout=10000)
        pag.fill("#inpCodigo", TOKEN)
        pag.click("#btnActivar")
        pag.wait_for_selector("#ecraEntrada:not([hidden])")
        ok(pag.locator("#blocoAdmin").is_visible(), "ecra de entrada tem o bloco de administrador")
        ok(pag.locator("#ligSairAdmin").is_hidden(), "sem sessao de administrador ao inicio")
        entrar(pag, "Cheia")
        ok("Olá, Cheia." in pag.inner_text("#ola"), "saudacao com o nome")''',
       '''        print("\\n[1] activacao e entrada (na entrada comum)")
        pag.goto(BASE + "/index.html")
        pag.wait_for_selector("#ecraActivacao:not([hidden])", timeout=10000)
        pag.fill("#inpCodigo", TOKEN)
        pag.click("#btnActivar")
        pag.wait_for_selector("#ecraEntrada:not([hidden])")
        ok(pag.locator("#blocoAdmin").is_visible(), "ecra de entrada tem o bloco de administrador")
        ok(pag.locator("#btnSairAdmin").is_hidden(), "sem sessao de administrador ao inicio")
        pag.fill("#inpNome", "Cheia")
        pag.click("#btnComecar")
        abrir_modulo(pag)
        ok("Olá, Cheia." in pag.inner_text("#ola"), "saudacao com o nome")''',
       'seccao 1')

# --- [8] o administrador liga-se na entrada comum, com o nome e a senha juntos
trocar('''        voltar(pag)
        pag.click("#ligTrocarNome")
        pag.wait_for_selector("#ecraEntrada:not([hidden])")
        pag.locator("#blocoAdmin summary").click()
        pag.fill("#inpAdmin", "errada")
        pag.click("#btnAdmin")
        pag.wait_for_timeout(1000)
        ok("errada" in pag.inner_text("#avisoAdmin").lower(), "recusa a palavra-passe errada")

        pag.fill("#inpAdmin", ADMIN_PW)
        pag.click("#btnAdmin")
        pag.wait_for_timeout(1200)
        ok(pag.locator("#crachaAdmin").is_visible(), "cracha ADMIN aparece na barra")
        entrar(pag, "Cheia")''',
       '''        voltar(pag)
        ir_entrada(pag)
        pag.locator("#blocoAdmin summary").click()
        pag.fill("#inpNome", "Cheia")
        pag.fill("#inpSenha", "errada")
        pag.click("#btnComecar")
        pag.wait_for_timeout(1200)
        ok("incorreta" in pag.inner_text("#avisoEntrada").lower(), "recusa a palavra-passe errada")

        pag.fill("#inpSenha", ADMIN_PW)
        pag.click("#btnComecar")
        abrir_modulo(pag)
        ok(pag.locator("#crachaAdmin").is_visible(), "cracha ADMIN aparece na barra")
        entrar(pag, "Cheia")''',
       'seccao 8')

# --- [9] o historico do servidor tem de ser pedido outra vez ao voltar ao modulo
trocar('''        print("\\n[9] administrador corrige o registo de outra pessoa")
        pag.click('.cartao[data-modo="descritores"]')''',
       '''        print("\\n[9] administrador corrige o registo de outra pessoa")
        # a aba "todos" e o que traz os registos do servidor para o aparelho.
        # Como o administrador se liga noutra pagina, ao voltar ao modulo essa
        # lista tem de ser pedida de novo.
        pag.click("#ligHistorico")
        pag.wait_for_selector("#ecraHistorico:not([hidden])")
        pag.click('.aba[data-aba="todos"]')
        pag.wait_for_timeout(1200)
        voltar(pag)
        pag.click('.cartao[data-modo="descritores"]')''',
       'seccao 9')

# --- [10] sair do administrador tambem e na entrada comum
trocar('''        voltar(pag)
        pag.click("#ligTrocarNome")
        pag.click("#ligSairAdmin")
        pag.wait_for_timeout(300)
        ok(pag.locator("#crachaAdmin").is_hidden(), "saiu do modo administrador")
        entrar(pag, "Joana")''',
       '''        voltar(pag)
        ir_entrada(pag)
        pag.click("#btnSairAdmin")
        pag.wait_for_timeout(300)
        pag.fill("#inpNome", "Joana")
        pag.click("#btnComecar")
        abrir_modulo(pag)
        ok(pag.locator("#crachaAdmin").is_hidden(), "saiu do modo administrador")''',
       'seccao 10')

# --- a base fica na versao 1 (ver o comentario em docs/india/app.js)
n = t.count("indexedDB.open('indiarec', 2)")
if n < 3:
    falhas.append("versao da base: encontrei %d aberturas (esperava 3 ou mais)" % n)
t = t.replace("indexedDB.open('indiarec', 2)", "indexedDB.open('indiarec', 1)")

# --- a configuracao do Service Worker vive na base da colheita, posta pelo menu
trocar('''        # o que faz funcionar "100 plantas sem rede e mandar tudo a chegada":
        # a configuracao tem de estar na base para o SW a poder ler
        cfg = pag.evaluate("""() => new Promise(feito => {
          const p = indexedDB.open('indiarec', 1);
          p.onsuccess = () => {
            const tx = p.result.transaction('config', 'readonly');
            const r = tx.objectStore('config').getAll();
            tx.oncomplete = () => feito(r.result.map(x => x.chave).sort());
          };
        })""")
        ok(cfg == ["endpoint", "token"], f"endpoint e codigo guardados para o SW ({cfg})")''',
       '''        # o que faz funcionar "100 plantas sem rede e mandar tudo a chegada":
        # o codigo de activacao tem de estar numa base para o SW o poder ler.
        # Aqui e a entrada comum que o poe, na base 'jatlog', e serve as duas
        # filas; o endereco vem do config.js, que o SW carrega com importScripts.
        cfg = pag.evaluate("""() => new Promise(feito => {
          const p = indexedDB.open('jatlog', 2);
          p.onsuccess = () => {
            const tx = p.result.transaction('config', 'readonly');
            const r = tx.objectStore('config').getAll();
            tx.oncomplete = () => feito(r.result.filter(x => x.v).map(x => x.k).sort());
          };
        })""")
        ok(cfg == ["token"], f"codigo de activacao guardado para o SW ({cfg})")''',
       'config do sw')

trocar('''pag.evaluate("() => navigator.serviceWorker.controller.postMessage({tipo: 'enviar'})")''',
       '''pag.evaluate("() => navigator.serviceWorker.controller.postMessage({tipo: 'enviar-agora'})")''',
       'mensagem ao sw')

if falhas:
    print('NAO GRAVEI. Falhas:')
    for f in falhas:
        print('  -', f)
    sys.exit(1)

destino = os.path.join(JL, 'tests', 'teste_india.py')
antes = io.open(destino, encoding='utf-8').read()
io.open(destino, 'w', encoding='utf-8', newline='\n').write(t)
print('teste_india.py  %d -> %d caracteres' % (len(antes), len(t)))
for proibido in ['ligTrocarNome', 'ligSairAdmin', 'btnEntrar', 'inpAdmin', '8765',
                 "indiarec', 2", "tipo: 'enviar'}"]:
    if proibido in t:
        print('  ⚠ ainda aparece:', proibido)
print('feito.')
