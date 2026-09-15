using CefSharp;
using CefSharp.Handler;

namespace Mizu.App.Browser;

internal sealed class BrowserRequestHandler(Action<string> notify, AdBlocker blocker) : RequestHandler
{
    protected override IResourceRequestHandler GetResourceRequestHandler(IWebBrowser control, IBrowser browser,
        IFrame frame, IRequest request, bool isNavigation, bool isDownload, string requestInitiator, ref bool disableDefaultHandling)
        => browser is not null && !browser.IsPopup && blocker.ShouldBlock(request.Url, isNavigation)
            ? new AdResourceHandler(blocker, isNavigation)
            : base.GetResourceRequestHandler(control, browser!, frame, request, isNavigation, isDownload, requestInitiator, ref disableDefaultHandling);

    protected override bool OnBeforeBrowse(IWebBrowser control, IBrowser browser, IFrame frame, IRequest request, bool userGesture, bool isRedirect)
    {
        if (!frame.IsMain || NavigationPolicy.IsWebUrl(request.Url) || request.Url == "about:blank") return false;
        notify("このURLの種類は開けません。HTTP／HTTPSのURLを指定してください。");
        return true;
    }
    protected override void OnRenderProcessTerminated(IWebBrowser control, IBrowser browser,
        CefTerminationStatus status, int errorCode, string errorMessage) => notify("ページの描画プロセスが終了しました。「再読み込み」で復旧できます。");
}
