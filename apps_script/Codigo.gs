/**
 * JatLog offline — endpoint para as duas folhas de calculo da colheita.
 *
 * Implanta como: Implementar > Nova implementacao > Aplicacao web
 *   - Executar como   : Eu (dono das folhas)
 *   - Quem tem acesso : Qualquer pessoa
 *
 * Propriedades do script (Definicoes do projeto > Propriedades do script):
 *   TOKEN           — codigo de activacao (sem esta propriedade vale 'jatropha')
 *   ADMIN_PASSWORD  — palavra-passe do administrador (por omissao 'JatRD2026')
 *
 * O cliente envia POST com Content-Type: text/plain para evitar o preflight CORS
 * (o Apps Script nao responde a OPTIONS). O corpo e JSON.
 *
 * Compatibilidade: a aplicacao Streamlit antiga escreve as colunas A..G da folha
 * Harvest_Log. Aqui acrescentamos so a coluna H (Record ID) e a coluna L do
 * Audit_Log (Op ID), portanto as duas aplicacoes podem correr ao mesmo tempo.
 */

// ---------------------------------------------------------------- configuracao

var SITES = {
  lines: {
    id: '1ulQjYCYlhZjxGMO3iTWGPmxM7U-O-NkCs2OOm6mY1Wk',
    campo: 'Line Number',
    prefixo: 'L'
  },
  blocks: {
    id: '1lm78EHRxKQRevTTN6NqBTMY4H8-qJuPRPpjEUoy0ses',
    campo: 'Block',
    prefixo: ''
  }
};

var FOLHA_MASTER = 'Master';
var FOLHA_LOG = 'Harvest_Log';
var FOLHA_AUDIT = 'Audit_Log';
var FUSO = 'Africa/Maputo';

// Harvest_Log: A..H. As colunas A..G sao as que o Streamlit ja escrevia.
var COL_TS = 1, COL_USER = 2, COL_MES = 3, COL_CAMPO = 4;
var COL_PESO = 5, COL_UNIDADE = 6, COL_GRAMAS = 7, COL_UUID = 8;
var LARGURA_LOG = 8;

var CABECALHO_AUDIT = ['Timestamp', 'Action', 'By User', 'Role', 'Record Owner',
                       'Month', 'Line/Block', 'Old Value', 'Old Unit',
                       'New Value', 'New Unit', 'Op ID'];
var COL_AUDIT_OP = 12;

/** Colunas do Master que a aplicacao mostra. Cada entrada tem nomes alternativos. */
var CAMPOS_MASTER = [
  ['saco',       ['Sack Number']],
  ['variedade',  ['Variety']],
  ['plantas',    ['Total no.of plant', 'No.of plant available']],
  ['mae',        ['Mother Id', 'Mother ID']]
];

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

function sitePorChave_(chave) {
  var s = SITES[String(chave || '')];
  if (!s) throw new Error('Local desconhecido: ' + chave);
  return s;
}

function igual_(a, b) {
  return String(a === null || a === undefined ? '' : a).trim().toLowerCase() ===
         String(b === null || b === undefined ? '' : b).trim().toLowerCase();
}

/** Numero do peso -> gramas, do mesmo modo que a aplicacao Streamlit. */
function paraGramas_(peso, unidade) {
  return Math.round(unidade === 'kg' ? peso * 1000 : peso);
}

function formatarPeso_(peso) {
  return (Math.round(peso * 100) / 100).toFixed(2);
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

/** Harvest_Log com a coluna H garantida (sem mexer nas colunas A..G existentes). */
function folhaLog_(ss, site) {
  var f = folhaOuCriar_(ss, FOLHA_LOG, ['Timestamp', 'Username', 'Month', site.campo,
                                        'Weight', 'Unit', 'Weight_g', 'Record ID']);
  if (f.getMaxColumns() < LARGURA_LOG) {
    f.insertColumnsAfter(f.getMaxColumns(), LARGURA_LOG - f.getMaxColumns());
  }
  if (String(f.getRange(1, COL_UUID).getValue()).trim() === '') {
    f.getRange(1, COL_UUID).setValue('Record ID').setFontWeight('bold');
  }
  return f;
}

function folhaAudit_(ss) {
  var f = folhaOuCriar_(ss, FOLHA_AUDIT, CABECALHO_AUDIT);
  if (f.getMaxColumns() < CABECALHO_AUDIT.length) {
    f.insertColumnsAfter(f.getMaxColumns(), CABECALHO_AUDIT.length - f.getMaxColumns());
  }
  if (String(f.getRange(1, COL_AUDIT_OP).getValue()).trim() === '') {
    f.getRange(1, COL_AUDIT_OP).setValue('Op ID').setFontWeight('bold');
  }
  return f;
}

/** Todas as linhas do log, uma leitura so. */
function lerLog_(folha) {
  var n = folha.getLastRow();
  if (n < 2) return [];
  return folha.getRange(2, 1, n - 1, LARGURA_LOG).getValues();
}

/**
 * IDs ja processados: os Record ID do log mais os Op ID do audit.
 * E o que impede uma fila reenviada de duplicar registos.
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
 * Encontra a linha de um registo. Procura primeiro pelo Record ID; se o registo
 * foi criado pela aplicacao Streamlit antiga (sem ID), procura pelo par
 * Timestamp + numero da linha/bloco. Devolve o indice 1-based na folha.
 */
function procurarLinha_(linhasLog, alvo) {
  var uuid = String((alvo && alvo.uuid) || '').trim();
  if (uuid) {
    for (var i = 0; i < linhasLog.length; i++) {
      if (String(linhasLog[i][COL_UUID - 1]).trim() === uuid) return i + 2;
    }
  }
  var ts = String((alvo && alvo.tsFull) || '').trim();
  var campo = String((alvo && alvo.line) || '').trim();
  if (ts && campo) {
    for (var k = 0; k < linhasLog.length; k++) {
      if (String(linhasLog[k][COL_TS - 1]).trim() === ts &&
          igual_(linhasLog[k][COL_CAMPO - 1], campo)) return k + 2;
    }
  }
  return 0;
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

/** Cadastro do local, reduzido as colunas que o ecra mostra. */
function master_(p) {
  var site = sitePorChave_(p.site);
  var ss = SpreadsheetApp.openById(site.id);
  var folha = ss.getSheetByName(FOLHA_MASTER);
  if (!folha) throw new Error('Folha ' + FOLHA_MASTER + ' não encontrada.');

  var n = folha.getLastRow();
  var largura = folha.getLastColumn();
  if (n < 2) return { ok: true, hora: agora_(), site: p.site, linhas: [] };

  var valores = folha.getRange(1, 1, n, largura).getValues();
  var cabecalho = valores[0].map(function (v) { return String(v).trim(); });

  function indiceDe(nomes) {
    for (var a = 0; a < nomes.length; a++) {
      for (var b = 0; b < cabecalho.length; b++) {
        if (igual_(cabecalho[b], nomes[a])) return b;
      }
    }
    return -1;
  }

  var iCampo = indiceDe([site.campo]);
  if (iCampo < 0) throw new Error('Coluna "' + site.campo + '" não encontrada no Master.');
  var indices = CAMPOS_MASTER.map(function (c) { return indiceDe(c[1]); });

  var linhas = [];
  for (var r = 1; r < valores.length; r++) {
    var campo = String(valores[r][iCampo]).trim();
    if (!campo) continue;
    var item = [campo];
    for (var c = 0; c < indices.length; c++) {
      item.push(indices[c] < 0 ? '' : String(valores[r][indices[c]]).trim());
    }
    linhas.push(item);
  }

  return {
    ok: true, hora: agora_(), site: p.site, campo: site.campo, prefixo: site.prefixo,
    colunas: ['campo'].concat(CAMPOS_MASTER.map(function (c) { return c[0]; })),
    linhas: linhas
  };
}

/** Registos de um mes (ou de todos, se o mes vier vazio). */
function log_(p) {
  var site = sitePorChave_(p.site);
  var mes = String(p.month || '').trim();
  var ss = SpreadsheetApp.openById(site.id);
  var folha = folhaLog_(ss, site);
  var linhas = lerLog_(folha);

  var saida = [];
  for (var i = 0; i < linhas.length; i++) {
    var L = linhas[i];
    if (!String(L[COL_TS - 1]).trim() && !String(L[COL_CAMPO - 1]).trim()) continue;
    if (mes && String(L[COL_MES - 1]).trim() !== mes) continue;
    saida.push([
      String(L[COL_TS - 1]).trim(),
      String(L[COL_USER - 1]).trim(),
      String(L[COL_MES - 1]).trim(),
      String(L[COL_CAMPO - 1]).trim(),
      String(L[COL_PESO - 1]).trim(),
      String(L[COL_UNIDADE - 1]).trim(),
      String(L[COL_UUID - 1]).trim()
    ]);
  }
  return { ok: true, hora: agora_(), site: p.site, month: mes, registos: saida };
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

    // agrupa por local para abrir cada folha de calculo uma vez so
    var porSite = {};
    for (var i = 0; i < entradas.length; i++) {
      var s = String(entradas[i].site || '');
      (porSite[s] = porSite[s] || []).push(entradas[i]);
    }

    var resultados = [];
    for (var chave in porSite) {
      processarSite_(chave, porSite[chave], admin, resultados);
    }
    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, hora: agora_(), resultados: resultados });
  } catch (err3) {
    return jsonOut_({ ok: false, erro: String((err3 && err3.message) || err3) });
  } finally {
    lock.releaseLock();
  }
}

function processarSite_(chave, entradas, admin, resultados) {
  var site, ss, folha, audit;
  try {
    site = sitePorChave_(chave);
    ss = SpreadsheetApp.openById(site.id);
    folha = folhaLog_(ss, site);
    audit = folhaAudit_(ss);
  } catch (err) {
    for (var i = 0; i < entradas.length; i++) {
      resultados.push({ uuid: entradas[i].uuid, ok: false,
                        erro: String((err && err.message) || err) });
    }
    return;
  }

  var linhas = lerLog_(folha);
  var vistos = idsProcessados_(linhas, audit);
  var novasLinhas = [];       // acrescentos ao Harvest_Log
  var novosAudits = [];

  for (var k = 0; k < entradas.length; k++) {
    var ent = entradas[k];
    var uuid = String(ent.uuid || '').trim();

    if (!uuid) { resultados.push({ uuid: '', ok: false, erro: 'Falta o ID do envio.' }); continue; }
    if (vistos[uuid]) { resultados.push({ uuid: uuid, ok: true, duplicado: true }); continue; }

    try {
      var r = aplicar_(ent, uuid, site, folha, linhas, admin, novasLinhas, novosAudits);
      vistos[uuid] = true;
      resultados.push(r);
    } catch (err2) {
      resultados.push({ uuid: uuid, ok: false, erro: String((err2 && err2.message) || err2) });
    }
  }

  if (novasLinhas.length) {
    folha.getRange(folha.getLastRow() + 1, 1, novasLinhas.length, LARGURA_LOG)
         .setValues(novasLinhas);
  }
  if (novosAudits.length) {
    audit.getRange(audit.getLastRow() + 1, 1, novosAudits.length, CABECALHO_AUDIT.length)
         .setValues(novosAudits);
  }
}

function aplicar_(ent, uuid, site, folha, linhas, admin, novasLinhas, novosAudits) {
  var tipo = String(ent.tipo || 'criar');
  var quem = String(ent.recorder || '').trim();
  var papel = admin ? 'admin' : 'worker';
  var mes = String(ent.month || '').trim();

  if (tipo === 'criar') {
    var peso = Number(ent.weight);
    if (!isFinite(peso) || peso <= 0) throw new Error('Peso inválido.');
    var unidade = (ent.unit === 'g') ? 'g' : 'kg';
    var campo = String(ent.line || '').trim();
    if (!campo) throw new Error('Falta a linha/bloco.');
    if (!mes) throw new Error('Falta o mês.');

    // O carimbo e o do aparelho: e quando a pesagem aconteceu de facto.
    var ts = String(ent.tsLocal || '').trim() || agora_();
    novasLinhas.push([ts, quem, mes, campo, formatarPeso_(peso), unidade,
                      paraGramas_(peso, unidade), uuid]);
    novosAudits.push([agora_(), 'CREATE', quem, papel, quem, mes, campo,
                      '', '', formatarPeso_(peso), unidade, uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, linha: campo };
  }

  // editar / apagar precisam da linha existente
  var idx = procurarLinha_(linhas, ent.alvo || {});
  if (!idx) {
    // Ja nao existe. Como o combinado e "quem chega depois manda", isto nao e
    // um erro que valha a pena mostrar ao utilizador: o registo desapareceu.
    novosAudits.push([agora_(), tipo === 'apagar' ? 'DELETE' : 'EDIT', quem, papel,
                      '', mes, String((ent.alvo || {}).line || ''),
                      '', '', '', '', uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, ausente: true };
  }

  var L = linhas[idx - 2];
  var dono = String(L[COL_USER - 1]).trim();
  if (!admin && dono && !igual_(dono, quem)) {
    throw new Error('Só o autor (' + dono + ') ou um administrador pode alterar este registo.');
  }

  var campoAntigo = String(L[COL_CAMPO - 1]).trim();
  var pesoAntigo = String(L[COL_PESO - 1]).trim();
  var unidadeAntiga = String(L[COL_UNIDADE - 1]).trim();
  var mesLinha = String(L[COL_MES - 1]).trim();

  if (tipo === 'apagar') {
    folha.deleteRow(idx);
    linhas.splice(idx - 2, 1);
    novosAudits.push([agora_(), 'DELETE', quem, papel, dono, mesLinha, campoAntigo,
                      pesoAntigo, unidadeAntiga, '', '', uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, linha: campoAntigo };
  }

  if (tipo === 'editar') {
    var novoPeso = Number(ent.weight);
    if (!isFinite(novoPeso) || novoPeso <= 0) throw new Error('Peso inválido.');
    var novaUnidade = (ent.unit === 'g') ? 'g' : 'kg';
    var texto = formatarPeso_(novoPeso);
    folha.getRange(idx, COL_PESO, 1, 3)
         .setValues([[texto, novaUnidade, paraGramas_(novoPeso, novaUnidade)]]);
    L[COL_PESO - 1] = texto;
    L[COL_UNIDADE - 1] = novaUnidade;
    novosAudits.push([agora_(), 'EDIT', quem, papel, dono, mesLinha, campoAntigo,
                      pesoAntigo, unidadeAntiga, texto, novaUnidade, uuid]);
    return { ok: true, uuid: uuid, tipo: tipo, linha: campoAntigo };
  }

  throw new Error('Operação desconhecida: ' + tipo);
}

// ------------------------------------------------- utilitario de diagnostico

/**
 * Executar a partir do editor para confirmar que o script ve as duas folhas.
 * Nao altera nada.
 */
function diagnostico() {
  for (var chave in SITES) {
    var site = SITES[chave];
    try {
      var ss = SpreadsheetApp.openById(site.id);
      var master = ss.getSheetByName(FOLHA_MASTER);
      var log = ss.getSheetByName(FOLHA_LOG);
      Logger.log(chave + ': ' + ss.getName() +
                 ' | Master=' + (master ? master.getLastRow() - 1 : 'AUSENTE') +
                 ' | Harvest_Log=' + (log ? Math.max(log.getLastRow() - 1, 0) : 'AUSENTE'));
    } catch (err) {
      Logger.log(chave + ': ERRO — ' + err);
    }
  }
  Logger.log('TOKEN=' + getToken() + ' / ADMIN_PASSWORD definido=' +
             (getAdminPassword() === 'JatRD2026' ? 'não (usa o valor por omissão)' : 'sim'));
}
