// Run with: electron scripts/smoke.cjs . Uses an isolated local test profile.
const { app, BrowserWindow, dialog, webContents, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync('.local', { recursive: true });
const log = (...values) => { const line = values.join(' '); fs.appendFileSync('.local/smoke.log', line + '\n'); console.log(line); };
fs.writeFileSync('.local/smoke.log', 'START\n');
app.setPath('userData', path.resolve(`.local/smoke-profile-${Date.now()}`));
dialog.showErrorBox = (title, message) => log('APP_ERROR', title, message);
const realOpenDialog = dialog.showOpenDialog.bind(dialog);
dialog.showOpenDialog = (win, options) => options.title === 'VST3プラグインを選択'
  ? Promise.resolve({ canceled: false, filePaths: ['C:\\Program Files\\Common Files\\VST3\\Bevel EQ.vst3'] })
  : realOpenDialog(win, options);
app.on('will-quit', () => log('QUIT'));
let audioPackets = 0;
ipcMain.on('audio', (_event, data) => { if (data instanceof ArrayBuffer && data.byteLength === 8192) audioPackets++; });
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_event, details) => { if (details.level >= 2) console.log('RENDERER:', details.message); });
});
require('../src/main.cjs');
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 12000));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw Error('Window did not open');
  const state = await win.webContents.executeJavaScript('window.mizu.invoke("initial")');
  log('SMOKE_STATE', JSON.stringify(state.status));
  async function waitPluginCount(count) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const plugins = await win.webContents.executeJavaScript('window.mizu.invoke("initial").then(x => x.status.plugins)');
      if (plugins.length === count) return plugins;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error(`Plugin rack did not reach ${count}`);
  }
  await win.webContents.executeJavaScript('window.mizu.invoke("plugin-add")');
  await waitPluginCount(1);
  await win.webContents.executeJavaScript('window.mizu.invoke("plugin-add")');
  const plugins = await waitPluginCount(2);
  for (const plugin of plugins) await win.webContents.executeJavaScript(`window.mizu.invoke('plugin-action', 'remove', ${plugin.id})`);
  await waitPluginCount(0);
  await win.webContents.executeJavaScript('window.mizu.invoke("plugin-add")');
  const again = await waitPluginCount(1);
  await win.webContents.executeJavaScript(`window.mizu.invoke('plugin-action', 'remove', ${again[0].id})`);
  await waitPluginCount(0);
  log('SMOKE_VST_REINSERT', 'passed');
  for (const contents of webContents.getAllWebContents()) {
    if (contents.getURL().startsWith('chrome-extension://') && contents.getURL().endsWith('/background.html')) {
      const extension = await contents.executeJavaScript('import("./js/background.js").then(m => ({ ready: m.default.readyToFilter, webNavigation: !!chrome.webNavigation, tabs: !!chrome.tabs }))');
      log('SMOKE_EXTENSION', JSON.stringify(extension));
      if (!extension.ready) throw Error('uBlock filtering engine did not initialize');
      const player = webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://www.youtube.com/'));
      // Use a page without YouTube's CSP/advertising exceptions to isolate uBO.
      await player.loadURL('https://example.com/');
      const before = await contents.executeJavaScript('µBlock.requestStats.blockedCount');
      player.debugger.attach('1.3');
      await player.debugger.sendCommand('Network.enable');
      player.debugger.on('message', (_event, method, data) => { if (method === 'Network.loadingFailed') log('NETWORK_FAILURE', JSON.stringify({ error: data.errorText, blockedReason: data.blockedReason })); });
      const request = await player.executeJavaScript('new Promise(resolve => { const image = document.createElement("img"); image.onload = () => resolve("loaded"); image.onerror = () => resolve("rejected"); image.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?mizu-test=1"; document.body.append(image); setTimeout(() => resolve("timeout"), 4000); })');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const after = await contents.executeJavaScript('µBlock.requestStats.blockedCount');
      log('SMOKE_BLOCKING', JSON.stringify({ before, after, request }));
      if (!(after > before)) throw Error('Known ad request was not counted as blocked by uBlock');
      player.debugger.detach();
      await player.loadURL('https://www.youtube.com/').catch(() => {});
    }
  }
  const player = webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://www.youtube.com/'));
  const wav = Buffer.alloc(44 + 48000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await player.executeJavaScript(`document.querySelectorAll('video,audio').forEach(v=>v.pause()); const silentAudio = document.createElement('audio'); silentAudio.src = ${JSON.stringify('data:audio/wav;base64,'+wav.toString('base64'))}; document.body.append(silentAudio);`);
  await player.executeJavaScript(fs.readFileSync('src/youtube-page.js', 'utf8'));
  await new Promise(resolve => setTimeout(resolve, 250));
  const baseline = audioPackets;
  await player.executeJavaScript('document.querySelector("audio").play()', true);
  await new Promise(resolve => setTimeout(resolve, 1200));
  log('SMOKE_AUDIO_IPC', String(audioPackets - baseline));
  if (audioPackets - baseline < 20) throw Error('Audio did not cross the sandbox preload into main');
  await win.webContents.executeJavaScript('document.getElementById("settings-button").click()');
  await new Promise(resolve => setTimeout(resolve, 300));
  await win.webContents.executeJavaScript('document.getElementById("rule-add").click()');
  await new Promise(resolve => setTimeout(resolve, 300));
  const result = await win.webContents.executeJavaScript('({ title: document.title, settingsVisible: !document.getElementById("settings").hidden, ruleCount: document.querySelectorAll(".rule").length, categories: document.querySelector(".category").options.length, webhookType: document.querySelector(".webhook").type, removedStatus: !document.querySelector(".flow, .signal, .rack-bottom, #audio-status, #extension-status") })');
  log('SMOKE_UI', JSON.stringify(result));
  if (!result.settingsVisible || result.ruleCount !== 1 || result.categories < 15) throw Error('Settings UI smoke check failed');
  if (result.webhookType !== 'url' || !result.removedStatus) throw Error('Requested UI cleanup missing');
  fs.mkdirSync('.local', { recursive: true }); fs.writeFileSync('.local/settings-smoke.png', (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('document.querySelector(".webhook").value = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456"; document.getElementById("save").click()');
  await new Promise(resolve => setTimeout(resolve, 250));
  const saved = await win.webContents.executeJavaScript('window.mizu.invoke("initial").then(x => ({ rules: x.settings.rules.length, forwarding: x.settings.forwarding }))');
  if (saved.rules !== 1 || saved.forwarding) throw Error('Encrypted settings save failed');
  log('SMOKE_SETTINGS', JSON.stringify(saved));
  win.close();
}).catch(error => { log('FAIL', error.stack); app.exit(1); });
