# Mizu YouTube Player

Windows 11向けのElectronプレイヤー。YouTubeや外部サイトのタブ音声をアプリ内のJUCE製VST3ホストへ送り、Windowsの既定オーディオデバイスから出力します。外部仮想マイク／仮想ケーブルは使いません。

## 起動

この作業環境では依存関係とネイティブホストをビルド済みです。

```powershell
npm start
```

新しい環境ではNode.js 22以上、Visual Studio 2022「C++によるデスクトップ開発」、Windows SDK、CMake 3.22以上、Gitが必要です。

```powershell
npm ci
npm run native:configure
npm run native:build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-ublock.ps1
npm start
```

配布用のポータブルEXE:

```powershell
npm run dist
```

出力先は `dist/Mizu YouTube Player 1.0.0.exe`。ビルド時にVSTホストと展開済みuBlock Originを同梱します。コード署名は未設定です。

## 操作

- 読み込み待ちの表示は「読み込んでいます...」のみです。装飾用のキャッチコピーを削除しました。
- アドレス欄から任意のHTTP/HTTPSサイトを閲覧できます。スキーム省略時はHTTPSを補い、リンクやリダイレクトも通常のWebサイト間で許可します。YouTube以外では現在のURLをコピーします。Googleログイン専用ウィンドウの遷移制限は維持しています。
- 外部サイトの音声も同じVSTチェーンを経由します。サイト別の音声設定は不要です。Webhook転送と音量補正ボタンはYouTube専用です。

- YouTubeを通常どおり操作します。ログイン用ページへの遷移と永続セッションに対応しています。Google側が組み込みブラウザーのログインを拒否する場合があります。アカウントでのログイン完了は未検証です。
- アドレスバー右の「URLをコピー」で `https://youtu.be/動画ID` をコピーします。`si`、`t`、`list`などを取り除きます。
- 「プラグインを追加」からWindows x64の`.vst3`ファイル／バンドルを選択します。追加順に直列処理します。「編集」でプラグイン固有UI、「バイパス」「削除」でチェーンを操作できます。
- 「設定 → 再生を転送」でAPIキーを入力し、有効にしてから転送先を追加・保存します。`videoCategoryId`のジャンル、Discord Webhook URL、テキストの組を複数登録できます。
- 音量補正の切り替えは設定画面とYouTubeコントロールにあります。`.ytp-right-controls-left`を優先し、存在しなければ`.ytp-right-controls`に配置します。

## Webhook

ジャンルなどの正確な取得にはYouTube Data API v3のAPIキーが必要です。APIを有効にしたキーを設定してください。APIキー・Webhook URLはElectron `safeStorage`で暗号化し、アプリの`userData/settings.enc`に保存します。YouTubeページにはキーを渡しません。

| 変数 | 内容 |
| --- | --- |
| `{url}` | `youtu.be`の短縮URL |
| `{full-url}` | 再生開始時のURL（時刻・プレイリストを保持） |
| `{title}` | 動画タイトル |
| `{channel}` | 投稿チャンネル |
| `{view}` / `{like}` / `{dislike}` | 再生数／高評価数／低評価数 |
| `{date}` | 日本時間の`YYYY/MM/DD/HH/MM` |
| `{relative-date}` | n分前・n時間前・n日前・nヶ月前・n年前 |
| `{duration}` | n秒 |
| `{format-duration}` | n分n秒（60分以上も分で表示） |

公式APIは他人の動画の低評価数を公開していないため、通常`{dislike}`は「取得不可」になります。他の非公開値も同様です。日時は投稿日時であり、撮影日時ではありません。

実際の再生イベント／再生中の動画IDを確認して通知します。同じ動画のポーリングは重複送信せず、別の動画を再生してから戻れば再送信します。広告再生中は転送しません。SPA遷移で以前の取得が残った場合は中断します。Discordのメンションは無効化し、送信後の成否が曖昧な場合や429時に自動再試行はしません。実際のWebhookへの送信は、接続先未提供のため未検証です。

## 音声処理

```text
Player WebContents (HTML media / Web Audio / iframe)
  → Electron tab audio capture (pre-mute, local echo disabled)
  → trusted shell MediaStreamAudioSourceNode
  → AudioWorklet (48 kHz / stereo / Float32)
  → shell preload → Electron main → child-process stdin
  → JUCE FIFO → VST3 chain → default Windows output
```

Chromiumの音声出力は常時ミュート。Workletもブラウザー出力をゼロにし、ネイティブホストだけが音を出します。ホストが利用できないときは未処理音への切り替えをせず無音になります。ホストはElectronと別プロセスのため、プラグインのクラッシュを検出できます。停止したホストは次のプラグイン追加時に再起動します（クラッシュしたチェーンは復元しません）。

音声はページのDOMではなくプレイヤータブ全体から取得します。信頼済みのローカル画面からの要求にだけ、そのタブのキャプチャを許可します。マイクや他アプリの音は取得しません。API上必要な映像トラックは取得直後に停止し、表示・録画しません。ステレオとプレイヤー音量を維持し、自動音量調整・ノイズ抑制・エコー除去を無効にします。3秒ごとに接続を確認し、切断時は再接続します。DRM保護された配信の再生・音声取得は未検証です。

参考: https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts

- Windows x64 / ステレオVST3エフェクトが対象です。VST処理は48 kHzで行い、出力先のサンプルレートへ変換します。
- Windowsの既定出力を750 ms間隔で確認し、変更・切断・再接続時にはVSTチェーンを保持して出力を再開します。44.1/48/96 kHzの出力変換をオフラインテスト済みです。
- VST2、楽器・MIDI、サイドチェイン、並べ替え、出力デバイス選択、プラグイン遅延補償は未実装です。
- 音声のコピーとキューを使用する初期実装です。高負荷時は音切れの可能性があり、厳密な低遅延保証や長時間のクロック差補正はありません。
- 出力は非有限値をゼロにし、最終段で±1に制限します。
- 音量補正OFFはYouTubeがHTMLMediaElementに設定する減衰を操作音量へ戻す実験的実装です。YouTubeの内部仕様変更、動画ごとの挙動、Stable volumeの処理には依存が残ります。Stable volumeはYouTubeの設定でもOFFにしてください。

## エフェクトチェーンの保存（0.1.4）

ラック上部の入力欄に名前を入れ、右側のフロッピーディスクを押すと新規プリセットを保存します。入力操作をした場合は同じ名前でも別プリセットとして追加します。一覧の名前を選ぶとその場で読込、各行右端の×で削除します。既存項目を選んだまま入力を変えずに保存すると、その項目を更新します。保存対象はプラグインのパス、順序、バイパス、JUCEのgetStateInformationで取得する内部状態です。プラグイン本体や外部サンプルは保存しません。

エフェクトは1行表示で、名前の右に「電源（バイパス）・ペン（編集）・ゴミ箱（削除）」を配置しています。長い名前は省略表示し、マウスを置くと全文を表示します。今回のUI更新もバージョン番号は0.1.4のままです。

### 背面・最小化時の音声

ブラウザーの出力は無音なので、Windows 11がアプリを非表示・非可聴とみなし、高精度タイマー要求を無視する場合があります。Electronのバックグラウンド抑制を無効化し、アプリ所有プロセスにのみSetProcessInformationでタイマー精度と実行速度を維持する設定を適用します。OS全体の設定や他アプリには適用しません。バックグラウンド時の省電力より再生の継続を優先します。

ネイティブホストは3072フレーム（48kHzで64ms）を蓄えてから再生し、IPCの受信間隔の揺れを吸収します。途切れた後も同量を蓄えて再開し、待機中は無音をエフェクトに通してリバーブ等の余韻を保ちます。その分だけ再生開始時の音声遅延が増えます。

参考: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessinformation

`electron scripts/occlusion-smoke.cjs timer-baseline`と`electron scripts/occlusion-smoke.cjs external-fixed`で、別プロセスの最大化ウィンドウによる遮蔽／最小化のPCM受信量を比較します。無音のテスト音声のみ使用します。`MizuAudioHost.exe --test-jitter`で到着の揺れと枯渇後の再開、`--test-resampling`で44.1/48/96kHz出力をオフライン検証します。

10秒間隔および通常終了時に前回チェーンを保存し、起動時に自動復元します。`userData/effect-chains.json`へ一時ファイル経由で書き込みます。復元時にプラグインが見つからない／失敗する場合は通知し、保存済みの前回チェーンを空の状態で上書きしません。強制終了直前の変更や、プラグイン自身が状態を保存しない項目は復元できません。

## 追加のChrome拡張機能（0.1.4）

「設定 → 拡張機能 → フォルダーを開く」で`userData/Extensions`を開きます。`Extensions/拡張名/manifest.json`となるように展開済みの拡張機能を配置し、「追加・削除を反映」を押します。複数の拡張機能をuBlock Originと同じ永続セッションへ読み込み、次回起動時も読み込みます。更新したファイルの再読み込みにはアプリ再起動が必要です。

設定ページを持つ拡張機能には「拡張機能の設定」ボタンを表示します。壊れたmanifestは個別にエラー表示し、他の拡張機能の読込を継続します。2つのテスト用拡張機能の同時content script実行・設定ページ表示・再起動後の再読込を検証済み。YouTube Enhancer本体は未提供のため未検証です。ElectronはChrome APIの全機能に対応していません。

`node scripts/chain-regression.cjs`で実VST状態の往復・ホスト再起動・欠落プラグイン保護を検証します。`electron scripts/persistence-smoke.cjs save .local/任意の新規プロファイル`、続けて`restore`でアプリ終了時保存・次回起動復元を検証します。

## uBlock Origin

公式uBlock Origin 1.74.0を変更せず読み込みます。Electron標準APIを`electron-chrome-extensions`で補完しています。フィルター初期化は内部で確認し、画面には接続状態や準備完了の表示を出しません。すべてのYouTube広告をブロックできるという保証はありません。

ElectronのManifest V2非推奨・一部権限に関する警告は残ります。Electronの`session.webRequest`に独自ハンドラーを追加すると拡張機能のハンドラーを妨げるため、このアプリでは使いません。uBlockの任意タブ作成など、汎用ブラウザー機能は制限しています。

## 検証

```powershell
npm test
npm run check
node_modules/.bin/electron.cmd scripts/smoke.cjs
node_modules/.bin/electron.cmd scripts/audio-smoke.cjs
node scripts/native-smoke.cjs "C:\Program Files\Common Files\VST3\Bevel EQ.vst3"
node scripts/native-regression.cjs "C:\Program Files\Common Files\VST3\Bevel EQ.vst3"
node_modules/.bin/electron.cmd scripts/login-regression.cjs
native/build/MizuAudioHost_artefacts/Release/MizuAudioHost.exe --test-resampling
```

- ユニットテスト: URL検証、変数展開、ジャンル別ルーティング、重複排除、古い取得の破棄、429、Discord文字数制限。
- Electronスモーク: YouTube表示、uBlock初期化と広告リクエスト遮断、設定フォーム・カテゴリ一覧・暗号化保存。
- 音声スモーク: ミュートしたプレイヤータブから、CORSヘッダーのない別オリジン音源、Web Audio、別オリジンiframeの非ゼロPCMを取得します。音量50%の反映とHTTPS外部サイトへの移動後の継続も検証します。実VSTを読み込み、テスト音はスピーカーに出しません。
- ネイティブスモーク: 実機出力デバイス起動、実際のVST3読み込み・バイパス・削除。無音バッファを使います。

## 0.1.1の修正

- VST操作を音声パケットより優先して待ち行列に保持し、パイプ混雑中も追加／削除を失わないようにしました。既存VSTの再走査を避け、非同期インスタンス生成を直列化しました。
- Bevel EQとBUSTERseで、2個挿入→出力再接続→全削除を3回繰り返すテストが通っています。Electronの追加操作経路でも削除後の再挿入を確認しました。
- ログインリンクをアプリ側の遷移処理へ直接渡し、子フレームのリダイレクトをトップページ用の制限で止めないようにしました。Googleログイン画面への遷移を確認しています。認証情報を使ったログイン完了は未検証です。
- 自動再生ではURLの更新前にプレイヤーの動画IDが変わるため、実際の再生IDを通知へ渡します。遅れて到着したURL更新による通知中断／重複を防ぎ、子フレームの遷移は無視します。
- Webhook URLは通常のURL入力欄へ変更。内部ルーティング図・接続状態・uBlock準備完了表示を削除しました。

## 0.1.2のログイン修正

- ログインを専用ウィンドウへ分離。プレイヤーと同じ永続セッションを使い、YouTubeが提供したログインURLを維持します。繰り返しクリックは既存のログインウィンドウを前面に出します。
- `accounts.youtube.com` と日本向けGoogleアカウント引き継ぎ先を許可。YouTubeに戻ったらCookieを保存し、プレイヤーを再読み込みします。
- `ERR_ABORTED` を通常の遷移中断として処理し、実際の通信失敗はエラーコード付きで表示します。
- `userData/login-diagnostics.jsonl` に遷移とエラーコードを記録します。URLのクエリー、Cookie、入力値、認証トークンは記録しません。
- Googleの入力フォーム表示まで検証。アカウント認証完了は未検証です。

スモークテストは`.local/`配下に独立したプロファイルを作り、本番のログイン／設定を変更しません。

## ソース構成

### 0.1.3 の操作変更

- 「プラグインを追加」でアプリ内の検索一覧を表示。Common Files/VST3、Steinberg/VstPlugins、VSTPlugins の3フォルダーを再帰スキャンします。
- VST3ファイルとバンドルを検出し、バンドル内部は重複登録しません。追加インストール後は「再スキャン」で更新します。
- ホストの対応形式は引き続きWindows x64のステレオVST3です。VST2のDLLは追加できず、検出件数のみ表示します。
- 設定ボタンは設定／プレイヤーを切り替えます。切り替えても未保存の入力は保持し、保存ボタンで確定します。
- `src/plugin-catalog.cjs` がファイル探索と選択IDの管理を担当します。

`src/main.cjs`: Electron・IPC・拡張機能・ウィンドウ。`src/core.cjs`: URL／変数／入力検証。`src/forwarder.cjs`: YouTube API／Discord。`src/youtube-page.js`: YouTube音量補正・再生検出。`src/ui/tab-audio.js`: サイト共通のタブ音声取得。`native/main.cpp`: VST3ホスト。`src/ui/`: 日本語の操作画面。

## 依存ライセンス・参照

この作業はローカル開発用です。第三者へ配布する際は、JUCE 8（AGPLv3または商用）、electron-chrome-extensions（GPL-3.0または商用）、uBlock Origin（GPL-3.0）等の条件に応じたソース提供・ライセンス表示を含めて配布形態を整えてください。第三者依存物のライセンスは各ソース／同梱ファイルに保持しています。

- https://www.electronjs.org/docs/latest/api/extensions
- https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions
- https://github.com/gorhill/uBlock/releases/tag/1.74.0
- https://github.com/juce-framework/JUCE/tree/8.0.12
- https://developers.google.com/youtube/v3/docs/videos
- https://developers.google.com/youtube/v3/docs/videoCategories/list
