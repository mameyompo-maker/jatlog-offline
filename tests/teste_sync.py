# -*- coding: utf-8 -*-
"""Background Sync do JatLog unificado: as DUAS filas sobem com a app fechada.

A aplicacao e "fechada" levando o separador para about:blank, portanto nenhum
JavaScript dela fica a correr. So o Service Worker pode enviar a partir dai.
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8810"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync")
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


def esperar(page, alvo, limite=15):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            if ecra(page) == alvo:
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def esperar_dialogo(page, sel, limite=12):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            if page.locator(sel).is_visible():
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


api("/__reset")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()

    registos_sw = []
    cdp = ctx.new_cdp_session(page)
    cdp.on("ServiceWorker.workerRegistrationUpdated",
           lambda e: registos_sw.extend(e.get("registrations", [])))
    cdp.send("ServiceWorker.enable")

    # ------------------------------------------------------------ preparar
    page.goto(BASE + "/index.html", wait_until="load")
    time.sleep(1.5)
    page.fill("#inpCodigo", "jatropha")
    page.click("#btnActivar")
    time.sleep(0.6)
    page.fill("#inpNome", "Op1")
    page.click("#btnComecar")
    check("S1 entrou no menu", esperar(page, "ecraMenu"), ecra(page))

    guardado = page.evaluate("""() => new Promise(ok => {
        const p = indexedDB.open('jatlog', 2);
        p.onsuccess = () => {
          const t = p.result.transaction('config', 'readonly');
          const r = t.objectStore('config').get('token');
          r.onsuccess = () => ok(r.result ? r.result.v : '');
        };
      })""")
    check("S2 o código ficou onde o Service Worker o vê", guardado == "jatropha", guardado)
    check("S3 o navegador suporta Background Sync", page.evaluate("() => 'SyncManager' in window"))

    # abre os dois modulos uma vez, com rede, para terem o que precisam em cache
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    check("S4 colheita pronta", esperar(page, "ecraBusca"), ecra(page))
    time.sleep(1.5)

    # ------------------------------------------------- gravar sem rede (colheita)
    ctx.set_offline(True)
    time.sleep(0.5)
    for numero, peso in ((1, 2.5), (2, 3.5)):
        page.fill("#inpBusca", str(numero))
        page.press("#inpBusca", "Enter")
        esperar(page, "ecraPeso")
        page.fill("#inpPeso", str(peso))
        page.press("#inpPeso", "Enter")
        esperar_dialogo(page, "#dlgConfirmar")
        page.click("#btnRegistarAssim")
        esperar(page, "ecraBusca")
    check("S5 dois pesos na fila", page.evaluate("() => S.fila.length") == 2,
          page.evaluate("() => S.fila.length"))

    # -------------------------------------------------- gravar sem rede (india)
    page.goto(BASE + "/india/index.html", wait_until="load")
    check("S6 medicoes abrem sem rede", esperar(page, "ecraLevantamento"), ecra(page))
    page.click('.cartao[data-modo="descritores"]')
    esperar(page, "ecraPlanta")
    page.locator('#grelhaFileiras button:has-text("r02")').first.click()
    page.locator('#teclado button[data-tecla="limpar"]').click()
    for d in "10":
        page.locator('#teclado button[data-tecla="%s"]' % d).click()
    page.click("#btnPlanta")
    esperar(page, "ecraFormulario")
    page.fill("#campo_limboFoliar", "12,5")
    page.click("#btnEnviar")
    page.wait_for_selector("#dlgIncompleto[open]")
    page.click("#btnEnviarAssim")
    esperar(page, "ecraPlanta")
    time.sleep(0.6)
    check("S7 medicao na fila", page.locator("#contadorFila").is_visible())

    st = api("/__estado")
    # O "offline" do Playwright nao chega ao Service Worker (tem o seu proprio
    # contexto de rede), por isso a fila da colheita pode ja ter subido sozinha
    # antes desta linha. O que interessa e que tudo chegue uma so vez -> S17.
    check("S8 as medicoes ainda nao subiram", len(st["india"]) == 0, len(st["india"]))

    # ---------------------------------------------------- fechar a aplicacao
    page.goto("about:blank", wait_until="load")
    time.sleep(1)
    check("S9 a aplicacao ja nao esta a correr",
          page.evaluate("() => typeof S === 'undefined'"))

    # ------------------------------------- rede volta, sync em segundo plano
    ctx.set_offline(False)
    time.sleep(1)

    ids = [r["registrationId"] for r in registos_sw
           if BASE in r.get("scopeURL", "") and not r.get("isDeleted")]
    check("S10 registo do Service Worker encontrado", bool(ids), registos_sw)

    for tag in ("jatlog-enviar", "indiarec-enviar"):
        if ids:
            cdp.send("ServiceWorker.dispatchSyncEvent", {
                "origin": BASE,
                "registrationId": ids[-1],
                "tag": tag,
                "lastChance": False,
            })

    fim = time.time() + 40
    while time.time() < fim:
        st = api("/__estado")
        if len(st["log"]["lines"]) >= 2 and len(st["india"]) >= 1:
            break
        time.sleep(1)

    st = api("/__estado")
    check("S11 a fila da colheita subiu com a app fechada", len(st["log"]["lines"]) == 2,
          st["log"]["lines"])
    check("S12 os pesos chegaram certos",
          sorted(l[4] for l in st["log"]["lines"]) == ["2.50", "3.50"],
          [l[4] for l in st["log"]["lines"]])
    check("S13 a fila das medicoes subiu com a app fechada", len(st["india"]) == 1, st["india"])
    check("S14 o valor da medicao chegou certo",
          st["india"] and st["india"][0]["values"].get("limboFoliar") == 12.5, st["india"])

    # ------------------------------------ reabrir: filas vazias, sem duplicar
    page.goto(BASE + "/index.html", wait_until="load")
    esperar(page, "ecraMenu")
    time.sleep(2)
    check("S15 o menu nao conta pendentes",
          page.locator("#filaColheita").is_hidden() and page.locator("#filaIndia").is_hidden())

    page.goto(BASE + "/colheita/index.html", wait_until="load")
    esperar(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar(page, "ecraBusca")
    time.sleep(2)
    check("S16 fila da colheita vazia ao reabrir", page.evaluate("() => S.fila.length") == 0,
          page.evaluate("() => S.fila.length"))

    page.goto(BASE + "/india/index.html", wait_until="load")
    esperar(page, "ecraLevantamento")
    time.sleep(2)
    st = api("/__estado")
    check("S17 nada foi duplicado",
          len(st["log"]["lines"]) == 2 and len(st["india"]) == 1,
          (len(st["log"]["lines"]), len(st["india"])))
    check("S18 contador de pendentes limpo", page.locator("#contadorFila").is_hidden())
    page.screenshot(path=os.path.join(OUT, "depois.png"), full_page=True)

    b.close()

maus = [n for n, c in R if not c]
print("\n%d/%d" % (len(R) - len(maus), len(R)))
for m in maus:
    print("FAIL:", m)
sys.exit(1 if maus else 0)
