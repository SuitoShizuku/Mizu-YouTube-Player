const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const child = spawn(path.resolve('dist/win-unpacked/Mizu YouTube Player.exe'), [
  `--user-data-dir=${path.resolve(`.local/package-test-${Date.now()}`)}`, '--remote-debugging-port=0'
], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const deadline = setTimeout(() => { child.kill(); console.error('Packaged smoke timed out'); process.exitCode = 1; }, 45000);
function evaluate(url, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    socket.onerror = reject;
    socket.onmessage = message => { const result = JSON.parse(message.data); if (result.id === 1) { socket.close(); result.error || result.result.exceptionDetails ? reject(Error(JSON.stringify(result))) : resolve(result.result.result.value); } };
  });
}
let started = false, log = '';
child.stderr.on('data', async chunk => {
  log += chunk.toString();
  const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(log);
  if (!match || started) return;
  started = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 15000));
    const targets = await (await fetch(`http://127.0.0.1:${match[1]}/json`)).json();
    const shell = targets.find(target => target.url.includes('/ui/index.html'));
    if (!shell) throw Error('Packaged UI did not load');
    const state = await evaluate(shell.webSocketDebuggerUrl, 'window.mizu.invoke("initial").then(x => x.status)');
    console.log('PACKAGED_SMOKE', JSON.stringify(state));
    if (!state.extension.includes('フィルター準備完了') || state.audio.includes('停止') || state.audio.includes('未ビルド')) throw Error('Packaged host or extension did not initialize');
    const ui = await evaluate(shell.webSocketDebuggerUrl, '({ version: document.querySelector("footer").textContent, removedStatus: !document.querySelector(".flow, .signal, .rack-bottom, #audio-status, #extension-status") })');
    if (!ui.version.includes(require('../package.json').version) || !ui.removedStatus) throw Error('Packaged UI is not the updated version');
    console.log('PACKAGED_UI', JSON.stringify(ui));
    const compact = await evaluate(shell.webSocketDebuggerUrl, '({ height: document.querySelector(".presets").getBoundingClientRect().height, editable: document.getElementById("preset-name").getAttribute("role") === "combobox", saveIcon: !!document.querySelector("#preset-save svg"), removedButtons: !document.querySelector("#preset-load, #preset-delete, #preset-list") })');
    if (compact.height > 40 || !compact.editable || !compact.saveIcon || !compact.removedButtons) throw Error('Packaged compact preset UI missing');
    console.log('PACKAGED_COMPACT', JSON.stringify(compact));
    const picker = await evaluate(shell.webSocketDebuggerUrl, `(async () => {
      const catalog = await window.mizu.invoke('plugin-catalog');
      await document.getElementById('plugin-add').onclick();
      const visible = document.getElementById('plugin-picker').open;
      await document.getElementById('picker-close').onclick();
      await document.getElementById('settings-button').onclick();
      const settingsVisible = !document.getElementById('settings').hidden;
      await document.getElementById('settings-button').onclick();
      return { count: catalog.plugins.length, visible, settingsVisible, returned: document.getElementById('settings').hidden };
    })()`);
    if (!picker.count || !picker.visible || !picker.settingsVisible || !picker.returned) throw Error('Packaged picker/settings toggle failed');
    console.log('PACKAGED_PICKER', JSON.stringify(picker));
    const persistence = await evaluate(shell.webSocketDebuggerUrl, `(async () => {
      const saved = await window.mizu.invoke('preset-save', 'Package smoke');
      await window.mizu.invoke('preset-load', saved[0].id);
      await window.mizu.invoke('preset-delete', saved[0].id);
      const extensions = await window.mizu.invoke('extensions-info');
      return { saved: saved.length, extensions: extensions.entries.filter(e => e.loaded).length, directory: extensions.directory };
    })()`);
    if (persistence.saved !== 1 || !persistence.extensions) throw Error('Packaged presets/extensions failed');
    console.log('PACKAGED_PERSISTENCE', JSON.stringify(persistence));
    if (process.argv.includes('--login')) {
      const player = targets.find(target => target.url.startsWith('https://www.youtube.com/'));
      if (!player) throw Error('YouTube target missing');
      let clicked = false;
      for (let attempt = 0; attempt < 30 && !clicked; attempt++) {
        clicked = await evaluate(player.webSocketDebuggerUrl, `(() => { const a=Array.from(document.querySelectorAll('a[href]')).find(a=>/ServiceLogin|accounts.google/.test(a.href)); if(!a) return false; a.click(); return true; })()`);
        if (!clicked) await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!clicked) throw Error('Sign-in link missing');
      let visible = false;
      for (let attempt = 0; attempt < 40 && !visible; attempt++) {
        const pages = await (await fetch(`http://127.0.0.1:${match[1]}/json`)).json();
        const auth = pages.find(target => target.url.startsWith('https://accounts.google.com/'));
        if (auth) visible = await evaluate(auth.webSocketDebuggerUrl, 'Boolean(document.querySelector("input[type=email], #identifierId"))');
        if (!visible) await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!visible) throw Error('Packaged Google sign-in form did not open');
      console.log('PACKAGED_LOGIN', 'Google email form displayed in dedicated window');
    }
    const browsing = await evaluate(shell.webSocketDebuggerUrl, `(async () => {
      const loading = document.querySelector('.player-placeholder').textContent;
      await window.mizu.invoke('navigate', 'example.com');
      const url = await window.mizu.invoke('copy');
      return { loading, url };
    })()`);
    if (browsing.loading !== '読み込んでいます...' || new URL(browsing.url).hostname !== 'example.com') throw Error('Packaged browsing/loading update missing');
    console.log('PACKAGED_BROWSING', JSON.stringify(browsing));
    const audio = await evaluate(shell.webSocketDebuggerUrl, 'window.mizuAudio.start()');
    if (!audio.active || audio.sampleRate !== 48000) throw Error('Packaged external tab audio capture failed');
    console.log('PACKAGED_TAB_AUDIO', JSON.stringify(audio));
    const suggestions = await evaluate(shell.webSocketDebuggerUrl, `(async () => {
      await document.getElementById('settings-button').onclick();
      document.getElementById('rule-add').click();
      const input=document.querySelector('.rule:last-child .format');
      function type(text, caret=text.length) {input.focus();input.value=text;input.setSelectionRange(caret,caret);input.dispatchEvent(new Event('input',{bubbles:true}));}
      function key(key) {input.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}
      type('{'); const menu=input.nextElementSibling;const count=menu.children.length;
      type('before {format-v');const filtered=menu.children.length;key('ArrowDown');key('Enter');const keyboard=input.value;
      type('{genre} tail',6);menu.children[0].click();const mouse=input.value;
      type('{');key('Escape');const escaped=menu.hidden;
      type('{like} {view} {channel-subscribers}');
      return {count,filtered,keyboard,mouse,escaped,preview:document.querySelector('.rule:last-child .preview').textContent};
    })()`);
    if(suggestions.count!==16 || suggestions.filtered!==2 || suggestions.keyboard!=='before {format-view-ja}' || suggestions.mouse!=='{genre} tail' || !suggestions.escaped || !suggestions.preview.includes('123000')) throw Error('Variable suggestions failed: '+JSON.stringify(suggestions));
    console.log('PACKAGED_SUGGESTIONS',JSON.stringify(suggestions));
    fs.writeFileSync('.local/package-smoke.json', JSON.stringify(state, null, 2));
    clearTimeout(deadline);
    child.kill();
  } catch (error) { console.error(error); clearTimeout(deadline); child.kill(); process.exitCode = 1; }
});
child.on('error', error => { console.error(error); clearTimeout(deadline); process.exitCode = 1; });
child.on('exit', () => { clearTimeout(deadline); if (!started) { console.error(log); process.exitCode = 1; } });
