# -*- coding: utf-8 -*-
"""Verificacao do site publicado: so leitura, nunca escreve nas folhas."""
import sys, time
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "https://mameyompo-maker.github.io/jatlog-offline"
R = []
def check(n, c, extra=""):
    R.append((n, bool(c)))
    print(("PASS " if c else "FAIL ") + n + (" | " + str(extra) if extra and not c else ""))
def ecra(pg):
    for e in pg.locator("section.ecra").all():
        if e.is_visible():
            return e.get_attribute("id")
with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE + "/", wait_until="load"); time.sleep(2.5)
    check("P1 abre na activacao", ecra(pg) == "ecraActivacao", ecra(pg))
    cor = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    check("P2 fundo escuro", cor == "rgb(18, 20, 15)", cor)
    pg.fill("#inpCodigo", "jatropha"); pg.click("#btnActivar"); time.sleep(1.0)
    check("P3 codigo aceite", ecra(pg) == "ecraEntrada", ecra(pg))
    pg.fill("#inpNome", "Kaz (teste)"); pg.click("#btnComecar"); time.sleep(1.5)
    check("P4 chega ao menu", ecra(pg) == "ecraMenu", ecra(pg))
    check("P5 dois cartoes", pg.locator(".cartao-menu").count() == 2)
    pg.screenshot(path="fotos/pub_menu.png", full_page=True)
    pg.click("#cartaoColheita"); pg.wait_for_load_state("load"); time.sleep(3.0)
    check("P6 colheita abre no local e mes", ecra(pg) == "ecraLocal", ecra(pg))
    pg.click("#btnContinuar"); time.sleep(5.0)
    check("P7 o cadastro real desceu (chega a busca)", ecra(pg) == "ecraBusca", ecra(pg))
    check("P8 nome vindo da entrada comum", "Kaz" in pg.inner_text("#topoNome"), pg.inner_text("#topoNome"))
    pg.screenshot(path="fotos/pub_colheita.png", full_page=True)
    pg.goto(BASE + "/india/", wait_until="load"); time.sleep(4.0)
    check("P9 medicoes abrem no levantamento", ecra(pg) == "ecraLevantamento", ecra(pg))
    check("P10 saudacao com o mesmo nome", "Kaz" in pg.inner_text("#ola"), pg.inner_text("#ola"))
    # o progresso so e pedido ao entrar num levantamento (assim era antes da
    # juncao). Abrir um levantamento e leitura pura: nao escreve na folha.
    pg.click('.cartao[data-modo="descritores"]'); time.sleep(5.0)
    check("P11a as 16 fileiras reais aparecem",
          pg.locator("#grelhaFileiras button").count() == 16,
          pg.locator("#grelhaFileiras button").count())
    pg.locator('.ecra:not([hidden]) [data-voltar]').first.click(); time.sleep(1.5)
    check("P11b progresso real das 415 plantas chegou",
          "415" in pg.inner_text('[data-texto="descritores"]'),
          pg.inner_text('[data-texto="descritores"]'))
    pg.screenshot(path="fotos/pub_india.png", full_page=True)
    sw = pg.evaluate("navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : ''")
    check("P12 service worker unico na raiz", sw.endswith("/jatlog-offline/sw.js"), sw)
    check("P13 sem erros de JS", not erros, erros[:3])
    # limpar o que este teste deixou no navegador (nada foi escrito nas folhas)
    pg.evaluate("Object.keys(localStorage).forEach(k => localStorage.removeItem(k))")
    nav.close()
maus = [n for n, c in R if not c]
print("\n%d/%d" % (len(R) - len(maus), len(R)))
sys.exit(1 if maus else 0)
