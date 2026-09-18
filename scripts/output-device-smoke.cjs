const assert=require('node:assert/strict');
const path=require('node:path');
const {AudioHost}=require('../src/audio-host.cjs');
const host=new AudioHost(path.resolve('native/build/MizuAudioHost_artefacts/Release/MizuAudioHost.exe'));
function next(type,run,accept=()=>true){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Timeout: '+type)),15000);const listener=e=>{if(e.type===type&&accept(e))finish(null,e);else if(e.type==='error')finish(Error(e.message));};function finish(error,event){clearTimeout(timer);host.off('event',listener);error?reject(error):resolve(event);}host.on('event',listener);try{run();}catch(e){finish(e);}});}
(async()=>{
  await host.ensureReady();
  const list=await next('outputs',()=>host.command(11));assert.ok(list.devices.length);console.log('OUTPUTS',JSON.stringify(list));
  await next('plugins',()=>host.command(2,'C:\\Program Files\\Common Files\\VST3\\Bevel EQ.vst3'));
  const id=host.plugins[0].id;
  for(const name of list.devices){const state=await next('outputs',()=>host.command(12,name),e=>e.selected===name);assert.equal(state.active,name);assert.equal(host.plugins[0].id,id);console.log('SELECTED',name);}
  const missing='Mizu absent test endpoint';const fallback=await next('outputs',()=>host.command(12,missing),e=>e.selected===missing);assert.ok(fallback.active);assert.ok(fallback.devices.includes(fallback.active));
  const def=await next('outputs',()=>host.command(12,''),e=>e.selected==='');assert.ok(def.active);assert.equal(host.plugins[0].id,id);console.log('FALLBACK_AND_DEFAULT',JSON.stringify(def));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>host.stop());
