# -*- coding: utf-8 -*-
"""Teste do modo temporario "so ramos" (REMOVER-RAMOS-TEMP).

Cobre especificamente o que pode fazer mal: uma correcao "so ramos" tem de
gravar SO a coluna do Branch, sem tocar em altura/copa/cachos que ja la
estavam. Isto e o oposto do resto da aplicacao, que sempre grava o bloco
de campos inteiro (em branco vai 0/X) -- por isso o teste principal e
verificar o payload enviado ao servidor, campo a campo.

Antes: `python tests/servidor.py docs 8810` (ou reutilizar um ja no ar)."""

import json
import sys
import urllib.parse
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8810"
TOKEN = "jatropha"
RONDA = "5 month after planting (20260511)"
FALHAS = []

FILEIRAS = ([("r%02d" % i, 35) for i in range(1, 10)] +
            [("r%02d" % i, 20) for i in range(10, 13)] +
            [("r%02d" % i, 10) for i in range(13, 17)])


def ok(cond, msg):
    print(("  OK   " if cond else "  FALHA") + "  " + msg)
    if not cond:
        FALHAS.append(msg)


def bater(caminho, **q):
    u = BASE + caminho + ("?" + urllib.parse.urlencode(q) if q else "")
    with urllib.request.urlopen(u) as r:
        return json.loads(r.read().decode())


def log_servidor():
    return bater("/__estado")["india"]


def _posicao(blocos, seq):
    acc = 0
    for nome, n in blocos:
        if seq <= acc + n:
            return nome, seq - acc
        acc += n
    raise ValueError(seq)


def fileira_de(seq):
    return _posicao(FILEIRAS, seq)


def pid(seq):
    return "NBF(Tanheia)26-%03d" % seq


def escolher_seq(pag, seq):
    fila, no = fileira_de(seq)
    pag.locator(f'#grelhaFileiras button:has-text("{fila}")').first.click()
    pag.locator('#teclado button[data-tecla="limpar"]').click()
    for d in str(no):
        pag.locator(f'#teclado button[data-tecla="{d}"]').click()


def voltar_ate_levantamento(pag):
    """[data-voltar] usa uma pilha de navegacao, nao vai directo ao menu — sobe
    ecra a ecra ate chegar ao #ecraLevantamento."""
    for _ in range(8):
        if pag.locator("#ecraLevantamento:not([hidden])").count():
            return
        pag.locator('.ecra:not([hidden]) [data-voltar]').first.click()
        pag.wait_for_timeout(150)
    pag.wait_for_selector("#ecraLevantamento:not([hidden])")


def confirmar_e_avancar(pag):
    pag.click("#btnEnviar")
    pag.wait_for_selector("#dlgIncompleto[open]")
    pag.click("#btnEnviarAssim")
    pag.wait_for_timeout(900)


def campos_do_form(pag):
    """Os data-tecla dos campos numericos actualmente no formulario, pela id."""
    ids = pag.eval_on_selector_all(
        "#camposForm input[id^='campo_']",
        "els => els.map(e => e.id.replace('campo_', ''))")
    return set(ids)


def main():
    bater("/__reset")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 844},
                              is_mobile=True, has_touch=True)
        pag = ctx.new_page()
        erros = []
        pag.on("pageerror", lambda e: erros.append(str(e)))
        pag.on("console", lambda m: erros.append("console: " + m.text) if m.type == "error" else None)

        pag.goto(BASE + "/index.html")
        pag.wait_for_selector("#ecraActivacao:not([hidden])", timeout=10000)
        pag.fill("#inpCodigo", TOKEN)
        pag.click("#btnActivar")
        pag.wait_for_selector("#ecraEntrada:not([hidden])")
        pag.fill("#inpNome", "Cheia")
        pag.click("#btnComecar")
        pag.wait_for_selector("#ecraMenu:not([hidden])")
        pag.click("#cartaoIndia")
        pag.wait_for_load_state("load")
        pag.wait_for_selector("#ecraLevantamento:not([hidden])")

        print("\n[1] ronda normal de crescimento, com altura/copa mas SEM ramos "
              "(simula quem esqueceu de contar os ramos)")
        # 2026-08-18: o ecra de escolher a ronda ficou de fora do caminho (so ha
        # uma ronda por agora) -- entra-se logo em ecraPlanta com RONDA_UNICA.
        pag.click('.cartao[data-modo="crescimento"]')
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        ok("Crescimento" in pag.inner_text("#subPlanta") and "G" in pag.inner_text("#subPlanta"),
           f"cabecalho normal mostra o bloco G-M ({pag.inner_text('#subPlanta')!r})")

        escolher_seq(pag, 50)
        pag.click("#btnPlanta")
        pag.wait_for_selector("#ecraFormulario:not([hidden])")
        # seq 50 cai em r02 (36..70), posicao 50-35=15
        ok(pag.inner_text("#subForm").strip() == "Fileira r02, n.º 15",
           f"cabecalho do formulario tambem poe a fileira em primeiro ({pag.inner_text('#subForm')!r})")
        # nomeRonda() traduz/formata RONDA_UNICA para apresentacao (pt-PT)
        ok(pag.inner_text("#rondaForm").strip() == "5 meses após a plantação (11/05/2026)",
           f"a ronda aparece na sua propria linha, formatada a partir de RONDA_UNICA ({pag.inner_text('#rondaForm')!r})")
        pag.fill("#campo_alturaPlanta", "3,20")
        pag.fill("#campo_cnp1", "1,10")
        pag.fill("#campo_cnp2", "1,05")
        # ramos e os cachos ficam em branco de proposito
        confirmar_e_avancar(pag)

        reg = log_servidor()
        ok(len(reg) == 1, f"1 registo no servidor ({len(reg)})")
        v0 = reg[0]["values"]
        ok(v0.get("alturaPlanta") == 3.2 and v0.get("cnp1") == 1.1 and v0.get("cnp2") == 1.05,
           f"altura/copa gravadas normalmente ({v0})")
        ok(v0.get("ramos") == 0, f"ramos ficou 0 por omissao, como seria hoje ({v0.get('ramos')})")

        print("\n[2] entrar no modo 'so ramos' pela mesma ronda")
        pag.click("#ligTrocarPlanta")
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        voltar_ate_levantamento(pag)

        ok(pag.locator("#ligSomenteRamos").is_visible(), "o botao temporario esta no menu")
        pag.click("#ligSomenteRamos")
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        ok("J" in pag.inner_text("#subPlanta") and "G" not in pag.inner_text("#subPlanta"),
           f"cabecalho diz coluna J, nao o bloco G-M ({pag.inner_text('#subPlanta')!r})")

        print("\n[3] o formulario mostra SO o campo dos ramos")
        escolher_seq(pag, 50)
        ok("pode corrigir" in pag.inner_text("#resolvidoPlanta"),
           "a planta ja aparece com registo (da ronda de crescimento)")
        pag.click("#btnPlanta")
        pag.wait_for_selector("#ecraFormulario:not([hidden])")
        campos = campos_do_form(pag)
        ok(campos == {"ramos"}, f"so o campo 'ramos' aparece no formulario ({campos})")
        ok(pag.locator("#btnEliminar").is_hidden(),
           "Eliminar fica escondido (apagaria o bloco inteiro da ronda)")

        pag.fill("#campo_ramos", "6")
        confirmar_e_avancar(pag)

        reg = log_servidor()
        ok(len(reg) == 2, f"2 registos no servidor ({len(reg)})")
        v1 = reg[1]["values"]
        ok(set(v1.keys()) == {"ramos"},
           f"o envio 'so ramos' so leva a chave ramos, nada de altura/cnp1/cnp2/cachos ({v1})")
        ok(v1.get("ramos") == 6, f"com o valor certo ({v1.get('ramos')})")
        ok(reg[1]["accao"] == "Correction", f"contabilizado como correccao ({reg[1]['accao']})")

        print("\n[4] trocar de planta a meio nao apaga o registo da planta antiga")
        pag.click("#ligTrocarPlanta")
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        escolher_seq(pag, 50)
        pag.click("#btnPlanta")
        pag.wait_for_selector("#ecraFormulario:not([hidden])")
        antes = len(log_servidor())
        pag.click("#cabecalhoPlanta")
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        escolher_seq(pag, 51)
        pag.click("#btnPlanta")
        pag.wait_for_selector("#ecraFormulario:not([hidden])")
        pag.fill("#campo_ramos", "4")
        confirmar_e_avancar(pag)

        reg = log_servidor()
        ok(len(reg) == antes + 1,
           f"so entrou 1 registo novo, nenhuma eliminacao da planta 050 ({len(reg)} vs {antes})")
        ok(not any(r["pid"] == pid(50) and r["accao"] == "Deletion" for r in reg),
           "a planta 050 nao foi eliminada ao trocar de alvo")

        print("\n[5] reabrir pelo historico volta ao mesmo formulario restrito")
        pag.click("#ligTrocarPlanta")
        pag.wait_for_selector("#ecraPlanta:not([hidden])")
        voltar_ate_levantamento(pag)
        pag.click("#ligHistorico")
        pag.wait_for_selector("#ecraHistorico:not([hidden])")
        pag.locator(f'#listaHistorico li:has-text("{pid(50)}")').first.click()
        pag.wait_for_selector("#ecraFormulario:not([hidden])")
        campos = campos_do_form(pag)
        ok(campos == {"ramos"},
           f"reaberto pelo historico continua so com 'ramos' ({campos})")
        ok(pag.locator("#btnEliminar").is_hidden(),
           "Eliminar continua escondido ao reabrir pelo historico")

        print("\n[6] service worker e erros de JS")
        ok(erros == [], f"sem erros de JS ({erros})")

        ctx.close()
        nav.close()

    print("\n" + "=" * 56)
    if FALHAS:
        print(f"{len(FALHAS)} falha(s):")
        for m in FALHAS:
            print(" -", m)
        sys.exit(1)
    print("Todos os testes passaram.")


if __name__ == "__main__":
    main()
