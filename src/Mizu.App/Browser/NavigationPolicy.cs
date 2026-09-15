namespace Mizu.App.Browser;

internal static class NavigationPolicy
{
    public const string Home = "https://www.youtube.com/";
    public static bool IsWebUrl(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp) && string.IsNullOrEmpty(uri.UserInfo);

    public static string? FromInput(string input)
    {
        input = input.Trim();
        if (string.IsNullOrEmpty(input)) return null;
        if (!input.Contains("://", StringComparison.Ordinal)) input = "https://" + input;
        return IsWebUrl(input) ? input : null;
    }
}
