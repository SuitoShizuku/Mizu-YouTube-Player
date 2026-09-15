const { app, BrowserWindow, webContents, dialog } = require('electron');
const path = require('node:path');
app.setPath('userData', path.resolve(`.local/login-test-${Date.now()}`));
dialog.showErrorBox = (title, message) => console.error(title, message);
const deadline = setTimeout(() => app.exit(1), 40000);
app.on('web-contents-created', (_event, wc) => {
  for (const name of ['will-navigate', 'will-redirect', 'did-navigate', 'did-navigate-in-page']) wc.on(name, (_e, url) => {
    try { const u = new URL(url); console.log('NAV', name, u.origin + u.pathname); } catch {}
  });
});
require('../src/main.cjs');
app.whenReady().then(async () => {
  await new Promise(resolve => setTimeout(resolve, 9000));
  const player = webContents.getAllWebContents().find(w => w.getURL().startsWith('https://www.youtube.com/'));
  if (!player) throw Error('Player missing');
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await player.executeJavaScript(`Array.from(document.querySelectorAll('a[href]')).some(a=>/signin|ServiceLogin|accounts.google/.test(a.href))`)) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.log('LOGIN_LINKS', JSON.stringify(await player.executeJavaScript(`Array.from(document.querySelectorAll('a[href]')).filter(a=>/signin|ServiceLogin|accounts.google/.test(a.href)).map(a=>({text:a.textContent.trim(),url:a.href,target:a.target})).slice(0,6)`)));
  await player.executeJavaScript(`Array.from(document.querySelectorAll('a[href]')).find(a=>/signin|ServiceLogin|accounts.google/.test(a.href))?.click()`, true);
  await new Promise(resolve => setTimeout(resolve, 4000));
  const auth = webContents.getAllWebContents().find(w => w.getURL().startsWith('https://accounts.google.com/'));
  if (!auth) throw Error('Dedicated Google sign-in window did not open');
  const u = new URL(auth.getURL());
  const hasEmailField = await auth.executeJavaScript('Boolean(document.querySelector("input[type=email], #identifierId"))');
  console.log('LOGIN_RESULT', u.origin + u.pathname, 'emailField=' + hasEmailField);
  if (u.hostname !== 'accounts.google.com' || !hasEmailField) throw Error('Sign-in button did not open the Google login form');
  if (!player.getURL().startsWith('https://www.youtube.com/')) throw Error('Sign-in replaced the player window');
  clearTimeout(deadline); BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.close(); });
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });
