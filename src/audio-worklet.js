class MizuOutput extends AudioWorkletProcessor {
  constructor() { super(); this.pcm = new Float32Array(2048); this.offset = 0; }
  process(inputs, outputs) {
    // Browser output stays silent. Only the native host emits sound.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      this.pcm[this.offset++] = channels[0][i];
      this.pcm[this.offset++] = (channels[1] || channels[0])[i];
      if (this.offset === this.pcm.length) {
        this.port.postMessage(this.pcm.buffer, [this.pcm.buffer]);
        this.pcm = new Float32Array(2048); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('mizu-output', MizuOutput);
