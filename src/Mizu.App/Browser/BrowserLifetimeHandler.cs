using System.Collections.Concurrent;
using CefSharp;
using CefSharp.Enums;
using CefSharp.Handler;

namespace Mizu.App.Browser;

internal sealed class BrowserLifetimeHandler(bool diagnostic, Action<string> notify) : LifeSpanHandler
{
    private readonly ConcurrentDictionary<int, IBrowser> popups = new();
    protected override bool OnBeforePopup(IWebBrowser control, IBrowser browser, IFrame frame,
        string targetUrl, string targetFrameName, WindowOpenDisposition disposition, bool userGesture,
        IPopupFeatures popupFeatures, IWindowInfo windowInfo, IBrowserSettings browserSettings,
        ref bool noJavascriptAccess, out IWebBrowser newBrowser)
    {
        newBrowser = null!;
        if (diagnostic)
        {
            notify("PCM診断中は別ウィンドウを開きません。ログインは通常再生モードで行ってください。");
            return true;
        }
        // Native CEF popups preserve the opener and request context for sign-in.
        if (string.IsNullOrEmpty(targetUrl) || targetUrl == "about:blank" || NavigationPolicy.IsWebUrl(targetUrl)) return false;
        notify("この種類の外部リンクは開けません。");
        return true;
    }
    protected override void OnAfterCreated(IWebBrowser control, IBrowser browser)
    {
        if (browser.IsPopup) popups[browser.Identifier] = browser;
    }
    protected override void OnBeforeClose(IWebBrowser control, IBrowser browser) => popups.TryRemove(browser.Identifier, out _);
    public void ClosePopups()
    {
        foreach (var popup in popups.Values)
            if (!popup.IsDisposed) popup.GetHost().CloseBrowser(true);
    }
}
