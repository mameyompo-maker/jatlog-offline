# -*- coding: utf-8 -*-
"""E2E do JatLog unificado: entrada comum + os dois modulos.

  python servidor.py <docs> 8810     (noutra janela)
  python teste.py
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8810"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
sys.stdout.reconfigure(encoding="utf-8")
os.makedirs(OUT, exist_ok=True)
R = []


def check(nome, cond, extra=""):
    R.append((nome, bool(cond)))
    print(("PASS " if cond else "FAIL ") + nome + (" | " + str(extra) if extra and not cond else ""))


def api(caminho):
    with urllib.request.urlopen(BASE + caminho, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def ecra(page):
    for e in page.locator("section.ecra").all():
        if e.is_visible():
            return e.get_attribute("id")
    return None


def esperar_ecra(page, alvo, limite=12):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            if ecra(page) == alvo:
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def visivel(page, sel):
    try:
        return page.locator(sel).is_visible()
    except Exception:
        return False


def ir_menu(page):
    page.goto(BASE + "/index.html", wait_until="load")
    esperar_ecra(page, "ecraMenu")


def registar_peso(page, numero, peso):
    page.fill("#inpBusca", str(numero))
    page.press("#inpBusca", "Enter")
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", str(peso))
    page.press("#inpPeso", "Enter")
    esperar_ecra(page, "ecraBusca")


def registar_medicao(page, fileira, numero, valor):
    page.click('.cartao[data-modo="descritores"]')
    esperar_ecra(page, "ecraPlanta")
    page.locator('#grelhaFileiras button:has-text("%s")' % fileira).first.click()
    page.locator('#teclado button[data-tecla="limpar"]').click()
    for d in str(numero):
        page.locator('#teclado button[data-tecla="%s"]' % d).click()
    page.click("#btnPlanta")
    esperar_ecra(page, "ecraFormulario")
    page.fill("#campo_limboFoliar", str(valor))
    page.click("#btnEnviar")
    page.wait_for_selector("#dlgIncompleto[open]")
    page.click("#btnEnviarAssim")
    esperar_ecra(page, "ecraPlanta")
    page.wait_for_timeout(700)


api("/__reset")

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    erros = []
    page.on("pageerror", lambda e: erros.append(str(e)))
    page.on("console", lambda m: erros.append("console: " + m.text) if m.type == "error" else None)

    # ============================================== A. entrada comum
    print("\n[A] entrada comum")
    page.goto(BASE + "/index.html", wait_until="load")
    time.sleep(1.0)
    check("A1 abre na activacao", ecra(page) == "ecraActivacao", ecra(page))

    page.click("#btnActivar")
    time.sleep(0.3)
    check("A2 codigo vazio e recusado", visivel(page, "#avisoActivacao"))

    page.fill("#inpCodigo", "jatropha")
    page.click("#btnActivar")
    check("A3 codigo certo abre a entrada", esperar_ecra(page, "ecraEntrada"), ecra(page))

    page.click("#btnComecar")
    time.sleep(0.3)
    check("A4 nome vazio e recusado", visivel(page, "#avisoEntrada"))

    page.fill("#inpNome", "Op1")
    page.click("#btnComecar")
    check("A5 nome leva ao menu", esperar_ecra(page, "ecraMenu"), ecra(page))
    check("A6 menu sauda pelo nome", "Op1" in page.inner_text("#subMenu"), page.inner_text("#subMenu"))
    check("A7 menu tem os dois cartoes",
          visivel(page, "#cartaoColheita") and visivel(page, "#cartaoIndia"))
    page.screenshot(path=os.path.join(OUT, "01_menu.png"), full_page=True)

    # ============================================== B. modulo da colheita
    print("\n[B] modulo da colheita")
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    check("B1 cartao abre a colheita", "/colheita/" in page.url, page.url)
    check("B2 comeca no local e mes (nao pede nome nem codigo)",
          esperar_ecra(page, "ecraLocal"), ecra(page))
    check("B2a nenhum local vem marcado de antemao",
          page.locator(".escolha-local.activo").count() == 0)
    check("B2b Continuar so abre depois de escolher",
          page.locator("#btnContinuar").is_disabled())

    page.click('.escolha-local[data-site="lines"]')
    check("B2c o local escolhido fica marcado",
          page.locator('.escolha-local[data-site="lines"].activo').count() == 1)
    page.click("#btnContinuar")
    check("B3 vai para a busca", esperar_ecra(page, "ecraBusca"), ecra(page))
    check("B4 barra de contexto mostra o nome da entrada comum",
          "Op1" in page.inner_text("#topoNome"), page.inner_text("#topoNome"))

    registar_peso(page, 1, "4,4")
    time.sleep(1.0)
    log = api("/__estado")["log"]["lines"]
    check("B5 peso chegou ao servidor", len(log) == 1, log)
    check("B6 gravado com o nome certo", log and log[0][1] == "Op1", log)
    check("B7 virgula decimal lida como 4.40", log and log[0][4] == "4.40", log)
    page.screenshot(path=os.path.join(OUT, "02_colheita.png"), full_page=True)

    page.click("#btnMenu")
    page.wait_for_load_state("load")
    check("B8 botao Menu volta a entrada comum", esperar_ecra(page, "ecraMenu"), page.url)

    # ============================================== C. modulo das medicoes
    print("\n[C] modulo das medicoes (India)")
    page.click("#cartaoIndia")
    page.wait_for_load_state("load")
    check("C1 cartao abre as medicoes", "/india/" in page.url, page.url)
    check("C2 comeca no levantamento", esperar_ecra(page, "ecraLevantamento"), ecra(page))
    check("C3 saudacao com o nome da entrada comum",
          "Op1" in page.inner_text("#ola"), page.inner_text("#ola"))

    registar_medicao(page, "r02", 10, "12,5")
    india = api("/__estado")["india"]
    check("C4 medicao chegou ao servidor", len(india) == 1, india)
    check("C5 gravada com o nome certo", india and india[0]["recorder"] == "Op1", india)
    check("C6 virgula decimal lida como 12.5",
          india and india[0]["values"].get("limboFoliar") == 12.5, india)
    page.screenshot(path=os.path.join(OUT, "03_india.png"), full_page=True)

    page.locator('.ecra:not([hidden]) [data-voltar]').first.click()
    esperar_ecra(page, "ecraLevantamento")
    page.click("#ligMenu")
    page.wait_for_load_state("load")
    check("C7 ligacao Menu volta a entrada comum", esperar_ecra(page, "ecraMenu"), page.url)

    # ============================================== D. sessao partilhada
    print("\n[D] sessao partilhada")
    chaves = page.evaluate("Object.keys(localStorage).filter(k => k.indexOf('jat.') === 0).sort()")
    check("D1 codigo e nome vivem no espaco partilhado",
          "jat.token" in chaves and "jat.nome" in chaves, chaves)
    check("D2 nenhum modulo guardou o nome so para si",
          not page.evaluate("!!(localStorage['jatlog.nome'] || localStorage['indiarec.nome'])"))

    page.goto(BASE + "/colheita/index.html", wait_until="load")
    check("D3 entrar direito na colheita nao volta a pedir nada",
          esperar_ecra(page, "ecraLocal"), page.url)

    page.goto(BASE + "/india/index.html", wait_until="load")
    check("D4 entrar direito nas medicoes nao volta a pedir nada",
          esperar_ecra(page, "ecraLevantamento"), page.url)

    # ============================================== E. idioma
    print("\n[E] idioma")
    ir_menu(page)
    page.locator('#idiomas button:has-text("日本語")').click()
    time.sleep(0.4)
    check("E1 menu em japones", "何を登録" in page.inner_text("#ecraMenu"),
          page.inner_text("#ecraMenu")[:60])

    page.goto(BASE + "/colheita/index.html", wait_until="load")
    esperar_ecra(page, "ecraLocal")
    check("E2 colheita herda o japones", "拠点" in page.inner_text("#ecraLocal"),
          page.inner_text("#ecraLocal")[:60])

    page.goto(BASE + "/india/index.html", wait_until="load")
    esperar_ecra(page, "ecraLevantamento")
    check("E3 medicoes herdam o japones", "こんにちは" in page.inner_text("#ola")
          or "さん" in page.inner_text("#ola"), page.inner_text("#ola"))

    ir_menu(page)
    page.locator('#idiomas button:has-text("PT")').click()
    time.sleep(0.4)
    check("E4 volta ao portugues", "registrar" in page.inner_text("#ecraMenu").lower(),
          page.inner_text("#ecraMenu")[:60])

    # ============================================== F. sem rede
    print("\n[F] sem rede, nos dois modulos")
    ctx.set_offline(True)

    page.goto(BASE + "/colheita/index.html", wait_until="load")
    check("F1 colheita abre sem rede (service worker)", esperar_ecra(page, "ecraLocal"), ecra(page))
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    check("F1b entra na busca sem rede (cadastro em cache)",
          esperar_ecra(page, "ecraBusca"), ecra(page))
    registar_peso(page, 2, 3)
    time.sleep(0.6)
    check("F2 fica por enviar", visivel(page, "#barra"), "")

    page.goto(BASE + "/india/index.html", wait_until="load")
    check("F3 medicoes abrem sem rede", esperar_ecra(page, "ecraLevantamento"), ecra(page))
    registar_medicao(page, "r03", 5, "7,5")
    check("F4 contador da fila visivel", visivel(page, "#contadorFila"))

    ir_menu(page)
    time.sleep(0.8)
    check("F5 menu conta o que falta na colheita", visivel(page, "#filaColheita"),
          page.inner_text("#ecraMenu"))
    check("F6 menu conta o que falta nas medicoes", visivel(page, "#filaIndia"))

    antes_log = len(api("/__estado")["log"]["lines"])
    antes_india = len(api("/__estado")["india"])
    check("F7 nada subiu enquanto esteve sem rede",
          antes_log == 1 and antes_india == 1, (antes_log, antes_india))

    ctx.set_offline(False)
    page.goto(BASE + "/colheita/index.html", wait_until="load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    time.sleep(2.0)
    page.goto(BASE + "/india/index.html", wait_until="load")
    esperar_ecra(page, "ecraLevantamento")
    time.sleep(2.0)

    log = api("/__estado")["log"]["lines"]
    india = api("/__estado")["india"]
    check("F8 colheita subiu ao voltar a rede", len(log) == 2, log)
    check("F9 medicoes subiram ao voltar a rede", len(india) == 2, len(india))

    ir_menu(page)
    time.sleep(1.0)
    check("F10 menu deixa de contar pendentes",
          not visivel(page, "#filaColheita") and not visivel(page, "#filaIndia"))

    # ============================================== G. administrador
    print("\n[G] administrador")
    page.click("#btnTrocarUsuario")
    esperar_ecra(page, "ecraEntrada")
    page.fill("#inpNome", "Gestor")
    page.locator("#blocoAdmin summary").click()
    page.fill("#inpSenha", "errada")
    page.click("#btnComecar")
    time.sleep(1.0)
    check("G1 senha errada e recusada", visivel(page, "#avisoEntrada"))

    page.fill("#inpSenha", "JatRD2026")
    page.click("#btnComecar")
    check("G2 senha certa entra no menu", esperar_ecra(page, "ecraMenu"), ecra(page))
    check("G3 menu assinala o administrador",
          "administrador" in page.inner_text("#subMenu"), page.inner_text("#subMenu"))

    page.goto(BASE + "/colheita/index.html", wait_until="load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    check("G4 colheita reconhece o administrador", visivel(page, ".badge-adm"))

    page.goto(BASE + "/india/index.html", wait_until="load")
    esperar_ecra(page, "ecraLevantamento")
    check("G5 medicoes reconhecem o administrador", visivel(page, "#crachaAdmin"))

    ir_menu(page)
    page.click("#btnSairAdmin2")
    time.sleep(0.4)
    check("G6 sair do administrador vale para os dois",
          "administrador" not in page.inner_text("#subMenu"), page.inner_text("#subMenu"))

    # ============================================== H. atalhos antigos
    print("\n[H] quem chega sem passar pela entrada")
    page.evaluate("localStorage.removeItem('jat.nome')")
    # o location.replace acontece durante o arranque: o page.url do Playwright
    # fica pelo endereco pedido, por isso pergunta-se a propria pagina
    page.goto(BASE + "/colheita/index.html", wait_until="load")
    time.sleep(1.5)
    check("H1 colheita sem nome manda para a entrada comum",
          page.evaluate("location.pathname") == "/index.html",
          page.evaluate("location.pathname"))

    page.goto(BASE + "/india/index.html", wait_until="load")
    time.sleep(1.5)
    check("H2 medicoes sem nome mandam para a entrada comum",
          page.evaluate("location.pathname") == "/index.html",
          page.evaluate("location.pathname"))

    # os erros de rede da fase sem rede (F) sao propositados
    reais = [e for e in erros if "ERR_INTERNET_DISCONNECTED" not in e
             and "Failed to fetch" not in e]
    check("H3 sem erros de JavaScript", not reais, reais[:3])

    nav.close()

maus = [n for n, c in R if not c]
print("\n%d/%d" % (len(R) - len(maus), len(R)))
if maus:
    print("falhas:")
    for m in maus:
        print("  -", m)
sys.exit(1 if maus else 0)
