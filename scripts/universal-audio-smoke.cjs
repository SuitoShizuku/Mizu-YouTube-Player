const { app, BrowserWindow, webContents, ipcMain } = require('electron');
const { AudioHost } = require('../src/audio-host.cjs');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
let packets = 0, left = 0, right = 0;
const original = AudioHost.prototype.audio;
AudioHost.prototype.audio = function(buffer) {
  if (buffer instanceof ArrayBuffer && buffer.byteLength === 8192) {
    packets++; const pcm = new Float32Array(buffer);
    for (let i=0;i<pcm.length;i+=2) { left=Math.max(left,Math.abs(pcm[i])); right=Math.max(right,Math.abs(pcm[i+1])); }
    // Measure the actual PCM arriving at the native host, but emit only silence.
    return original.call(this, new ArrayBuffer(8192));
  }
};
const wav = Buffer.alloc(44 + 48000 * 4 * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(48000,24); wav.writeUInt32LE(192000,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<48000*4;i++){wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/48000)*3276),44+i*4);wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*880/48000)*1638),46+i*4);}
const servers = [0,1].map(() => http.createServer((req,res) => {
  if(req.url === '/tone.wav'){res.setHeader('Content-Type','audio/wav');res.end(wav);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Generic audio fixture</title><body>Audio test</body>');}
}));
const directory=path.resolve('.local/universal-audio-'+Date.now()); app.setPath('userData',directory);
require('../src/main.cjs');
ipcMain.on('audio-route-status', (_event, connected, message) => console.log('ROUTE_STATUS', connected, message));
app.on('will-quit',()=>servers.forEach(s=>s.close()));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  for(const server of servers)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await wait(10000);
  const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/ui/index.html'));
  const invoke=(name,...args)=>win.webContents.executeJavaScript(`window.mizu.invoke(${JSON.stringify(name)},...${JSON.stringify(args)})`);
  const bases=servers.map(s=>'http://127.0.0.1:'+s.address().port);
  await invoke('navigate',bases[0]);
  const player=webContents.getAllWebContents().find(w=>w.getURL().startsWith(bases[0]));
  const results=[];
  async function measure(name){packets=left=right=0;await wait(1400);const result={name,packets,left,right,muted:player.isAudioMuted()};results.push(result);console.log('UNIVERSAL_AUDIO',JSON.stringify(result));assert.ok(packets>40&&left>.02&&right>.01);assert.ok(result.muted);return result;}
  const catalog=await invoke('plugin-catalog');await invoke('plugin-add',catalog.plugins.find(p=>p.name==='Bevel EQ').id);
  for(let i=0;i<50&&!(await invoke('initial')).status.plugins.length;i++)await wait(100);
  assert.equal((await invoke('initial')).status.plugins.length,1);
  await player.executeJavaScript(`window.media=new Audio(${JSON.stringify(bases[1]+'/tone.wav')}); media.loop=true; document.body.append(media); media.play()`,true);
  await wait(500); const full=await measure('cross-origin media without CORS');
  await player.executeJavaScript('media.volume=0.5');await wait(500);const half=await measure('player volume half');assert.ok(Math.abs(half.left/full.left-.5)<.05);
  await player.executeJavaScript('media.pause()');
  const oscillator=`window.ctx=new AudioContext();const osc=ctx.createOscillator();const gain=ctx.createGain();gain.gain.value=.08;osc.connect(gain).connect(ctx.destination);osc.start();ctx.resume()`;
  await player.executeJavaScript(oscillator,true);await measure('Web Audio');await player.executeJavaScript('ctx.close()');
  await player.executeJavaScript(`const frame=document.createElement('iframe');frame.src=${JSON.stringify(bases[1]+'/frame')};document.body.append(frame)`);
  await wait(500);const child=player.mainFrame.frames.find(f=>f.url===bases[1]+'/frame');assert.ok(child);
  await child.executeJavaScript(oscillator,true);await measure('cross-origin iframe');await child.executeJavaScript('ctx.close()');
  await invoke('navigate','https://example.com/');await player.executeJavaScript(oscillator,true);await measure('HTTPS navigation retains capture');
  await player.executeJavaScript('ctx.close()');
  const capture=await win.webContents.executeJavaScript('window.mizuAudio.start()',true);assert.equal(capture.sampleRate,48000);
  fs.writeFileSync('.local/universal-audio-results.json',JSON.stringify(results,null,2));
  win.close();
}).catch(error=>{console.error(error);servers.forEach(s=>s.close());app.exit(1);});
