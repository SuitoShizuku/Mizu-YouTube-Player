const { allowedNavigation, signInUrl, navigationCode, wasAborted, safeLocation } = require('./navigation.cjs');
const { isYouTube } = require('./core.cjs');

class LoginWindow {
  constructor({ BrowserWindow, parent, session, extensions, notify, diagnostic, onReturn }) {
    Object.assign(this, { BrowserWindow, parent, session, extensions, notify, diagnostic, onReturn });
    this.window = null;
  }
  open(candidate) {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); return; }
    const win = this.window = new this.BrowserWindow({ parent: this.parent, width: 560, height: 780, minWidth: 460, minHeight: 600,
      title: 'Google にログイン — Mizu YouTube Player', autoHideMenuBar: true,
      webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true } });
    this.extensions?.addTab(win.webContents, win);
    const wc = win.webContents;
    let returned = false, sawAccount = false;
    const record = (event, url, code) => this.diagnostic({ event, location: safeLocation(url), ...(code ? { code } : {}) });
    const guard = (event, url) => {
      if (allowedNavigation(url)) return;
      event.preventDefault(); record('blocked-navigation', url, 'APP_NAVIGATION_BLOCKED');
      this.notify(`ログインの遷移先を開けませんでした: ${safeLocation(url)} (APP_NAVIGATION_BLOCKED)`);
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', (event, url, _inPlace, mainFrame) => { if (mainFrame !== false) { record('redirect', url); guard(event, url); } });
    const load = url => {
      record('open', url);
      if (['accounts.google.com', 'accounts.google.co.jp'].includes(new URL(url).hostname)) sawAccount = true;
      return wc.loadURL(url).catch(error => {
        record('load-rejected', url, navigationCode(error));
        if (wasAborted(error) || win.isDestroyed()) return; // Normal navigation handoff is not a failure.
        this.notify(`ログインページを開けませんでした (${navigationCode(error)})`);
      });
    };
    wc.setWindowOpenHandler(({ url }) => { if (allowedNavigation(url)) void load(url); return { action: 'deny' }; });
    wc.on('did-fail-load', (_event, code, description, url, mainFrame) => {
      if (mainFrame && code !== -3) record('load-failed', url, `${code}:${/^ERR_[A-Z_]+$/.test(description) ? description : 'LOAD_FAILED'}`);
    });
    wc.on('did-navigate', (_event, url) => {
      record('committed', url);
      if (['accounts.google.com', 'accounts.google.co.jp', 'accounts.youtube.com'].includes(new URL(url).hostname)) sawAccount = true;
    });
    wc.on('did-finish-load', () => {
      if (!sawAccount || returned || !isYouTube(wc.getURL())) return;
      returned = true;
      void Promise.resolve(this.onReturn()).catch(() => this.notify('YouTubeに戻れませんでした。プレイヤーを再読み込みしてください'))
        .finally(() => { if (!win.isDestroyed()) win.close(); });
    });
    win.on('closed', () => { if (this.window === win) this.window = null; });
    void load(signInUrl(candidate));
  }
  close() { if (this.window && !this.window.isDestroyed()) this.window.close(); }
}
module.exports = { LoginWindow };
