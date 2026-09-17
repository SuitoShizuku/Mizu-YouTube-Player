(() => {
  let stream, context, source, worklet, pending;
  const active = () => stream?.getAudioTracks().some(track => track.readyState === 'live') && context?.state !== 'closed';
  async function dispose() {
    if (worklet) { worklet.port.onmessage = null; worklet.disconnect(); }
    source?.disconnect(); stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') await context.close();
    stream = context = source = worklet = null;
  }
  async function connect() {
    await dispose();
    try {
      // Main grants only the player WebContents. No microphone or system loopback.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1, width: 16, height: 16 },
        audio: { channelCount: 2, sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      // getDisplayMedia requires video in the request, but the audio track is
      // independent. Drop video immediately: nothing is displayed or recorded.
      stream.getVideoTracks().forEach(track => track.stop());
      const track = stream.getAudioTracks()[0];
      if (!track) throw Error('タブの音声トラックを取得できません');
      const settings = track.getSettings();
      if (settings.echoCancellation || settings.noiseSuppression || settings.autoGainControl) throw Error('音声キャプチャの自動補正を無効化できません');
      context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      await context.audioWorklet.addModule('../audio-worklet.js');
      source = context.createMediaStreamSource(new MediaStream([track]));
      worklet = new AudioWorkletNode(context, 'mizu-output', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      worklet.port.onmessage = event => window.mizu.sendAudio(event.data);
      source.connect(worklet); worklet.connect(context.destination);
      await context.resume();
      track.onended = () => window.mizu.reportAudio(false, 'タブの音声接続が切れました。再接続します');
      window.mizu.reportAudio(true, 'タブ音声 → VST3 → 出力');
      return { active: true, sampleRate: context.sampleRate, channels: settings.channelCount, videoTracks: stream.getVideoTracks().filter(t => t.readyState === 'live').length };
    } catch (error) {
      await dispose(); window.mizu.reportAudio(false, error.message); throw error;
    }
  }
  window.mizuAudio = Object.freeze({
    async start() {
      if (pending) return pending;
      if (active()) { await context.resume(); return { active: true, sampleRate: context.sampleRate }; }
      pending = connect();
      try { return await pending; } finally { pending = null; }
    }
  });
})();
