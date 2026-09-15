# Phase 1 変更一覧

## 変更した既存ファイル

- `README.md`：起動、ビルド、保存先、制約の説明

## 新規ファイル

- `.gitignore`：SDK、キャッシュ、成果物の除外
- `global.json`：.NET 10 SDK指定
- `Directory.Build.props`：プロジェクト内NuGetキャッシュ
- `Mizu.slnx`：ソリューション
- `Start-Mizu.cmd`：発行済みアプリの起動
- `scripts/build.ps1`：ビルド・チェック・発行
- `src/Mizu.App/Mizu.App.csproj`：WPFプロジェクト・CEF依存
- `src/Mizu.App/packages.lock.json`：依存バージョンとハッシュ
- `src/Mizu.App/app.manifest`：通常権限・DPI設定
- `src/Mizu.App/App.xaml`：共通表示スタイル
- `src/Mizu.App/App.xaml.cs`：単一起動・CEF初期化・終了
- `src/Mizu.App/MainWindow.xaml`：プレイヤー画面
- `src/Mizu.App/MainWindow.xaml.cs`：画面イベント・ブラウザ接続
- `src/Mizu.App/Browser/NavigationPolicy.cs`：URL入力の検証
- `src/Mizu.App/Browser/BrowserRequestHandler.cs`：遷移・描画障害
- `src/Mizu.App/Browser/BrowserLifetimeHandler.cs`：ポップアップ管理
- `src/Mizu.App/Browser/TestTonePage.cs`：通信不要のテスト音
- `src/Mizu.App/Audio/PcmProbe.cs`：非同期PCMコールバック診断
- `src/Mizu.App/Infrastructure/AppPaths.cs`：保存先
- `src/Mizu.App/Infrastructure/AppLog.cs`：キュー付きログ
- `src/Mizu.App/Infrastructure/WindowPreferences.cs`：寸法保存
- `src/Mizu.App/Properties/AssemblyInfo.cs`：検証プロジェクトへの内部公開
- `tests/Mizu.Tests/Mizu.Tests.csproj`：外部テストフレームワーク不要の検証プロジェクト
- `tests/Mizu.Tests/Program.cs`：URL・実PCMレイアウト・破棄後コールバック等のチェック
- `docs/phase1-verification.md`：動作確認手順・実測結果
- `docs/phase1-files.md`：この一覧
- `licenses/`：利用ライセンス本文と出典

## ローカル生成物（Git管理外）

- `.tools/dotnet/`：公式.NET 10 SDK
- `.packages/`：NuGet依存
- `artifacts/phase1-release/`：自己完結型Windows x64実行フォルダー
- 各プロジェクトの `bin/`、`obj/`
