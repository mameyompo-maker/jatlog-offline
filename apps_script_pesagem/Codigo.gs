/**
 * JatLog offline — endpoint temporario para o registo de pesagem de sacos de
 * sementes (colheita), uma pesagem de cada vez, nas duas epocas "25-26" e
 * "26-27".
 *
 * Implanta como: Implementar > Nova implementacao > Aplicacao web
 *   - Executar como   : Eu (dono da folha de calculo)
 *   - Quem tem acesso : Qualquer pessoa
 *
 * Este script tem de ter acesso a folha de calculo
 *   1TZ8wHv4N6rPr3e9I0sF4PBtZgZHTrk6npKMc6CZJ4kM
 * (vinculado a ela, ou com permissao para a abrir por ID). E o UNICO escritor
 * das colunas "Actual" (E = No. of sacks weighed, F = Actual weight (kg)) dos
 * separadores "25-26" e "26-27" — nunca escreve nas colunas A..D nem G..H,
 * que pertencem ao separador ja construido manualmente por uma pessoa.
 *
 * Propriedades do script (Definicoes do projeto > Propriedades do script):
 *   TOKEN           — codigo de activacao (sem esta propriedade vale 'jatropha')
 *   ADMIN_PASSWORD  — palavra-passe do administrador (por omissao 'JatRD2026')
 *   Definir os MESMOS valores que nos outros modulos da JatLog (colheita,
 *   India Rec, etc.) para que o codigo de activacao partilhado do "shell" da
 *   aplicacao continue a funcionar em todos os modulos.
 *
 * O cliente envia POST com Content-Type: text/plain para evitar o preflight
 * CORS (o Apps Script nao responde a OPTIONS). O corpo e JSON.
 *
 * Script temporario: ao contrario do Codigo.gs da colheita (Harvest_Log), aqui
 * nao ha nenhuma aplicacao antiga a preservar — Weighing_Log e Audit_Log
 * nascem so com este script, por isso nao precisam de logica de migracao.
 */

// ---------------------------------------------------------------- configuracao

var SPREADSHEET_ID = '1TZ8wHv4N6rPr3e9I0sF4PBtZgZHTrk6npKMc6CZJ4kM';

var SEASONS_VALIDAS = ['25-26', '26-27'];

var FOLHA_LOG = 'Weighing_Log';
var FOLHA_AUDIT = 'Audit_Log';
var FUSO = 'Africa/Maputo';

// Weighing_Log: A..H.
var COL_TS = 1, COL_USER = 2, COL_SEASON = 3, COL_MAE = 4;
var COL_PESO = 5, COL_UNIDADE = 6, COL_KG = 7, COL_UUID = 8;
var LARGURA_LOG = 8;
var CABECALHO_LOG = ['Timestamp', 'Username', 'Season', 'Mother ID',
                      'Weight', 'Unit', 'Weight_kg', 'Record ID'];

var CABECALHO_AUDIT = ['Timestamp', 'Action', 'By User', 'Role', 'Record Owner',
                       'Season', 'Mother ID', 'Old Value', 'Old Unit',
                       'New Value', 'New Unit', 'Op ID'];
var COL_AUDIT_OP = 12;

// Separador de resumo (25-26 / 26-27): cabecalhos na linha 5, dados a partir
// da linha 6. As colunas exactas resolvem-se pelo texto do cabecalho (ver
// colunasResumo_), nao por indice fixo — o separador foi construido a mao.
var LINHA_CABECALHO_RESUMO = 5;
var LINHA_INICIO_RESUMO = 6;
var NOME_COL_MAE_RESUMO = 'Mother ID';
var NOME_COL_SACOS_RESUMO = 'No. of sacks weighed';
var NOME_COL_PESO_RESUMO = 'Actual weight (kg)';

function prop_(nome, porOmissao) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  return (v === null || v === '') ? porOmissao : v;
}
function getToken() { return prop_('TOKEN', 'jatropha'); }
function getAdminPassword() { return prop_('ADMIN_PASSWORD', 'JatRD2026'); }

// ---------------------------------------------------------------- utilitarios

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function agora_() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd HH:mm:ss'); }

function igual_(a, b) {
  return String(a === null || a === undefined ? '' : a).trim().toLowerCase() ===
         String(b === null || b === undefined ? '' : b).trim().toLowerCase();
}

function arred_(n, casas) {
  var f = Math.pow(10, casas || 0);
  return Math.round(n * f) / f;
}

/** Numero do peso -> quilogramas, arredondado a 3 casas. */
function paraQuilos_(peso, unidade) {
  return arred_(unidade === 'g' ? peso / 1000 : peso, 3);
}

function validarEpoca_(season) {
  var s = String(season || '').trim();
  if (SEASONS_VALIDAS.indexOf(s) < 0) {
    throw new Error('Época inválida: "' + s + '" (use "25-26" ou "26-27").');
  }
  return s;
}

// ------------------------------------------------------------------- folhas

function folhaOuCriar_(ss, nome, cabecalho) {
  var f = ss.getSheetByName(nome);
  if (!f) {
    f = ss.insertSheet(nome);
    if (cabecalho && cabecalho.length) {
      f.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
      f.setFrozenRows(1);
    }
  }
  return f;
}

function folhaLog_(ss) { return folhaOuCriar_(ss, FOLHA_LOG, CABECALHO_LOG); }
function folhaAudit_(ss) { return folhaOuCriar_(ss, FOLHA_AUDIT, CABECALHO_AUDIT); }

/** Separador de resumo "25-26" ou "26-27" — ja existe, nunca e criado aqui. */
function folhaSazon_(ss, season) {
  var f = ss.getSheetByName(season);
  if (!f) throw new Error('Separador "' + season + '" não encontrado na folha de cálculo.');
  return f;
}

/** Todas as linhas do Weighing_Log, uma leitura so. */
function lerLog_(folha) {
  var n = folha.getLastRow();
  if (n < 2) return [];
  return folha.getRange(2, 1, n - 1, LARGURA_LOG).getValues();
}

/**
 * IDs ja processados: os Record ID do Weighing_Log mais os Op ID do
 * Audit_Log. E o que impede uma fila reenviada de duplicar registos.
 */
function idsProcessados_(linhasLog, audit) {
  var vistos = {};
  for (var i = 0; i < linhasLog.length; i++) {
    var u = String(linhasLog[i][COL_UUID - 1]).trim();
    if (u) vistos[u] = true;
  }
  var n = audit.getLastRow();
  if (n >= 2) {
    var ops = audit.getRange(2, COL_AUDIT_OP, n - 1, 1).getValues();
    for (var j = 0; j < ops.length; j++) {
      var o = String(ops[j][0]).trim();
      if (o) vistos[o] = true;
    }
  }
  return vistos;
}

/**
 * Encontra a linha de um registo no Weighing_Log. Procura primeiro pelo
 * Record ID; como recurso, procura pelo par Timestamp + Mother ID (nao ha
 * aplicacao antiga sem uuid a escrever aqui, mas mantem-se o mesmo padrao de
 * pesquisa do script da colheita por consistencia). Devolve o indice
 * 1-based na folha.
 */
function procurarLinha_(linhasLog, alvo) {
  var uuid = String((alvo && alvo.uuid) || '').trim();
  if (uuid) {
    for (var i = 0; i < linhasLog.length; i++) {
      if (String(linhasLog[i][COL_UUID - 1]).trim() === uuid) return i + 2;
    }
  }
  var ts = String((alvo && alvo.tsFull) || '').trim();
  var motherId = String((alvo && alvo.motherId) || '').trim();
  if (ts && motherId) {
    for (var k = 0; k < linhasLog.length; k++) {
      if (String(linhasLog[k][COL_TS - 1]).trim() === ts &&
          igual_(linhasLog[k][COL_MAE - 1], motherId)) return k + 2;
    }
  }
  return 0;
}

/**
 * Resolve as colunas do separador de resumo pelo texto do cabecalho (linha
 * LINHA_CABECALHO_RESUMO), em vez de indices fixos — o separador foi
 * construido a mao e este script so pode escrever exactamente nas colunas
 * "No. of sacks weighed" e "Actual weight (kg)".
 */
function colunasResumo_(folhaResumo) {
  var largura = folhaResumo.getLastColumn();
  var cabecalho = folhaResumo.getRange(LINHA_CABECALHO_RESUMO, 1, 1, largura).getValues()[0]
    .map(function (v) { return String(v).trim(); });

  function indiceDe(nome) {
    for (var i = 0; i < cabecalho.length; i++) {
      if (igual_(cabecalho[i], nome)) return i + 1;
    }
    return -1;
  }

  var iMae = indiceDe(NOME_COL_MAE_RESUMO);
  var iSacos = indiceDe(NOME_COL_SACOS_RESUMO);
  var iPeso = indiceDe(NOME_COL_PESO_RESUMO);
  if (iMae < 0) throw new Error('Coluna "' + NOME_COL_MAE_RESUMO + '" não encontrada no separador de resumo.');
  if (iSacos < 0) throw new Error('Coluna "' + NOME_COL_SACOS_RESUMO + '" não encontrada no separador de resumo.');
  if (iPeso < 0) throw new Error('Coluna "' + NOME_COL_PESO_RESUMO + '" não encontrada no separador de resumo.');
  return { mae: iMae, sacos: iSacos, peso: iPeso };
}

/**
 * Linhas de Mother ID do separador de resumo, a partir de LINHA_INICIO_RESUMO.
 * Para no primeiro Mother ID em branco ou igual a "Total" (a linha de
 * rollup). Nunca escreve nada — so le a coluna do Mother ID.
 */
function linhasResumo_(folhaResumo, colMae) {
  var ultima = folhaResumo.getLastRow();
  if (ultima < LINHA_INICIO_RESUMO) return [];
  var valores = folhaResumo
    .getRange(LINHA_INICIO_RESUMO, colMae, ultima - LINHA_INICIO_RESUMO + 1, 1)
    .getValues();

  var linhas = [];
  for (var i = 0; i < valores.length; i++) {
    var v = String(valores[i][0]).trim();
    if (!v || igual_(v, 'Total')) break;
    linhas.push({ motherId: v, linha: LINHA_INICIO_RESUMO + i });
  }
  return linhas;
}

/**
 * Recalcula a partir do Weighing_Log (fonte da verdade) o numero de sacos e
 * o peso total de uma epoca+Mother ID, e escreve o resultado nas colunas
 * "No. of sacks weighed" / "Actual weight (kg)" do separador de resumo. Se o
 * Mother ID nao constar do separador (ainda) nao escreve nada — o
 * Weighing_Log ja ficou correcto de qualquer forma.
 */
function atualizarResumo_(ss, season, motherId, linhas) {
  var folhaResumo = folhaSazon_(ss, season);
  var cols = colunasResumo_(folhaResumo);
  var todas = linhasResumo_(folhaResumo, cols.mae);

  var alvo = null;
  for (var i = 0; i < todas.length; i++) {
    if (igual_(todas[i].motherId, motherId)) { alvo = todas[i]; break; }
  }
  if (!alvo) return;

  var conta = 0, soma = 0;
  for (var k = 0; k < linhas.length; k++) {
    var L = linhas[k];
    if (String(L[COL_SEASON - 1]).trim() !== season) continue;
    if (!igual_(L[COL_MAE - 1], motherId)) continue;
    conta++;
    soma += Number(L[COL_KG - 1]) || 0;
  }

  folhaResumo.getRange(alvo.linha, cols.sacos).setValue(conta);
  folhaResumo.getRange(alvo.linha, cols.peso).setValue(arred_(soma, 3));
}

// ---------------------------------------------------------------- doGet

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token !== getToken()) return jsonOut_({ ok: false, erro: 'Não autorizado.' });

  try {
    var accao = p.action || 'master';
    if (accao === 'admin') {
      return jsonOut_({ ok: true, admin: String(p.pw || '') === getAdminPassword() });
    }
    if (accao === 'master') return jsonOut_(master_(p));
    if (accao === 'log') return jsonOut_(log_(p));
    return jsonOut_({ ok: false, erro: 'Acção desconhecida: ' + accao });
  } catch (err) {
    return jsonOut_({ ok: false, erro: String((err && err.message) || err) });
  }
}

/**
 * Resumo em vivo de uma epoca: para cada Mother ID do separador de resumo,
 * numero de sacos e peso total, sempre calculados a partir do Weighing_Log
 * (nunca a confiar no que ja esta escrito nas colunas E/F — essas sao so a
 * cache que este proprio script mantem).
 */
function master_(p) {
  var season = validarEpoca_(p.season);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var folhaResumo = folhaSazon_(ss, season);
  var cols = colunasResumo_(folhaResumo);
  var linhasResumoArr = linhasResumo_(folhaResumo, cols.mae);

  var folha = folhaLog_(ss);
  var linhas = lerLog_(folha);

  var saida = [];
  for (var i = 0; i < linhasResumoArr.length; i++) {
    var motherId = linhasResumoArr[i].motherId;
    var conta = 0, soma = 0;
    for (var k = 0; k < linhas.length; k++) {
      var L = linhas[k];
      if (String(L[COL_SEASON - 1]).trim() !== season) continue;
      if (!igual_(L[COL_MAE - 1], motherId)) continue;
      conta++;
      soma += Number(L[COL_KG - 1]) || 0;
    }
    saida.push([motherId, conta, arred_(soma, 3)]);
  }

  return { ok: true, hora: agora_(), season: season, linhas: saida };
}

/** Registos de uma epoca (ou de todas, se a epoca vier vazia), limitados aos mais recentes. */
function log_(p) {
  var season = String(p.season || '').trim();
  var limite = Number(p.limite);
  if (!isFinite(limite) || limite <= 0) limite = 200;

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var folha = folhaLog_(ss);
  var linhas = lerLog_(folha);

  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var L = linhas[i];
    if (!String(L[COL_TS - 1]).trim() && !String(L[COL_MAE - 1]).trim()) continue;
    if (season && String(L[COL_SEASON - 1]).trim() !== season) continue;
    saida.push([
      String(L[COL_TS - 1]).trim(),
      String(L[COL_USER - 1]).trim(),
      String(L[COL_SEASON - 1]).trim(),
      String(L[COL_MAE - 1]).trim(),
      String(L[COL_PESO - 1]).trim(),
      String(L[COL_UNIDADE - 1]).trim(),
      String(L[COL_KG - 1]).trim(),
      String(L[COL_UUID - 1]).trim()
    ]);
  }
  if (saida.length > limite) saida = saida.slice(saida.length - limite);

  return { ok: true, hora: agora_(), season: season, registos: saida };
}

// ---------------------------------------------------------------- doPost

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonOut_({ ok: false, erro: 'Servidor ocupado, tente outra vez.' });
  }

  try {
    var pedido;
    try {
      pedido = JSON.parse(e.postData.contents);
    } catch (err2) {
      return jsonOut_({ ok: false, erro: 'JSON inválido.' });
    }

    if (pedido.token !== getToken()) return jsonOut_({ ok: false, erro: 'Não autorizado.' });

    var admin = !!(pedido.adminPassword && pedido.adminPassword === getAdminPassword());
    var entradas = pedido.entries || [];
    if (!entradas.length) return jsonOut_({ ok: true, resultados: [] });

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var folha = folhaLog_(ss);
    var audit = folhaAudit_(ss);
    var linhas = lerLog_(folha);
    var vistos = idsProcessados_(linhas, audit);
    var novosAudits = [];
    var resultados = [];
    var tocados = {}; // chave "season|motherId" -> true, para so recalcular o resumo uma vez por par

    for (var i = 0; i < entradas.length; i++) {
      var ent = entradas[i];
      var uuid = String(ent.uuid || '').trim();

      if (!uuid) { resultados.push({ uuid: '', ok: false, erro: 'Falta o ID do envio.' }); continue; }
      if (vistos[uuid]) { resultados.push({ uuid: uuid, ok: true, duplicado: true }); continue; }

      try {
        var r = aplicar_(ent, uuid, folha, linhas, admin, novosAudits, tocados);
        vistos[uuid] = true;
        resultados.push(r);
      } catch (err3) {
        resultados.push({ uuid: uuid, ok: false, erro: String((err3 && err3.message) || err3) });
      }
    }

    if (novosAudits.length) {
      audit.getRange(audit.getLastRow() + 1, 1, novosAudits.length, CABECALHO_AUDIT.length)
           .setValues(novosAudits);
    }

    // O Weighing_Log ja esta todo actualizado (em memoria e na folha) neste
    // ponto; recalcula o resumo uma vez por cada par epoca+Mother ID tocado,
    // ja com o efeito de todas as entradas do lote.
    for (var chave in tocados) {
      var partes = chave.split('|');
      try {
        atualizarResumo_(ss, partes[0], partes[1], linhas);
      } catch (err4) {
        // Uma epoca/Mother ID sem correspondencia no separador de resumo nao
        // deve impedir o resto do lote; o Weighing_Log ja ficou correcto.
      }
    }

    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, hora: agora_(), resultados: resultados });
  } catch (err5) {
    return jsonOut_({ ok: false, erro: String((err5 && err5.message) || err5) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Aplica uma entrada ao Weighing_Log (e escreve logo, sem batching, para que
 * "linhas" em memoria e a folha nunca se desalinhem — importante porque um
 * mesmo lote pode criar e depois editar/apagar o mesmo registo). Devolve o
 * resultado no formato da resposta e marca em "tocados" o par epoca+Mother ID
 * cujo resumo tem de ser recalculado no fim do lote.
 */
function aplicar_(ent, uuid, folha, linhas, admin, novosAudits, tocados) {
  var tipo = String(ent.tipo || 'criar');
  var quem = String(ent.recorder || '').trim();
  var papel = admin ? 'admin' : 'worker';
  var seasonPedido = String(ent.season || '').trim();

  if (tipo === 'criar') {
    var season = validarEpoca_(seasonPedido);
    var motherId = String(ent.motherId || '').trim();
    if (!motherId) throw new Error('Falta o Mother ID.');
    var peso = Number(ent.weight);
    if (!isFinite(peso) || peso <= 0) throw new Error('Peso inválido.');
    var unidade = (ent.unit === 'g') ? 'g' : 'kg';
    var pesoKg = paraQuilos_(peso, unidade);

    // O carimbo e o do aparelho: e quando a pesagem aconteceu de facto.
    var ts = String(ent.tsLocal || '').trim() || agora_();
    var novaLinha = [ts, quem, season, motherId, peso, unidade, pesoKg, uuid];
    folha.getRange(folha.getLastRow() + 1, 1, 1, LARGURA_LOG).setValues([novaLinha]);
    linhas.push(novaLinha);

    novosAudits.push([agora_(), 'CREATE', quem, papel, quem, season, motherId,
                      '', '', peso, unidade, uuid]);
    tocados[season + '|' + motherId] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: motherId };
  }

  // editar / apagar precisam da linha existente
  var idx = procurarLinha_(linhas, ent.alvo || {});
  if (!idx) {
    // Ja nao existe. Como o combinado e "quem chega depois manda", isto nao e
    // um erro que valha a pena mostrar ao utilizador: o registo desapareceu.
    novosAudits.push([agora_(), tipo === 'apagar' ? 'DELETE' : 'EDIT', quem, papel,
                      '', seasonPedido, String((ent.alvo || {}).motherId || ''),
                      '', '', '', '', uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, ausente: true };
  }

  var L = linhas[idx - 2];
  var dono = String(L[COL_USER - 1]).trim();
  if (!admin && dono && !igual_(dono, quem)) {
    throw new Error('Só o autor (' + dono + ') ou um administrador pode alterar este registo.');
  }

  var motherIdAntigo = String(L[COL_MAE - 1]).trim();
  var seasonLinha = String(L[COL_SEASON - 1]).trim();
  var pesoAntigo = L[COL_PESO - 1];
  var unidadeAntiga = String(L[COL_UNIDADE - 1]).trim();

  if (tipo === 'apagar') {
    folha.deleteRow(idx);
    linhas.splice(idx - 2, 1);
    novosAudits.push([agora_(), 'DELETE', quem, papel, dono, seasonLinha, motherIdAntigo,
                      pesoAntigo, unidadeAntiga, '', '', uuid]);
    tocados[seasonLinha + '|' + motherIdAntigo] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: motherIdAntigo };
  }

  if (tipo === 'editar') {
    var novoPeso = Number(ent.weight);
    if (!isFinite(novoPeso) || novoPeso <= 0) throw new Error('Peso inválido.');
    var novaUnidade = (ent.unit === 'g') ? 'g' : 'kg';
    var novoPesoKg = paraQuilos_(novoPeso, novaUnidade);

    folha.getRange(idx, COL_PESO, 1, 3).setValues([[novoPeso, novaUnidade, novoPesoKg]]);
    L[COL_PESO - 1] = novoPeso;
    L[COL_UNIDADE - 1] = novaUnidade;
    L[COL_KG - 1] = novoPesoKg;

    novosAudits.push([agora_(), 'EDIT', quem, papel, dono, seasonLinha, motherIdAntigo,
                      pesoAntigo, unidadeAntiga, novoPeso, novaUnidade, uuid]);
    tocados[seasonLinha + '|' + motherIdAntigo] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: motherIdAntigo };
  }

  throw new Error('Operação desconhecida: ' + tipo);
}

// ------------------------------------------------- utilitario de diagnostico

/**
 * Executar a partir do editor para confirmar que o script ve os dois
 * separadores de resumo e as folhas de log. Nao altera nada.
 */
function diagnostico() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    for (var i = 0; i < SEASONS_VALIDAS.length; i++) {
      var season = SEASONS_VALIDAS[i];
      var f = ss.getSheetByName(season);
      if (!f) { Logger.log(season + ': SEPARADOR AUSENTE'); continue; }
      var cols = colunasResumo_(f);
      var linhas = linhasResumo_(f, cols.mae);
      Logger.log(season + ': ' + linhas.length + ' Mother ID(s) — colunas sacos=' +
                 cols.sacos + ' peso=' + cols.peso);
    }
    var log = ss.getSheetByName(FOLHA_LOG);
    var audit = ss.getSheetByName(FOLHA_AUDIT);
    Logger.log(FOLHA_LOG + '=' +
               (log ? Math.max(log.getLastRow() - 1, 0) + ' linhas' : 'AUSENTE (criada no 1º uso)'));
    Logger.log(FOLHA_AUDIT + '=' +
               (audit ? Math.max(audit.getLastRow() - 1, 0) + ' linhas' : 'AUSENTE (criada no 1º uso)'));
  } catch (err) {
    Logger.log('ERRO — ' + err);
  }
  Logger.log('TOKEN=' + getToken() + ' / ADMIN_PASSWORD definido=' +
             (getAdminPassword() === 'JatRD2026' ? 'não (usa o valor por omissão)' : 'sim'));
}
