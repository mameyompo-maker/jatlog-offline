/* JatLog — textos do ecrã de entrada comum (activação, nome, menu).
 *
 * Os dois módulos têm os seus próprios ficheiros de textos
 * (colheita/i18n.js e india/i18n.js). Aqui ficam só as palavras da entrada,
 * que é o que as três páginas partilham.
 *
 * O idioma escolhido é guardado em 'jat.idioma' e os módulos lêem a mesma
 * chave, por isso a escolha feita aqui vale para a aplicação toda.
 */

var IDIOMAS = [
  { cod: 'pt', rotulo: 'PT', html: 'pt-PT' },
  { cod: 'en', rotulo: 'EN', html: 'en' },
  { cod: 'ja', rotulo: '日本語', html: 'ja' }
];

var TEXTOS = {

  pt: {
    'app.rodape': 'JatLog · offline',
    'app.subtitulo': 'Registos de campo',

    'activacao.titulo': 'Activar o aparelho',
    'activacao.texto': 'Digite o código de activação que o gestor lhe deu. Só é preciso uma vez neste aparelho.',
    'activacao.campo': 'Código de activação',
    'activacao.botao': 'Activar',
    'activacao.falta': 'Digite o código de activação.',
    'activacao.aVerificar': 'A confirmar o código com o servidor…',
    'activacao.recusado': 'O servidor não aceita este código. Peça o código certo ao gestor — sem ele, nenhum registo consegue subir.',
    'activacao.recusadoNum': 'O servidor de {modulos} não aceita este código. Peça o código certo ao gestor — os registos desse módulo não conseguem subir.',
    'activacao.semRede': 'Sem ligação: o código ficou guardado, mas ainda não foi confirmado. Vai ser confirmado sozinho quando houver rede.',

    'entrada.titulo': 'Identifique-se',
    'entrada.texto': 'O nome fica guardado até trocar de utilizador, e vale para os dois registos.',
    'entrada.adminActivo': 'Modo administrador activo — continua como administrador.',
    'entrada.sairAdmin': 'Sair do modo administrador',
    'entrada.nome': 'Nome de utilizador',
    'entrada.nomePlaceholder': 'O seu nome',
    'entrada.admin': 'Administrador',
    'entrada.senha': 'Senha do administrador',
    'entrada.senhaPlaceholder': 'Só para o gestor',
    'entrada.botao': 'Começar',
    'entrada.faltaNome': 'Escreva o seu nome.',
    'entrada.senhaErrada': 'Senha do administrador incorrecta.',
    'entrada.semVerificar': 'Não foi possível verificar a senha agora. Tente de novo quando tiver internet.',
    'entrada.senhaDepois': 'Sem rede: a senha será verificada no envio',

    'menu.titulo': 'O que vai registar?',
    'menu.usuario': 'Utilizador: <b>{nome}</b>',
    'menu.usuarioAdmin': 'Utilizador: <b>{nome}</b> · administrador',
    'menu.colheita': 'Colheita — peso',
    'menu.colheitaDesc': 'Peso das sementes por linha (Tanheia), por bloco (7 de Abril) ou por Source ID (Índia 17).',
    'menu.india': 'Medições — India',
    'menu.indiaDesc': 'Crescimento e descritores das plantas de NBF (Tanheia) 26.',
    'menu.pesagem': 'Pesagem de sacos',
    'menu.pesagemDesc': 'Peso real das sementes por planta-mãe (Tanheia) — 25-26 / 26-27.',
    'menu.india17': 'Colheita — Índia 17',
    'menu.porEnviar': '{n} por enviar',
    'menu.desactivar': 'Desactivar este aparelho',
    'menu.confirmarDesactivar': 'Apagar o código de activação deste aparelho? Os registos por enviar não se perdem.',

    'menu.enviarAgora': 'Enviar agora',
    'menu.tudoEnviado': '✓ Tudo enviado',
    'menu.aEnviarAgora': 'A tentar enviar tudo…',
    'menu.semPendentes': 'Já está tudo enviado.',
    'menu.enviarSemRede': 'Sem ligação — vai enviar sozinho quando voltar a rede.',
    'menu.enviarConcluido': 'Envio concluído.',

    'atualizar.botao': 'Verificar actualização',
    'atualizar.aVerificar': 'A verificar…',
    'atualizar.aAtualizar': 'Nova versão encontrada — a actualizar. A aplicação vai recarregar sozinha…',
    'atualizar.jaAtualizado': 'Já está na versão mais recente.',
    'atualizar.semRede': 'Sem ligação — não é possível verificar agora.',
    'atualizar.naoSuportado': 'Este aparelho/navegador não suporta actualização automática.',

    'geral.trocarUsuario': 'Trocar de utilizador'
  },

  en: {
    'app.rodape': 'JatLog · offline',
    'app.subtitulo': 'Field records',

    'activacao.titulo': 'Activate this phone',
    'activacao.texto': 'Enter the activation code your manager gave you. You only need to do this once on this phone.',
    'activacao.campo': 'Activation code',
    'activacao.botao': 'Activate',
    'activacao.falta': 'Enter the activation code.',
    'activacao.aVerificar': 'Checking the code with the server…',
    'activacao.recusado': 'The server does not accept this code. Ask your manager for the right one — without it nothing you record can be uploaded.',
    'activacao.recusadoNum': 'The {modulos} server does not accept this code. Ask your manager for the right one — records from that module cannot be uploaded.',
    'activacao.semRede': 'No connection: the code was saved but not confirmed yet. It will be confirmed automatically once there is signal.',

    'entrada.titulo': 'Who are you?',
    'entrada.texto': 'Your name stays until you switch user, and it applies to both records.',
    'entrada.adminActivo': 'Administrator mode is on — you will stay an administrator.',
    'entrada.sairAdmin': 'Leave administrator mode',
    'entrada.nome': 'User name',
    'entrada.nomePlaceholder': 'Your name',
    'entrada.admin': 'Administrator',
    'entrada.senha': 'Administrator password',
    'entrada.senhaPlaceholder': 'Manager only',
    'entrada.botao': 'Start',
    'entrada.faltaNome': 'Enter your name.',
    'entrada.senhaErrada': 'Wrong administrator password.',
    'entrada.semVerificar': 'The password cannot be checked right now. Try again when you have internet.',
    'entrada.senhaDepois': 'No signal: the password will be checked when the records are sent',

    'menu.titulo': 'What are you recording?',
    'menu.usuario': 'User: <b>{nome}</b>',
    'menu.usuarioAdmin': 'User: <b>{nome}</b> · administrator',
    'menu.colheita': 'Harvest — weight',
    'menu.colheitaDesc': 'Seed weight by line (Tanheia), by block (7 de Abril) or by Source ID (India 17).',
    'menu.india': 'Measurements — India',
    'menu.indiaDesc': 'Growth and descriptors of the NBF (Tanheia) 26 plants.',
    'menu.pesagem': 'Sack weighing',
    'menu.pesagemDesc': 'Actual seed weight per mother plant (Tanheia) — 25-26 / 26-27.',
    'menu.india17': 'Harvest — India 17',
    'menu.porEnviar': '{n} waiting to be sent',
    'menu.desactivar': 'Deactivate this phone',
    'menu.confirmarDesactivar': 'Erase the activation code from this phone? Records waiting to be sent are kept.',

    'menu.enviarAgora': 'Send now',
    'menu.tudoEnviado': '✓ All sent',
    'menu.aEnviarAgora': 'Trying to send everything…',
    'menu.semPendentes': 'Everything is already sent.',
    'menu.enviarSemRede': 'No connection — it will send automatically once you are back online.',
    'menu.enviarConcluido': 'Sending finished.',

    'atualizar.botao': 'Check for update',
    'atualizar.aVerificar': 'Checking…',
    'atualizar.aAtualizar': 'New version found — updating. The app will reload on its own…',
    'atualizar.jaAtualizado': 'You already have the latest version.',
    'atualizar.semRede': 'No connection — cannot check right now.',
    'atualizar.naoSuportado': 'This device/browser does not support automatic updates.',

    'geral.trocarUsuario': 'Switch user'
  },

  ja: {
    'app.rodape': 'JatLog · オフライン',
    'app.subtitulo': '現場記録',

    'activacao.titulo': 'この端末を有効にする',
    'activacao.texto': '管理者から渡されたアクティベーションコードを入力してください。この端末では最初の一度だけです。',
    'activacao.campo': 'アクティベーションコード',
    'activacao.botao': '有効にする',
    'activacao.falta': 'アクティベーションコードを入力してください。',
    'activacao.aVerificar': 'サーバーでコードを確認しています…',
    'activacao.recusado': 'サーバーがこのコードを受け付けません。正しいコードを管理者に確認してください。このままでは登録したものが一つも送信できません。',
    'activacao.recusadoNum': '{modulos}のサーバーがこのコードを受け付けません。正しいコードを管理者に確認してください。この項目の登録は送信できません。',
    'activacao.semRede': '圏外です。コードは保存しましたが、まだ確認できていません。電波が戻れば自動で確認します。',

    'entrada.titulo': '名前を入れてください',
    'entrada.texto': '名前はユーザーを切り替えるまで保持され、どちらの記録でも使われます。',
    'entrada.adminActivo': '管理者モードが有効です。このまま管理者として続けます。',
    'entrada.sairAdmin': '管理者モードを終了する',
    'entrada.nome': 'ユーザー名',
    'entrada.nomePlaceholder': 'あなたの名前',
    'entrada.admin': '管理者',
    'entrada.senha': '管理者パスワード',
    'entrada.senhaPlaceholder': '管理者のみ',
    'entrada.botao': '開始',
    'entrada.faltaNome': '名前を入力してください。',
    'entrada.senhaErrada': '管理者パスワードが違います。',
    'entrada.semVerificar': '今はパスワードを確認できません。通信できる場所で試してください。',
    'entrada.senhaDepois': '圏外のため、パスワードは送信時に確認されます',

    'menu.titulo': '何を登録しますか',
    'menu.usuario': 'ユーザー: <b>{nome}</b>',
    'menu.usuarioAdmin': 'ユーザー: <b>{nome}</b> · 管理者',
    'menu.colheita': '収穫重量',
    'menu.colheitaDesc': 'ライン別(Tanheia)・ブロック別(7 de Abril)・Source ID別(インド17系統)の種子重量。',
    'menu.india': 'インドの測定',
    'menu.indiaDesc': 'NBF(Tanheia)26 の株の生育と形態記載。',
    'menu.pesagem': '種子の袋の計量',
    'menu.pesagemDesc': '母樹ごとの種子の実測重量(Tanheia) — 25-26 / 26-27。',
    'menu.india17': '収穫 — インド17系統',
    'menu.porEnviar': '未送信 {n} 件',
    'menu.desactivar': 'この端末を無効にする',
    'menu.confirmarDesactivar': 'この端末のアクティベーションコードを消しますか。未送信の記録は消えません。',

    'menu.enviarAgora': '今すぐ送信',
    'menu.tudoEnviado': '✓ すべて送信済み',
    'menu.aEnviarAgora': 'すべての送信を試みています…',
    'menu.semPendentes': 'すでにすべて送信済みです。',
    'menu.enviarSemRede': '圏外です。電波が戻れば自動で送信されます。',
    'menu.enviarConcluido': '送信が完了しました。',

    'atualizar.botao': '最新のバージョンにする',
    'atualizar.aVerificar': '確認しています…',
    'atualizar.aAtualizar': '新しいバージョンが見つかりました。更新しています。まもなく自動で再読み込みされます…',
    'atualizar.jaAtualizado': 'すでに最新バージョンです。',
    'atualizar.semRede': '圏外のため、今は確認できません。',
    'atualizar.naoSuportado': 'この端末・ブラウザは自動更新に対応していません。',

    'geral.trocarUsuario': 'ユーザーを切り替える'
  }

};
