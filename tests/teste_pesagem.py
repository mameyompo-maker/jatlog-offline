# -*- coding: utf-8 -*-
"""E2E do modulo da pesagem (temporario, sacos de sementes por planta-mae)
dentro do JatLog unificado. Correr servidor.py primeiro."""
import json
import os
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8810"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
sys.stdout.reconfigure(encoding="utf-8")
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra and not cond else ""))


def api(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def estado():
    return api("/__estado")


def visivel(page, sel):
    try:
        return page.locator(sel).is_visible()
    except Exception:
        return False


def ecra_actual(page):
    for e in page.locator("section.ecra").all():
        if e.is_visible():
            return e.get_attribute("id")
    return None


def esperar_ecra(page, alvo, limite=12):
    fim = time.time() + limite
    while time.time() < fim:
        if ecra_actual(page) == alvo:
            return True
        time.sleep(0.2)
    return False


def esperar_dialogo(page, sel, limite=12):
    """A confirmação é um <dialog> nativo por cima do ecrã (não uma
    section.ecra), por isso não passa por ecra_actual()/esperar_ecra()."""
    fim = time.time() + limite
    while time.time() < fim:
        if visivel(page, sel):
            return True
        time.sleep(0.2)
    return False


def _idNoInicio(motherId):
    """'P1' não pode casar com 'P10'/'P11'/'P13'/'P15'/'P111': o ID vem sempre
    no início do texto do cartão, por isso ancora-se ao início e exige um
    limite de palavra a seguir (sem usar lookbehind, que o motor de regex do
    Chromium injectado pelo Playwright nem sempre resolve da mesma forma)."""
    return re.compile(r'^' + re.escape(motherId) + r'(?!\w)')


def cartaoMae(page, motherId):
    """O cartão de uma planta-mãe concreta na lista (não depender da ordem).
    O ID fica isolado no span .idMae, por isso filtra-se por ele em vez de
    pelo texto do cartão inteiro (mais simples e sem ambiguidade)."""
    return page.locator("#listaMaes .cartao").filter(
        has=page.locator(".idMae", has_text=re.compile(r'^\s*' + re.escape(motherId) + r'\s*$'))
    ).first


def cartaoHist(page, motherId):
    """No histórico o ID não tem span próprio: vem em texto simples no início
    do cartão, por isso ancora-se ao início do texto do próprio cartão."""
    return page.locator("#listaHistorico .cartao", has_text=_idNoInicio(motherId)).first


def pesar(page, motherId, valor, unidade=None):
    """Regista um saco, passando pela janela de confirmação (todo registo
    passa por lá agora, não só o que está fora da faixa — ver submeterPeso())."""
    cartaoMae(page, motherId).click()
    esperar_ecra(page, "ecraPeso")
    if unidade:
        page.click('#segPeso button[data-unidade="%s"]' % unidade)
    page.fill("#inpPeso", str(valor))
    page.press("#inpPeso", "Enter")
    esperar_dialogo(page, "#dlgConfirmar")
    page.click("#btnRegistarAssim")
    esperar_ecra(page, "ecraLista")


def ir_entrada(page):
    """Abre a entrada comum, já no ecrã do nome."""
    page.goto(BASE + "/index.html", wait_until="load")
    time.sleep(0.6)
    if ecra_actual(page) == "ecraMenu":
        page.click("#btnTrocarUsuario")
        esperar_ecra(page, "ecraEntrada")


def entrar_como(page, nome, senha=None):
    """Troca de utilizador na entrada comum e volta ao módulo da pesagem,
    na escolha da época (sem nada marcado)."""
    ir_entrada(page)
    page.fill("#inpNome", nome)
    if senha is not None:
        page.locator("#blocoAdmin summary").click()
        page.fill("#inpSenha", senha)
    page.click("#btnComecar")
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoPesagem")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraEpoca")


def escolher_epoca(page, season):
    page.click('.escolha-local[data-season="%s"]' % season)
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraLista")


api("/__reset")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    erros_js = []
    page.on("pageerror", lambda e: erros_js.append(str(e)))

    # ---------------------------------------------------------- A. activação
    page.goto(BASE + "/index.html", wait_until="load")
    time.sleep(1.2)
    page.fill("#inpCodigo", "jatropha")
    page.click("#btnActivar")
    esperar_ecra(page, "ecraEntrada")

    page.fill("#inpNome", "Op1")
    page.click("#btnComecar")
    check("A1 nome leva ao menu", esperar_ecra(page, "ecraMenu"), ecra_actual(page))
    check("A2 cartão da pesagem existe no menu", visivel(page, "#cartaoPesagem"))

    page.click("#cartaoPesagem")
    page.wait_for_load_state("load")
    check("A3 abre na escolha da época", esperar_ecra(page, "ecraEpoca"), ecra_actual(page))
    check("A4 nada vem marcado (é preciso escolher)",
          page.locator(".escolha-local.activo").count() == 0 and
          page.locator("#btnContinuar").is_disabled())
    page.screenshot(path=os.path.join(OUT, "01_epoca.png"), full_page=True)

    # ------------------------------------------------------------ B. escolha
    page.click('.escolha-local[data-season="25-26"]')
    check("B1 fica marcada e o botão liberta",
          page.locator('.escolha-local[data-season="25-26"].activo').count() == 1 and
          not page.locator("#btnContinuar").is_disabled())
    page.click("#btnContinuar")
    check("B2 chega à lista de planta-mãe", esperar_ecra(page, "ecraLista"), ecra_actual(page))
    check("B3 lista tem as 20 planta-mãe", page.locator("#listaMaes .cartao").count() == 20,
          page.locator("#listaMaes .cartao").count())
    check("B4 sem registo mostra o texto neutro",
          "ainda sem registo" in cartaoMae(page, "P71").inner_text())
    page.screenshot(path=os.path.join(OUT, "02_lista.png"), full_page=True)

    # ------------------------------------------------- C0. ecrã de confirmação
    # Mesmo um valor normal (dentro da faixa) passa pelo ecrã de confirmação
    # antes de ir para o servidor — só o aviso de faixa e o texto do botão
    # mudam consoante o caso (ver submeterPeso() em app.js).
    cartaoMae(page, "P13").click()
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "8")
    page.press("#inpPeso", "Enter")
    check("C0a valor normal também pede confirmação",
          esperar_dialogo(page, "#dlgConfirmar"), ecra_actual(page))
    check("C0b mostra a planta-mãe e o valor",
          "P13" in page.inner_text("#alvoConfirmar") and "8" in page.inner_text("#alvoConfirmar"),
          page.inner_text("#alvoConfirmar"))
    check("C0c sem aviso de faixa quando o valor é normal", not visivel(page, "#avisoConfirmar"))
    check("C0d botão diz 'Registar' (não 'Registar assim')",
          page.inner_text("#btnRegistarAssim").strip() == "Registar",
          page.inner_text("#btnRegistarAssim"))
    page.click("#btnRegistarAssim")
    check("C0e grava depois de confirmar", esperar_ecra(page, "ecraLista"), ecra_actual(page))
    time.sleep(1.2)
    check("C0f chegou ao servidor",
          any(l[3] == "P13" and l[4] == "8.00" for l in estado()["pesagem"]["25-26"]),
          estado()["pesagem"]["25-26"])

    # ---------------------------------------------------------------- C. peso
    pesar(page, "P71", "12.4")
    check("C1 volta à lista depois de gravar", ecra_actual(page) == "ecraLista")
    check("C2 badge actualiza com 1 saco",
          "1" in cartaoMae(page, "P71").inner_text() and
          "12,4" in cartaoMae(page, "P71").inner_text(),
          cartaoMae(page, "P71").inner_text())
    check("C3 banner de gravado", "12,40" in page.inner_text("#avisoGravado"),
          page.inner_text("#avisoGravado"))
    time.sleep(1.5)

    # (P13 do C0 já lá está — filtra-se por P71 em vez de usar o índice/tamanho
    # da lista toda, para não depender de quantos outros registos vieram antes)
    st = estado()
    linhasP71 = [l for l in st["pesagem"]["25-26"] if l[3] == "P71"]
    check("C4 chegou ao servidor",
          len(linhasP71) == 1 and linhasP71[0][4] == "12.40", linhasP71)
    check("C5 kg convertidos", abs(linhasP71[0][6] - 12.4) < 1e-6, linhasP71[0][6])
    check("C6 auditoria CREATE", st["pesagemAudit"]["25-26"][0][1] == "CREATE")
    # o contador do topo soma a época toda: 1 saco do P13 (C0) + 1 do P71 aqui
    check("C7 contador do topo a 2", page.inner_text("#topoNum") == "2", page.inner_text("#topoNum"))

    # segundo saco da mesma planta-mãe: soma, não substitui
    # (1200 g = 1.2 kg -- tem de ficar dentro da faixa 1-200 kg, senão pede confirmação)
    pesar(page, "P71", "1200", unidade="g")
    time.sleep(1.5)
    check("C8 dois sacos somados",
          "2" in cartaoMae(page, "P71").inner_text() and
          "13,6" in cartaoMae(page, "P71").inner_text(),
          cartaoMae(page, "P71").inner_text())
    st = estado()
    check("C9 dois registos no servidor",
          len([l for l in st["pesagem"]["25-26"] if l[3] == "P71"]) == 2)
    page.screenshot(path=os.path.join(OUT, "03_dois_sacos.png"), full_page=True)

    # valor fora da faixa pede confirmação
    cartaoMae(page, "P9").click()
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "0.2")
    page.press("#inpPeso", "Enter")
    check("C10 fora da faixa pede confirmação", esperar_dialogo(page, "#dlgConfirmar"), ecra_actual(page))
    page.click("#btnCorrigir")
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "0.2")
    page.press("#inpPeso", "Enter")
    esperar_dialogo(page, "#dlgConfirmar")
    check("C10b fora da faixa mostra o aviso e o botão 'Registar assim'",
          visivel(page, "#avisoConfirmar") and
          page.inner_text("#btnRegistarAssim").strip() == "Registar assim",
          page.inner_text("#btnRegistarAssim"))
    page.click("#btnRegistarAssim")
    check("C11 confirma e grava mesmo assim", esperar_ecra(page, "ecraLista"), ecra_actual(page))
    time.sleep(1.2)
    check("C12 gravado apesar de fora da faixa",
          any(l[3] == "P9" for l in estado()["pesagem"]["25-26"]))

    # -------------------------------------------------------------- D. edição
    # o histórico é do mais recente para o mais antigo: o primeiro cartão de
    # P71 é o segundo saco (1,2 kg), não o primeiro (12,4 kg)
    cartaoHist(page, "P71").click()
    check("D1 abre a edição", esperar_ecra(page, "ecraEditar"), ecra_actual(page))
    page.fill("#inpEditar", "5")
    page.click('#segEditar button[data-unidade="kg"]')
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraLista")
    time.sleep(1.2)
    st = estado()
    linhasP71 = [l for l in st["pesagem"]["25-26"] if l[3] == "P71"]
    check("D2 uma das linhas foi editada",
          any(l[4] == "5.00" for l in linhasP71), linhasP71)
    check("D3 auditoria EDIT", any(a[1] == "EDIT" for a in st["pesagemAudit"]["25-26"]))
    check("D4 badge reflecte a edição (12.4 + 5 = 17.4)",
          "17,4" in cartaoMae(page, "P71").inner_text(), cartaoMae(page, "P71").inner_text())

    # ------------------------------------------------------------ E. exclusão
    linhasP9 = [l for l in estado()["pesagem"]["25-26"] if l[3] == "P9"]
    check("E0 P9 tem um registo antes de apagar", len(linhasP9) == 1, linhasP9)
    cartaoHist(page, "P9").click()
    esperar_ecra(page, "ecraEditar")
    page.click("#btnApagar")
    check("E1 pede confirmação", esperar_ecra(page, "ecraApagar"), ecra_actual(page))
    page.click("#btnApagarNao")
    esperar_ecra(page, "ecraEditar")
    page.click("#btnApagar")
    esperar_ecra(page, "ecraApagar")
    page.click("#btnApagarSim")
    esperar_ecra(page, "ecraLista")
    time.sleep(1.2)
    st = estado()
    check("E2 registo apagado no servidor",
          not any(l[3] == "P9" for l in st["pesagem"]["25-26"]), st["pesagem"]["25-26"])
    check("E3 auditoria DELETE", any(a[1] == "DELETE" for a in st["pesagemAudit"]["25-26"]))
    check("E4 badge volta a 'sem registo'",
          "ainda sem registo" in cartaoMae(page, "P9").inner_text())
    page.screenshot(path=os.path.join(OUT, "04_apagado.png"), full_page=True)

    # -------------------------------------------------------- F. mudar época
    page.click("#btnMudarEpoca")
    check("F1 volta à escolha, já com a época actual marcada",
          esperar_ecra(page, "ecraEpoca") and
          page.locator('.escolha-local[data-season="25-26"].activo').count() == 1,
          ecra_actual(page))
    page.click('.escolha-local[data-season="26-27"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraLista")
    check("F2 época 26-27 começa sem registos",
          "ainda sem registo" in cartaoMae(page, "P71").inner_text())
    pesar(page, "P71", "3")
    time.sleep(1.2)
    # 25-26 tem 3: P13 (C0) + P71 x2 (C1/C8) — o P9 do C10/C11 foi apagado no E
    check("F3 26-27 não mistura com 25-26",
          len(estado()["pesagem"]["26-27"]) == 1 and len(estado()["pesagem"]["25-26"]) == 3,
          estado()["pesagem"])
    page.screenshot(path=os.path.join(OUT, "05_outra_epoca.png"), full_page=True)

    # ---------------------------------------------------- G. trabalho offline
    ctx.set_offline(True)
    time.sleep(0.6)
    check("G1 barra avisa sem conexão", "SEM LIGAÇÃO" in page.inner_text("#barra"),
          page.inner_text("#barra"))

    pesar(page, "P1", "9.5")
    pesar(page, "P10", "6")
    check("G2 dois registos ficam na fila",
          "2 registo(s) guardado" in page.inner_text("#barra"), page.inner_text("#barra"))
    check("G3 aparecem no histórico com selo",
          page.locator("#listaHistorico .selo").count() >= 2)
    check("G4 badges já reflectem a fila local",
          "9,5" in cartaoMae(page, "P1").inner_text())
    check("G5 servidor ainda não os tem", len(estado()["pesagem"]["26-27"]) == 1)
    page.screenshot(path=os.path.join(OUT, "06_offline.png"), full_page=True)

    ctx.set_offline(False)
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    fim = time.time() + 25
    while time.time() < fim:
        if len(estado()["pesagem"]["26-27"]) >= 3:
            break
        time.sleep(1)
    check("G6 fila subiu sozinha ao voltar a rede",
          len(estado()["pesagem"]["26-27"]) == 3, estado()["pesagem"]["26-27"])
    time.sleep(1.5)
    check("G7 selos desaparecem depois de enviar",
          page.locator("#listaHistorico .selo").count() == 0)

    # ---------------------------------------------------------- H. permissões
    entrar_como(page, "Op2")
    escolher_epoca(page, "26-27")
    check("H1 registos de outra pessoa ficam trancados",
          page.locator("#listaHistorico .histrow").count() >= 3,
          page.locator("#listaHistorico .histrow").count())
    check("H2 nenhum é editável", page.locator("#listaHistorico .cartao").count() == 0)
    page.screenshot(path=os.path.join(OUT, "07_trancado.png"), full_page=True)

    # ------------------------------------------------------------- I. admin
    ir_entrada(page)
    page.fill("#inpNome", "Chefe")
    page.locator("#blocoAdmin summary").click()
    page.fill("#inpSenha", "JatRD2026")
    page.click("#btnComecar")
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoPesagem")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraEpoca")
    escolher_epoca(page, "26-27")
    check("I1 crachá ADMIN", "ADMIN" in page.inner_text("#topoNome"))
    check("I2 admin pode editar tudo",
          page.locator("#listaHistorico .cartao").count() >= 3,
          page.locator("#listaHistorico .cartao").count())

    cartaoHist(page, "P1").click()
    esperar_ecra(page, "ecraEditar")
    page.fill("#inpEditar", "7.7")
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraLista")
    time.sleep(1.2)
    check("I3 admin gravou a correcção de outra pessoa",
          any(l[3] == "P1" and l[4] == "7.70" for l in estado()["pesagem"]["26-27"]),
          estado()["pesagem"]["26-27"])
    page.screenshot(path=os.path.join(OUT, "08_admin.png"), full_page=True)

    # --------------------------------------------------- J. arranque sem rede
    ctx.set_offline(True)
    page.reload(wait_until="load")
    time.sleep(2.0)
    check("J1 abre sem rede, na escolha da época", ecra_actual(page) == "ecraEpoca",
          ecra_actual(page))
    escolher_epoca(page, "26-27")
    check("J2 lista sobrevive sem rede (cadastro em cache)",
          page.locator("#listaMaes .cartao").count() == 20)
    ctx.set_offline(False)
    page.screenshot(path=os.path.join(OUT, "09_offline_reload.png"), full_page=True)

    # ------------------------------------- O. histórico no ecrã da época
    # (2026-08-30: mal se marca uma época, aparece por baixo o histórico com
    #  as duas épocas misturadas, corrigível; tocar de novo desfaz a escolha
    #  — o mesmo desenho do ecrã do local da colheita.)
    print("\n[O] histórico no ecrã da época")
    page.click("#btnMudarEpoca")
    esperar_ecra(page, "ecraEpoca")
    time.sleep(1.2)   # dá tempo ao action=log (season vazia) de responder
    check("O1 com época marcada o histórico aparece",
          visivel(page, "#historicoEpoca") and
          page.locator("#listaHistoricoEpoca .cartao, #listaHistoricoEpoca .histrow").count() >= 1,
          page.inner_text("#listaHistoricoEpoca")[:120])
    texto = page.inner_text("#listaHistoricoEpoca")
    check("O2 as duas épocas vêm misturadas, cada cartão diz a sua",
          "2025–26" in texto and "2026–27" in texto, texto[:160])

    page.click('.escolha-local[data-season="26-27"]')   # a mesma → desfaz
    time.sleep(0.3)
    check("O3 tocar de novo desfaz a escolha e esconde o histórico",
          not visivel(page, "#historicoEpoca") and
          page.locator("#btnContinuar").is_disabled() and
          page.locator(".escolha-local.activo").count() == 0)

    page.click('.escolha-local[data-season="26-27"]')
    time.sleep(1.2)
    page.locator("#listaHistoricoEpoca .cartao").first.click()
    check("O4 tocar num cartão abre a edição", esperar_ecra(page, "ecraEditar"), ecra_actual(page))
    page.fill("#inpEditar", "9.87")
    page.click("#btnGuardarEdicao")
    check("O5 guardar volta ao ecrã da época", esperar_ecra(page, "ecraEpoca"), ecra_actual(page))
    time.sleep(2.0)   # a correcção sobe e o histórico recarrega
    check("O6 o valor corrigido aparece no histórico",
          "9,87" in page.inner_text("#listaHistoricoEpoca"),
          page.inner_text("#listaHistoricoEpoca")[:160])
    est = estado()
    todas = est["pesagem"]["25-26"] + est["pesagem"]["26-27"]
    check("O7 a correcção chegou ao servidor",
          any(str(l[4]) == "9.87" for l in todas), todas[-3:])

    # -------------------------------------------------------- K. erros de JS
    check("K sem erros de JavaScript na consola", not erros_js, erros_js)

    browser.close()

# ------------------------------------------------------------------- relatório
falhas = [n for n, ok, _ in results if not ok]
print("\n%d/%d passaram" % (len(results) - len(falhas), len(results)))
if falhas:
    print("FALHARAM: " + ", ".join(falhas))
    sys.exit(1)
