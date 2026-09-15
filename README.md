# Mizu YT Player

Windows 11 x64向けの.NET 10 / WPF / CefSharpプレイヤー。
現在は **Phase 1（最小プレイヤーと音声取得の実現性検証）** です。VST・Webhookは未実装です。

## 起動

この作業環境では、ルートの `Start-Mizu.cmd` をダブルクリックしてください。
`artifacts/phase1-adblock/Mizu.YT.Player.exe` を直接起動することもできます。
実行ファイルだけを移動せず、`artifacts/phase1-adblock` 全体を保持してください。
.NETランタイムは同梱しています。CEFにはVisual C++ x64ランタイムが必要です。

## Phase 1でできること

- YouTube Web版の表示、URL入力、戻る・進む・再読み込み
- YouTube標準UIによる再生・停止・シーク・検索等
- 専用の永続ブラウザプロファイル（Googleが認証を許可した場合のログイン維持）
- 通常再生とPCM取得のみの診断モードの切り替え
- PCMの受信数・非ゼロパケット数・振幅・形式の表示
- 通信不要の440 Hzテスト音ページ
- ウィンドウ寸法保存、多重起動防止、起動・音声診断ログ
- [広告ブロック（実験的）](docs/adblock.md)：一部の広告通信・ページ内広告枠を対象。動画広告の完全除去は未対応

## 動作確認

[Phase 1確認手順・実測結果](docs/phase1-verification.md) を参照してください。
**ユーザーによるPhase 1確認が終わるまでPhase 2へ進みません。**

## ビルド

.NET 10 SDKが必要です。この環境には `.tools/dotnet` にローカル配置しています。

```powershell
powershell -File scripts/build.ps1 -Publish
```

このスクリプトはReleaseビルド、自動チェック、自己完結型発行を実行します。
再発行前にプレイヤーを終了してください。SDK・NuGetキャッシュ・生成バイナリはGit管理外です。
NuGet依存は `src/Mizu.App/packages.lock.json` で記録しています。

## 保存先

`%LOCALAPPDATA%/MizuYTPlayer/`

- `Browser/Default/`：専用Cookie・キャッシュ等。Gitや共有対象に含めないでください。
- `window.json`：ウィンドウ寸法
- `Logs/app-*.log`：最大およそ7起動分の診断ログ。URL・Cookie・PCM本体は出力しません。

## 制約

- Googleの埋め込みブラウザ判定によってログインできない場合があります。UA偽装・Cookie移植はしません。
- PCM診断中は音声を出力せず破棄します。VST処理経路はまだありません。
- モード切り替えはブラウザを作り直すため、再生位置と戻る履歴を引き継ぎません。Cookieは同じプロファイルを使用します。
- 診断モードは再起動時にOFFへ戻します。ポップアップでログインするときは通常モードにしてください。
- 標準CEFのH.264/AAC・DRM等の制約があり、すべての動画形式は保証できません。
- 本当のラウドネス無効化を実装したとするボタンはありません。
- 音声取得APIの存在・PCM受信確認と、実音の無音確認は別です。

依存ライセンスは `licenses/`、変更一覧は [Phase 1変更一覧](docs/phase1-files.md) を参照してください。
