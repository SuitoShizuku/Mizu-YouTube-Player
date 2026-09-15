using System.IO;
using System.Reflection;

namespace Mizu.App.Browser;

// Limited domain rules, not an EasyList engine. Does not block media/player APIs.
internal sealed class AdBlocker
{
    private int enabled;
    private long blocked;
    private string pageUrl = NavigationPolicy.Home;
    private static readonly string[] AdHosts = ["doubleclick.net", "googlesyndication.com", "googleadservices.com"];
    public bool Enabled { get => Volatile.Read(ref enabled) != 0; set => Volatile.Write(ref enabled, value ? 1 : 0); }
    public long Blocked => Interlocked.Read(ref blocked);
    public string PageUrl { set => Volatile.Write(ref pageUrl, value); }
    public static string CosmeticScript { get; } = LoadScript();
    public bool ShouldBlock(string url, bool navigation) => Enabled && !navigation
        && IsYouTube(Volatile.Read(ref pageUrl)) && IsAdUrl(url);
    public void RecordBlock() => Interlocked.Increment(ref blocked);
    internal static bool IsYouTube(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && MatchesHost(uri.IdnHost, "youtube.com");
    internal static bool IsAdUrl(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && (uri.Scheme == "https" || uri.Scheme == "http")
        && AdHosts.Any(host => MatchesHost(uri.IdnHost, host));
    private static bool MatchesHost(string host, string domain) => host.Equals(domain, StringComparison.OrdinalIgnoreCase)
        || host.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase);
    private static string LoadScript()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Mizu.AdBlock.js")
            ?? throw new InvalidOperationException("Missing ad-block script");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
