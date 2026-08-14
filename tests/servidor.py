# -*- coding: utf-8 -*-
"""Servidor de teste do JatLog unificado.

Serve docs/ e imita OS DOIS Apps Script:
  /exec-colheita  -> Codigo.gs da colheita  (peso por linha/bloco)
  /exec-india     -> Codigo.gs do India Rec (medicoes das plantas)

O config.js e reescrito para apontar para estes dois caminhos.
Token e senha de administrador sao os mesmos nos dois, como na producao.

  python servidor.py <docs-dir> [porta]

Extras: /__reset  /__estado  /__falhar?on=1  /__semear?quem=&pid=&mode=
"""

import json
import sys
import threading
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

DOCS = Path(sys.argv[1]).resolve()
PORTA = int(sys.argv[2]) if len(sys.argv) > 2 else 8810

TOKEN = "jatropha"
ADMIN_PW = "JatRD2026"

TRAVA = threading.Lock()

# --------------------------------------------------------------- colheita

COLS_CRESC = ["alturaPlanta", "cnp1", "cnp2", "ramos",
              "cachosFrutos", "cachosFlores", "cachosBotoes"]
COLS_DESCR = ["habitoCrescimento", "limboFoliar", "peciolo", "folhaComprimento",
              "folhaLargura", "lobulosFolha", "corInflorMasc", "corInflorFem",
              "corFruto", "frutoComprimento", "frutoLargura", "sementeComprimento",
              "sementeLargura"]
BASE_CRESC = 7    # coluna G
BASE_DESCR = 14   # coluna N


def master_lines():
    return [
        ["L1", "S001", "GJ-01", "48", "M-114"],
        ["L2", "S002", "GJ-01", "52", "M-115"],
        ["L3", "S003", "GJ-02", "40", "M-116"],
        ["L586 to L593", "S086", "GJ-02", "301", "M-586"],
        ["L586", "S087", "GJ-03", "44", "M-586B"],
    ]


def master_blocks():
    return [[str(i), "SB%03d" % i, "GJ-0%d" % (1 + i % 2), str(30 + i), "MB-%03d" % i]
            for i in range(1, 16)]


def estado_inicial():
    return {
        "master": {"lines": master_lines(), "blocks": master_blocks()},
        "log": {"lines": [], "blocks": []},   # [ts, user, mes, campo, peso, unid, gramas, uuid]
        "audit": {"lines": [], "blocks": []},
        "india": [],
        "indiaUuids": set(),
        "indiaMortas": set(),
        "falhar": False,
    }


E = estado_inicial()


def agora():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def igual(a, b):
    return str(a or "").strip().lower() == str(b or "").strip().lower()


def ids_processados(site):
    vistos = set()
    for linha in E["log"][site]:
        if linha[7]:
            vistos.add(linha[7])
    for a in E["audit"][site]:
        if a[11]:
            vistos.add(a[11])
    return vistos


def procurar(site, alvo):
    alvo = alvo or {}
    u = str(alvo.get("uuid") or "").strip()
    if u:
        for i, linha in enumerate(E["log"][site]):
            if linha[7] == u:
                return i
    ts = str(alvo.get("tsFull") or "").strip()
    campo = str(alvo.get("line") or "").strip()
    if ts and campo:
        for i, linha in enumerate(E["log"][site]):
            if linha[0] == ts and igual(linha[3], campo):
                return i
    return -1


def gramas(peso, unidade):
    return int(round(peso * 1000 if unidade == "kg" else peso))


def aplicar_colheita(ent, admin):
    uid = str(ent.get("uuid") or "").strip()
    site = ent.get("site")
    if site not in E["log"]:
        return {"uuid": uid, "ok": False, "erro": "Local desconhecido: %s" % site}
    if not uid:
        return {"uuid": "", "ok": False, "erro": "Falta o ID do envio."}
    if uid in ids_processados(site):
        return {"uuid": uid, "ok": True, "duplicado": True}

    tipo = ent.get("tipo", "criar")
    quem = str(ent.get("recorder") or "").strip()
    papel = "admin" if admin else "worker"
    mes = str(ent.get("month") or "").strip()

    if tipo == "criar":
        try:
            peso = float(ent.get("weight"))
        except (TypeError, ValueError):
            return {"uuid": uid, "ok": False, "erro": "Peso inválido."}
        if peso <= 0:
            return {"uuid": uid, "ok": False, "erro": "Peso inválido."}
        unidade = "g" if ent.get("unit") == "g" else "kg"
        campo = str(ent.get("line") or "").strip()
        ts = str(ent.get("tsLocal") or "").strip() or agora()
        E["log"][site].append([ts, quem, mes, campo, "%.2f" % peso, unidade,
                               gramas(peso, unidade), uid])
        E["audit"][site].append([agora(), "CREATE", quem, papel, quem, mes, campo,
                                 "", "", "%.2f" % peso, unidade, uid])
        return {"uuid": uid, "ok": True, "tipo": tipo, "linha": campo}

    idx = procurar(site, ent.get("alvo"))
    if idx < 0:
        E["audit"][site].append([agora(), "DELETE" if tipo == "apagar" else "EDIT",
                                 quem, papel, "", mes,
                                 str((ent.get("alvo") or {}).get("line") or ""),
                                 "", "", "", "", uid])
        return {"uuid": uid, "ok": True, "tipo": tipo, "ausente": True}

    linha = E["log"][site][idx]
    dono = linha[1]
    if not admin and dono and not igual(dono, quem):
        return {"uuid": uid, "ok": False,
                "erro": "Só o autor (%s) ou um administrador pode alterar este registo." % dono}

    if tipo == "apagar":
        E["log"][site].pop(idx)
        E["audit"][site].append([agora(), "DELETE", quem, papel, dono, linha[2], linha[3],
                                 linha[4], linha[5], "", "", uid])
        return {"uuid": uid, "ok": True, "tipo": tipo, "linha": linha[3]}

    if tipo == "editar":
        try:
            peso = float(ent.get("weight"))
        except (TypeError, ValueError):
            return {"uuid": uid, "ok": False, "erro": "Peso inválido."}
        if peso <= 0:
            return {"uuid": uid, "ok": False, "erro": "Peso inválido."}
        unidade = "g" if ent.get("unit") == "g" else "kg"
        antigo, unidade_antiga = linha[4], linha[5]
        linha[4] = "%.2f" % peso
        linha[5] = unidade
        linha[6] = gramas(peso, unidade)
        E["audit"][site].append([agora(), "EDIT", quem, papel, dono, linha[2], linha[3],
                                 antigo, unidade_antiga, linha[4], unidade, uid])
        return {"uuid": uid, "ok": True, "tipo": tipo, "linha": linha[3]}

    return {"uuid": uid, "ok": False, "erro": "Operação desconhecida: %s" % tipo}


# ------------------------------------------------------------------ india

def letra(n):
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def chave(modo, ronda, pid):
    return "%s|%s|%s" % (modo, ronda if modo == "crescimento" else "", pid)


# lotes pela ordem da folha: o n.o de referencia e a posicao nesta lista
LOTES = [("India #bag01", 30), ("India #bag02", 25), ("India #bag03", 25),
         ("India #bag04", 35), ("India #bag05", 15), ("India #bag06", 25),
         ("India #bag07", 25), ("India #bag09", 20), ("India #bag10", 25),
         ("India #bag11", 15), ("India #bag12", 25), ("India #bag13", 35),
         ("India #bag14", 25), ("India #bag15", 35), ("India#S-2A", 20),
         ("India#S-2B", 15), ("India#S-4", 20)]


def referencia(seq):
    """(n.o de referencia, nome do lote, n.o dentro do lote) a partir do seq."""
    acc = 0
    for i, (nome, n) in enumerate(LOTES):
        if seq <= acc + n:
            return i + 1, nome, seq - acc
        acc += n
    return 0, "", 0


def por_chave():
    """Ultimo registo valido de cada planta/levantamento/ronda."""
    out = {}
    for r in E["india"]:
        if not r["estado"].startswith("OK"):
            continue
        # marcas da planta: ficam no log mas nao sao registos de levantamento
        if r["accao"] in ("Dead plant", "Live plant"):
            continue
        k = chave(r["mode"], r.get("ronda", ""), r["pid"])
        if r["accao"] == "Deletion":
            out.pop(k, None)
            continue
        ja = out.get(k)
        novo = dict(r)
        novo["dono"] = ja["dono"] if ja else r["recorder"]
        out[k] = novo
    return out


def aplicar_india(ent, admin):
    uid = ent.get("uuid", "")
    if uid in E["indiaUuids"]:
        return {"uuid": uid, "ok": True, "duplicado": True}

    seq = ent.get("seq")
    if not isinstance(seq, int) or not (1 <= seq <= 415):
        return {"uuid": uid, "ok": False, "erro": "seq inválido"}

    modo = ent.get("mode")
    ronda = ent.get("ronda", "")
    pid = ent.get("pid", "")
    pedida = ent.get("accao", "")

    # marca da planta (morta/viva): nao e registo e nao depende do dono
    if pedida in ("morta", "viva"):
        if pedida == "morta":
            E["indiaMortas"].add(seq)
        else:
            E["indiaMortas"].discard(seq)
        rotulo = "Dead plant" if pedida == "morta" else "Live plant"
        E["indiaUuids"].add(uid)
        E["india"].append(dict(ent, accao=rotulo, estado="OK"))
        return {"uuid": uid, "ok": True, "linha": 2 + seq,
                "accao": rotulo, "celulas": []}

    anterior = por_chave().get(chave(modo, ronda, pid))
    eliminar = pedida == "eliminar"
    accao = "Deletion" if eliminar else ("Correction" if anterior else "Record")

    if eliminar and not anterior:
        erro = "Não há nenhum registo desta planta para eliminar."
        E["india"].append(dict(ent, accao="Deletion", estado="ERROR: " + erro))
        return {"uuid": uid, "ok": False, "erro": erro}

    # desde 2026-08-12 nao ha recusa por causa de quem registou

    if eliminar:
        E["indiaUuids"].add(uid)
        E["india"].append(dict(ent, accao="Deletion", estado="OK"))
        return {"uuid": uid, "ok": True, "linha": 2 + seq,
                "accao": "Deletion", "celulas": []}

    chaves = COLS_CRESC if modo == "crescimento" else COLS_DESCR
    vals = ent.get("values", {})
    celulas = []
    for i, ch in enumerate(chaves):
        if ch in vals and vals[ch] not in (None, ""):
            col = (BASE_CRESC + i) if modo == "crescimento" else (BASE_DESCR + i)
            celulas.append("%s%d" % (letra(col), 2 + seq))

    # uma observacao sozinha ja chega para gravar
    if not celulas and not str(ent.get("notas", "")).strip():
        return {"uuid": uid, "ok": False, "erro": "Nenhum valor preenchido."}

    E["indiaUuids"].add(uid)
    E["india"].append(dict(ent, accao=accao, estado="OK"))
    return {"uuid": uid, "ok": True, "linha": 2 + seq, "accao": accao, "celulas": celulas}


# --------------------------------------------------------------- servidor

CONFIG_JS = (
    "self.JATLOG_CONFIG={ENDPOINT:'/exec-colheita',VERSAO:'teste'};\n"
    "self.INDIAREC_CONFIG={ENDPOINT:'/exec-india',VERSAO:'teste'};\n"
)


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(DOCS), **kw)

    def log_message(self, *a):
        pass

    def _corpo(self, corpo, tipo, codigo=200):
        if isinstance(corpo, str):
            corpo = corpo.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Service-Worker-Allowed", "/")
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, obj, codigo=200):
        self._corpo(json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8", codigo)

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        caminho = u.path

        if caminho == "/config.js":
            return self._corpo(CONFIG_JS, "application/javascript; charset=utf-8")

        if caminho == "/__reset":
            with TRAVA:
                E.update(estado_inicial())
            return self._json({"ok": True})
        if caminho == "/__estado":
            with TRAVA:
                return self._json({"ok": True, "log": E["log"], "audit": E["audit"],
                                   "india": E["india"]})
        if caminho == "/__falhar":
            E["falhar"] = q.get("on", "1") == "1"
            return self._json({"ok": True, "falhar": E["falhar"]})
        if caminho == "/__semear":
            with TRAVA:
                E["india"].append({
                    "uuid": "semeado-1", "tsLocal": "01/08/2026 08:00:00",
                    "recorder": q.get("quem", "Outra Pessoa"), "accao": "Record",
                    "mode": q.get("mode", "descritores"), "ronda": q.get("ronda", ""),
                    "pid": q.get("pid", "NBF(Tanheia)26-100"),
                    "values": {"limboFoliar": 9.9}, "estado": "OK",
                })
            return self._json({"ok": True})

        if caminho == "/exec-colheita":
            return self._get_colheita(q)
        if caminho == "/exec-india":
            return self._get_india(q)

        return super().do_GET()

    def _get_colheita(self, q):
        if E["falhar"]:
            return self._json({"ok": False, "erro": "servidor em baixo"}, 500)
        if q.get("token") != TOKEN:
            return self._json({"ok": False, "erro": "Não autorizado."})
        accao = q.get("action", "master")
        with TRAVA:
            if accao == "admin":
                return self._json({"ok": True, "admin": q.get("pw") == ADMIN_PW})
            site = q.get("site", "lines")
            if site not in E["master"]:
                return self._json({"ok": False, "erro": "Local desconhecido: %s" % site})
            if accao == "master":
                return self._json({
                    "ok": True, "hora": agora(), "site": site,
                    "colunas": ["campo", "saco", "variedade", "plantas", "mae"],
                    "linhas": E["master"][site]})
            if accao == "log":
                mes = q.get("month", "")
                saida = [[l[0], l[1], l[2], l[3], l[4], l[5], l[7]]
                         for l in E["log"][site] if not mes or l[2] == mes]
                return self._json({"ok": True, "hora": agora(), "site": site,
                                   "month": mes, "registos": saida})
            return self._json({"ok": False, "erro": "Acção desconhecida: %s" % accao})

    def _get_india(self, q):
        if E["falhar"]:
            return self._json({"ok": False, "erro": "servidor em baixo"}, 500)
        if q.get("token") != TOKEN:
            return self._json({"ok": False, "erro": "Não autorizado."})
        accao = q.get("action", "estado")
        if accao == "admin":
            return self._json({"ok": True, "admin": q.get("pw") == ADMIN_PW})

        with TRAVA:
            if accao == "estado":
                modo = q.get("mode", "descritores")
                ronda = q.get("ronda", "")
                feitas = []
                for k, r in por_chave().items():
                    if r["mode"] != modo:
                        continue
                    if modo == "crescimento" and r.get("ronda", "") != ronda:
                        continue
                    feitas.append([int(r["pid"][-3:]), r["dono"]])
                feitas.sort()
                return self._json({"ok": True, "hora": "2026-08-10 12:00:00", "mode": modo,
                                   "ronda": ronda, "feitas": feitas,
                                   "mortas": sorted(E["indiaMortas"]),
                                   "rondas": ["5 month after planting (20260511)"]})

            if accao == "historico":
                regs = list(por_chave().values())
                regs.reverse()
                saida = []
                for r in regs[:200]:
                    ref, lote, noLote = referencia(int(r["pid"][-3:]))
                    saida.append(
                        {"uuid": r["uuid"], "ts": r["tsLocal"], "recorder": r["dono"],
                         "ultimo": r["recorder"], "accao": r["accao"], "mode": r["mode"],
                         "ronda": r.get("ronda", ""), "pid": r["pid"],
                         "ref": ref, "lote": lote, "noLote": noLote,
                         "row": r.get("row", ""), "noFileira": r.get("noFileira", "")})
                return self._json({"ok": True, "hora": "2026-08-10 12:00:00", "registos": saida})

            if accao == "registo":
                for r in reversed(E["india"]):
                    if r["uuid"] == q.get("uuid"):
                        return self._json({"ok": True, "registo": {
                            "uuid": r["uuid"], "ts": r["tsLocal"], "recorder": r["recorder"],
                            "mode": r["mode"], "ronda": r.get("ronda", ""), "pid": r["pid"],
                            "notas": r.get("notas", ""),
                            "values": r["values"]}})
                return self._json({"ok": False, "erro": "Registo não encontrado."})

        return self._json({"ok": False, "erro": "Acção desconhecida: " + accao})

    # ----------------------------------------------------------------- POST
    def do_POST(self):
        caminho = urlparse(self.path).path
        if caminho not in ("/exec-colheita", "/exec-india"):
            return self._json({"ok": False, "erro": "nao encontrado"}, 404)
        if E["falhar"]:
            return self._json({"ok": False, "erro": "servidor em baixo"}, 500)

        n = int(self.headers.get("Content-Length") or 0)
        try:
            pedido = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._json({"ok": False, "erro": "JSON inválido."})

        if pedido.get("token") != TOKEN:
            return self._json({"ok": False, "erro": "Não autorizado."})

        admin = pedido.get("adminPassword") == ADMIN_PW
        aplicar = aplicar_colheita if caminho == "/exec-colheita" else aplicar_india
        with TRAVA:
            resultados = [aplicar(e, admin) for e in (pedido.get("entries") or [])]
        return self._json({"ok": True, "hora": agora(), "resultados": resultados})


class Servidor(ThreadingHTTPServer):
    """Recusa arrancar se ja houver um servidor na porta.

    No Windows o allow_reuse_address deixa dois processos ficarem com a mesma
    porta e os pedidos vao parar a um deles ao calhas — ja custou meia hora a
    perceber que era uma copia antiga a responder.
    """
    allow_reuse_address = False
    daemon_threads = True


if __name__ == "__main__":
    srv = Servidor(("127.0.0.1", PORTA), H)
    print("a servir %s em http://127.0.0.1:%d" % (DOCS, PORTA), flush=True)
    srv.serve_forever()
