const { app, BrowserWindow, webContents } = require('electron');
const path = require('node:path');
app.setPath('userData',path.resolve(process.argv[2] || `.local/startup-${Date.now()}`));
const started=Date.now();let firstReady,loads=0;
app.on('web-contents-created',(_event,wc)=>{
  const load=wc.loadURL.bind(wc);wc.loadURL=(url,...args)=>load(url==='https://www.youtube.com/' ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : url,...args);
  wc.on('did-start-navigation',(_e,url,_inPlace,main)=>{
    if(!main || _inPlace || !url.startsWith('https://www.youtube.com/'))return;
    loads++;console.log("NAVIGATION",url);
    const bg=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/background.html'));
    if(loads===1) void (bg?bg.executeJavaScript('import("./js/background.js").then(({ default: u }) => u.readyToFilter && u.supportStats.allReadyAfter !== "?")'):Promise.resolve(false)).then(ready=>{firstReady=ready;console.log('FIRST_NAVIGATION',JSON.stringify({ready,ms:Date.now()-started}));});
  });
});
// Keep the startup playback test silent.
require('../src/audio-host.cjs').AudioHost.prototype.audio = () => {};
require('../src/main.cjs');
app.whenReady().then(async()=>{
  await new Promise(resolve=>setTimeout(resolve,20000));
  for (const wc of webContents.getAllWebContents()) { console.log("WC",wc.getURL()); if(wc.getURL().endsWith("/background.html")) console.log("BG",await wc.executeJavaScript('import("./js/background.js").then(({default:u})=>({ready:u.readyToFilter,stats:u.supportStats,suspend:globalThis.vAPI?.net?.suspendDepth}))')); }
  const player=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://www.youtube.com/'));
  const state=await player.executeJavaScript(`({title:document.title,images:[...document.images].filter(i=>i.naturalWidth>0).length,thumbnails:document.querySelectorAll('ytd-thumbnail').length,app:!!document.querySelector('ytd-app'),video:document.querySelector('video')?.readyState,player:document.getElementById('movie_player')?.getPlayerState?.(),sources:[...document.images].slice(0,5).map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth}))})`);
  console.log('STARTUP_RESULT',JSON.stringify({firstReady,loads,...state}));
  if(process.argv.includes('--assert') && (!firstReady || !state.app || !state.images || state.video < 2)) throw Error('Startup not ready or content failed');
  BrowserWindow.getAllWindows()[0].close();
}).catch(error=>{console.error(error);app.exit(1);});
