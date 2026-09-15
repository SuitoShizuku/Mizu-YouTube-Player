using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using CefSharp;
using CefSharp.Wpf;
using Mizu.App.Audio;
using Mizu.App.Browser;
using Mizu.App.Infrastructure;

namespace Mizu.App;

public partial class MainWindow : Window
{
    private ChromiumWebBrowser? browser;
    private BrowserLifetimeHandler? lifetime;
    private PcmProbe? probe;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private bool closing;
    private long lastLoggedPackets;
    private readonly AdBlocker adBlocker = new();

    public MainWindow()
    {
        InitializeComponent();
        adBlocker.Enabled = AdBlockPreferences.Load().Enabled;
        AdBlockToggle.IsChecked = adBlocker.Enabled;
        var preferences = WindowPreferences.Load();
        Width = Math.Min(preferences.Width, SystemParameters.WorkArea.Width);
        Height = Math.Min(preferences.Height, SystemParameters.WorkArea.Height);
        timer.Tick += (_, _) => UpdateProbe();
        timer.Start();
        Loaded += (_, _) => CreateBrowser(NavigationPolicy.Home);
        Closing += (_, _) =>
        {
            closing = true;
            timer.Stop();
            new WindowPreferences(RestoreBounds.Width, RestoreBounds.Height).Save();
            DisposeBrowser();
        };
    }

    private void Notify(string text)
    {
        if (closing || Dispatcher.HasShutdownStarted) return;
        Dispatcher.BeginInvoke(() => { if (!closing) StatusText.Text = text; });
    }

    private void CreateBrowser(string address, bool showTestPage = false)
    {
        DisposeBrowser();
        var diagnostic = CaptureToggle.IsChecked == true;
        probe = diagnostic ? new PcmProbe() : null;
        lastLoggedPackets = 0;
        lifetime = new BrowserLifetimeHandler(diagnostic, Notify);
        var control = new ChromiumWebBrowser
        {
            Address = showTestPage ? "about:blank" : address,
            LifeSpanHandler = lifetime,
            RequestHandler = new BrowserRequestHandler(Notify, adBlocker),
            AudioHandler = probe
        };
        browser = control;
        adBlocker.PageUrl = address;
        control.FrameLoadEnd += (_, e) =>
        {
            if (e.Frame.IsMain && adBlocker.Enabled && AdBlocker.IsYouTube(e.Url))
                e.Frame.ExecuteJavaScriptAsync(AdBlocker.CosmeticScript);
        };
        string? loadError = null;
        if (showTestPage)
            control.IsBrowserInitializedChanged += (_, _) =>
            {
                if (control.IsBrowserInitialized && browser == control)
                    control.LoadHtml(TestTonePage.Html, "https://mizu.invalid/diagnostic");
            };
        control.AddressChanged += (_, _) =>
        {
            if (browser == control) adBlocker.PageUrl = control.Address;
            // This WPF dependency-property event also follows SPA URL changes.
            if (browser == control && !AddressBox.IsKeyboardFocusWithin) AddressBox.Text = control.Address;
        };
        control.LoadingStateChanged += (_, e) => Dispatcher.BeginInvoke(() =>
        {
            if (closing || browser != control) return;
            BackButton.IsEnabled = e.CanGoBack;
            ForwardButton.IsEnabled = e.CanGoForward;
            if (e.IsLoading) { loadError = null; StatusText.Text = "読み込み中…"; }
            else StatusText.Text = loadError ?? "準備完了 · ログイン操作はYouTubeの画面から行ってください。";
        });
        control.LoadError += (_, e) =>
        {
            if (e.Frame.IsMain && e.ErrorCode != CefErrorCode.Aborted)
            {
                AppLog.Write($"MainFrameLoadFailed {e.ErrorCode}");
                Dispatcher.BeginInvoke(() =>
                {
                    if (closing || browser != control) return;
                    loadError = $"ページを読み込めませんでした（{e.ErrorCode}）。接続を確認して再読み込みしてください。";
                    StatusText.Text = loadError;
                });
            }
        };
        control.TitleChanged += (_, _) =>
        {
            if (browser == control) Title = $"Mizu YT Player — {control.Title}";
        };
        BrowserContainer.Content = control;
        ModeText.Text = diagnostic
            ? "PCM診断中：音声は計測後に破棄します。非ゼロPCMが届いても元音の抑止は聴感確認が必要です。切り替え時はページを読み直します。"
            : "通常再生：YouTubeの音声をブラウザから出力します。VSTは未実装です。";
        AppLog.Write(diagnostic ? "BrowserCreated CaptureOnly" : "BrowserCreated Normal");
    }

    private void DisposeBrowser()
    {
        if (probe is not null)
        {
            var s = probe.Snapshot();
            AppLog.Write($"ProbeSummary packets={s.Packets} nonSilent={s.NonSilentPackets} frames={s.Frames} rate={s.SampleRate} channels={s.Channels}");
        }
        lifetime?.ClosePopups();
        var old = browser;
        browser = null;
        BrowserContainer.Content = null;
        old?.Dispose();
        probe?.Dispose();
        probe = null;
    }

    private void UpdateProbe()
    {
        AdBlockText.Text = adBlocker.Enabled ? $"ON · 通信遮断 {adBlocker.Blocked:N0} 件 · 動画広告の完全除去は未対応" : "OFF";
        if (probe is null) { ProbeText.Text = "PCM診断：OFF"; return; }
        var s = probe.Snapshot();
        ProbeText.Text = s.Error ?? $"{(s.Recent ? "受信中" : "待機中")}  {s.SampleRate} Hz / {s.Channels} ch  |  packets: {s.Packets:N0}  non-zero: {s.NonSilentPackets:N0}  peak: {s.Peak:F6}";
        if (s.Packets - lastLoggedPackets >= 500)
        {
            lastLoggedPackets = s.Packets;
            AppLog.Write($"ProbeProgress packets={s.Packets} nonSilent={s.NonSilentPackets} rate={s.SampleRate} channels={s.Channels}");
        }
    }

    private void Navigate()
    {
        var address = NavigationPolicy.FromInput(AddressBox.Text);
        if (address is null) { StatusText.Text = "有効なHTTP／HTTPS URLを入力してください。"; return; }
        browser?.Load(address);
    }
    private void Go_Click(object sender, RoutedEventArgs e) => Navigate();
    private void AdBlock_Click(object sender, RoutedEventArgs e)
    {
        adBlocker.Enabled = AdBlockToggle.IsChecked == true;
        var saved = new AdBlockPreferences(adBlocker.Enabled).Save();
        if (browser?.IsBrowserInitialized == true)
        {
            if (adBlocker.Enabled && AdBlocker.IsYouTube(browser.Address)) browser.ExecuteScriptAsync(AdBlocker.CosmeticScript);
            else browser.ExecuteScriptAsync("document.getElementById('mizu-ad-block-style')?.remove();");
        }
        StatusText.Text = saved ? "広告ブロックを切り替えました。適用済み通信をリセットするには「再読み込み」を押してください。"
            : "切り替えましたが設定を保存できませんでした。ページを再読み込みして確認してください。";
    }
    private void Address_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) { Navigate(); e.Handled = true; } }
    private void Back_Click(object sender, RoutedEventArgs e) { if (browser?.CanGoBack == true) browser.Back(); }
    private void Forward_Click(object sender, RoutedEventArgs e) { if (browser?.CanGoForward == true) browser.Forward(); }
    private void Reload_Click(object sender, RoutedEventArgs e) => browser?.Reload();
    private void Home_Click(object sender, RoutedEventArgs e) => browser?.Load(NavigationPolicy.Home);
    private void Capture_Click(object sender, RoutedEventArgs e)
    {
        var address = browser?.Address;
        CreateBrowser(address is not null && NavigationPolicy.IsWebUrl(address) ? address : NavigationPolicy.Home,
            address == "https://mizu.invalid/diagnostic");
    }
    private void TestTone_Click(object sender, RoutedEventArgs e)
    {
        browser?.LoadHtml(TestTonePage.Html, "https://mizu.invalid/diagnostic");
    }
    private void Help_Click(object sender, RoutedEventArgs e) => MessageBox.Show(this,
        "1. 通常再生でYouTubeにログインし、動画を再生します。\n2. 再起動してログイン状態が維持されるか確認します。\n3. PCM取得のみをONにし、再度動画を再生します。\n4. non-zeroが増えることと、スピーカーが無音になることを確認します。\n5. OFFに戻すと通常の音声出力に戻ります。\n\nテスト音ページはGoogleログインや通信に依存しない比較用です。\nブラウザのミュートや動画の音量ゼロは、元音抑止の検証になりません。\nGoogleがログインを拒否した場合は、その画面の内容をお知らせください。\n\n保存先: " + AppPaths.Root,
        "Phase 1 確認手順", MessageBoxButton.OK, MessageBoxImage.Information);
}
