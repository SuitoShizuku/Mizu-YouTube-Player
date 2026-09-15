using System.IO;

namespace Mizu.App.Infrastructure;

internal static class AppPaths
{
    public static string Root { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MizuYTPlayer");
    public static string ProfileRoot => Path.Combine(Root, "Browser");
    public static string Profile => Path.Combine(ProfileRoot, "Default");
    public static string Logs => Path.Combine(Root, "Logs");
    public static void Initialize()
    {
        Directory.CreateDirectory(Profile);
        Directory.CreateDirectory(Logs);
    }
}
