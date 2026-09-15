using System.IO;
using System.Windows;
using CefSharp;
using CefSharp.Wpf;
using Mizu.App.Infrastructure;

namespace Mizu.App;

public partial class App : Application
{
    private Mutex? instance;
    private bool ownsInstance, cefStarted;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new Mutex(true, @"Local\MizuYTPlayer.Phase1", out ownsInstance);
        if (!ownsInstance)
        {
            MessageBox.Show("Mizu YT Playerは既に起動しています。既存のウィンドウを使用してください。", "Mizu YT Player");
            Shutdown(); return;
        }
        try
        {
            AppPaths.Initialize();
            AppLog.Start();
            AppLog.Write("Startup");
            var settings = new CefSettings
            {
                RootCachePath = AppPaths.ProfileRoot,
                CachePath = AppPaths.Profile,
                PersistSessionCookies = true,
                LogSeverity = LogSeverity.Disable,
                Locale = "ja",
                AcceptLanguageList = "ja,en-US,en"
            };
            // Do not override user-agent, certificates, web security, or Google authentication.
            Cef.EnableWaitForBrowsersToClose();
            cefStarted = Cef.Initialize(settings, performDependencyCheck: true, browserProcessHandler: null);
            if (!cefStarted) throw new InvalidOperationException("CEF initialization failed");
            var window = new MainWindow();
            MainWindow = window;
            window.Show();
        }
        catch (Exception ex)
        {
            AppLog.Write($"StartupFailed {ex.GetType().Name}");
            MessageBox.Show($"起動できませんでした（{ex.GetType().Name}）。\n配布フォルダー全体とVC++ x64ランタイムを確認してください。\nログ: {AppPaths.Logs}", "Mizu YT Player", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }
    protected override void OnExit(ExitEventArgs e)
    {
        if (cefStarted)
        {
            Cef.WaitForBrowsersToClose(5000);
            Cef.Shutdown();
        }
        AppLog.Write("Shutdown");
        AppLog.Stop();
        if (ownsInstance) instance?.ReleaseMutex();
        instance?.Dispose();
        base.OnExit(e);
    }
}
