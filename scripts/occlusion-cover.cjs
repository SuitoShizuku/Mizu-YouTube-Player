const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setPath('userData', path.resolve('.local/occlusion-cover-' + process.pid));
let win;
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1600, height: 1000, backgroundColor: '#202735', title: 'Mizu external occlusion test', webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html,<h1 style="color:white">Mizu background audio test</h1>');
  win.maximize(); win.setAlwaysOnTop(true); win.focus();
  process.stdout.write('COVER_READY\n');
  process.stdin.on('data', () => app.quit()); process.stdin.resume();
});
app.on('window-all-closed', () => app.quit());
