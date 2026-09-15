const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
protocol.registerSchemesAsPrivileged([{ scheme: 'mizu-audio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }]);
app.setPath('userData', path.resolve(`.local/audio-test-${Date.now()}`));
app.whenReady().then(async () => {
  protocol.handle('mizu-audio', () => new Response(fs.readFileSync('src/audio-worklet.js'), { headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  win.webContents.setAudioMuted(true);
  const frames = 48000 * 2, wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; ++i) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 48000) * 4096), 44 + i * 2);
  await win.loadURL('https://www.youtube.com/').catch(() => {});
  // Execute the actual routing script against a controlled media element; Chromium remains muted.
  await win.webContents.executeJavaScript(`document.body.replaceChildren(); window.stats = { packets: 0, peak: 0, status: '' }; window.addEventListener('message', e => { if(e.data?.source !== 'mizu-player') return; if(e.data.type === 'status') stats.status=e.data.value; if(e.data.type === 'audio') { stats.packets++; for(const x of new Float32Array(e.data.value)) stats.peak=Math.max(stats.peak,Math.abs(x)); } }); const video=document.createElement('video'); video.src=${JSON.stringify('data:audio/wav;base64,'+wav.toString('base64'))}; document.body.append(video);`);
  await win.webContents.executeJavaScript(fs.readFileSync('src/youtube-page.js', 'utf8'));
  await win.webContents.executeJavaScript('document.querySelector("video").play()', true);
  await new Promise(resolve => setTimeout(resolve, 2500));
  const result = await win.webContents.executeJavaScript('window.stats');
  fs.writeFileSync('.local/audio-smoke.json', JSON.stringify(result, null, 2));
  console.log('AUDIO_SMOKE', JSON.stringify(result));
  if (result.packets < 20 || result.peak < 0.05 || result.peak > 0.2) throw Error('Muted Chromium must still provide nonzero native-route PCM');
  await win.webContents.executeJavaScript('stats.peak=0; const media=document.querySelector("video"); media.volume=0.5; media.currentTime=0; media.play()', true);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const volume = await win.webContents.executeJavaScript('window.stats.peak');
  console.log('AUDIO_VOLUME_HALF', volume);
  if (Math.abs(volume / result.peak - 0.5) > 0.02) throw Error('Player volume is not preserved');
  win.close();
}).catch(error => { console.error(error); app.exit(1); });
