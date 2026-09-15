using System.Diagnostics;
using CefSharp;
using CefSharp.Structs;

namespace Mizu.App.Audio;

// Phase 1 measurement only: never plays, records, or forwards audio.
// Samples are read only while CEF owns the callback buffer. No allocations,
// locks, file I/O, dispatcher calls, or networking on the packet callback.
internal sealed class PcmProbe : IAudioHandler
{
    private int channels, sampleRate, active, disposed;
    private long packets, frames, nonSilentPackets, lastPacket;
    private float peak;
    private string? error;
    public bool GetAudioParameters(IWebBrowser control, IBrowser browser, ref AudioParameters parameters) => !browser.IsPopup;
    public void OnAudioStreamStarted(IWebBrowser control, IBrowser browser, AudioParameters parameters, int channelCount)
    {
        Volatile.Write(ref channels, channelCount);
        Volatile.Write(ref sampleRate, parameters.SampleRate);
        Volatile.Write(ref error, null);
        Volatile.Write(ref active, 1);
    }
    public unsafe void OnAudioStreamPacket(IWebBrowser control, IBrowser browser, IntPtr data, int noOfFrames, long pts)
    {
        if (Volatile.Read(ref disposed) != 0 || data == IntPtr.Zero || noOfFrames <= 0) return;
        var count = Volatile.Read(ref channels);
        if (count is < 1 or > 32) return;
        var samples = (float**)data.ToPointer();
        float packetPeak = 0;
        for (var c = 0; c < count; c++)
            for (var f = 0; f < noOfFrames; f++)
            {
                var value = MathF.Abs(samples[c][f]);
                if (float.IsFinite(value) && value > packetPeak) packetPeak = value;
            }
        Volatile.Write(ref peak, packetPeak);
        Interlocked.Add(ref frames, noOfFrames);
        Interlocked.Increment(ref packets);
        if (packetPeak > 0.000001f) Interlocked.Increment(ref nonSilentPackets);
        Volatile.Write(ref lastPacket, Stopwatch.GetTimestamp());
    }
    public void OnAudioStreamStopped(IWebBrowser control, IBrowser browser) => Volatile.Write(ref active, 0);
    public void OnAudioStreamError(IWebBrowser control, IBrowser browser, string errorMessage)
    {
        // Do not expose arbitrary CEF messages (which may contain URLs) in logs.
        Volatile.Write(ref error, "音声キャプチャでエラーが発生しました。通常再生に戻して再試行してください。");
        Volatile.Write(ref active, 0);
    }
    public ProbeSnapshot Snapshot()
    {
        var timestamp = Volatile.Read(ref lastPacket);
        var recent = timestamp != 0 && Stopwatch.GetElapsedTime(timestamp).TotalSeconds < 1;
        return new(Volatile.Read(ref active) != 0, recent, Volatile.Read(ref sampleRate), Volatile.Read(ref channels),
            Interlocked.Read(ref packets), Interlocked.Read(ref frames), Interlocked.Read(ref nonSilentPackets),
            recent ? Volatile.Read(ref peak) : 0, Volatile.Read(ref error));
    }
    public void Dispose() { Volatile.Write(ref disposed, 1); Volatile.Write(ref active, 0); }
}

internal sealed record ProbeSnapshot(bool Active, bool Recent, int SampleRate, int Channels, long Packets,
    long Frames, long NonSilentPackets, float Peak, string? Error);
