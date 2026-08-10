# -*- coding: utf-8 -*-
"""Fotos de todos os ecrãs do módulo da colheita, para ver o desenho escuro."""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8810"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fotos")
os.makedirs(OUT, exist_ok=True)

def api(c):
    with urllib.request.urlopen(BASE + c, timeout=10) as r:
        return json.loads(r.read().decode())

def ecra(pg):
    for e in pg.locator("section.ecra").all():
        if e.is_visible():
            return e.get_attribute("id")

def esperar(pg, alvo, limite=12):
    fim = time.time() + limite
    while time.time() < fim:
        if ecra(pg) == alvo:
            return True
        time.sleep(0.2)
    return False

api("/__reset")
with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE + "/index.html", wait_until="load"); time.sleep(1.0)
    pg.fill("#inpCodigo", "jatropha"); pg.click("#btnActivar"); time.sleep(0.8)
    pg.locator("#blocoAdmin summary").click()
    pg.fill("#inpNome", "Cheia"); time.sleep(0.4)
    pg.screenshot(path=os.path.join(OUT, "a_entrada.png"), full_page=True)
    pg.click("#btnComecar"); esperar(pg, "ecraMenu"); time.sleep(0.8)
    pg.click("#cartaoColheita"); pg.wait_for_load_state("load")
    esperar(pg, "ecraLocal"); pg.click("#btnContinuar"); esperar(pg, "ecraBusca"); time.sleep(1.5)

    # um registo normal
    pg.fill("#inpBusca", "1"); pg.press("#inpBusca", "Enter"); esperar(pg, "ecraPeso"); time.sleep(0.8)
    pg.screenshot(path=os.path.join(OUT, "b_peso.png"), full_page=True)
    pg.fill("#inpPeso", "4,4"); pg.press("#inpPeso", "Enter"); esperar(pg, "ecraBusca"); time.sleep(1.8)
    pg.screenshot(path=os.path.join(OUT, "c_busca_com_registo.png"), full_page=True)

    # candidatos (o número 586 tem duas linhas possíveis)
    pg.fill("#inpBusca", "586"); pg.press("#inpBusca", "Enter"); esperar(pg, "ecraCandidatos"); time.sleep(0.8)
    pg.screenshot(path=os.path.join(OUT, "d_candidatos.png"), full_page=True)
    pg.click("#btnOutroNumero"); esperar(pg, "ecraBusca"); time.sleep(0.5)

    # valor fora da faixa -> ecrã de confirmação
    pg.fill("#inpBusca", "2"); pg.press("#inpBusca", "Enter"); esperar(pg, "ecraPeso")
    pg.fill("#inpPeso", "90"); pg.press("#inpPeso", "Enter"); esperar(pg, "ecraConfirmar"); time.sleep(0.8)
    pg.screenshot(path=os.path.join(OUT, "e_confirmar.png"), full_page=True)
    pg.click("#btnCorrigir"); esperar(pg, "ecraPeso")
    pg.fill("#inpPeso", "3"); pg.press("#inpPeso", "Enter"); esperar(pg, "ecraBusca"); time.sleep(1.8)

    # edição
    pg.locator("#listaHistorico .cartao").first.click(); esperar(pg, "ecraEditar"); time.sleep(0.8)
    pg.screenshot(path=os.path.join(OUT, "f_editar.png"), full_page=True)
    pg.click("#btnApagar"); esperar(pg, "ecraApagar"); time.sleep(0.6)
    pg.screenshot(path=os.path.join(OUT, "g_apagar.png"), full_page=True)
    pg.click("#btnApagarNao"); esperar(pg, "ecraEditar")
    pg.click("#btnCancelarEdicao"); esperar(pg, "ecraBusca"); time.sleep(0.8)

    # sem rede: barra + selo POR ENVIAR
    ctx.set_offline(True); time.sleep(0.6)
    pg.fill("#inpBusca", "3"); pg.press("#inpBusca", "Enter"); esperar(pg, "ecraPeso")
    pg.fill("#inpPeso", "2"); pg.press("#inpPeso", "Enter"); esperar(pg, "ecraBusca"); time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "h_sem_rede.png"), full_page=True)
    pg.goto(BASE + "/index.html", wait_until="load"); esperar(pg, "ecraMenu"); time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "i_menu_pendentes.png"), full_page=True)
    ctx.set_offline(False)
    nav.close()
print("ok")
