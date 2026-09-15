# 広告ブロック（実験的）

Phase 1への追加機能です。動画の冒頭・途中広告をすべて除去する実装ではありません。

## 対象

- YouTubeを表示中に、doubleclick.net / googlesyndication.com / googleadservices.comとそのサブドメインへの一部リソース要求をCEFでキャンセル
- 専用JavaScriptでYouTubeの広告専用要素に非表示CSSを追加。後から追加されるSPA要素にも適用
- ON/OFFと設定保存（`%LOCALAPPDATA%/MizuYTPlayer/adblock.json`）
- 遮断した通信数だけを画面に表示。URLや閲覧履歴は保存しない

初期値はONです。動画配信元googlevideo.com、YouTube player API、ログインAPIはドメイン遮断対象に含めません。
メインページの遷移と別ウィンドウの通信はキャンセルしません。
遮断件数は広告の個数ではありません。測定用リクエストも含まれ得ます。

## 未対応・制約

- 本編と同じ配信経路の動画広告、サーバー側で挿入された広告、埋め込みスポンサー部分
- 完全なEasyList構文や外部フィルターリストの自動更新
- ブロック警告の回避、認証回避、YouTube内部レスポンスの書き換え
- 既に取得済みの広告データの消去。切り替え後は再読み込みが必要
- 広告DOMの変更や、Service Worker・リダイレクト等で捕捉されない要求

YouTubeは広告ブロッカー検出時に広告の許可等を求める場合があります。
https://support.google.com/youtube/answer/14129599?hl=ja
再生できない場合はOFFにして「再読み込み」を押してください。

## 確認手順

1. 以前のMizuを通常終了し、ルートのStart-Mizu.cmdを起動。
2. YouTubeで検索・動画再生し、通信遮断件数とページ内広告枠を確認。
3. OFFにして再読み込み。再生やログインへの影響が解消するか比較。
4. ON/OFF設定が再起動後も維持されるか確認。
5. PCM診断とテスト音が従来どおり動くか確認。

ドメイン判定・OFF復帰等の自動検証は実施します。広告配信はアカウント・地域・配信条件で異なるため、実YouTubeでの除去率は未検証です。

## 変更ファイル

既存: BrowserRequestHandler.cs、MainWindow.xaml/.xaml.cs、Mizu.App.csproj、tests/Mizu.Tests/Program.cs、scripts/build.ps1、Start-Mizu.cmd、README.md。

新規: Browser/AdBlocker.cs、Browser/AdResourceHandler.cs、Browser/Scripts/AdBlock.js、Infrastructure/AdBlockPreferences.cs、この文書。
