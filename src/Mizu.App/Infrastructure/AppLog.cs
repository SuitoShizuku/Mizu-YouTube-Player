using System.IO;
using System.Threading.Channels;

namespace Mizu.App.Infrastructure;

// No URLs, cookies, page content, or exception messages are logged.
internal static class AppLog
{
    private static readonly Channel<string> Queue = Channel.CreateBounded<string>(new BoundedChannelOptions(256)
    { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
    private static Task? writer;
    public static void Start()
    {
        foreach (var file in Directory.GetFiles(AppPaths.Logs, "app-*.log").OrderDescending().Skip(6))
            try { File.Delete(file); } catch (IOException) { }
        writer = Task.Run(async () =>
        {
            try
            {
                await using var output = new StreamWriter(Path.Combine(AppPaths.Logs, $"app-{DateTime.Now:yyyyMMdd-HHmmss}.log"), true);
                await foreach (var entry in Queue.Reader.ReadAllAsync())
                {
                    await output.WriteLineAsync(entry);
                    await output.FlushAsync();
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        });
    }
    public static void Write(string eventName) => Queue.Writer.TryWrite($"{DateTimeOffset.Now:O} {eventName}");
    public static void Stop()
    {
        Queue.Writer.TryComplete();
        writer?.Wait(TimeSpan.FromSeconds(2));
    }
}
