/* JatLog offline — módulo da pesagem: textos do ecrã em português, inglês e
 * japonês.
 *
 * Módulo pequeno e temporário (pesagem manual dos sacos de sementes já
 * colhidas, por planta-mãe, em Tanheia). O fluxo é mais simples que o da
 * colheita: em vez de local+mês+número de linha, escolhe-se a época e depois
 * uma de ~20 planta-mãe de uma lista fixa — sem busca nem candidatos.
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
    /* 'num.separador' é o sinal decimal que se mostra no ecrã. A leitura
     * aceita sempre os dois — ver paraNumero() em app.js. */
    'num.separador': ',',

    'app.rodape': 'JatLog · offline',

    'epoca.titulo': 'Escolha a época',
    'epoca.usuario': 'Utilizador: <b>{nome}</b>',
    'epoca.usuarioAdmin': 'Utilizador: <b>{nome}</b> · administrador',
    'epoca.campo': 'Época',
    'epoca.falta': 'Escolha a época.',
    'epoca.botao': 'Continuar',
    'epoca.aCarregar': 'A carregar a lista de planta-mãe…',
    'epoca.semCadastro': 'Não foi possível descarregar a lista de planta-mãe desta época e ainda não há cópia neste aparelho. Ligue-se à internet uma vez.',
    'epoca.rotulo.25-26': '2025–26',
    'epoca.rotulo.26-27': '2026–27',

    'topo.sacos': 'sacos',
    'geral.menu': 'Menu (trocar de registo)',

    'lista.titulo': 'Escolha a planta-mãe',
    'lista.mudarEpoca': 'Mudar época',
    'lista.buscar': 'Procurar planta-mãe…',
    'lista.badge': '{n} sacos · {kg} kg',
    'lista.semRegisto': 'ainda sem registo',
    'lista.semCadastro': 'A lista de planta-mãe ainda não foi carregada neste aparelho.',
    'lista.semResultado': 'Nenhuma planta-mãe encontrada para "{filtro}".',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} guardado às {hora}',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} guardado às {hora} (no aparelho)',

    'peso.tag': 'Pesando',
    'peso.subEpoca': 'Época {epoca}',
    'peso.registar': 'Registar',
    'peso.cancelar': 'Cancelar',
    'peso.invalido': 'Valor inválido. Use apenas números — tanto faz 1,5 como 1.5',
    'peso.maiorQueZero': 'O peso deve ser maior que zero.',

    'confirmar.tag': 'Confirmar registo',
    'confirmar.aviso': 'O valor <b>{valor} {unidade}</b> está fora da faixa esperada para um saco. Confirme se está correcto antes de registar.',
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
    'apagar.aviso': 'Eliminar definitivamente o saco de <b>{id}</b> ({valor} {unidade})? Esta acção não pode ser desfeita.',
    'apagar.sim': 'Sim, eliminar',
    'apagar.nao': 'Não, voltar',

    'historico.titulo': 'Todos os registos',
    'historico.vazio': 'Nenhum registo em {epoca} ainda.',
    'historico.toque': 'toque para corrigir',
    /* Aqui entra sozinho, no lugar de um nome ("08-15 06:54 · {quem} · …"),
       por isso não pode ser "si" — "si" precisa de um "por" à frente. */
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

    'epoca.titulo': 'Choose the season',
    'epoca.usuario': 'User: <b>{nome}</b>',
    'epoca.usuarioAdmin': 'User: <b>{nome}</b> · administrator',
    'epoca.campo': 'Season',
    'epoca.falta': 'Choose the season.',
    'epoca.botao': 'Continue',
    'epoca.aCarregar': 'Loading the mother-plant list…',
    'epoca.semCadastro': 'The mother-plant list for this season could not be downloaded and there is no copy on this phone yet. Connect to the internet once.',
    'epoca.rotulo.25-26': '2025–26',
    'epoca.rotulo.26-27': '2026–27',

    'topo.sacos': 'sacks',
    'geral.menu': 'Menu (switch record)',

    'lista.titulo': 'Choose the mother plant',
    'lista.mudarEpoca': 'Change season',
    'lista.buscar': 'Search mother plant…',
    'lista.badge': '{n} sack(s) · {kg} kg',
    'lista.semRegisto': 'no entries yet',
    'lista.semCadastro': 'The mother-plant list has not been loaded on this phone yet.',
    'lista.semResultado': 'No mother plant found for "{filtro}".',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} saved at {hora}',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} saved at {hora} (on this phone)',

    'peso.tag': 'Weighing',
    'peso.subEpoca': 'Season {epoca}',
    'peso.registar': 'Record',
    'peso.cancelar': 'Cancel',
    'peso.invalido': 'Invalid value. Numbers only — either 1.5 or 1,5 works',
    'peso.maiorQueZero': 'The weight must be greater than zero.',

    'confirmar.tag': 'Confirm the entry',
    'confirmar.registar': 'Record',
    'confirmar.aviso': '<b>{valor} {unidade}</b> is outside the expected range for a sack. Check it before recording.',
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
    'apagar.aviso': 'Permanently delete the sack for <b>{id}</b> ({valor} {unidade})? This cannot be undone.',
    'apagar.sim': 'Yes, delete',
    'apagar.nao': 'No, go back',

    'historico.titulo': 'All entries',
    'historico.vazio': 'No entries in {epoca} yet.',
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

    'epoca.titulo': '収穫期を選んでください',
    'epoca.usuario': 'ユーザー: <b>{nome}</b>',
    'epoca.usuarioAdmin': 'ユーザー: <b>{nome}</b> · 管理者',
    'epoca.campo': '収穫期',
    'epoca.falta': '収穫期を選んでください。',
    'epoca.botao': '次へ',
    'epoca.aCarregar': '母樹リストを読み込んでいます…',
    'epoca.semCadastro': 'この収穫期の母樹リストを取得できず、この端末にも控えがありません。一度だけ、通信できる場所で開いてください。',
    'epoca.rotulo.25-26': '2025〜26年',
    'epoca.rotulo.26-27': '2026〜27年',

    'topo.sacos': '袋',
    'geral.menu': 'メニュー(登録先を変える)',

    'lista.titulo': '母樹を選んでください',
    'lista.mudarEpoca': '収穫期を変える',
    'lista.buscar': '母樹を検索…',
    'lista.badge': '{n} 袋 · {kg} kg',
    'lista.semRegisto': 'まだ記録なし',
    'lista.semCadastro': 'この端末にはまだ母樹リストがありません。',
    'lista.semResultado': '「{filtro}」に一致する母樹が見つかりません。',
    'lista.gravado': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} を {hora} に保存しました',
    'lista.gravadoLocal': '<span class="tick">✓</span><b>{id}</b> — {valor} {unidade} を {hora} に端末へ保存しました',

    'peso.tag': '計量中',
    'peso.subEpoca': '収穫期 {epoca}',
    'peso.registar': '登録',
    'peso.cancelar': 'やめる',
    'peso.invalido': '入力が正しくありません。数字だけを入れてください(1.5 でも 1,5 でも構いません)',
    'peso.maiorQueZero': '重量は0より大きい値にしてください。',

    'confirmar.tag': '登録の確認',
    'confirmar.registar': '登録する',
    'confirmar.aviso': '<b>{valor} {unidade}</b> は袋の重量として想定の範囲外です。正しいか確認してから登録してください。',
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
    'apagar.aviso': '<b>{id}</b> の袋の記録({valor} {unidade})を完全に削除しますか。元に戻せません。',
    'apagar.sim': 'はい、削除する',
    'apagar.nao': 'いいえ、戻る',

    'historico.titulo': 'すべての記録',
    'historico.vazio': '{epoca} の記録はまだありません。',
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
