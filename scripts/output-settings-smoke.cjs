const {app,BrowserWindow}=require('electron');const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const mode=process.argv[2],profile=path.resolve(process.argv[3]);app.setPath('userData',profile);
require('../src/audio-host.cjs').AudioHost.prototype.audio=()=>{};
require('../src/main.cjs');
app.whenReady().then(async()=>{
  await new Promise(r=>setTimeout(r,12000));const win=BrowserWindow.getAllWindows()[0];
  const run=script=>win.webContents.executeJavaScript(script);
  const initial=await run('window.mizu.invoke("initial")');
  if(mode==='save'){
    const name=initial.status.outputs.devices.find(n=>n!==initial.status.outputs.active);assert.ok(name);
    await run(`(async()=>{await document.getElementById('settings-button').onclick();const s=document.getElementById('output-device');s.value=${JSON.stringify(name)};await s.onchange();})()`);
    await new Promise(r=>setTimeout(r,1000));
    const state=await run('window.mizu.invoke("initial")');assert.equal(state.settings.outputDevice,name);assert.equal(state.status.outputs.active,name);
    fs.writeFileSync(path.join(profile,'expected-output.txt'),name);console.log('OUTPUT_UI_SAVE',name);
  }else{
    const name=fs.readFileSync(path.join(profile,'expected-output.txt'),'utf8');assert.equal(initial.settings.outputDevice,name);assert.equal(initial.status.outputs.selected,name);assert.equal(initial.status.outputs.active,name);
    console.log('OUTPUT_RESTORED',name);
    await run('window.mizu.invoke("output-device", "")');
  }
  win.close();
}).catch(e=>{console.error(e);app.exit(1);});
