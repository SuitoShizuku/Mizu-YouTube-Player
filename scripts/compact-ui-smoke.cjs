const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.setPath('userData', path.resolve('.local/compact-ui-' + Date.now()));
require('../src/main.cjs');
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 10000));
  const win = BrowserWindow.getAllWindows()[0];
  const result = await win.webContents.executeJavaScript(`(async () => {
    const $ = id => document.getElementById(id), invoke = window.mizu.invoke;
    const assert = (value, message) => { if (!value) throw Error(message); };
    const items = await invoke('plugin-catalog');
    await invoke('plugin-add', items.plugins.find(p => p.name === 'Bevel EQ').id);
    const wait = () => new Promise(resolve => setTimeout(resolve, 200));
    let state;
    for(let i=0;i<60;i++){state=(await invoke('initial')).status;if(state.plugins.length)break;await wait();}
    async function save(name) { $('preset-name').value = name; $('preset-name').dispatchEvent(new Event('input')); await $('preset-save').onclick(); }
    await save('Listening');
    assert((await invoke('presets')).length === 1, 'new save');
    await invoke('plugin-action', 'bypass', state.plugins[0].id);
    await save('Night');
    $('preset-toggle').click();
    const choose = [...document.querySelectorAll('.preset-choose')].find(el => el.textContent === 'Listening');
    choose.click(); await wait(); await wait();
    assert(!(await invoke('initial')).status.plugins[0].bypass, 'select must load immediately');
    await $('preset-save').onclick(); assert((await invoke('presets')).length === 2, 'selected save must update');
    await save('Listening'); assert((await invoke('presets')).length === 3, 'typed same name must create');
    $('preset-toggle').click();
    document.querySelector('.preset-option .tool-icon').click(); await wait(); await wait();
    assert((await invoke('presets')).length === 2, 'in-menu delete');
    assert(!$('preset-menu').hidden, 'delete should keep menu open');
    const presetHeight = document.querySelector('.presets').getBoundingClientRect().height;
    const row = document.querySelector('.plugin'), rowHeight = row.getBoundingClientRect().height;
    const labels = [...row.querySelectorAll('button')].map(b=>b.getAttribute('aria-label'));
    assert(presetHeight <= 40 && rowHeight <= 46, 'compact heights');
    assert(labels[0].includes('バイパス') && labels[1].includes('編集') && labels[2].includes('削除'), 'icon order');
    assert(!document.querySelector('#preset-load, #preset-delete, #preset-list'), 'old controls removed');
    return { presetHeight, rowHeight, labels, presets: (await invoke('presets')).length };
  })()`);
  console.log('COMPACT_UI', JSON.stringify(result));
  await new Promise(resolve => setTimeout(resolve, 300));
  fs.writeFileSync('.local/compact-ui.png', (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('document.getElementById("preset-toggle").click()');
  await new Promise(resolve => setTimeout(resolve, 200));
  fs.writeFileSync('.local/compact-rack.png', (await win.webContents.capturePage()).toPNG());
  win.close();
}).catch(error => { console.error(error); app.exit(1); });
