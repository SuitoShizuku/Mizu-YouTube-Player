const { app, BrowserWindow, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const phase = process.argv[2], profile = path.resolve(process.argv[3]);
app.setPath('userData', profile);
if (phase === 'save') {
  for (const name of ['one', 'two']) {
    const folder = path.join(profile, 'Extensions', name); fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Mizu fixture ' + name, version: '1.0', content_scripts: [{ matches: ['https://www.youtube.com/*'], js: ['content.js'] }], options_page: 'options.html' }));
    fs.writeFileSync(path.join(folder, 'content.js'), `document.documentElement.setAttribute('data-mizu-${name}', 'loaded');`);
    fs.writeFileSync(path.join(folder, 'options.html'), '<h1>Fixture options</h1>');
  }
}
require('../src/main.cjs');
const deadline = setTimeout(() => { console.error('Persistence smoke timed out'); app.exit(1); }, 60000);
app.on('will-quit', () => clearTimeout(deadline));
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 12000));
  const win = BrowserWindow.getAllWindows()[0];
  const invoke = (name, ...args) => win.webContents.executeJavaScript(`window.mizu.invoke(${JSON.stringify(name)}, ...${JSON.stringify(args)})`);
  const state = () => invoke('initial').then(x => x.status);
  if (phase === 'save') {
    const catalog = await invoke('plugin-catalog');
    await invoke('plugin-add', catalog.plugins.find(p => p.name === 'Bevel EQ').id);
    for (let i = 0; i < 60 && !(await state()).plugins.length; i++) await new Promise(resolve => setTimeout(resolve, 100));
    const id = (await state()).plugins[0].id;
    await invoke('plugin-action', 'bypass', id);
    await invoke('preset-save', 'Saved chain');
    // Final change is saved ONLY by the normal application close handler.
    await invoke('plugin-action', 'bypass', id);
  } else {
    const plugins = (await state()).plugins; assert.equal(plugins.length, 1); assert.equal(plugins[0].bypass, false);
    const presets = await invoke('presets'); assert.equal(presets[0].name, 'Saved chain');
    await invoke('preset-load', presets[0].id); assert.equal((await state()).plugins[0].bypass, true);
  }
  const info = await invoke('extensions-info');
  assert.equal(info.entries.filter(e => e.loaded).length, 3);
  const player = webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://www.youtube.com/'));
  assert.ok(await player.executeJavaScript(`document.documentElement.getAttribute('data-mizu-one') === 'loaded' && document.documentElement.getAttribute('data-mizu-two') === 'loaded'`));
  await invoke('extension-options', info.entries.find(e => e.name === 'Mizu fixture one').id);
  await new Promise(resolve => setTimeout(resolve, 300));
  const options = BrowserWindow.getAllWindows().find(w => w !== win);
  assert.match(options.webContents.getURL(), /^chrome-extension:\/\//); options.close();
  await win.webContents.executeJavaScript('document.getElementById("settings-button").click()');
  await new Promise(resolve => setTimeout(resolve, 300));
  try { fs.writeFileSync('.local/persistence-ui.png', (await win.webContents.capturePage()).toPNG()); } catch {}
  console.log('PERSISTENCE_APP', phase, 'passed; two extra content scripts and extension options also passed');
  win.close();
}).catch(error => { console.error(error); app.exit(1); });
