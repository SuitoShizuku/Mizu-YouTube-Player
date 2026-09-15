const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AudioHost } = require('../src/audio-host.cjs');
test('plugin commands survive pipe backpressure and take priority over audio', () => {
  const host = new AudioHost('unused');
  const writes = []; let writable = false;
  host.ready = true;
  host.process = { stdin: { writable: true, destroyed: false, write: packet => { writes.push(packet.readUInt32LE(0)); return writable; } } };
  host.audio(new ArrayBuffer(8192)); // Fill the pipe.
  host.command(2, 'first.vst3'); host.command(4, '1'); host.command(2, 'second.vst3');
  host.audio(new ArrayBuffer(8192));
  assert.deepEqual(writes, [1]);
  assert.equal(host.commands.length, 3);
  writable = true; host.blocked = false; host.flushCommands();
  assert.deepEqual(writes, [1, 2, 4, 2]);
  assert.equal(host.commands.length, 0);
  host.audio(new ArrayBuffer(8192)); assert.deepEqual(writes, [1, 2, 4, 2, 1]);
});
