# JatLog(現場記録アプリ)

**公開URL: https://mameyompo-maker.github.io/jatlog-offline/**
(活性化コード `jatropha` / 管理者パスワード `JatRD2026`)

## テスト用プレビュー(どこにも書き込まれない)

**`preview.bat` をダブルクリック**すると、モックサーバーに繋がったコピーが
`http://127.0.0.1:8811/` で開く。ここで登録・修正・削除しても**本番の
スプレッドシートには一切書き込まれない**(docs/ のコピーを %TEMP% に作り、
そのコピーの config.js をテスト用エンドポイントに書き換えて動かす仕組み。
本物の docs/ には触らない)。活性化コードと管理者パスワードは本番と同じ。
やめるときは黒い窓を閉じるだけ。必要なのは Python だけ(追加パッケージ不要)。

モザンビークの圃場で、**圏外でも**記録できる PWA。2026-08-10 に、それまで
別々のアプリだった **収穫重量(JatLog offline)** と **インドの測定(India Rec)** を
1つに統合し、その後 **袋の計量(pesagem)** と **Índia 17 の月次収穫(india17)** が
加わって、いまは **4モジュール**構成。

```
活性化コード ─→ 名前(+管理者) ─→ ┌─ Colheita — peso   (Tanheia / 7 de Abril / Índia 17)
   (端末に1回)      (共通)         ├─ Medições — India (NBF(Tanheia)26 の測定)
                                    └─ Pesagem de sacos (母樹ごとの袋の実測)
```

**コードと名前を聞かれるのは入口で1回だけ**で、その後メニューで「何を登録するか」を
選ぶ。管理者モード・表示言語・送信待ちの扱いも全モジュール共通。
india17 は独立モジュールだが、入口は colheita の拠点選択の3番目
(Tanheia / 7 de Abril / Índia 17 が同じ画面に並ぶ)。

旧 Streamlit 版 JatLog は退役済み(このアプリが本番唯一)。

## 🚨 保守の掟(直す前に必ず読む)

1. **push = 即・本番デプロイ。** `docs/` は GitHub Pages 直結で、push した瞬間に
   現場の端末へ配信される。
2. **`docs/` を変更したら `docs/sw.js` の `CACHE = 'jatlog-vNN'` を必ず+1する。**
   これを忘れると端末が古いキャッシュを使い続ける。
3. **`tests/servidor.py` を本物の `docs/` に向けて起動しない**(その場で
   `config.js` をモック向けに書き換えてしまう)。必ずコピーに向ける。
   手で触りたいだけなら **`preview.bat`** を使う(安全にそれをやる)。
4. **Apps Script の更新は「デプロイを管理 → 編集(鉛筆)→ バージョン:新バージョン」。**
   「新しいデプロイ」を選ぶと URL が変わり、配布済みの全端末が繋がらなくなる。
5. **India(測定)のサーバー原本だけ別リポジトリ**:
   `../jatmed_field_app/apps_script/Codigo.gs`。あちらの `docs/`(旧単独版の画面)には
   絶対に触らない — 現場の画面はこのリポジトリの `docs/india/`。

## モジュール ⇄ サーバー ⇄ スプレッドシート対応表

| モジュール | 画面 | Apps Script 原本 | 書き込み先スプレッドシート(ID) | 主なタブ |
|---|---|---|---|---|
| colheita(収穫重量) | `docs/colheita/` | `apps_script/Codigo.gs` | Tanheia: `1ulQjYCYlhZjxGMO3iTWGPmxM7U-O-NkCs2OOm6mY1Wk` / 7 de Abril: `1lm78EHRxKQRevTTN6NqBTMY4H8-qJuPRPpjEUoy0ses` | Master / Harvest_Log / Audit_Log |
| india(測定) | `docs/india/` | `../jatmed_field_app/apps_script/Codigo.gs` | Detail_India17: `1WSfQdkMdy_cton-Za6TGzRmpSi1cjycWqHfMCS_cDXQ` | Data_5months(ラウンドごと)/ Log |
| pesagem(袋の計量) | `docs/pesagem/` | `apps_script_pesagem/Codigo.gs` | Tanheia_Mixed_Seed_Weight: `1TZ8wHv4N6rPr3e9I0sF4PBtZgZHTrk6npKMc6CZJ4kM` | 25-26 / 26-27 / Weighing_Log / Audit_Log |
| india17(月次収穫) | `docs/india17/` | `apps_script_india17/Codigo.gs` | India17_Haevest: `10q83vNULXo8o9HeAdNqibwVXkAYDazCLGy-nIQzvWms` | 26-27 / Harvest17_Log / Harvest17_Audit / Harvest17_Hatena |

4本の Apps Script の `.../exec` URL は `docs/config.js` にある(4つの
`*_CONFIG.ENDPOINT`)。トークン(`TOKEN=jatropha`)と管理者パスワード
(`ADMIN_PASSWORD=JatRD2026`)は4本ともスクリプトプロパティで同じ値。
**Log 系タブは Apps Script が初回書き込み時に自動作成する**ので手で作らない。
シートのタブ名を変えたら、対応する Codigo.gs を grep で点検し、
`diagnostico()` を実行して列の解決を確認すること(2026-08-28 に
タブ改名で沈黙破壊が起きた実績あり)。

## ファイル構成

入口(shell)と4つのモジュールに分かれている。**1つの HTML に混ぜていないのは、
元の2アプリが関数名も画面IDも大量に衝突していたため**(`S` / `t()` / `mostrar()` /
`enviarFila()` / `ecraEntrada` …)。別ページにすれば、テスト済みのコードをほぼ
そのまま使える。ホーム画面のアイコン・Service Worker・manifest は1つなので、
現場から見れば1つのアプリ。

| パス | 中身 |
|---|---|
| `docs/index.html` | **入口**:活性化 → 名前(+管理者)→ メニュー |
| `docs/shell.js` | 入口の中身。共有セッション・送信待ち件数・「最新版にする」「今すぐ送信」 |
| `docs/shell_i18n.js` | 入口の文言(PT/EN/日本語) |
| `docs/styles.css` | 入口と `colheita/`・`pesagem/`・`india17/` の共通デザイン(暗色) |
| `docs/config.js` | **4つの ENDPOINT をここに書く** |
| `docs/sw.js` | Service Worker(1つ)。全ページのキャッシュと**4本のキューの自動送信**。`CACHE` のバンプを忘れない |
| `docs/manifest.webmanifest` | アプリ名・アイコン(1つ) |
| `docs/colheita/` | 収穫重量モジュール(Tanheia / 7 de Abril。Índia 17 への入口もここ) |
| `docs/india/` | インド測定モジュール(独自 `styles.css` / `plants.json` 持ち) |
| `docs/pesagem/` | 袋の計量モジュール |
| `docs/india17/` | Índia 17 月次収穫モジュール |
| `apps_script/Codigo.gs` | colheita のサーバー原本(コピペでデプロイ) |
| `apps_script_pesagem/Codigo.gs` | pesagem のサーバー原本 |
| `apps_script_india17/Codigo.gs` | india17 のサーバー原本 |
| `preview.bat` | どこにも書き込まれないローカルプレビュー(冒頭参照) |
| `tests/` | モックサーバー + E2E 6スイート(下記「テスト」) |
| `ferramentas/` | 歴史的な移植スクリプト(portar_india / portar_teste。単独版→統合版の移植手順そのもの。通常は使わない) |

india(測定)のサーバー原本だけは **`../jatmed_field_app/apps_script/Codigo.gs`**
(旧 `india-rec` リポジトリ)にある。

### 端末に残るデータの置き場所

| | colheita | india | pesagem | india17 |
|---|---|---|---|---|
| 送信キュー(IndexedDB) | `jatlog` | `indiarec` | `pesagem` | `india17` |
| 固有設定(localStorage) | `jatlog.*` | `indiarec.*` | `pesagem.*` | `india17.*` |
| Background Sync タグ | `jatlog-enviar` | `indiarec-enviar` | `pesagem-enviar` | `india17-enviar` |

**共有**(コード・名前・言語・管理者)は全モジュールとも `localStorage` の
`jat.*`。SW は localStorage を読めないので、コードと管理者パスワードは
IndexedDB `jatlog` の `config` ストアにも写している(`guardarConfigParaOSW()`)。

⚠ 共有するキーの一覧は `shell.js` と各モジュールの `app.js` の `PARTILHADAS` に
書いてある。**増やすときは全部の箇所を直す。**

### 配色(2026-08-11 に暗色へ統一)

アプリ全体が黒背景・黄緑アクセント。**直射日光下で読めること**を狙った測定側の
配色に、入口と収穫側を合わせた(Kaz さん判断)。

| | 値 | 使いどころ |
|---|---|---|
| 背景 | `#12140F` | ページ全体 |
| パネル | `#1E2119` / `#2A2E23` | カード・入力欄 / 一段明るい面 |
| 罫線 | `#3D4234` | 枠線(2px) |
| 文字 | `#F2F4EE` / `#A8B09A` | 本文 / 補助 |
| アクセント | `#7CB342`(濃い側 `#558B2F`) | 主ボタン・選択中・強調 |
| アクセント上の文字 | `#10210A` | **白は使わない**(この緑では読めない) |
| 注意 / 誤り / 完了 | `#F9A825` / `#E53935` / `#43A047` | 未送信の帯・エラー・トースト |

スタイルシートは2つ(`docs/styles.css` と `docs/india/styles.css`)。変数名は
別々(`--card` / `--painel` など)だが**値は同じ思想**。片方の色を変えるときは
もう片方も見ること。

## セットアップ

### 1. Apps Script を配置(Kaz さん作業)

1. どちらかのスプレッドシートを開き **拡張機能 → Apps Script**
   (2冊とも同じアカウントの所有物なので、片方に紐づけておけば両方に書ける)
2. 既定の `Code.gs` を全部消し、`apps_script/Codigo.gs` を貼り付けて保存
3. エディタで **`diagnostico()` を実行**。ログに 2 拠点の行数が出れば接続OK
   (ここで失敗するなら、貼り先のプロジェクトが間違っている)
4. スクリプトプロパティ(**任意**。未設定でも動く)
   - `TOKEN` … 端末に入力する Código de activação。未設定なら **`jatropha`**
   - `ADMIN_PASSWORD` … 管理者パスワード。未設定なら **`JatRD2026`**
5. **デプロイ → 新しいデプロイ → 種類:ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
6. 表示される `.../exec` で終わる URL を控える

> ⚠ コードを直したときは「デプロイを管理 → 編集(鉛筆)→ バージョン:新バージョン」。
> 「新しいデプロイ」を選ぶと URL が変わり、配布済みの端末が繋がらなくなる。

### 2. URL をアプリに設定

`docs/config.js` に **4つ**の ENDPOINT がある(すべて記入済み)。

- `JATLOG_CONFIG.ENDPOINT` … colheita(収穫)の URL
- `INDIAREC_CONFIG.ENDPOINT` … india(測定)の URL(サーバー原本は
  `../jatmed_field_app/apps_script/Codigo.gs`)
- `PESAGEM_CONFIG.ENDPOINT` … pesagem(袋の計量)の URL
- `INDIA17_CONFIG.ENDPOINT` … india17(月次収穫)の URL

⚠ 管理者パスワードは4本の Apps Script のスクリプトプロパティにそれぞれ入っている。
入口の画面はどれか一つが認めれば管理者として通す(順に問い合わせる)。
**一部だけ変えると、残りへの書き込みが管理者権限で通らなくなる。**

### 3. GitHub Pages で配信

```
gh repo create jatlog-offline --public --source . --remote origin --push
```
そのあと Settings → Pages → Source を `main` の `/docs` に設定。

### 4. 端末ごとの初期設定(1回だけ)

1. スマホのブラウザで Pages の URL を開く
2. メニューから **「ホーム画面に追加」**(これをしないと圏外で起動しない)
3. 起動 → `Código de activação` に `jatropha` を入力
4. 名前を入れる → **メニューが出る**
5. **両方のモジュールを1回ずつ開いておく**(ここで端末にデータが落ちる。ネットが要る)
   - Colheita … 拠点と月を選ぶ → 台帳が落ちる。**使う拠点は両方とも開いておく**
   - Medições … 開くだけで株一覧と進捗が落ちる

以降は圏外でもホーム画面のアイコンから使える。

## 現場での使い方

起動すると「何を登録しますか」のメニューが出るので、カードを選ぶ。
モジュールの中からは **Menu(登録先を変える)** でいつでも戻れる。

メニューの見方(2026-08-30 の形):

- タイトルの下に**送信の状態が1行**で出る。未送信があると琥珀色の帯
  「N por enviar」+**「Enviar agora(今すぐ送信)」**ボタン、全部送信済みなら
  「✓ Tudo enviado」だけ。各カードにもモジュール別の未送信件数が出る
- 下の小さいボタン列に **「Verificar actualização(最新版にする)」**がある。
  押すと新しい版があればその場で更新して自動で再読み込みされる
- 場所(colheita)やシーズン(pesagem)を選ぶと、**その下に全期間の履歴**
  (月・シーズン混在、新しい順)が出る。自分の記録はタップで修正でき、
  管理者は全件修正できる。選択中のボタンをもう一度押すと選択解除

収穫重量では、**まず拠点を選ぶ**(Tanheia(Linhas)/ 7 de Abril(Blocos))。
初期選択は無く、選ぶまで「Continuar」は押せない。**入るたびに毎回選ぶ**
(前回の拠点が入ったまま始まると、7 de Abril で量ったものを Tanheia に
入れてしまうため)。月は前回の値(無ければ今月)が入っているので、そのままでよい。

そのあとの操作は現行 JatLog と同じ。番号を入れて Enter → 重量 → Registrar。
違うのは圏外のときの見え方だけ。

- 画面の一番上に赤い帯 **SEM CONEXÃO — pode continuar a registar**
- 登録すると履歴に **POR ENVIAR** のタグが付く(黄色い破線の枠)
- 電波が戻ると自動で送信され、タグが消える。手動操作は要らない
- 送信待ちのまま**アプリを閉じても消えない**(IndexedDB に残る)
- **Android は、アプリを閉じたままでも電波が戻った時点で自動送信される**
  (Background Sync。Service Worker が起きて送る)。**2つのモジュールの両方**が
  この仕組みを使う(タグは `jatlog-enviar` と `indiarec-enviar`)。
  **iOS にはこの仕組みが無い**ので、一日の終わりに電波のある場所でアプリを
  一度開いてもらう運用が必要
- 送信中は上の帯に **`A enviar… 25 de 100`** と進み具合が出る。25件ずつ送り、
  1束ごとに「送信済み」を確定するので、100件の途中で電波が切れてもそこまでは残る
- **送れなかったときは理由が画面に出る**(履歴画面の送信ボタンの下)。
  例: `Não subiu às 15:32 — o código de activação não é aceite.`
  アプリを閉じている間の失敗も、次に開いたときにここで読める。
  **「送信待ちが減らない」と言われたら、まずこの行を読んでもらう**

### インド測定の使い方(2026-08-14 に作り直した)

**Crescimento(生育)** か **Descritores(形質)** を選び、**列(r01〜r16)を押して
番号を入れる**と株が決まる。列を押した時点で番号には **1** が入っているので、
1株目はそのまま「Continuar」でよい。

株が決まると、いちばん大きい行に**系統**が出る。データシートと圃場の地図が
系統ごとに作られているため:

```
2 (India #bag02)  n.º 15      ← 系統2番の15株目
NBF(Tanheia)26-045
Fileira r02, n.º 10  ·  ← n.º 1 à direita
```

- 系統の**先頭の株**には `início da linhagem` の印が出る(数え間違いが起きやすい)
- **保存すると同じ列の次の株の入力画面に直行する。** 列の最後で株選択に戻る。
  株を変えたいときは**入力画面の見出しをタップ**
- 保存前に**必ず確認画面**が出る。「この株には果実がない、ということでよいですか」
  のように**対象(果実・種子・雄花・雌花・葉)の単位で先に聞き**、
  個々の空欄項目は下の折りたたみの中に入っている
- 各入力欄の下に**自由記述の備考欄**がある。備考だけでも保存できる
- **枯れている株**は株選択画面の右側の印から登録する。枯死株は「次の未登録」から飛ばされる
- 記録の修正・削除は**誰でもできる**(2026-08-12 に開放)。追跡は `Log` 側で担保
- **番号を間違えたときは、入力画面の見出しをタップして株を選び直す。** 入力した値は
  そのまま付いてきて、保存すると正しい株に入り、間違った株からは消える
- **枯れている株は入力画面の一番上のボタン**で登録できる(押すと次の株へ進む)
- **空欄のまま保存した項目は 0(測定・計数)/ X(選択)としてシートに入る。**
  「行ったが無かった」という意味。**一度も登録していない株のセルは空のまま**
- **履歴は列グリッドから探せる。** 列を押すとその列の株が順に並び、押すと
  既に記録されている値ごと開く(電波があればサーバーの値も後から入る)

## 表示言語(PT / EN / 日本語)

入口の画面(活性化・名前・メニュー)と、各モジュールの最初の画面の右上に
**PT / EN / 日本語** のボタンがある。どこで選んでも共通の設定が変わるので、
**入口で1回選べばアプリ全体に効く**。既定はポルトガル語(現場の言語)。

- 切り替えるのは表示だけ。**シートに保存される内容は言語に関係なく同じ**
- 拠点名(Tanheia / 7 de Abril)は固有名詞なので翻訳しない
- 選んだ言語は `<html lang>` にも反映するので、**Chrome が勝手に翻訳を被せてこなくなる**

> ⚠ ブラウザの自動翻訳は使わないこと。ページの文字を機械翻訳で書き換えるだけで、
> アプリの言語設定が変わるわけではない。入力画面では誤訳や表示崩れの元になる。
> Chrome で一度「ポルトガル語を常に翻訳」を選んでいると、ホーム画面から開いた
> アプリにも適用される。**Chrome の設定 → 言語 → 翻訳** から解除できる。

### 小数点はどちらでもよい

**`4,4` でも `4.4` でも同じ 4.4 kg として読む。言語設定には関係しない。**
ポルトガル語圏の書き方と英語圏の書き方が現場で混ざるため。

- 全角の `４，４` も読む(日本語キーボード対策)
- 同じ記号が2回以上出てきたら桁区切りとみなす(`1.234,5` → 1234.5)
- **画面に出すときの記号は言語に従う**(ポルトガル語 `4,40` / 英語・日本語 `4.40`)
- **シートに書く値は言語に関係なく常に `4.40`**(ピリオド)

言語を足すときは文言ファイルに同じキーの塊を1つ増やし、`IDIOMAS` に1行足すだけ。
コード側の変更は要らない。**文言ファイルは3つある**(`docs/shell_i18n.js` /
`docs/colheita/i18n.js` / `docs/india/i18n.js`)ので、3つとも足すこと。

## 送信待ちのデータはいつ消えるのか

送信待ちの記録は、端末の **IndexedDB**(オリジン `mameyompo-maker.github.io`)にある。

**消えないこと**

- アプリを閉じる / 端末を再起動する / 電池が切れる
- 何日も圏外のまま使い続ける
- アプリ自体が新しい版に更新される(Service Worker のキャッシュ更新は別物)
- 空き容量が減る — `navigator.storage.persist()` で保護を要求している。
  ホーム画面に追加済みなら Chrome も Safari も自動で許可する

**消えること**

- ブラウザの **「Cookie とサイトデータを削除」**(Safari は「履歴と Web サイトデータを消去」)。
  ※「キャッシュされた画像とファイル」だけの削除では消えない
- **ホーム画面のアイコンを削除する**(iOS)/ **PWA をアンインストールする**(Android)
- プライベートブラウズ / シークレットタブで開いた場合(閉じたら消える)
- 端末の初期化、ブラウザ自体のアンインストール

**現場のルールはこれだけ**:画面上部に帯が出ている間は、アイコンを消したり
ブラウザのデータを消したりしない。Android は閉じたままでも送られるが、
確実を期すなら一日の終わりにアプリを開いて**帯が消えるのを確認**する
(iOS はこの確認が必須)。

> ⚠ ホーム画面に追加せず Safari のタブで使うと、iOS は7日間そのサイトを触らないと
> 保存データを消す。**必ずホーム画面に追加すること。**追加した Web アプリはこの
> 7日ルールの対象外になる。

## 仕様メモ

- **後勝ち。** 2人が同じ記録を触らない前提(Kaz さん判断・2026-08-09)なので、
  版の突き合わせはしない。送信ごとの UUID は**二重送信を防ぐため**だけに使う
- `Harvest_Log` に **H列 `Record ID`** を、`Audit_Log` に **L列 `Op ID`** を足す。
  A〜G / A〜K は現行のままなので Streamlit 版は壊れない
- 修正・削除の対象は Record ID で探す。Streamlit 版が作った古い行には ID が無いので、
  その場合は Timestamp + 番号 で探す
- まだ送っていない登録を直した場合、修正は送らずに**キューの中身を書き換える**
  (サーバーがまだ知らない行を直そうとしないため)
- タイムスタンプは**端末の時計**。実際に計量した時刻を残すため
- 台帳から端末に載せるのは 5 列だけ:番号 / Sack Number / Variety /
  Total no.of plant / Mother Id

## テスト

`tests/` に一式。先にモックサーバーを起動してから流す(4本の Apps Script を
すべて模倣する)。

🚨 **モックサーバーは、渡された docs ディレクトリの `config.js` をモック向けに
書き換える。本物の `docs/` を渡さず、必ずコピーを渡すこと。**

```powershell
# docs のコピーを作る(本物には向けない)
Copy-Item -Recurse docs $env:TEMP\jatlog_test_docs
Start-Process python -ArgumentList "tests\servidor.py","$env:TEMP\jatlog_test_docs","8810" -WindowStyle Hidden

# コンソールが cp932 で落ちるので PYTHONIOENCODING が必須
$env:PYTHONIOENCODING = "utf-8"
python tests\teste.py            # 統合そのもの(入口・メニュー・共有セッション)
python tests\teste_colheita.py   # colheita(+ Índia 17 への入口、全期間履歴)
python tests\teste_india.py      # india(測定)
python tests\teste_pesagem.py    # pesagem(袋の計量、全期間履歴)
python tests\teste_india17.py    # india17(月次収穫)
python tests\teste_sync.py       # アプリを閉じたままの自動送信(4本のキュー)
```

合格件数はスイートの末尾に出る(2026-08-30 時点: 統合 64 / colheita 92 /
india 全項目 / pesagem 61 / india17 60 / sync 18)。**この数字は書き写さず、
毎回実測すること。**

`teste_india.py` は India Rec 単独版の `tests/teste.py` の移植版。あちらを直したら
`ferramentas/portar_teste.py` でこちらへ持ってくる(置換が1回ずつ当たらなければ
止まるようにしてある)。とくに次の2節は落とさないこと:

- **[22]** 旧版が作った送信待ち(`precisaAdmin: true` 付き)がちゃんと出ていくか
- **[23]** Service Worker **だけ**を叩いて記録がサーバーに届くか
- **[24]** わざと違う活性化コードにして、画面が**コードのせいだと言うか**
  (2026-08-13 の事故そのもの)

⚠ Playwright の「オフライン」は Service Worker には届かない(SW は別のネットワーク
コンテキストを持つ)。圏外テスト中に SW が先に送ってしまうことがあるので、
判定は「最後に1件ずつ届いていること」で行う。

## 制限事項

- サーバーに拒否された記録(権限エラーなど)はキューに残り、検索画面に赤い帯で
  理由が出る。「Tentar de novo」で再送できる。**データは消えない**
- 管理者パスワードは、圏外でログインした場合その場では検証できない。
  送信時にサーバーが判定する(間違っていれば上記の赤い帯に出る)
- 台帳を一度も落としていない拠点は、圏外では開けない
- 管理者が**他人の記録を開くと空のフォームが出ることがある**。サーバー上の値は
  「Registos e correcções → Todos」を一度開くと端末に載る。統合前から同じ挙動
  (アプリを開き直した直後も同じ)だが、管理者ログインが入口に移ったぶん
  遭遇しやすくなっている
