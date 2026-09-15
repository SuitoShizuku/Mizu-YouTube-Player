using CefSharp;
using CefSharp.Handler;

namespace Mizu.App.Browser;

internal sealed class AdResourceHandler(AdBlocker blocker, bool navigation) : ResourceRequestHandler
{
    protected override CefReturnValue OnBeforeResourceLoad(IWebBrowser control, IBrowser browser, IFrame frame,
        IRequest request, IRequestCallback callback)
    {
        if (!blocker.ShouldBlock(request.Url, navigation)) return CefReturnValue.Continue;
        blocker.RecordBlock();
        return CefReturnValue.Cancel;
    }
}
