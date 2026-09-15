namespace Mizu.App.Browser;

internal static class TestTonePage
{
    // Loaded through CefSharp's in-memory resource handler, never fetched remotely.
    public const string Html = """
        <!doctype html><html lang="ja"><meta charset="utf-8"><title>音声経路テスト</title>
        <style>body{background:#101b2a;color:#e5eff8;font:17px system-ui;padding:50px;line-height:1.8}
        button{font:inherit;padding:12px 24px;margin:8px;background:#7cd4e4;border:0;border-radius:8px}
        p{max-width:780px}small{color:#acc2d4}</style>
        <h1>音声経路テスト</h1><p>440 Hzの小さなテスト音を生成します。音量を下げてから開始してください。</p>
        <button id="start">テスト音を開始</button><button id="stop">停止</button><p id="state">停止中</p>
        <p>通常再生：音が聞こえることを確認します。<br>PCM取得のみ：non-zeroが増加し、音が聞こえないことを確認します。</p>
        <small>このページはアプリ内で生成しています。録音・外部送信は行いません。</small>
        <script>let ctx;document.querySelector('#start').onclick=async()=>{
        if(ctx)await ctx.close();ctx=new AudioContext();const osc=ctx.createOscillator();const gain=ctx.createGain();
        osc.frequency.value=440;gain.gain.value=0.03;osc.connect(gain).connect(ctx.destination);
        await ctx.resume();osc.start();document.querySelector('#state').textContent='生成中：440 Hz / '+ctx.sampleRate+' Hz';};
        document.querySelector('#stop').onclick=async()=>{if(ctx){await ctx.close();ctx=null;}
        document.querySelector('#state').textContent='停止中';};</script></html>
        """;
}
