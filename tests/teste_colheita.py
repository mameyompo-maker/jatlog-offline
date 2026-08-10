# -*- coding: utf-8 -*-
"""E2E do modulo da colheita dentro do JatLog unificado.

A activacao e o nome passaram para a entrada comum (/index.html); o resto
do fluxo e o mesmo de antes. Correr servidor.py primeiro."""
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


def cartao(page, texto):
    """O cartão do histórico de um registo concreto (não depender da ordem)."""
    return page.locator("#listaHistorico .cartao", has_text=texto).first


def registar(page, numero, peso, unidade=None):
    page.fill("#inpBusca", str(numero))
    page.press("#inpBusca", "Enter")
    esperar_ecra(page, "ecraPeso")
    if unidade:
        page.click('#segPeso button[data-unidade="%s"]' % unidade)
    page.fill("#inpPeso", str(peso))
    page.press("#inpPeso", "Enter")
    esperar_ecra(page, "ecraBusca")


def ir_entrada(page):
    """Abre a entrada comum, ja no ecra do nome."""
    page.goto(BASE + "/index.html", wait_until="load")
    time.sleep(0.6)
    if ecra_actual(page) == "ecraMenu":
        page.click("#btnTrocarUsuario")
        esperar_ecra(page, "ecraEntrada")


def entrar_como(page, nome, senha=None):
    """Troca de utilizador na entrada comum e volta ao modulo da colheita."""
    ir_entrada(page)
    page.fill("#inpNome", nome)
    if senha is not None:
        page.locator("#blocoAdmin summary").click()
        page.fill("#inpSenha", senha)
    page.click("#btnComecar")
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")


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
    check("A1 abre na activação", ecra_actual(page) == "ecraActivacao", ecra_actual(page))

    page.click("#btnActivar")
    time.sleep(0.3)
    check("A2 código vazio é recusado", visivel(page, "#avisoActivacao"))

    page.fill("#inpCodigo", "jatropha")
    page.click("#btnActivar")
    time.sleep(0.5)
    check("A3 código certo abre a entrada", ecra_actual(page) == "ecraEntrada", ecra_actual(page))
    page.screenshot(path=os.path.join(OUT, "01_entrada.png"), full_page=True)

    # -------------------------------------------------------------- B. entrada
    page.click("#btnComecar")
    time.sleep(0.3)
    check("B1 nome vazio é recusado", visivel(page, "#avisoEntrada"))

    page.fill("#inpNome", "Op1")
    page.click("#btnComecar")
    check("B1b nome leva ao menu", esperar_ecra(page, "ecraMenu"), ecra_actual(page))
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    check("B2 vai para local e mês", esperar_ecra(page, "ecraLocal"), ecra_actual(page))
    check("B3 nenhum local vem marcado (é preciso escolher)",
          page.locator(".escolha-local.activo").count() == 0 and
          page.locator("#btnContinuar").is_disabled())
    page.click('.escolha-local[data-site="lines"]')
    page.screenshot(path=os.path.join(OUT, "02_local.png"), full_page=True)

    mes_actual = page.input_value("#selMes")
    ano_actual = page.input_value("#selAno")
    MES = mes_actual + "-" + ano_actual[-2:]

    page.click("#btnContinuar")
    check("B4 chega à busca", esperar_ecra(page, "ecraBusca"), ecra_actual(page))
    # o CSS põe a barra em maiúsculas, por isso compara-se sem caixa
    check("B5 barra de contexto mostra o local",
          "TANHEIA" in page.inner_text("#topoMes").upper(), page.inner_text("#topoMes"))
    page.screenshot(path=os.path.join(OUT, "03_busca.png"), full_page=True)

    # --------------------------------------------------------------- C. busca
    page.fill("#inpBusca", "abc")
    page.press("#inpBusca", "Enter")
    time.sleep(0.4)
    check("C1 texto não numérico é recusado",
          "apenas números" in page.inner_text("#avisoBusca"))

    page.fill("#inpBusca", "999")
    page.press("#inpBusca", "Enter")
    time.sleep(0.4)
    check("C2 número inexistente avisa", "não existe" in page.inner_text("#avisoBusca"))

    page.fill("#inpBusca", "586")
    page.press("#inpBusca", "Enter")
    check("C3 número repetido mostra candidatos",
          esperar_ecra(page, "ecraCandidatos"), ecra_actual(page))
    cands = page.locator("#listaCandidatos .cartao")
    check("C4 dois candidatos", cands.count() == 2, cands.count())
    check("C5 candidato mostra o intervalo",
          "8 linhas (586-593)" in cands.nth(0).inner_text(), cands.nth(0).inner_text())
    page.screenshot(path=os.path.join(OUT, "04_candidatos.png"), full_page=True)

    page.click("#btnOutroNumero")
    esperar_ecra(page, "ecraBusca")

    # ---------------------------------------------------------------- D. peso
    page.fill("#inpBusca", "2")
    page.press("#inpBusca", "Enter")
    check("D1 número único vai direto ao peso", esperar_ecra(page, "ecraPeso"), ecra_actual(page))
    check("D2 mostra a linha", page.inner_text("#pesoLinha") == "L2", page.inner_text("#pesoLinha"))
    check("D3 detalhe do cadastro", page.inner_text("#metaSaco") == "S002" and
          page.inner_text("#metaMae") == "M-115")
    page.screenshot(path=os.path.join(OUT, "05_peso.png"), full_page=True)

    page.fill("#inpPeso", "0")
    page.press("#inpPeso", "Enter")
    time.sleep(0.3)
    check("D4 zero é recusado", "maior que zero" in page.inner_text("#avisoPeso"))

    page.fill("#inpPeso", "99")
    page.press("#inpPeso", "Enter")
    check("D5 valor fora da faixa pede confirmação",
          esperar_ecra(page, "ecraConfirmar"), ecra_actual(page))
    page.click("#btnCorrigir")
    esperar_ecra(page, "ecraPeso")

    page.fill("#inpPeso", "4.4")
    page.press("#inpPeso", "Enter")
    check("D6 volta à busca depois de gravar", esperar_ecra(page, "ecraBusca"), ecra_actual(page))
    # o ecra esta em portugues, por isso o sinal decimal mostrado e a virgula
    check("D7 banner de gravado", "4,40" in page.inner_text("#avisoGravado"),
          page.inner_text("#avisoGravado"))
    time.sleep(1.5)

    st = estado()
    check("D8 chegou ao servidor",
          len(st["log"]["lines"]) == 1 and st["log"]["lines"][0][3] == "L2"
          and st["log"]["lines"][0][4] == "4.40", st["log"]["lines"])
    check("D9 gramas convertidas", st["log"]["lines"][0][6] == 4400, st["log"]["lines"][0][6])
    check("D10 auditoria CREATE", st["audit"]["lines"][0][1] == "CREATE")
    check("D11 contador a 1", page.inner_text("#topoNum") == "1", page.inner_text("#topoNum"))
    page.screenshot(path=os.path.join(OUT, "06_gravado.png"), full_page=True)

    # gramas
    registar(page, 3, 800, unidade="g")
    time.sleep(1.5)
    st = estado()
    linha_g = [l for l in st["log"]["lines"] if l[3] == "L3"][0]
    check("D12 unidade g gravada", linha_g[5] == "g" and linha_g[6] == 800, linha_g)

    # -------------------------------------------------------------- E. edição
    cartao(page, "L3").click()
    check("E1 abre a edição", esperar_ecra(page, "ecraEditar"), ecra_actual(page))
    page.fill("#inpEditar", "5.5")
    page.click('#segEditar button[data-unidade="kg"]')
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraBusca")
    time.sleep(1.5)
    st = estado()
    linha3 = [l for l in st["log"]["lines"] if l[3] == "L3"][0]
    check("E2 edição gravada", linha3[4] == "5.50" and linha3[5] == "kg", linha3)
    check("E3 auditoria EDIT", any(a[1] == "EDIT" for a in st["audit"]["lines"]))

    # ------------------------------------------------------------ F. exclusão
    cartao(page, "L3").click()
    esperar_ecra(page, "ecraEditar")
    page.click("#btnApagar")
    check("F1 pede confirmação", esperar_ecra(page, "ecraApagar"), ecra_actual(page))
    page.click("#btnApagarNao")
    esperar_ecra(page, "ecraEditar")
    page.click("#btnApagar")
    esperar_ecra(page, "ecraApagar")
    page.click("#btnApagarSim")
    esperar_ecra(page, "ecraBusca")
    time.sleep(1.5)
    st = estado()
    check("F2 registo apagado no servidor",
          not any(l[3] == "L3" for l in st["log"]["lines"]), st["log"]["lines"])
    check("F3 auditoria DELETE", any(a[1] == "DELETE" for a in st["audit"]["lines"]))

    # ---------------------------------------------------- G. trabalho offline
    ctx.set_offline(True)
    time.sleep(0.6)
    check("G1 barra avisa sem conexão",
          "SEM CONEXÃO" in page.inner_text("#barra"), page.inner_text("#barra"))

    registar(page, 1, 2.5)
    registar(page, 3, 3.5)
    check("G2 dois registos ficam na fila",
          "2 registro(s) guardado" in page.inner_text("#barra"), page.inner_text("#barra"))
    check("G3 aparecem no histórico com selo",
          page.locator("#listaHistorico .selo").count() == 2,
          page.locator("#listaHistorico .selo").count())
    check("G4 contador conta os locais", page.inner_text("#topoNum") == "3",
          page.inner_text("#topoNum"))
    check("G5 servidor ainda não os tem", len(estado()["log"]["lines"]) == 1)
    page.screenshot(path=os.path.join(OUT, "07_offline.png"), full_page=True)

    # editar um registo que ainda está na fila: junta-se ao próprio envio
    cartao(page, "L1").click()
    esperar_ecra(page, "ecraEditar")
    page.fill("#inpEditar", "9.9")
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraBusca")
    check("G6 correcção offline não cria envio extra",
          "2 registro(s) guardado" in page.inner_text("#barra"), page.inner_text("#barra"))

    # ------------------------------------------------- H. arranque sem rede
    page.reload(wait_until="load")
    time.sleep(2.0)
    # o local pede-se sempre à entrada, mesmo sem rede (o cadastro está em cache)
    check("H1 abre sem rede, na escolha do local", ecra_actual(page) == "ecraLocal",
          ecra_actual(page))
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    check("H1b entra na busca sem rede", esperar_ecra(page, "ecraBusca"), ecra_actual(page))
    check("H2 mantém o utilizador", "Op1" in page.inner_text("#topoNome"))
    page.fill("#inpBusca", "586")
    page.press("#inpBusca", "Enter")
    check("H3 busca funciona sem rede (cadastro em cache)",
          esperar_ecra(page, "ecraCandidatos"), ecra_actual(page))
    page.click("#btnOutroNumero")
    esperar_ecra(page, "ecraBusca")
    check("H4 fila sobreviveu ao recarregamento",
          "2 registro" in page.inner_text("#barra"), page.inner_text("#barra"))
    # o Chromium volta a pôr navigator.onLine a true depois de recarregar
    # offline; a barra tem de perceber isso pelo pedido que falhou
    check("H5 barra sabe que não há rede, apesar do navigator.onLine",
          "SEM CONEXÃO" in page.inner_text("#barra"), page.inner_text("#barra"))
    check("H6 navigator.onLine está mesmo a mentir",
          page.evaluate("() => navigator.onLine") is True)
    page.screenshot(path=os.path.join(OUT, "08_offline_reload.png"), full_page=True)

    # -------------------------------------------------------- I. volta a rede
    ctx.set_offline(False)
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    fim = time.time() + 25
    while time.time() < fim:
        if len(estado()["log"]["lines"]) >= 3:
            break
        time.sleep(1)
    st = estado()
    check("I1 fila subiu sozinha", len(st["log"]["lines"]) == 3, st["log"]["lines"])
    l1 = [l for l in st["log"]["lines"] if l[3] == "L1"]
    check("I2 correcção offline chegou com o valor novo",
          l1 and l1[0][4] == "9.90", l1)
    time.sleep(2.0)
    check("I3 barra limpa depois de enviar", page.locator("#barra").is_hidden() or
          page.inner_text("#barra") == "", page.inner_text("#barra"))
    check("I4 selos desaparecem", page.locator("#listaHistorico .selo").count() == 0,
          page.locator("#listaHistorico .selo").count())
    page.screenshot(path=os.path.join(OUT, "09_enviado.png"), full_page=True)

    # não duplica se reenviar
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    time.sleep(2.5)
    check("I5 não duplica", len(estado()["log"]["lines"]) == 3, len(estado()["log"]["lines"]))

    # ---------------------------------------------------------- J. permissões
    entrar_como(page, "Op2")
    check("J1 registos de outra pessoa ficam trancados",
          page.locator("#listaHistorico .histrow").count() == 3,
          page.locator("#listaHistorico .histrow").count())
    check("J2 nenhum é editável", page.locator("#listaHistorico .cartao").count() == 0)
    page.screenshot(path=os.path.join(OUT, "10_trancado.png"), full_page=True)

    # ------------------------------------------------------------- K. admin
    ir_entrada(page)
    page.fill("#inpNome", "Chefe")
    page.locator("#blocoAdmin summary").click()
    page.fill("#inpSenha", "errada")
    page.click("#btnComecar")
    time.sleep(1.2)
    check("K1 senha errada é recusada",
          "incorreta" in page.inner_text("#avisoEntrada"), page.inner_text("#avisoEntrada"))

    page.fill("#inpSenha", "JatRD2026")
    page.click("#btnComecar")
    check("K2 admin entra", esperar_ecra(page, "ecraMenu"), ecra_actual(page))
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    check("K3 crachá ADMIN", "ADMIN" in page.inner_text("#topoNome"))
    check("K4 admin pode editar tudo",
          page.locator("#listaHistorico .cartao").count() == 3,
          page.locator("#listaHistorico .cartao").count())
    check("K5 admin tem o selector de mês", visivel(page, "#linhaMesAdmin"))
    page.screenshot(path=os.path.join(OUT, "11_admin.png"), full_page=True)

    # admin persiste ao trocar de utilizador
    ir_entrada(page)
    check("K6 modo admin persiste", visivel(page, "#avisoAdminActivo"))
    page.fill("#inpNome", "Gestor2")
    page.click("#btnComecar")
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    check("K7 continua admin sem senha", "ADMIN" in page.inner_text("#topoNome"))

    # admin corrige o registo de outra pessoa
    cartao(page, "L2").click()
    esperar_ecra(page, "ecraEditar")
    page.fill("#inpEditar", "7.7")
    page.click("#btnGuardarEdicao")
    esperar_ecra(page, "ecraBusca")
    time.sleep(1.5)
    check("K8 admin gravou a correcção de outra pessoa",
          any(l[3] == "L2" and l[4] == "7.70" for l in estado()["log"]["lines"]),
          estado()["log"]["lines"])

    ir_entrada(page)
    page.click("#btnSairAdmin")
    time.sleep(0.4)
    check("K9 sai do modo admin", not visivel(page, "#avisoAdminActivo"))

    # --------------------------------------------------------- L. outro local
    page.fill("#inpNome", "Op1")
    page.click("#btnComecar")
    esperar_ecra(page, "ecraMenu")
    page.click("#cartaoColheita")
    page.wait_for_load_state("load")
    esperar_ecra(page, "ecraLocal")
    page.click('.escolha-local[data-site="lines"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    page.click("#btnMudarLocal")
    esperar_ecra(page, "ecraLocal")
    check("L0 vindo de \"Mudar local\" o local actual vem marcado",
          page.locator('.escolha-local[data-site="lines"].activo').count() == 1)
    page.click('.escolha-local[data-site="blocks"]')
    page.click("#btnContinuar")
    esperar_ecra(page, "ecraBusca")
    check("L1 muda para 7 de Abril",
          "7 DE ABRIL" in page.inner_text("#topoMes").upper(), page.inner_text("#topoMes"))
    check("L2 rótulo do bloco",
          "bloco" in page.inner_text("#rotuloBusca").lower(), page.inner_text("#rotuloBusca"))
    registar(page, 7, 12.5)
    time.sleep(1.5)
    st = estado()
    check("L3 grava na folha dos blocos",
          len(st["log"]["blocks"]) == 1 and st["log"]["blocks"][0][3] == "7",
          st["log"]["blocks"])
    check("L4 não mexeu nas linhas", len(st["log"]["lines"]) == 3)
    page.screenshot(path=os.path.join(OUT, "12_blocos.png"), full_page=True)

    # --------------------------------------------------- M. servidor em baixo
    api("/__falhar?on=1")
    registar(page, 8, 3.3)
    time.sleep(3.0)
    check("M1 registo fica guardado quando o servidor falha",
          "por enviar" in page.inner_text("#barra").lower() or
          "guardado" in page.inner_text("#barra").lower(), page.inner_text("#barra"))
    api("/__falhar?on=0")
    page.evaluate("() => window.dispatchEvent(new Event('online'))")
    fim = time.time() + 25
    while time.time() < fim:
        if len(estado()["log"]["blocks"]) >= 2:
            break
        time.sleep(1)
    check("M2 sobe quando o servidor volta", len(estado()["log"]["blocks"]) == 2,
          estado()["log"]["blocks"])

    check("Z sem erros de JavaScript", not erros_js, erros_js)
    browser.close()

print("\n==== SUMMARY ====")
fails = [r for r in results if not r[1]]
print("%d/%d passed" % (len(results) - len(fails), len(results)))
for n, ok, extra in fails:
    print("FAIL:", n, extra)
