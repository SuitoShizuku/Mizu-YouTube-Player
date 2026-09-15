const assert = require('node:assert/strict');
const path = require('node:path');
const { AudioHost } = require('../src/audio-host.cjs');
const host = new AudioHost(path.resolve('native/build/MizuAudioHost_artefacts/Release/MizuAudioHost.exe'));
const plugin = process.argv[2] || 'C:\\Program Files\\Common Files\\VST3\\Bevel EQ.vst3';
function next(type, run) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error(`Timed out: ${type}`)), 12000);
    const listener = event => { if (event.type === type) finish(null, event); else if (event.type === 'error') finish(Error(event.message)); };
    function finish(error, value) { clearTimeout(timer); host.off('event', listener); error ? reject(error) : resolve(value); }
    host.on('event', listener);
    try { run(); } catch (error) { finish(error); }
  });
}
(async () => {
  await next('ready', () => host.start());
  const stream = setInterval(() => host.audio(new ArrayBuffer(8192)), 20);
  try {
    for (let round = 0; round < 3; round++) {
      for (let i = 1; i <= 2; i++) {
        const event = await next('plugins', () => host.command(2, plugin));
        assert.equal(event.plugins.length, i);
        console.log('ADDED', round, i);
      }
      await next('device', () => host.command(6));
      assert.equal(host.plugins.length, 2);
      for (const slot of [...host.plugins]) {
        await next('plugins', () => host.command(4, String(slot.id)));
      }
      assert.equal(host.plugins.length, 0);
    }
    console.log('VST repeated insertion/removal and output reopen with streaming audio passed.');
  } finally { clearInterval(stream); host.stop(); }
})().catch(error => { console.error(error); host.stop(); process.exitCode = 1; });
