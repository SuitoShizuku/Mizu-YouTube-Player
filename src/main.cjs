const { app, BrowserWindow, WebContentsView, webContents, ipcMain, session, clipboard, dialog, safeStorage, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { SettingsStore } = require('./settings.cjs');
const { PluginCatalog } = require('./plugin-catalog.cjs');
const catalog = new PluginCatalog();
const { AudioHost } = require('./audio-host.cjs');
const { Forwarder } = require('./forwarder.cjs');
const { LoginWindow } = require('./login.cjs');
const { allowedNavigation, wasAborted } = require('./navigation.cjs');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { CATEGORY_LIST, VARIABLES, shortUrl, videoId, playbackUrl, isYouTube } = require('./core.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'mizu-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]);
app.setName('Mizu YouTube Player');
let win, view, store, host, forwarder, extensions, login, settingsOpen = false, pickerOpen = false;
let status = { audio: 'VSTホストを起動中', extension: 'uBlock Origin 未導入', plugins: [], loadingPlugin: '', url: 'https://www.youtube.com/' };
const shellUrl = pathToFileURL(path.join(__dirname, 'ui/index.html')).href;
function publish() { if (win && !win.isDestroyed()) win.webContents.send('state', status); }
function note(text) { if (win && !win.isDestroyed()) win.webContents.send('notice', String(text).slice(0, 1000)); }
function bounds() {
  if (!win || !view) return;
  const [width, height] = win.getContentSize();
  view.setBounds({ x: 0, y: 76, width: Math.max(1, width - 312), height: Math.max(1, height - 104) });
  view.setVisible(!settingsOpen && !pickerOpen);
}
function trusted(event) { return event.sender === win?.webContents && event.senderFrame?.url === shellUrl; }
function playerEvent(event) { return event.sender === view?.webContents && event.senderFrame === view.webContents.mainFrame && isYouTube(event.senderFrame.url); }
function handle(name, fn) { ipcMain.handle(name, (event, ...args) => { if (!trusted(event)) throw Error('許可されていない呼び出し'); return fn(...args); }); }
async function inject() {
  if (!isYouTube(view.webContents.getURL())) return;
  try {
    await view.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'youtube-page.js'), 'utf8'));
    view.webContents.send('normalization', store.value.normalizationOff);
  } catch { note('YouTubeの音声接続に失敗しました。ページを再読み込みしてください'); }
}
async function loadExtension(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (!String(manifest.name).toLowerCase().includes('ublock')) throw Error('uBlock Originの展開フォルダーを選択してください');
  const extension = await view.webContents.session.extensions.loadExtension(directory, { allowFileAccess: false });
  status.extension = `${extension.name} 読込済み · 互換性未保証`;
  publish();
  let attempts = 0;
  const probe = setInterval(async () => {
    if (!win || win.isDestroyed() || ++attempts > 20) { clearInterval(probe); return; }
    const background = webContents.getAllWebContents().find(wc => wc.getURL() === `chrome-extension://${extension.id}/background.html`);
    if (!background) return;
    try {
      if (await background.executeJavaScript('Boolean(globalThis.µBlock?.readyToFilter)')) {
        status.extension = `${extension.name} · フィルター準備完了`; publish(); clearInterval(probe);
      }
    } catch { /* Background page may restart during extension initialization. */ }
  }, 1000);
  probe.unref();
}
async function createWindow() {
  store = new SettingsStore(app.getPath('userData'), safeStorage);
  let loadError;
  try { store.load(); } catch (error) { loadError = `保存済み設定を読めませんでした: ${error.message}`; }
  win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1000, minHeight: 650, backgroundColor: '#0b111b', title: 'Mizu YouTube Player',
    webPreferences: { preload: path.join(__dirname, 'shell-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.setMenuBarVisibility(false);
  const playerSession = session.fromPartition('persist:mizu-youtube');
  extensions = new ElectronChromeExtensions({ session: playerSession, license: 'GPL-3.0',
    createTab: async details => {
      if (!allowedNavigation(details.url || '')) throw Error('拡張機能による外部ページ表示は許可されていません');
      await view.webContents.loadURL(details.url);
      return [view.webContents, win];
    },
    selectTab: (tab, owner) => { owner.focus(); tab.focus(); },
    removeTab: () => {}, // The single player tab belongs to the application lifecycle.
    requestPermissions: async () => false
  });
  playerSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  playerSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  playerSession.protocol.handle('mizu-audio', request => request.url === 'mizu-audio://host/worklet.js'
    ? new Response(fs.readFileSync(path.join(__dirname, 'audio-worklet.js')), { headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } })
    : new Response('', { status: 404 }));
  view = new WebContentsView({ webPreferences: { session: playerSession, preload: path.join(__dirname, 'youtube-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.contentView.addChildView(view);
  extensions.addTab(view.webContents, win);
  view.webContents.setAudioMuted(true); // Silence until every media element is connected to the host.
  view.webContents.on('will-navigate', (event, url) => { if (!allowedNavigation(url)) event.preventDefault(); });
  view.webContents.on('will-redirect', (event, url, _inPlace, mainFrame) => { if (mainFrame !== false && !allowedNavigation(url)) event.preventDefault(); });
  view.webContents.setWindowOpenHandler(({ url }) => { if (allowedNavigation(url)) view.webContents.loadURL(url).catch(() => note('ページを開けませんでした')); return { action: 'deny' }; });
  view.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) { view.webContents.setAudioMuted(true); forwarder.cancel(); } });
  const navigated = url => {
    if (videoId(status.url) !== videoId(url) || !videoId(url)) forwarder.navigate(url);
    status.url = url; publish();
  };
  view.webContents.on('did-navigate', (_event, url) => navigated(url));
  view.webContents.on('did-navigate-in-page', (_event, url, mainFrame) => { if (mainFrame) navigated(url); });
  view.webContents.on('did-finish-load', inject);
  view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) note(`ページ読み込み失敗 (${code})`); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('resize', bounds);
  win.on('closed', () => { login?.close(); forwarder.cancel(); host.removeAllListeners(); host.stop(); view.webContents?.close(); win = null; });
  login = new LoginWindow({ BrowserWindow, parent: win, session: playerSession, extensions, notify: note,
    diagnostic: entry => {
      // Never log query strings, cookies, form fields, tokens, or credentials.
      const file = path.join(app.getPath('userData'), 'login-diagnostics.jsonl');
      try {
        if (fs.existsSync(file) && fs.statSync(file).size > 131072) fs.writeFileSync(file, '');
        fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');
      } catch { /* Diagnostics must not prevent sign-in. */ }
    },
    onReturn: async () => {
      await playerSession.cookies.flushStore();
      if (view.webContents && !view.webContents.isDestroyed()) {
        extensions.selectTab(view.webContents);
        await view.webContents.loadURL('https://www.youtube.com/').catch(error => { if (!wasAborted(error)) note('ログイン後のYouTubeを再読み込みしてください'); });
      }
    }
  });
  forwarder = new Forwarder(() => store.value, note);
  const exe = app.isPackaged ? path.join(process.resourcesPath, 'MizuAudioHost.exe') : path.join(__dirname, '../native/build/MizuAudioHost_artefacts/Release/MizuAudioHost.exe');
  host = new AudioHost(exe);
  host.on('status', message => { status.audio = message; status.plugins = host.plugins; status.loadingPlugin = ''; view.webContents.setAudioMuted(true); publish(); note(message); });
  host.on('event', event => {
    if (event.type === 'ready') status.audio = 'ホスト接続済み · 48 kHz / Stereo';
    if (event.type === 'plugins') status.plugins = event.plugins;
    if (event.type === 'plugin-loading') status.loadingPlugin = event.message;
    if (event.type === 'plugin-finished') status.loadingPlugin = '';
    if (event.type === 'error') note(event.message);
    publish();
  });
  handle('initial', () => ({ settings: store.value, categories: CATEGORY_LIST, variables: VARIABLES, status }));
  handle('navigate', url => {
    if (typeof url !== 'string' || url.length > 4000) throw Error('URLが不正です');
    const id = videoId(url);
    if (new URL(url).hostname === 'youtu.be' && id) url = `https://www.youtube.com/watch?v=${id}`;
    if (!allowedNavigation(url)) throw Error('YouTubeのHTTPS URLを入力してください');
    return view.webContents.loadURL(url);
  });
  handle('back', () => { if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack(); });
  handle('reload', () => view.webContents.reload());
  handle('copy', () => { const url = shortUrl(view.webContents.getURL()); if (!url) throw Error('動画ページを開いてください'); clipboard.writeText(url); return url; });
  handle('settings-open', open => { settingsOpen = !!open; bounds(); });
  handle('settings-save', settings => { const value = store.save(settings); forwarder.cancel(); view.webContents.send('normalization', value.normalizationOff); return value; });
  handle('extension-select', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'uBlock Originのmanifest.jsonがあるフォルダー', properties: ['openDirectory'] });
    if (!result.canceled) { await loadExtension(result.filePaths[0]); fs.writeFileSync(path.join(app.getPath('userData'), 'extension-path.json'), JSON.stringify(result.filePaths[0])); }
  });
  handle('plugin-catalog', refresh => catalog.scan(refresh === true));
  handle('plugin-picker-open', open => { pickerOpen = !!open; bounds(); });
  handle('plugin-add', async id => {
    const selected = catalog.resolve(id);
    await host.ensureReady();
    host.command(2, selected);
  });
  handle('plugin-action', (action, id) => {
    if (!['editor', 'remove', 'bypass'].includes(action) || !Number.isInteger(id) || !status.plugins.some(p => p.id === id)) throw Error('プラグイン操作が不正です');
    host.command({ editor: 3, remove: 4, bypass: 5 }[action], String(id));
  });
  ipcMain.on('audio', (event, buffer) => { if (playerEvent(event)) host.audio(buffer); });
  ipcMain.on('player-playing', (event, report) => {
    if (!playerEvent(event)) return;
    const url = playbackUrl(report);
    if (url) void forwarder.playing(url);
  });
  ipcMain.on('sign-in', (event, requestedUrl) => {
    if (!playerEvent(event)) return;
    login.open(typeof requestedUrl === 'string' && requestedUrl.length <= 12000 ? requestedUrl : undefined);
  });
  ipcMain.on('player-status', (event, text) => { if (playerEvent(event) && host.ready && typeof text === 'string') { status.audio = text.slice(0, 180); publish(); } });
  // Keep Chromium's output muted even after routing. The worklet still processes
  // upstream samples, while newly inserted/unconnected media cannot bypass VST.
  ipcMain.on('audio-connected', event => { if (playerEvent(event) && !host.ready) note('音声ルートは接続済みですが、VSTホストが停止しています'); });
  ipcMain.on('normalization-toggle', event => {
    if (playerEvent(event)) {
      try { store.save({ ...store.value, normalizationOff: !store.value.normalizationOff }); view.webContents.send('normalization', store.value.normalizationOff); }
      catch (error) { note(error.message); }
    }
  });
  await win.loadFile(path.join(__dirname, 'ui/index.html'));
  bounds();
  host.start();
  const bundled = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'extensions/ublock');
  try {
    const savedPath = path.join(app.getPath('userData'), 'extension-path.json');
    if (fs.existsSync(path.join(bundled, 'manifest.json'))) await loadExtension(bundled);
    else if (fs.existsSync(savedPath)) await loadExtension(JSON.parse(fs.readFileSync(savedPath, 'utf8')));
  } catch { status.extension = 'uBlock Origin 読込失敗 · 設定で再選択'; publish(); }
  if (loadError) note(loadError);
  await view.webContents.loadURL('https://www.youtube.com/').catch(error => { if (error.code !== 'ERR_ABORTED' && error.errno !== -3) note(`YouTubeを読み込めませんでした: ${error.code || '通信エラー'}`); });
}
app.whenReady().then(createWindow).catch(error => { dialog.showErrorBox('Mizu 起動エラー', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
