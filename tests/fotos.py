# -*- coding: utf-8 -*-
import os, sys, time
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8810"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fotos")
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE + "/index.html", wait_until="load"); time.sleep(1.2)
    pg.fill("#inpCodigo", "jatropha"); pg.click("#btnActivar"); time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "1_entrada.png"), full_page=True)
    pg.fill("#inpNome", "Cheia"); pg.click("#btnComecar"); time.sleep(1.5)
    pg.screenshot(path=os.path.join(OUT, "2_menu.png"), full_page=True)
    pg.click("#cartaoColheita"); pg.wait_for_load_state("load"); time.sleep(1.5)
    pg.screenshot(path=os.path.join(OUT, "3_colheita_local.png"), full_page=True)
    pg.click('.escolha-local[data-site="lines"]'); time.sleep(0.4)
    pg.click("#btnContinuar"); time.sleep(2.0)
    pg.screenshot(path=os.path.join(OUT, "4_colheita_busca.png"), full_page=True)
    pg.goto(BASE + "/india/index.html", wait_until="load"); time.sleep(2.0)
    pg.screenshot(path=os.path.join(OUT, "5_india_lev.png"), full_page=True)
    pg.goto(BASE + "/index.html", wait_until="load"); time.sleep(1.0)
    pg.locator('#idiomas button:has-text("日本語")').click(); time.sleep(1.2)
    pg.screenshot(path=os.path.join(OUT, "6_menu_ja.png"), full_page=True)
    nav.close()
print("ok")
