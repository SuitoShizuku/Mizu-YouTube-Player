const { app, BrowserWindow, webContents, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const label = process.argv[2] || 'after';
let externalCover;
if (label === 'timer-baseline') {
  // A/B isolate Windows timer policy without changing the rest of the app.
  const { AudioHost } = require('../src/audio-host.cjs');
  const command = AudioHost.prototype.command;
  AudioHost.prototype.command = function(type, ...args) { if (type !== 10) return command.call(this, type, ...args); };
}
app.setPath('userData', path.resolve('.local/occlusion-' + label + '-' + Date.now()));
let samples = [];
ipcMain.on('routed-audio', () => samples.push(performance.now()));
require('../src/main.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await wait(10000);
  const win = BrowserWindow.getAllWindows()[0];
  const player = webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://www.youtube.com/'));
  const wav = Buffer.alloc(44 + 48000 * 2 * 5);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await player.executeJavaScript(`document.querySelectorAll('audio,video').forEach(v=>v.pause()); const probe = document.createElement('audio'); probe.loop = true; probe.src = ${JSON.stringify('data:audio/wav;base64,' + wav.toString('base64'))}; document.body.append(probe);`);
  await player.executeJavaScript(fs.readFileSync('src/youtube-page.js', 'utf8'));
  await wait(500);
  await player.executeJavaScript('document.querySelector("audio").play()', true);
  await wait(2000);
  async function measure(name) {
    samples = []; await wait(15000);
    const gaps = samples.slice(1).map((value, i) => value - samples[i]).sort((a,b) => a-b);
    const result = { name, packets: samples.length, maxGapMs: Math.round(gaps.at(-1) || 0), p99GapMs: Math.round(gaps[Math.floor(gaps.length * .99)] || 0), gapsOver100ms: gaps.filter(g=>g>100).length, visibility: await player.executeJavaScript('document.visibilityState') };
    console.log('OCCLUSION', JSON.stringify(result)); return result;
  }
  const foreground = await measure('foreground');
  externalCover = spawn(process.execPath, [path.resolve('scripts/occlusion-cover.cjs')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const exited = new Promise(resolve => externalCover.once('exit', resolve));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('External cover did not start')), 15000);
    externalCover.on('error', error => { clearTimeout(timeout); reject(error); });
    externalCover.stdout.on('data', data => { if (data.toString().includes('COVER_READY')) { clearTimeout(timeout); resolve(); } });
  });
  await wait(3000);
  const covered = await measure('covered');
  if (externalCover.exitCode !== null) throw Error('Cover exited before measurement completed');
  // Electron GUI subprocess stdin is not a reliable control channel on Windows.
  // This helper owns only a disposable test window and no user data.
  externalCover.kill(); await exited; externalCover = null;
  win.minimize(); await wait(2000);
  const minimized = await measure('minimized');
  fs.writeFileSync('.local/occlusion-' + label + '.json', JSON.stringify({ foreground, covered, minimized }, null, 2));
  win.restore(); win.close();
  if (!['before', 'timer-baseline'].includes(label) && (covered.packets < foreground.packets * .9 || minimized.packets < foreground.packets * .9 || covered.maxGapMs > 250 || minimized.maxGapMs > 250)) throw Error('Background PCM delivery regressed');
}).catch(error => { externalCover?.kill(); console.error(error); app.exit(1); });
