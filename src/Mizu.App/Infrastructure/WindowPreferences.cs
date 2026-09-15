using System.IO;
using System.Text.Json;

namespace Mizu.App.Infrastructure;

internal sealed record WindowPreferences(double Width = 1280, double Height = 850)
{
    private static string FilePath => Path.Combine(AppPaths.Root, "window.json");
    public static WindowPreferences Load()
    {
        try
        {
            var value = JsonSerializer.Deserialize<WindowPreferences>(File.ReadAllText(FilePath));
            if (value is not null && double.IsFinite(value.Width) && double.IsFinite(value.Height))
                return new(Math.Clamp(value.Width, 900, 3840), Math.Clamp(value.Height, 650, 2160));
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { }
        return new();
    }
    public void Save()
    {
        try
        {
            File.WriteAllText(FilePath + ".tmp", JsonSerializer.Serialize(this));
            File.Move(FilePath + ".tmp", FilePath, true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { AppLog.Write("WindowSettingsSaveFailed"); }
    }
}
