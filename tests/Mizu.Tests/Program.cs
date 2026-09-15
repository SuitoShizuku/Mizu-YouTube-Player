using System.Runtime.InteropServices;
using CefSharp.Structs;
using Mizu.App.Audio;
using Mizu.App.Browser;

var passed = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception("FAIL: " + label);
    Console.WriteLine("PASS: " + label); passed++;
}
Check(NavigationPolicy.FromInput(" youtube.com/watch?v=abc ") == "https://youtube.com/watch?v=abc", "HTTPS default and trim");
foreach (var input in new[] { "", "file:///C:/secret", "javascript:alert(1)", "https://user:pass@example.com/", "data:text/html,hello" })
    Check(NavigationPolicy.FromInput(input) is null, "Reject unsafe or empty input");
Check(!NavigationPolicy.IsWebUrl("https://"), "Reject malformed URL");
Check(NavigationPolicy.IsWebUrl("https://accounts.google.com/"), "Allow normal login navigation");
using var probe = new PcmProbe();
probe.OnAudioStreamStarted(null!, null!, new AudioParameters { SampleRate = 48000 }, 2);
unsafe
{
    float* left = stackalloc float[] { 0, -0.25f, 0.125f, 0 };
    float* right = stackalloc float[] { 0, 0.5f, float.NaN, 0 };
    float** channels = stackalloc float*[2]; channels[0] = left; channels[1] = right;
    probe.OnAudioStreamPacket(null!, null!, (IntPtr)channels, 4, 0);
    var s = probe.Snapshot();
    Check(s.Packets == 1 && s.Frames == 4 && s.NonSilentPackets == 1, "Count stereo frames, not samples");
    Check(s.Peak == 0.5f && s.SampleRate == 48000 && s.Channels == 2 && s.Recent, "Read planar PCM and ignore NaN");
    for (var i = 0; i < 4; i++) left[i] = right[i] = 0;
    probe.OnAudioStreamPacket(null!, null!, (IntPtr)channels, 4, 0);
    Check(probe.Snapshot().NonSilentPackets == 1 && probe.Snapshot().Peak == 0, "Do not report silence as nonzero");
    probe.OnAudioStreamStopped(null!, null!);
    Check(!probe.Snapshot().Active, "Stream stop state");
    probe.OnAudioStreamStarted(null!, null!, new AudioParameters { SampleRate = 44100 }, 2);
    Check(probe.Snapshot().Active && probe.Snapshot().SampleRate == 44100, "Stream restart with new format");
    probe.OnAudioStreamError(null!, null!, "secret URL");
    Check(!probe.Snapshot().Active && !probe.Snapshot().Error!.Contains("secret"), "Sanitize capture error");
    probe.Dispose();
    probe.OnAudioStreamPacket(null!, null!, (IntPtr)channels, 4, 0);
    Check(probe.Snapshot().Packets == 2, "Ignore callbacks after disposal");
}
var blocker = new AdBlocker { Enabled = true, PageUrl = "https://www.youtube.com/watch?v=test" };
Check(blocker.ShouldBlock("https://googleads.g.doubleclick.net/pagead/id", false), "Block ad subdomain");
Check(blocker.ShouldBlock("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", false), "Block syndication resource");
foreach (var safe in new[] { "https://rr1.googlevideo.com/videoplayback", "https://www.youtube.com/youtubei/v1/player",
    "https://accounts.google.com/", "https://notdoubleclick.net/", "https://doubleclick.net.example.org/", "https://example.org/?next=doubleclick.net" })
    Check(!blocker.ShouldBlock(safe, false), "Preserve media, login, and host-boundary matches");
Check(!blocker.ShouldBlock("https://doubleclick.net/", true), "Never cancel top-level navigation");
blocker.PageUrl = "https://accounts.google.com/";
Check(!blocker.ShouldBlock("https://doubleclick.net/", false), "Disable filtering outside YouTube");
blocker.PageUrl = "https://youtube.com.example.org/";
Check(!blocker.ShouldBlock("https://doubleclick.net/", false), "Reject spoofed page origin");
blocker.PageUrl = NavigationPolicy.Home; blocker.Enabled = false;
Check(!blocker.ShouldBlock("https://doubleclick.net/", false), "Off restores requests");
Check(AdBlocker.CosmeticScript.Contains("mizu-ad-block-style"), "Cosmetic script embedded in build");
Console.WriteLine($"{passed} checks passed.");
