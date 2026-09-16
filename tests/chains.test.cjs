const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { Chains } = require('../src/chains.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mizu-chains-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const host = new EventEmitter(); host.ready = true; host.chain = [];
  host.command = (type, request) => { assert.equal(type, 7); queueMicrotask(() => host.emit('event', { type: 'snapshot', request, chain: host.chain })); };
  return { host, chains: new Chains(directory, host), directory };
}
test('same-name preset overwrite, empty chain persistence, and deletion survive reload', async t => {
  const { host, chains, directory } = fixture(t);
  host.chain = [{ path: path.join(directory, 'effect.vst3'), state: 'serialized-state', bypass: false }];
  const first = await chains.save('Music'); assert.equal(first.length, 1);
  host.chain = [{ ...host.chain[0], state: 'edited-state', bypass: true }];
  const second = await chains.save('Music'); assert.deepEqual(second, first);
  const reload = new Chains(directory, host); assert.equal(reload.data.presets[0].chain[0].state, 'edited-state');
  host.chain = []; await chains.capture(); assert.deepEqual(new Chains(directory, host).data.last, []);
  await chains.remove(first[0].id); assert.deepEqual(new Chains(directory, host).list(), []);
});
test('unavailable host, invalid snapshot and missing plugin cannot erase last saved chain', async t => {
  const { host, chains } = fixture(t);
  await chains.save('Before'); const original = fs.readFileSync(chains.file, 'utf8');
  host.ready = false; await chains.capture(); assert.equal(fs.readFileSync(chains.file, 'utf8'), original);
  host.ready = true; host.chain = [{ invalid: true }]; await assert.rejects(chains.capture());
  assert.equal(fs.readFileSync(chains.file, 'utf8'), original);
  await assert.rejects(chains.restore([{ path: path.join(os.tmpdir(), 'mizu-absent-plugin.vst3'), state: '', bypass: false }]));
  host.chain = []; await chains.capture(); assert.equal(fs.readFileSync(chains.file, 'utf8'), original);
});
test('typing creates a new preset even with the same name; selection updates only its ID', async t => {
  const { chains } = fixture(t);
  const first = await chains.save('Music', { mode: 'create' });
  const second = await chains.save('Music', { mode: 'create' });
  assert.equal(second.length, 2); assert.notEqual(second[0].id, second[1].id);
  const updated = await chains.save('Music', { mode: 'update', id: first[0].id });
  assert.equal(updated.length, 2); assert.equal(updated.at(-1).id, first[0].id);
  await assert.rejects(chains.save('Music', { mode: 'update', id: 'missing' }));
});
