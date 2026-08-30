/* JatLog offline — módulo do peso da colheita (Índia 17): textos do ecrã em
 * português, inglês e japonês.
 *
 * Módulo pequeno, primo da pesagem: em vez de escolher a época, escolhe-se o
 * mês (Aug/26 .. Mar/27, as colunas da folha "India 17 weight") e depois um
 * de 17 Source ID de uma lista fixa — sem busca nem candidatos.
 *
 * O português é o idioma de origem e o que fica por omissão. Para acrescentar
 * um idioma, junta-se mais um bloco com as mesmas chaves e um botão em
 * IDIOMAS — nada mais no código precisa de mudar.
 *
 * Nas frases, {x} é substituído pelo valor correspondente (ver t() em app.js).
 */

var IDIOMAS = [
  { cod: 'pt', rotulo: 'PT', html: 'pt-PT' },
  { cod: 'en', rotulo: 'EN', html: 'en' },
  { cod: 'ja', rotulo: '日本語', html: 'ja' }
];

var TEXTOS = {

  pt: {
    'num.separador': ',',

    'app.rodape': 'JatLog · offline',

    'mes.titulo': 'Escolha o mês',
    'mes.usuario': 'Utilizador: <b>{nome}</b>',
    'mes.usuarioAdmin': 'Utilizador: <b>{nome}</b> · administrador',
    'mes.campo': 'Mês',
    'mes.falta': 'Escolha o mês.',
    'mes.botao': 'Continuar',
    'mes.aCarregar': 'A carregar a lista de Source ID…',
    'mes.semCadastro': 'Não foi possível descarregar a lista de Source ID e ainda não há cópia neste aparelho. Ligue-se à internet uma vez.',

    'topo.registos': 'registos',
    'geral.menu': 'Menu (trocar de registo)',

    'lista.titulo': 'Escolha o Source ID',
    'lista.hatena': 'Source ID desconhecido (?)',
    'lista.mudarMes': 'Mudar mês',
    'lista.buscar': 'Procurar Source ID…',
    'lista.badge': '{n} registo(s) · {g} g',
    'lista.semRegisto': 'ainda sem registo',
    'lista.semCadastro': 'A lista de Source ID ainda não foi carregada neste aparelho.',
    'lista.semResultado': 'Nenhum Source ID encontrado para "{filtro}".',
    'lista.contexto': 'Linha {linha} · {plantas} plantas',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} guardado às {hora}',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} guardado às {hora} (no aparelho)',

    'peso.tag': 'Pesando',
    'peso.subMes': 'Mês {mes}',
    'peso.registar': 'Registar',
    'peso.cancelar': 'Cancelar',
    'peso.invalido': 'Valor inválido. Use apenas números — tanto faz 1,5 como 1.5',
    'peso.maiorQueZero': 'O peso deve ser maior que zero.',

    'confirmar.tag': 'Confirmar registo',
    'confirmar.aviso': 'O valor <b>{valor} {unidade}</b> está fora da faixa esperada. Confirme se está correcto antes de registar.',
    'confirmar.registar': 'Registar',
    'confirmar.assim': 'Registar assim',
    'confirmar.corrigir': 'Corrigir',

    'editar.tag': 'Editando registo',
    'editar.cabecalho': 'Corrigindo o peso registado para <b>{id}</b>. Ajuste o valor e guarde.',
    'editar.lancado': 'Lançado em {quando} por {quem}',
    'editar.guardar': 'Guardar',
    'editar.cancelar': 'Cancelar',
    'editar.apagar': 'Eliminar este registo',
    'editar.semPermissao': 'Só o autor do registo ou o administrador pode alterá-lo.',

    'apagar.tag': 'Registo a eliminar',
    'apagar.aviso': 'Eliminar definitivamente o registo de <b>{id}</b> ({valor} {unidade})? Esta acção não pode ser desfeita.',
    'apagar.sim': 'Sim, eliminar',
    'apagar.nao': 'Não, voltar',

    'historico.titulo': 'Todos os registos',
    'historico.vazio': 'Nenhum registo em {mes} ainda.',
    'historico.toque': 'toque para corrigir',
    'historico.voce': 'você',
    'historico.trancado': '🔒 só o autor ou o admin',
    'historico.porEnviar': 'POR ENVIAR',

    'rede.semRede': 'SEM LIGAÇÃO — pode continuar a registar',
    'rede.semRedeFila': 'SEM LIGAÇÃO — {n} registo(s) guardado(s) no aparelho',
    'rede.aEnviar': 'A enviar…',
    'rede.porEnviar': '{n} registo(s) por enviar',
    'rede.recusados': '{n} registo(s) recusado(s) pelo servidor',
    'rede.erroFila': '{n} registo(s) recusado(s) pelo servidor. Primeiro erro: {erro}',
    'rede.tentarDeNovo': 'Tentar de novo',

    'brinde.registado': '{id} registado',
    'brinde.guardado': '{id} guardado no aparelho',
    'brinde.actualizado': '{id} actualizado',
    'brinde.apagado': '{id} eliminado',
    'brinde.enviados': '{n} registo(s) enviado(s)',
    'brinde.recusados': '{n} registo(s) recusado(s)'
  },

  en: {
    'num.separador': '.',

    'app.rodape': 'JatLog · offline',

    'mes.titulo': 'Choose the month',
    'mes.usuario': 'User: <b>{nome}</b>',
    'mes.usuarioAdmin': 'User: <b>{nome}</b> · administrator',
    'mes.campo': 'Month',
    'mes.falta': 'Choose the month.',
    'mes.botao': 'Continue',
    'mes.aCarregar': 'Loading the Source ID list…',
    'mes.semCadastro': 'The Source ID list could not be downloaded and there is no copy on this phone yet. Connect to the internet once.',

    'topo.registos': 'entries',
    'geral.menu': 'Menu (switch record)',

    'lista.titulo': 'Choose the Source ID',
    'lista.hatena': 'Unknown Source ID (?)',
    'lista.mudarMes': 'Change month',
    'lista.buscar': 'Search Source ID…',
    'lista.badge': '{n} entry(ies) · {g} g',
    'lista.semRegisto': 'no entries yet',
    'lista.semCadastro': 'The Source ID list has not been loaded on this phone yet.',
    'lista.semResultado': 'No Source ID found for "{filtro}".',
    'lista.contexto': 'Row {linha} · {plantas} plants',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} saved at {hora}',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} saved at {hora} (on this phone)',

    'peso.tag': 'Weighing',
    'peso.subMes': 'Month {mes}',
    'peso.registar': 'Record',
    'peso.cancelar': 'Cancel',
    'peso.invalido': 'Invalid value. Numbers only — either 1.5 or 1,5 works',
    'peso.maiorQueZero': 'The weight must be greater than zero.',

    'confirmar.tag': 'Confirm the entry',
    'confirmar.registar': 'Record',
    'confirmar.aviso': '<b>{valor} {unidade}</b> is outside the expected range. Check it before recording.',
    'confirmar.assim': 'Record it anyway',
    'confirmar.corrigir': 'Fix it',

    'editar.tag': 'Editing an entry',
    'editar.cabecalho': 'Correcting the weight recorded for <b>{id}</b>. Adjust the value and save.',
    'editar.lancado': 'Recorded on {quando} by {quem}',
    'editar.guardar': 'Save',
    'editar.cancelar': 'Cancel',
    'editar.apagar': 'Delete this entry',
    'editar.semPermissao': 'Only the person who recorded it, or an administrator, can change it.',

    'apagar.tag': 'Entry to delete',
    'apagar.aviso': 'Permanently delete the entry for <b>{id}</b> ({valor} {unidade})? This cannot be undone.',
    'apagar.sim': 'Yes, delete',
    'apagar.nao': 'No, go back',

    'historico.titulo': 'All entries',
    'historico.vazio': 'No entries in {mes} yet.',
    'historico.toque': 'tap to correct',
    'historico.voce': 'you',
    'historico.trancado': '🔒 only the author or an admin',
    'historico.porEnviar': 'NOT SENT',

    'rede.semRede': 'NO CONNECTION — you can keep recording',
    'rede.semRedeFila': 'NO CONNECTION — {n} entry(ies) held on this phone',
    'rede.aEnviar': 'Sending…',
    'rede.porEnviar': '{n} entry(ies) waiting to be sent',
    'rede.recusados': '{n} entry(ies) refused by the server',
    'rede.erroFila': '{n} entry(ies) refused by the server. First error: {erro}',
    'rede.tentarDeNovo': 'Try again',

    'brinde.registado': '{id} recorded',
    'brinde.guardado': '{id} held on this phone',
    'brinde.actualizado': '{id} updated',
    'brinde.apagado': '{id} deleted',
    'brinde.enviados': '{n} entry(ies) sent',
    'brinde.recusados': '{n} entry(ies) refused'
  },

  ja: {
    'num.separador': '.',

    'app.rodape': 'JatLog · オフライン',

    'mes.titulo': '月を選んでください',
    'mes.usuario': 'ユーザー: <b>{nome}</b>',
    'mes.usuarioAdmin': 'ユーザー: <b>{nome}</b> · 管理者',
    'mes.campo': '月',
    'mes.falta': '月を選んでください。',
    'mes.botao': '次へ',
    'mes.aCarregar': 'Source ID リストを読み込んでいます…',
    'mes.semCadastro': 'Source ID リストを取得できず、この端末にも控えがありません。一度だけ、通信できる場所で開いてください。',

    'topo.registos': '件',
    'geral.menu': 'メニュー(登録先を変える)',

    'lista.titulo': 'Source ID を選んでください',
    'lista.hatena': '不明な Source ID(?)',
    'lista.mudarMes': '月を変える',
    'lista.buscar': 'Source ID を検索…',
    'lista.badge': '{n} 件 · {g} g',
    'lista.semRegisto': 'まだ記録なし',
    'lista.semCadastro': 'この端末にはまだ Source ID リストがありません。',
    'lista.semResultado': '「{filtro}」に一致する Source ID が見つかりません。',
    'lista.contexto': '{linha} 行目 · {plantas} 株',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} を {hora} に保存しました',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} を {hora} に端末へ保存しました',

    'peso.tag': '計量中',
    'peso.subMes': '{mes}',
    'peso.registar': '登録',
    'peso.cancelar': 'やめる',
    'peso.invalido': '入力が正しくありません。数字だけを入れてください(1.5 でも 1,5 でも構いません)',
    'peso.maiorQueZero': '重量は0より大きい値にしてください。',

    'confirmar.tag': '登録の確認',
    'confirmar.registar': '登録する',
    'confirmar.aviso': '<b>{valor} {unidade}</b> は想定の範囲外です。正しいか確認してから登録してください。',
    'confirmar.assim': 'このまま登録',
    'confirmar.corrigir': '入力し直す',

    'editar.tag': '記録の修正',
    'editar.cabecalho': '<b>{id}</b> の重量を修正します。値を直して保存してください。',
    'editar.lancado': '{quando} に {quem} が登録',
    'editar.guardar': '保存',
    'editar.cancelar': 'やめる',
    'editar.apagar': 'この記録を削除する',
    'editar.semPermissao': '登録した本人か管理者だけが変更できます。',

    'apagar.tag': '削除する記録',
    'apagar.aviso': '<b>{id}</b> の記録({valor} {unidade})を完全に削除しますか。元に戻せません。',
    'apagar.sim': 'はい、削除する',
    'apagar.nao': 'いいえ、戻る',

    'historico.titulo': 'すべての記録',
    'historico.vazio': '{mes} の記録はまだありません。',
    'historico.toque': 'タップして修正',
    'historico.voce': 'あなた',
    'historico.trancado': '🔒 本人と管理者のみ',
    'historico.porEnviar': '未送信',

    'rede.semRede': '圏外 — このまま記録を続けられます',
    'rede.semRedeFila': '圏外 — {n} 件を端末に保存しています',
    'rede.aEnviar': '送信中…',
    'rede.porEnviar': '未送信 {n} 件',
    'rede.recusados': 'サーバーに拒否された記録が {n} 件あります',
    'rede.erroFila': 'サーバーに拒否された記録が {n} 件あります。最初のエラー: {erro}',
    'rede.tentarDeNovo': 'もう一度試す',

    'brinde.registado': '{id} を登録しました',
    'brinde.guardado': '{id} を端末に保存しました',
    'brinde.actualizado': '{id} を更新しました',
    'brinde.apagado': '{id} を削除しました',
    'brinde.enviados': '{n} 件を送信しました',
    'brinde.recusados': '{n} 件が拒否されました'
  }
};
