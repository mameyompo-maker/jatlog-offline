# -*- coding: utf-8 -*-
"""E2E do modulo do peso da colheita por mes (Indice 17) dentro do JatLog
unificado. Correr servidor.py primeiro.

O endpoint real (/exec-india17) e uma imitacao local so para este teste — o
Apps Script de producao e escrito e implantado pelo Kaz (ver HANDOVER.md)."""
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


def _idNoInicio(sourceId):
    """Ancora ao início do texto do cartão (mesma razão da pesagem: um ID não
    pode casar por engano com outro que o contenha como prefixo)."""
    return re.compile(r'^' + re.escape(sourceId) + r'(?!\w)')


def cartaoId(page, sourceId):
    """O cartão de um Source ID concreto na lista (não depender da ordem)."""
    return page.locator("#listaIds .cartao").filter(
        has=page.locator(".idSrc", has_text=re.compile(
            r'^\s*' + re.escape(sourceId) + r'(\s*\([^)]*\))?\s*$'))
    ).first


def cartaoHist(page, sourceId):
    """No histórico o ID não tem span próprio: vem em texto simples no início
    do cartão."""
    return page.locator("#listaHistorico .cartao", has_text=_idNoInicio(sourceId)).first


def pesar(page, sourceId, valor, unidade=None):
    """Regista um lançamento, passando pela janela de confirmação (todo
    registo passa por lá, não só o que está fora da faixa)."""
    cartaoId(page, sourceId).click()
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


def ir_para_india17(page, mes="Aug", ano=2026):
    """A partir do menu, chega ao módulo do Índia 17 — que não tem cartão
    próprio: vive como 3ª opção na escolha de local da colheita, com o mesmo
    par de pulldowns mês/ano usado por Tanheia/7 de Abril (só a lista de
    opções muda — ver INDIA17_MESES_POR_ANO em colheita/app.js). Escolher
    local + mês/ano e continuar vai direito para a lista do módulo próprio
    (../india17/?mes=...), sem repetir a pergunta do mês lá. 'mes' usa o
    nome curto do pulldown (ex. "Apr", "Aug"), não o formato completo
    ("Aug/26") que o módulo do Índia 17 grava."""
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="india17"]')
    page.select_option("#selAno", str(ano))
    page.select_option("#selMes", mes)
    page.click("#btnContinuar")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLista")


def entrar_como(page, nome, senha=None, mes="Aug", ano=2026):
    """Troca de utilizador na entrada comum e volta ao módulo do Índia 17,
    já na lista (mês/ano escolhidos na colheita, como qualquer outro local)."""
    ir_entrada(page)
    page.fill("#inpNome", nome)
    if senha is not None:
        page.locator("#blocoAdmin summary").click()
        page.fill("#inpSenha", senha)
    page.click("#btnComecar")
    ir_para_india17(page, mes, ano)


def escolher_mes(page, mes):
    """Pulldown de mês, mesmo formato do local/mês da colheita (Tanheia/7 de
    Abril): select_option em vez de clicar num botão."""
    page.select_option("#selMes", mes)
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

    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    check("A2 Índia 17 aparece na escolha de local, junto de Tanheia/7 de Abril",
          page.locator('.escolha-local[data-site="india17"]').count() == 1)

    # o mês/ano escolhem-se já aqui, tal como Tanheia/7 de Abril — só a lista
    # de opções muda (2026/2027 fixos; ver teste_colheita.py para o detalhe)
    page.click('.escolha-local[data-site="india17"]')
    page.select_option("#selAno", "2026")
    page.select_option("#selMes", "Aug")
    page.click("#btnContinuar")
    page.wait_for_load_state("load")
    check("A3 chega directo à lista do Índia 17 (sem repetir a pergunta do mês)",
          esperar_ecra(page, "ecraLista"), ecra_actual(page))
    # O rótulo vem traduzido (pt, língua por omissão) — "Ago/26", não "Aug/26".
    check("A4 mês do topo é 'Ago/26'", "AGO/26" in page.inner_text("#topoMes").upper(),
          page.inner_text("#topoMes"))
    page.screenshot(path=os.path.join(OUT, "01_mes.png"), full_page=True)

    # ------------------------------------------------------------ B. lista
    check("B1 lista tem os 17 Source ID", page.locator("#listaIds .cartao").count() == 17,
          page.locator("#listaIds .cartao").count())
    check("B2 sem registo mostra o texto neutro",
          "ainda sem registo" in cartaoId(page, "India #bag05").inner_text())
    check("B3 mostra a linha de contexto e o n.º de plantas junto ao ID",
          "Linha" in cartaoId(page, "India #bag05").inner_text()
          and "(15)" in cartaoId(page, "India #bag05").inner_text(),
          cartaoId(page, "India #bag05").inner_text())
    page.screenshot(path=os.path.join(OUT, "02_lista.png"), full_page=True)

    # ------------------------------------------------- C0. ecrã de confirmação
    # Mesmo um valor normal (dentro da faixa) passa pelo ecrã de confirmação
    # antes de ir para o servidor — só o aviso de faixa e o texto do botão
    # mudam consoante o caso (ver submeterPeso() em app.js).
    cartaoId(page, "India #bag13").click()
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "8")
    page.press("#inpPeso", "Enter")
    check("C0a valor normal também pede confirmação",
          esperar_dialogo(page, "#dlgConfirmar"), ecra_actual(page))
    check("C0b mostra o Source ID, o mês e o valor",
          "India #bag13" in page.inner_text("#alvoConfirmar") and
          "Ago/26" in page.inner_text("#alvoConfirmar") and
          "8" in page.inner_text("#alvoConfirmar"),
          page.inner_text("#alvoConfirmar"))
    check("C0c sem aviso de faixa quando o valor é normal", not visivel(page, "#avisoConfirmar"))
    check("C0d botão diz 'Registar' (não 'Registar assim')",
          page.inner_text("#btnRegistarAssim").strip() == "Registar",
          page.inner_text("#btnRegistarAssim"))
    page.click("#btnRegistarAssim")
    check("C0e grava depois de confirmar", esperar_ecra(page, "ecraLista"), ecra_actual(page))
    time.sleep(1.2)
    check("C0f chegou ao servidor",
          any(l[3] == "India #bag13" and l[4] == "8.00" for l in estado()["india17"]["Aug/26"]),
          estado()["india17"]["Aug/26"])

    # ---------------------------------------------------------------- C. peso
    pesar(page, "India #bag01", "12.4")
    check("C1 volta à lista depois de gravar", ecra_actual(page) == "ecraLista")
    check("C2 badge actualiza com 1 registo",
          "1" in cartaoId(page, "India #bag01").inner_text() and
          "12,4" in cartaoId(page, "India #bag01").inner_text(),
          cartaoId(page, "India #bag01").inner_text())
    check("C3 banner de gravado", "12,40" in page.inner_text("#avisoGravado"),
          page.inner_text("#avisoGravado"))
    time.sleep(1.5)

    # (India #bag13 do C0 já lá está — filtra-se por bag01 em vez de usar o
    # índice/tamanho da lista toda, para não depender de quantos outros
    # registos vieram antes)
    st = estado()
    linhasBag01 = [l for l in st["india17"]["Aug/26"] if l[3] == "India #bag01"]
    check("C4 chegou ao servidor",
          len(linhasBag01) == 1 and linhasBag01[0][4] == "12.40", linhasBag01)
    check("C5 kg convertidos", abs(linhasBag01[0][6] - 12.4) < 1e-6, linhasBag01[0][6])
    check("C6 auditoria CREATE", st["india17Audit"]["Aug/26"][0][1] == "CREATE")
    # o contador do topo soma o mês todo: 1 do bag13 (C0) + 1 do bag01 aqui
    check("C7 contador do topo a 2", page.inner_text("#topoNum") == "2", page.inner_text("#topoNum"))

    # segundo lançamento do mesmo Source ID: soma, não substitui
    # (1200 g = 1.2 kg -- tem de ficar dentro da faixa 0.1-300 kg, senão pede confirmação)
    pesar(page, "India #bag01", "1200", unidade="g")
    time.sleep(1.5)
    check("C8 dois lançamentos somados",
          "2" in cartaoId(page, "India #bag01").inner_text() and
          "13,6" in cartaoId(page, "India #bag01").inner_text(),
          cartaoId(page, "India #bag01").inner_text())
    st = estado()
    check("C9 dois registos no servidor",
          len([l for l in st["india17"]["Aug/26"] if l[3] == "India #bag01"]) == 2)
    page.screenshot(path=os.path.join(OUT, "03_dois_registos.png"), full_page=True)

    # valor fora da faixa (< 100 g) pede confirmação
    cartaoId(page, "India #bag02").click()
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "0.05")
    page.press("#inpPeso", "Enter")
    check("C10 fora da faixa pede confirmação", esperar_dialogo(page, "#dlgConfirmar"), ecra_actual(page))
    page.click("#btnCorrigir")
    esperar_ecra(page, "ecraPeso")
    page.fill("#inpPeso", "0.05")
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
          any(l[3] == "India #bag02" for l in estado()["india17"]["Aug/26"]))

    # -------------------------------------------------------------- D. edição
    # o histórico é do mais recente para o mais antigo: o primeiro cartão de
    # bag01 é o segundo lançamento (1,2 kg), não o primeiro (12,4 kg)
    cartaoHist(page, "India #bag01").click()
    check("D1 abre a edição", esperar_ecra(page, "ecraEditar"), ecra_actual(page))
    page.fill("#inpEditar", "5")
    page.click('#segEditar button[data-unidade="kg"]')
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraLista")
    time.sleep(1.2)
    st = estado()
    linhasBag01 = [l for l in st["india17"]["Aug/26"] if l[3] == "India #bag01"]
    check("D2 uma das linhas foi editada",
          any(l[4] == "5.00" for l in linhasBag01), linhasBag01)
    check("D3 auditoria EDIT", any(a[1] == "EDIT" for a in st["india17Audit"]["Aug/26"]))
    check("D4 badge reflecte a edição (12.4 + 5 = 17.4)",
          "17,4" in cartaoId(page, "India #bag01").inner_text(), cartaoId(page, "India #bag01").inner_text())

    # ------------------------------------------------------------ E. exclusão
    linhasBag02 = [l for l in estado()["india17"]["Aug/26"] if l[3] == "India #bag02"]
    check("E0 bag02 tem um registo antes de apagar", len(linhasBag02) == 1, linhasBag02)
    cartaoHist(page, "India #bag02").click()
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
          not any(l[3] == "India #bag02" for l in st["india17"]["Aug/26"]), st["india17"]["Aug/26"])
    check("E3 auditoria DELETE", any(a[1] == "DELETE" for a in st["india17Audit"]["Aug/26"]))
    check("E4 badge volta a 'sem registo'",
          "ainda sem registo" in cartaoId(page, "India #bag02").inner_text())
    page.screenshot(path=os.path.join(OUT, "04_apagado.png"), full_page=True)

    # --------------------------------------------------------- F. mudar mês
    page.click("#btnMudarMes")
    check("F1 volta à escolha, já com o mês actual marcado",
          esperar_ecra(page, "ecraMes") and page.input_value("#selMes") == "Aug/26",
          ecra_actual(page))
    page.select_option("#selMes", "Sep/26")
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraLista")
    check("F2 Sep/26 começa sem registos",
          "ainda sem registo" in cartaoId(page, "India #bag01").inner_text())
    pesar(page, "India #bag01", "3")
    time.sleep(1.2)
    # Aug/26 tem 3: bag13 (C0) + bag01 x2 (C1/C8) — o bag02 do C10/C11 foi apagado no E
    check("F3 Sep/26 não mistura com Aug/26",
          len(estado()["india17"]["Sep/26"]) == 1 and len(estado()["india17"]["Aug/26"]) == 3,
          estado()["india17"])
    page.screenshot(path=os.path.join(OUT, "05_outro_mes.png"), full_page=True)

    # ------------------------------------------------- F4-F6. mês novo (Apr/26)
    # Apr/26..Jul/26 substituíram o antigo mês especial "Up to Jul/26"
    # (2026-08-28): já não há caso especial, são 4 colunas mensais normais.
    page.click("#btnMudarMes")
    esperar_ecra(page, "ecraMes")
    check("F4 pulldown mostra a opção 'Apr/26'",
          page.locator('#selMes option[value="Apr/26"]').count() == 1)
    page.select_option("#selMes", "Apr/26")
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraLista")
    check("F5 'Apr/26' começa sem registos",
          "ainda sem registo" in cartaoId(page, "India #bag01").inner_text())
    pesar(page, "India #bag01", "2.2")
    time.sleep(1.2)
    check("F6 grava em 'Apr/26' sem misturar com os outros meses",
          len(estado()["india17"]["Apr/26"]) == 1 and
          len(estado()["india17"]["Sep/26"]) == 1 and
          len(estado()["india17"]["Aug/26"]) == 3,
          estado()["india17"])
    page.screenshot(path=os.path.join(OUT, "05b_novo_mes.png"), full_page=True)

    # volta a Sep/26: o resto do fluxo (offline, permissões, admin) conta
    # com esse mês continuar a ser o actual.
    page.click("#btnMudarMes")
    esperar_ecra(page, "ecraMes")
    escolher_mes(page, "Sep/26")

    # ---------------------------------------------------- G. trabalho offline
    ctx.set_offline(True)
    time.sleep(0.6)
    check("G1 barra avisa sem conexão", "SEM LIGAÇÃO" in page.inner_text("#barra"),
          page.inner_text("#barra"))

    pesar(page, "India #bag03", "9.5")
    pesar(page, "India #bag04", "6")
    check("G2 dois registos ficam na fila",
          "2 registo(s) guardado" in page.inner_text("#barra"), page.inner_text("#barra"))
    check("G3 aparecem no histórico com selo",
          page.locator("#listaHistorico .selo").count() >= 2)
    check("G4 badges já reflectem a fila local",
          "9,5" in cartaoId(page, "India #bag03").inner_text())
    check("G5 servidor ainda não os tem", len(estado()["india17"]["Sep/26"]) == 1)
    page.screenshot(path=os.path.join(OUT, "06_offline.png"), full_page=True)

    ctx.set_offline(False)
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    fim = time.time() + 25
    while time.time() < fim:
        if len(estado()["india17"]["Sep/26"]) >= 3:
            break
        time.sleep(1)
    check("G6 fila subiu sozinha ao voltar a rede",
          len(estado()["india17"]["Sep/26"]) == 3, estado()["india17"]["Sep/26"])
    time.sleep(1.5)
    check("G7 selos desaparecem depois de enviar",
          page.locator("#listaHistorico .selo").count() == 0)

    # ---------------------------------------------------------- H. permissões
    entrar_como(page, "Op2", mes="Sep")
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
    ir_para_india17(page, mes="Sep")
    check("I1 crachá ADMIN", "ADMIN" in page.inner_text("#topoNome"))
    check("I2 admin pode editar tudo",
          page.locator("#listaHistorico .cartao").count() >= 3,
          page.locator("#listaHistorico .cartao").count())

    cartaoHist(page, "India #bag03").click()
    esperar_ecra(page, "ecraEditar")
    page.fill("#inpEditar", "7.7")
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraLista")
    time.sleep(1.2)
    check("I3 admin gravou a correcção de outra pessoa",
          any(l[3] == "India #bag03" and l[4] == "7.70" for l in estado()["india17"]["Sep/26"]),
          estado()["india17"]["Sep/26"])
    page.screenshot(path=os.path.join(OUT, "08_admin.png"), full_page=True)

    # --------------------------------------------------- J. arranque sem rede
    ctx.set_offline(True)
    page.reload(wait_until="load")
    time.sleep(2.0)
    check("J1 abre sem rede, na escolha do mês", ecra_actual(page) == "ecraMes",
          ecra_actual(page))
    escolher_mes(page, "Sep/26")
    check("J2 lista sobrevive sem rede (cadastro em cache)",
          page.locator("#listaIds .cartao").count() == 17)
    ctx.set_offline(False)
    page.screenshot(path=os.path.join(OUT, "09_offline_reload.png"), full_page=True)

    # -------------------------------------------------- L. Source ID "?"
    # A folha "India 17 weight" (master) fica intocada, tal como pedido pelo
    # Kaz — os lançamentos com Source ID desconhecido vão para uma folha
    # própria (Harvest17_Hatena), aberta directamente pelo botão da lista,
    # sem precisar de aparecer no cadastro (ver buscarHatena() em app.js e
    # atualizarHatena17_() em Codigo.gs).
    check("L1 botão do Source ID desconhecido aparece na lista",
          page.locator("#btnHatena").count() == 1)
    page.click("#btnHatena")
    check("L2 abre o ecrã de peso com o Source ID '?'",
          esperar_ecra(page, "ecraPeso") and page.inner_text("#pesoId").strip() == "?",
          page.inner_text("#pesoId"))
    page.fill("#inpPeso", "4.5")
    page.press("#inpPeso", "Enter")
    esperar_dialogo(page, "#dlgConfirmar")
    page.click("#btnRegistarAssim")
    check("L3 grava e volta à lista", esperar_ecra(page, "ecraLista"), ecra_actual(page))
    time.sleep(1.2)
    check("L4 chegou ao servidor com sourceId '?'",
          any(l[3] == "?" and l[4] == "4.50" for l in estado()["india17"]["Sep/26"]),
          estado()["india17"]["Sep/26"])

    # -------------------------------------------------------- K. erros de JS
    check("K sem erros de JavaScript na consola", not erros_js, erros_js)

    browser.close()

# ------------------------------------------------------------------- relatório
falhas = [n for n, ok, _ in results if not ok]
print("\n%d/%d passaram" % (len(results) - len(falhas), len(results)))
if falhas:
    print("FALHARAM: " + ", ".join(falhas))
    sys.exit(1)
