/**
 * JatLog offline — endpoint do peso da colheita por mes (Indice 17), um
 * lancamento de cada vez, por Source ID, nas colunas Apr/26..Mar/27 (ciclo
 * de 12 meses).
 *
 * Implanta como: Implementar > Nova implementacao > Aplicacao web
 *   - Executar como   : Eu (dono da folha de calculo)
 *   - Quem tem acesso : Qualquer pessoa
 *
 * Este script tem de ter acesso a folha de calculo
 *   10q83vNULXo8o9HeAdNqibwVXkAYDazCLGy-nIQzvWms  ("India 17 weight")
 * E o UNICO escritor das colunas de mes (Apr/26..Mar/27) e de "Total weight"
 * da folha de dados — nunca escreve em S.No, Source ID, Row Number nem
 * Total no.of plant.
 *
 * Propriedades do script (Definicoes do projeto > Propriedades do script):
 *   TOKEN           — codigo de activacao (sem esta propriedade vale 'jatropha')
 *   ADMIN_PASSWORD  — palavra-passe do administrador (por omissao 'JatRD2026')
 *   Definir os MESMOS valores que nos outros modulos da JatLog (colheita,
 *   India Rec, pesagem) para que o codigo de activacao partilhado do "shell"
 *   da aplicacao continue a funcionar em todos os modulos.
 *
 * O cliente envia POST com Content-Type: text/plain para evitar o preflight
 * CORS (o Apps Script nao responde a OPTIONS). O corpo e JSON.
 *
 * Script novo: tal como o da pesagem, Harvest17_Log, Harvest17_Audit e
 * Harvest17_Hatena nascem so com este script, por isso nao precisam de
 * logica de migracao. Harvest17_Hatena e o total mensal do Source ID
 * especial "?" (lancamento desconhecido, tal como o "?" da colheita/
 * pesagem) — o Kaz pediu para NAO acrescentar esse caso a folha "India 17
 * weight", por isso fica numa folha propria, uma linha por mes.
 *
 * Antes de implantar, corre a funcao diagnostico() (menu "Executar" no editor,
 * escolhendo essa funcao) e confere o registo (Ver > Registos de execucao):
 * tem de mostrar a folha de dados encontrada, as colunas resolvidas e os 17
 * Source ID. Se der erro a resolver uma coluna, e porque o nome dela na
 * folha real nao bate certo com as constantes NOME_COL_* abaixo — corrige a
 * constante para bater com o texto exacto da folha.
 */

// ---------------------------------------------------------------- configuracao

var SPREADSHEET_ID = '10q83vNULXo8o9HeAdNqibwVXkAYDazCLGy-nIQzvWms';

// Os 12 meses com coluna propria na folha (ciclo Apr/26..Mar/27) — usados
// para resolver cols.meses e para somar o "Total weight". Ate 2026-08-28
// existia um caso especial "Up to Jul/26" (coluna acumulada); o Kaz
// substituiu-o por 4 colunas mensais normais (Apr/May/Jun/Jul/26), por isso
// o ciclo passou a ser 12 meses normais, sem excepcao.
var MESES_COLUNAS = ['Apr/26', 'May/26', 'Jun/26', 'Jul/26',
                      'Aug/26', 'Sep/26', 'Oct/26', 'Nov/26', 'Dec/26',
                      'Jan/27', 'Feb/27', 'Mar/27'];

var MESES_VALIDOS = MESES_COLUNAS;

var FOLHA_LOG = 'Harvest17_Log';
var FOLHA_AUDIT = 'Harvest17_Audit';
var FUSO = 'Africa/Maputo';

// Fonte especial "?" (Source ID desconhecido, tal como o "?" da colheita e
// da pesagem): o Kaz pediu para NÃO mexer na folha "India 17 weight", por
// isso "?" nunca lá aparece. Cada lançamento com sourceId="?" fica sempre no
// Harvest17_Log (aceita qualquer texto, sem validação de lista) e, além
// disso, o total por mês fica visível numa folha própria, criada sozinha —
// ver folhaHatena_/atualizarHatena17_.
var SOURCE_HATENA = '?';
var FOLHA_HATENA = 'Harvest17_Hatena';
var CABECALHO_HATENA = ['Month', 'Records', 'Total weight (g)'];

// Harvest17_Log: A..I. Weight_kg (coluna G) e um campo antigo — mantido tal
// e qual pelos registos ja gravados; Weight_g (coluna I, 2026-08-30) e o novo
// campo "fonte da verdade" para tudo o que este script calcula sozinho (as
// colunas mensais e "Total weight" da folha de dados, e o total do "?" em
// Harvest17_Hatena), para ficar consistente com colheita/pesagem (gramas).
// Ver garantirColunaG_ para a migracao automatica de uma folha ja existente.
var COL_TS = 1, COL_USER = 2, COL_MES = 3, COL_SOURCE = 4;
var COL_PESO = 5, COL_UNIDADE = 6, COL_KG = 7, COL_UUID = 8, COL_G = 9;
var LARGURA_LOG = 9;
var CABECALHO_LOG = ['Timestamp', 'Username', 'Month', 'Source ID',
                      'Weight', 'Unit', 'Weight_kg', 'Record ID', 'Weight_g'];

var CABECALHO_AUDIT = ['Timestamp', 'Action', 'By User', 'Role', 'Record Owner',
                       'Month', 'Source ID', 'Old Value', 'Old Unit',
                       'New Value', 'New Unit', 'Op ID'];
var COL_AUDIT_OP = 12;

// Folha de dados ("India 17 weight"): cabecalho em DUAS linhas — a linha 1
// tem S.No/Source ID/Row Number/Total no.of plant (mescladas verticalmente
// com a linha 2); a linha 2 tem os meses e "Total weight". As colunas
// resolvem-se pelo texto (linha 1 OU linha 2, o que estiver preenchido),
// nunca por indice fixo — ver colunasDados_.
var NOME_FOLHA_DADOS = 'シート1';           // nome por omissao do Google Sheets em japones
var LINHA_CAB1 = 1, LINHA_CAB2 = 2, LINHA_INICIO_DADOS = 3;
var NOME_COL_SOURCE = 'Source ID';
var NOME_COL_ROWNUM = 'Row Number';
var NOME_COL_PLANTAS = 'Total no.of plant';
var NOME_COL_TOTAL = 'Total weight';

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

/** Numero do peso -> gramas, do mesmo modo que colheita/pesagem. */
function paraGramas_(peso, unidade) {
  return Math.round(unidade === 'kg' ? peso * 1000 : peso);
}

function validarMes_(mes) {
  var m = String(mes || '').trim();
  if (MESES_VALIDOS.indexOf(m) < 0) {
    throw new Error('Mês inválido: "' + m + '" (use um de: ' + MESES_VALIDOS.join(', ') + ').');
  }
  return m;
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

/**
 * Harvest17_Log com a coluna I (Weight_g) garantida, sem mexer nas colunas
 * A..H existentes (2026-08-30: Kaz pediu para os totais automaticos ficarem
 * em gramas, tal como colheita/pesagem, sem apagar o que ja esta gravado).
 * Se a folha ja existir sem a coluna I, acrescenta-a, preenche o cabecalho e
 * faz o backfill de todas as linhas antigas (Weight_g = Weight_kg × 1000 —
 * exacto, porque Weight_kg ja tem precisao de grama ao arredondar a 3 casas)
 * e, so nessa primeira vez, também recalcula tudo o que ja estava em
 * quilos na folha de dados e no Harvest17_Hatena (ver recalcularTudoEmGramas_).
 */
function folhaLog_(ss) {
  var f = folhaOuCriar_(ss, FOLHA_LOG, CABECALHO_LOG);
  if (f.getMaxColumns() < LARGURA_LOG) {
    f.insertColumnsAfter(f.getMaxColumns(), LARGURA_LOG - f.getMaxColumns());
  }
  if (String(f.getRange(1, COL_G).getValue()).trim() === '') {
    f.getRange(1, COL_G).setValue('Weight_g').setFontWeight('bold');
    var ultima = f.getLastRow();
    if (ultima >= 2) {
      var kgVals = f.getRange(2, COL_KG, ultima - 1, 1).getValues();
      var gVals = kgVals.map(function (linha) {
        return [Math.round((Number(linha[0]) || 0) * 1000)];
      });
      f.getRange(2, COL_G, ultima - 1, 1).setValues(gVals);
    }
    recalcularTudoEmGramas_(ss, f);
  }
  return f;
}
function folhaAudit_(ss) { return folhaOuCriar_(ss, FOLHA_AUDIT, CABECALHO_AUDIT); }

/** Harvest17_Hatena com o cabecalho da 3.a coluna corrigido para gramas,
 * mesmo numa folha ja existente que ainda diga "(kg)" (2026-08-30). */
function folhaHatena_(ss) {
  var f = folhaOuCriar_(ss, FOLHA_HATENA, CABECALHO_HATENA);
  var c3 = CABECALHO_HATENA[2];
  if (String(f.getRange(1, 3).getValue()).trim() !== c3) {
    f.getRange(1, 3).setValue(c3).setFontWeight('bold');
  }
  return f;
}

/**
 * Folha de dados ("India 17 weight"): tenta o nome esperado primeiro; se a
 * folha tiver sido renomeada (2026-08-28: passou de "シート1" a "26-27"; por
 * isso NOME_FOLHA_DADOS não é de fiar sozinho), usa a primeira folha que não
 * seja nenhuma das três que este script cria (Harvest17_Log / Harvest17_Audit
 * / Harvest17_Hatena). Nunca é criada aqui — se não existir nenhuma, é erro.
 * Só funciona enquanto houver UMA ÚNICA folha de dados nesta spreadsheet.
 */
function folhaDados_(ss) {
  var f = ss.getSheetByName(NOME_FOLHA_DADOS);
  if (f) return f;
  var todas = ss.getSheets();
  for (var i = 0; i < todas.length; i++) {
    var nome = todas[i].getName();
    if (nome !== FOLHA_LOG && nome !== FOLHA_AUDIT && nome !== FOLHA_HATENA) return todas[i];
  }
  throw new Error('Não foi possível encontrar a folha de dados (esperava "' + NOME_FOLHA_DADOS + '").');
}

/** Todas as linhas do Harvest17_Log, uma leitura so. */
function lerLog_(folha) {
  var n = folha.getLastRow();
  if (n < 2) return [];
  return folha.getRange(2, 1, n - 1, LARGURA_LOG).getValues();
}

/**
 * IDs ja processados: os Record ID do Harvest17_Log mais os Op ID do
 * Harvest17_Audit. E o que impede uma fila reenviada de duplicar registos.
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
 * Encontra a linha de um registo no Harvest17_Log. Procura primeiro pelo
 * Record ID; como recurso, procura pelo par Timestamp + Source ID. Devolve
 * o indice 1-based na folha.
 */
function procurarLinha_(linhasLog, alvo) {
  var uuid = String((alvo && alvo.uuid) || '').trim();
  if (uuid) {
    for (var i = 0; i < linhasLog.length; i++) {
      if (String(linhasLog[i][COL_UUID - 1]).trim() === uuid) return i + 2;
    }
  }
  var ts = String((alvo && alvo.tsFull) || '').trim();
  var sourceId = String((alvo && alvo.sourceId) || '').trim();
  if (ts && sourceId) {
    for (var k = 0; k < linhasLog.length; k++) {
      if (String(linhasLog[k][COL_TS - 1]).trim() === ts &&
          igual_(linhasLog[k][COL_SOURCE - 1], sourceId)) return k + 2;
    }
  }
  return 0;
}

/**
 * Resolve as colunas da folha de dados pelo texto do cabecalho, combinando a
 * linha 1 e a linha 2 (uma tem valor, a outra fica em branco, por causa das
 * celulas mescladas verticalmente) — nunca por indice fixo. "total" pode
 * nao existir (-1): so afecta o preenchimento de "Total weight", nunca
 * impede a escrita do mes em si.
 */
function colunasDados_(folha) {
  var largura = folha.getLastColumn();
  var l1 = folha.getRange(LINHA_CAB1, 1, 1, largura).getValues()[0];
  var l2 = folha.getRange(LINHA_CAB2, 1, 1, largura).getValues()[0];
  var cab = [];
  for (var i = 0; i < largura; i++) {
    var a = String(l1[i]).trim(), b = String(l2[i]).trim();
    cab.push(a || b);
  }

  function indiceDe(nome) {
    for (var i = 0; i < cab.length; i++) {
      if (igual_(cab[i], nome)) return i + 1;
    }
    return -1;
  }

  var iSource = indiceDe(NOME_COL_SOURCE);
  var iRowNum = indiceDe(NOME_COL_ROWNUM);
  var iPlantas = indiceDe(NOME_COL_PLANTAS);
  if (iSource < 0) throw new Error('Coluna "' + NOME_COL_SOURCE + '" não encontrada na folha de dados.');
  if (iRowNum < 0) throw new Error('Coluna "' + NOME_COL_ROWNUM + '" não encontrada na folha de dados.');
  if (iPlantas < 0) throw new Error('Coluna "' + NOME_COL_PLANTAS + '" não encontrada na folha de dados.');

  var meses = {};
  MESES_COLUNAS.forEach(function (m) {
    var i = indiceDe(m);
    if (i < 0) throw new Error('Coluna do mês "' + m + '" não encontrada na folha de dados.');
    meses[m] = i;
  });

  return {
    source: iSource, rowNum: iRowNum, plantas: iPlantas, meses: meses,
    total: indiceDe(NOME_COL_TOTAL),   // só cache do total geral — opcional
    largura: largura
  };
}

/** Devolve o índice de coluna (1-based) do "mes" pedido. */
function colunaDoMes_(cols, mes) {
  return cols.meses[mes];
}

/**
 * Linhas de Source ID da folha de dados, a partir de LINHA_INICIO_DADOS. Para
 * no primeiro Source ID em branco ou igual a "Total" (a linha de rollup).
 * Nunca escreve nada — so le Source ID / Row Number / Total no.of plant.
 */
function linhasDados_(folha, cols) {
  var ultima = folha.getLastRow();
  if (ultima < LINHA_INICIO_DADOS) return [];
  var valores = folha.getRange(LINHA_INICIO_DADOS, 1, ultima - LINHA_INICIO_DADOS + 1, cols.largura).getValues();

  var linhas = [];
  for (var i = 0; i < valores.length; i++) {
    var linha = valores[i];
    var sourceId = String(linha[cols.source - 1]).trim();
    if (!sourceId || igual_(sourceId, 'Total')) break;
    linhas.push({
      sourceId: sourceId,
      rowNumber: String(linha[cols.rowNum - 1]).trim(),
      totalPlantas: linha[cols.plantas - 1],
      linha: LINHA_INICIO_DADOS + i
    });
  }
  return linhas;
}

/**
 * Recalcula a partir do Harvest17_Log (fonte da verdade) o peso desse mes
 * para esse Source ID, e escreve o resultado na coluna do mes da folha de
 * dados (ver colunaDoMes_). Tambem actualiza "Total weight" (soma de todos
 * os meses de MESES_COLUNAS) quando essa coluna existir — se nao existir, so
 * essa parte fica sem se actualizar (nao e essencial ao contrato, so uma
 * comodidade). Se o Source ID nao constar da folha de dados (ainda), nao
 * escreve nada — o Log ja ficou correcto de qualquer forma.
 */
function atualizarResumo17_(folhaD, cols, mes, sourceId, linhasLog) {
  var todas = linhasDados_(folhaD, cols);
  var alvo = null;
  for (var i = 0; i < todas.length; i++) {
    if (igual_(todas[i].sourceId, sourceId)) { alvo = todas[i]; break; }
  }
  if (!alvo) return;

  var soma = 0;
  for (var k = 0; k < linhasLog.length; k++) {
    var L = linhasLog[k];
    if (String(L[COL_MES - 1]).trim() !== mes) continue;
    if (!igual_(L[COL_SOURCE - 1], sourceId)) continue;
    soma += Number(L[COL_G - 1]) || 0;
  }
  folhaD.getRange(alvo.linha, colunaDoMes_(cols, mes)).setValue(Math.round(soma));

  if (cols.total > 0) {
    var somaTudo = 0;
    MESES_COLUNAS.forEach(function (m) {
      somaTudo += Number(folhaD.getRange(alvo.linha, cols.meses[m]).getValue()) || 0;
    });
    folhaD.getRange(alvo.linha, cols.total).setValue(Math.round(somaTudo));
  }
}

/**
 * Migração única, disparada por folhaLog_ na primeira vez que a coluna
 * Weight_g é criada numa folha já em produção:
 * recalcula TODAS as células de "India 17 weight" e Harvest17_Hatena a
 * partir do Harvest17_Log (agora em gramas), para nenhum mês antigo ficar a
 * mostrar quilos ao lado de meses novos em gramas na mesma coluna. Em lote
 * (uma leitura do Log + uma escrita por Source ID), não célula a célula
 * chamando atualizarResumo17_ em loop, para não estourar o tempo de
 * execução (17 Source ID × 12 meses seria bem mais lento).
 */
function recalcularTudoEmGramas_(ss, folha) {
  var folhaD = folhaDados_(ss);
  var cols = colunasDados_(folhaD);
  var linhasD = linhasDados_(folhaD, cols);
  var linhasLog = lerLog_(folha);

  linhasD.forEach(function (d) {
    var somasPorMes = {};
    MESES_COLUNAS.forEach(function (m) { somasPorMes[m] = 0; });
    linhasLog.forEach(function (L) {
      if (!igual_(L[COL_SOURCE - 1], d.sourceId)) return;
      var mes = String(L[COL_MES - 1]).trim();
      if (somasPorMes.hasOwnProperty(mes)) somasPorMes[mes] += Number(L[COL_G - 1]) || 0;
    });
    var somaTudo = 0;
    MESES_COLUNAS.forEach(function (m) {
      somaTudo += somasPorMes[m];
      folhaD.getRange(d.linha, cols.meses[m]).setValue(Math.round(somasPorMes[m]));
    });
    if (cols.total > 0) folhaD.getRange(d.linha, cols.total).setValue(Math.round(somaTudo));
  });

  var mesesComHatena = {};
  linhasLog.forEach(function (L) {
    if (igual_(L[COL_SOURCE - 1], SOURCE_HATENA)) mesesComHatena[String(L[COL_MES - 1]).trim()] = true;
  });
  if (Object.keys(mesesComHatena).length) {
    var folhaH = folhaHatena_(ss);
    Object.keys(mesesComHatena).forEach(function (mes) {
      atualizarHatena17_(folhaH, mes, linhasLog);
    });
  }
}

/**
 * Recalcula, a partir do Harvest17_Log, o total desse mês para o Source ID
 * especial "?" e escreve/actualiza a linha correspondente na folha
 * Harvest17_Hatena (uma linha por mês, criada por este script — a folha
 * "India 17 weight" fica sempre de fora disto, por pedido do Kaz).
 */
function atualizarHatena17_(folhaH, mes, linhasLog) {
  var conta = 0, soma = 0;
  for (var k = 0; k < linhasLog.length; k++) {
    var L = linhasLog[k];
    if (String(L[COL_MES - 1]).trim() !== mes) continue;
    if (!igual_(L[COL_SOURCE - 1], SOURCE_HATENA)) continue;
    conta++;
    soma += Number(L[COL_G - 1]) || 0;
  }

  var ultima = folhaH.getLastRow();
  var linha = 0;
  if (ultima >= 2) {
    var meses = folhaH.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < meses.length; i++) {
      if (String(meses[i][0]).trim() === mes) { linha = i + 2; break; }
    }
  }
  if (!linha) linha = Math.max(ultima + 1, 2);

  folhaH.getRange(linha, 1, 1, CABECALHO_HATENA.length).setValues([[mes, conta, Math.round(soma)]]);
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
 * Resumo em vivo de um mes: para cada Source ID da folha de dados, quantos
 * registos e quantas gramas, sempre calculados a partir do Harvest17_Log
 * (nunca a confiar no que ja esta escrito na coluna do mes — essa e so a
 * cache que este proprio script mantem).
 */
function master_(p) {
  var mes = validarMes_(p.mes);
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var folhaD = folhaDados_(ss);
  var cols = colunasDados_(folhaD);
  var linhasD = linhasDados_(folhaD, cols);

  var folha = folhaLog_(ss);
  var linhasLog = lerLog_(folha);

  var saida = [];
  for (var i = 0; i < linhasD.length; i++) {
    var d = linhasD[i];
    var conta = 0, soma = 0;
    for (var k = 0; k < linhasLog.length; k++) {
      var L = linhasLog[k];
      if (String(L[COL_MES - 1]).trim() !== mes) continue;
      if (!igual_(L[COL_SOURCE - 1], d.sourceId)) continue;
      conta++;
      soma += Number(L[COL_G - 1]) || 0;
    }
    saida.push([d.sourceId, d.rowNumber, d.totalPlantas, conta, Math.round(soma)]);
  }

  return { ok: true, hora: agora_(), mes: mes, linhas: saida };
}

/** Registos de um mes (ou de todos, se o mes vier vazio), limitados aos mais recentes. */
function log_(p) {
  var mes = String(p.mes || '').trim();
  var limite = Number(p.limite);
  if (!isFinite(limite) || limite <= 0) limite = 200;

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var folha = folhaLog_(ss);
  var linhas = lerLog_(folha);

  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var L = linhas[i];
    if (!String(L[COL_TS - 1]).trim() && !String(L[COL_SOURCE - 1]).trim()) continue;
    if (mes && String(L[COL_MES - 1]).trim() !== mes) continue;
    saida.push([
      String(L[COL_TS - 1]).trim(),
      String(L[COL_USER - 1]).trim(),
      String(L[COL_MES - 1]).trim(),
      String(L[COL_SOURCE - 1]).trim(),
      String(L[COL_PESO - 1]).trim(),
      String(L[COL_UNIDADE - 1]).trim(),
      String(L[COL_G - 1]).trim(),
      String(L[COL_UUID - 1]).trim()
    ]);
  }
  if (saida.length > limite) saida = saida.slice(saida.length - limite);

  return { ok: true, hora: agora_(), mes: mes, registos: saida };
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
    var tocados = {}; // chave "mes|sourceId" -> true, para so recalcular a cache uma vez por par

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

    // O Harvest17_Log ja esta todo actualizado (em memoria e na folha) neste
    // ponto; recalcula a cache uma vez por cada par mes+Source ID tocado, ja
    // com o efeito de todas as entradas do lote. O Source ID especial "?"
    // nunca esta na folha "India 17 weight" (por pedido do Kaz), por isso
    // vai antes para a folha Harvest17_Hatena, criada a parte.
    if (Object.keys(tocados).length) {
      var folhaD = folhaDados_(ss);
      var cols = colunasDados_(folhaD);
      var folhaH = null;
      for (var chave in tocados) {
        var partes = chave.split('|');
        var mesTocado = partes[0], sourceIdTocado = partes[1];
        if (igual_(sourceIdTocado, SOURCE_HATENA)) {
          try {
            folhaH = folhaH || folhaHatena_(ss);
            atualizarHatena17_(folhaH, mesTocado, linhas);
          } catch (err4b) {
            // Idem: nao deve impedir o resto do lote.
          }
          continue;
        }
        try {
          atualizarResumo17_(folhaD, cols, mesTocado, sourceIdTocado, linhas);
        } catch (err4) {
          // Um mes/Source ID sem correspondencia na folha de dados nao deve
          // impedir o resto do lote; o Harvest17_Log ja ficou correcto.
        }
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
 * Aplica uma entrada ao Harvest17_Log (e escreve logo, sem batching, para
 * que "linhas" em memoria e a folha nunca se desalinhem). Devolve o
 * resultado no formato da resposta e marca em "tocados" o par mes+Source ID
 * cuja cache tem de ser recalculada no fim do lote.
 */
function aplicar_(ent, uuid, folha, linhas, admin, novosAudits, tocados) {
  var tipo = String(ent.tipo || 'criar');
  var quem = String(ent.recorder || '').trim();
  var papel = admin ? 'admin' : 'worker';
  var mesPedido = String(ent.mes || '').trim();

  if (tipo === 'criar') {
    var mes = validarMes_(mesPedido);
    var sourceId = String(ent.sourceId || '').trim();
    if (!sourceId) throw new Error('Falta o Source ID.');
    var peso = Number(ent.weight);
    if (!isFinite(peso) || peso <= 0) throw new Error('Peso inválido.');
    var unidade = (ent.unit === 'g') ? 'g' : 'kg';
    var pesoKg = paraQuilos_(peso, unidade);
    var pesoG = paraGramas_(peso, unidade);

    // O carimbo e o do aparelho: e quando o lancamento aconteceu de facto.
    var ts = String(ent.tsLocal || '').trim() || agora_();
    var novaLinha = [ts, quem, mes, sourceId, peso, unidade, pesoKg, uuid, pesoG];
    folha.getRange(folha.getLastRow() + 1, 1, 1, LARGURA_LOG).setValues([novaLinha]);
    linhas.push(novaLinha);

    novosAudits.push([agora_(), 'CREATE', quem, papel, quem, mes, sourceId,
                      '', '', peso, unidade, uuid]);
    tocados[mes + '|' + sourceId] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: sourceId };
  }

  // editar / apagar precisam da linha existente
  var idx = procurarLinha_(linhas, ent.alvo || {});
  if (!idx) {
    // Ja nao existe. Como o combinado e "quem chega depois manda", isto nao e
    // um erro que valha a pena mostrar ao utilizador: o registo desapareceu.
    novosAudits.push([agora_(), tipo === 'apagar' ? 'DELETE' : 'EDIT', quem, papel,
                      '', mesPedido, String((ent.alvo || {}).sourceId || ''),
                      '', '', '', '', uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, ausente: true };
  }

  var L = linhas[idx - 2];
  var dono = String(L[COL_USER - 1]).trim();
  if (!admin && dono && !igual_(dono, quem)) {
    throw new Error('Só o autor (' + dono + ') ou um administrador pode alterar este registo.');
  }

  var sourceIdAntigo = String(L[COL_SOURCE - 1]).trim();
  var mesLinha = String(L[COL_MES - 1]).trim();
  var pesoAntigo = L[COL_PESO - 1];
  var unidadeAntiga = String(L[COL_UNIDADE - 1]).trim();

  if (tipo === 'apagar') {
    folha.deleteRow(idx);
    linhas.splice(idx - 2, 1);
    novosAudits.push([agora_(), 'DELETE', quem, papel, dono, mesLinha, sourceIdAntigo,
                      pesoAntigo, unidadeAntiga, '', '', uuid]);
    tocados[mesLinha + '|' + sourceIdAntigo] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: sourceIdAntigo };
  }

  if (tipo === 'editar') {
    var novoPeso = Number(ent.weight);
    if (!isFinite(novoPeso) || novoPeso <= 0) throw new Error('Peso inválido.');
    var novaUnidade = (ent.unit === 'g') ? 'g' : 'kg';
    var novoPesoKg = paraQuilos_(novoPeso, novaUnidade);
    var novoPesoG = paraGramas_(novoPeso, novaUnidade);

    folha.getRange(idx, COL_PESO, 1, 3).setValues([[novoPeso, novaUnidade, novoPesoKg]]);
    folha.getRange(idx, COL_G).setValue(novoPesoG);
    L[COL_PESO - 1] = novoPeso;
    L[COL_UNIDADE - 1] = novaUnidade;
    L[COL_KG - 1] = novoPesoKg;
    L[COL_G - 1] = novoPesoG;

    novosAudits.push([agora_(), 'EDIT', quem, papel, dono, mesLinha, sourceIdAntigo,
                      pesoAntigo, unidadeAntiga, novoPeso, novaUnidade, uuid]);
    tocados[mesLinha + '|' + sourceIdAntigo] = true;
    return { ok: true, uuid: uuid, tipo: tipo, linha: sourceIdAntigo };
  }

  throw new Error('Operação desconhecida: ' + tipo);
}

// ------------------------------------------------- utilitario de diagnostico

/**
 * Executar a partir do editor (antes de implantar!) para confirmar que o
 * script encontra a folha de dados, resolve as colunas certas e ve os 17
 * Source ID. Nao altera nada. Ver o resultado em Ver > Registos de execucao.
 */
function diagnostico() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var folhaD = folhaDados_(ss);
    Logger.log('Folha de dados encontrada: "' + folhaD.getName() + '"');

    var cols = colunasDados_(folhaD);
    Logger.log('Colunas — Source ID=' + cols.source + ' Row Number=' + cols.rowNum +
               ' Total no.of plant=' + cols.plantas + ' Total weight=' + cols.total);
    Logger.log('Colunas dos meses: ' + JSON.stringify(cols.meses));

    var linhasD = linhasDados_(folhaD, cols);
    Logger.log(linhasD.length + ' Source ID(s): ' +
               linhasD.map(function (l) { return l.sourceId; }).join(', '));

    var log = ss.getSheetByName(FOLHA_LOG);
    var audit = ss.getSheetByName(FOLHA_AUDIT);
    Logger.log(FOLHA_LOG + '=' +
               (log ? Math.max(log.getLastRow() - 1, 0) + ' linhas' : 'AUSENTE (criada no 1º uso)'));
    Logger.log(FOLHA_AUDIT + '=' +
               (audit ? Math.max(audit.getLastRow() - 1, 0) + ' linhas' : 'AUSENTE (criada no 1º uso)'));

    var hatena = ss.getSheetByName(FOLHA_HATENA);
    Logger.log(FOLHA_HATENA + '=' +
               (hatena ? Math.max(hatena.getLastRow() - 1, 0) + ' linhas' : 'AUSENTE (criada no 1º uso)'));
  } catch (err) {
    Logger.log('ERRO — ' + err);
  }
  Logger.log('TOKEN=' + getToken() + ' / ADMIN_PASSWORD definido=' +
             (getAdminPassword() === 'JatRD2026' ? 'não (usa o valor por omissão)' : 'sim'));
}
