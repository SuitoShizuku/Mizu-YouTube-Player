const { app, BrowserWindow, webContents } = require('electron');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', path.resolve('.local/browsing-' + Date.now()));
const server = http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/final' }); res.end(); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<h1>External browsing test</h1><a href="/next">Next</a>'); }
});
require('../src/main.cjs');
app.on('will-quit', () => server.close());
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => setTimeout(resolve, 8000));
  const win = BrowserWindow.getAllWindows()[0];
  const invoke = (name, ...args) => win.webContents.executeJavaScript(`window.mizu.invoke(${JSON.stringify(name)}, ...${JSON.stringify(args)})`);
  const loading = await win.webContents.executeJavaScript(`({text:document.querySelector('.player-placeholder').textContent, children:document.querySelector('.player-placeholder').children.length, slogans:document.body.textContent.includes('YOUR SOUND')})`);
  assert.equal(loading.text, '読み込んでいます...'); assert.equal(loading.children, 1); assert.equal(loading.slogans, false);
  const root = `http://127.0.0.1:${server.address().port}`;
  await invoke('navigate', root + '/redirect');
  const page = webContents.getAllWebContents().find(wc => wc.getURL() === root + '/final'); assert.ok(page);
  const loaded = new Promise(resolve => page.once('did-finish-load', resolve));
  await page.executeJavaScript('document.querySelector("a").click()'); await loaded;
  assert.equal(page.getURL(), root + '/next');
  assert.equal(await invoke('copy'), root + '/next');
  await invoke('navigate', 'example.com'); assert.equal(new URL(page.getURL()).hostname, 'example.com');
  assert.equal(await page.executeJavaScript('typeof window.mizu'), 'undefined');
  console.log('BROWSING_SMOKE passed: plain loading text, external HTTPS, local HTTP redirect/link, URL copy, isolated shell');
  win.close();
}).catch(error => { console.error(error); server.close(); app.exit(1); });
