using System.IO;
using System.Text.Json;

namespace Mizu.App.Infrastructure;

internal sealed record AdBlockPreferences(bool Enabled = true)
{
    private static string FilePath => Path.Combine(AppPaths.Root, "adblock.json");
    public static AdBlockPreferences Load()
    {
        try { return JsonSerializer.Deserialize<AdBlockPreferences>(File.ReadAllText(FilePath)) ?? new(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { return new(); }
    }
    public bool Save()
    {
        try
        {
            File.WriteAllText(FilePath + ".tmp", JsonSerializer.Serialize(this));
            File.Move(FilePath + ".tmp", FilePath, true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        { AppLog.Write("AdBlockSettingsSaveFailed"); return false; }
    }
}
