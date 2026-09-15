const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { allowedNavigation, signInUrl, wasAborted } = require('../src/navigation.cjs');
const { LoginWindow } = require('../src/login.cjs');
test('Google to YouTube account handoff and Japanese account endpoints are allowed', () => {
  for (const url of ['https://accounts.youtube.com/accounts/SetSID?secret=x', 'https://accounts.google.co.jp/accounts/SetSID', 'https://www.google.co.jp/accounts/SetSID', 'https://www.youtube.com/signin?action_handle_signin=true']) assert.equal(allowedNavigation(url), true);
  for (const url of ['http://accounts.google.com/', 'https://accounts.youtube.com.evil.test/', 'https://accounts.google.evil/', 'https://user:pass@accounts.google.com/', 'https://accounts.google.com:444/']) assert.equal(allowedNavigation(url), false);
});
test('original Google sign-in URL is retained and non-Google destinations are replaced', () => {
  const original = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin';
  assert.equal(signInUrl(original), original);
  assert.equal(new URL(signInUrl('https://evil.test/')).hostname, 'accounts.google.com');
  assert.equal(wasAborted({ code: 'ERR_ABORTED' }), true);
  assert.equal(wasAborted({ message: "ERR_ABORTED (-3) loading 'url'" }), true);
  assert.equal(wasAborted({ code: 'ERR_NAME_NOT_RESOLVED' }), false);
});
function fixture(error) {
  const created = [], notices = [], diagnostics = []; let returned = 0;
  const session = {};
  class FakeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; created.push(this); this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.loadURL = async url => { this.url = url; if (error) throw error; };
      this.webContents.getURL = () => this.url;
      this.webContents.setWindowOpenHandler = fn => { this.openHandler = fn; };
    }
    isDestroyed() { return this.destroyed; }
    show() {} focus() { this.focused = true; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const login = new LoginWindow({ BrowserWindow: FakeWindow, parent: {}, session, notify: text => notices.push(text), diagnostic: event => diagnostics.push(event), onReturn: async () => { returned++; } });
  return { login, created, notices, diagnostics, session, get returned() { return returned; } };
}
test('sign-in has a dedicated shared-session window; repeated clicks focus it', () => {
  const f = fixture(); f.login.open(); f.login.open();
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].options.webPreferences.session, f.session);
  assert.equal(f.created[0].options.webPreferences.preload, undefined);
  assert.equal(f.created[0].focused, true);
});
test('redirect abort is not shown as a failure; real errors retain a useful code', async () => {
  const aborted = fixture({ code: 'ERR_ABORTED' }); aborted.login.open();
  const failed = fixture({ code: 'ERR_CONNECTION_RESET' }); failed.login.open();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(aborted.notices.length, 0);
  assert.match(failed.notices[0], /ERR_CONNECTION_RESET/);
});
test('account handoff returns to the player and logs no token-bearing query strings', async () => {
  const f = fixture(); f.login.open('https://accounts.google.com/ServiceLogin?token=secret');
  const win = f.created[0]; let blocked = false;
  win.webContents.emit('will-redirect', { preventDefault() { blocked = true; } }, 'https://accounts.youtube.com/accounts/SetSID?token=secret', false, true);
  assert.equal(blocked, false);
  win.url = 'https://www.youtube.com/';
  win.webContents.emit('did-finish-load');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.returned, 1); assert.equal(win.destroyed, true);
  assert.ok(!JSON.stringify(f.diagnostics).includes('secret'));
});
