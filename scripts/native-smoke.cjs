const assert = require('node:assert/strict');
const path = require('node:path');
const { AudioHost } = require('../src/audio-host.cjs');
const host = new AudioHost(path.resolve('native/build/MizuAudioHost_artefacts/Release/MizuAudioHost.exe'));
let phase = 0;
const timer = setTimeout(() => { host.stop(); console.error('Native test timed out'); process.exit(1); }, 20000);
host.on('status', message => { if (phase < 4) { console.error(message); clearTimeout(timer); host.stop(); process.exitCode = 1; } });
host.on('event', event => {
  console.log(JSON.stringify(event));
  if (event.type === 'error') { clearTimeout(timer); host.stop(); process.exitCode = 1; }
  if (event.type === 'ready') { host.audio(new ArrayBuffer(8192)); host.command(2, process.argv[2] || 'C:\\Program Files\\Common Files\\VST3\\Bevel EQ.vst3'); phase = 1; }
  else if (event.type === 'plugins' && phase === 1) { assert.equal(event.plugins.length, 1); phase = 2; host.command(5, String(event.plugins[0].id)); }
  else if (event.type === 'plugins' && phase === 2) { assert.equal(event.plugins[0].bypass, true); phase = 3; host.command(4, String(event.plugins[0].id)); }
  else if (event.type === 'plugins' && phase === 3) { assert.equal(event.plugins.length, 0); phase = 4; clearTimeout(timer); host.stop(); console.log('Native VST3 load/bypass/remove passed.'); }
});
host.start();
