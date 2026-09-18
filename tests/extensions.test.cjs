const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ExtensionFolder } = require('../src/extensions.cjs');
test('loads multiple unpacked extensions, isolates bad manifests, removes missing folders', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizu-extensions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'Extensions'), bundled = path.join(dir, 'bundled');
  for (const folder of [bundled, path.join(root, 'enhancer'), path.join(root, 'invalid')]) fs.mkdirSync(folder, { recursive: true });
  for (const folder of [bundled, path.join(root, 'enhancer')]) fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ name: path.basename(folder), options_page: 'options.html' }));
  const loaded = [], removed = [];
  const session = { extensions: { loadExtension: async directory => { loaded.push(directory); return { id: path.basename(directory), name: path.basename(directory), version: '1' }; }, removeExtension: id => removed.push(id) } };
  const manager = new ExtensionFolder(root, session, bundled);
  let info = await manager.scan(); assert.equal(info.entries.filter(e => e.loaded).length, 2); assert.equal(info.entries.filter(e => !e.loaded).length, 1);
  assert.equal(manager.optionsUrl('enhancer'), 'chrome-extension://enhancer/options.html');
  await manager.scan(); assert.equal(loaded.length, 2);
  fs.rmSync(path.join(root, 'enhancer'), { recursive: true }); await manager.scan(); assert.deepEqual(removed, ['enhancer']);
  assert.throws(() => manager.optionsUrl('enhancer'));
});

test('scan waits for extension startup before allowing page navigation', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizu-startup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bundled = path.join(dir, 'bundled'); fs.mkdirSync(bundled);
  fs.writeFileSync(path.join(bundled, 'manifest.json'), '{"name":"uBlock Origin"}');
  let finish, started; const entered = new Promise(resolve => { started = resolve; });
  const session = { extensions: { loadExtension: async () => ({id:'test',name:'uBlock Origin'}), removeExtension() {} } };
  const manager = new ExtensionFolder(path.join(dir,'Extensions'), session, bundled, () => { started(); return new Promise(resolve => { finish=resolve; }); });
  let navigated=false;const loading=manager.scan().then(()=>{navigated=true;});
  await entered;assert.equal(navigated,false);finish();await loading;assert.equal(navigated,true);
});
