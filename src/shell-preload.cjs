const { contextBridge, ipcRenderer } = require('electron');
const operations = new Set(['initial', 'navigate', 'back', 'reload', 'copy', 'settings-open', 'settings-save', 'presets', 'preset-save', 'preset-load', 'preset-delete', 'extensions-info', 'extensions-scan', 'extensions-folder', 'extension-options', 'plugin-catalog', 'plugin-picker-open', 'plugin-add', 'plugin-action']);
contextBridge.exposeInMainWorld('mizu', {
  sendAudio: buffer => { if (buffer instanceof ArrayBuffer && buffer.byteLength === 8192) ipcRenderer.send('routed-audio', buffer); },
  reportAudio: (connected, message) => ipcRenderer.send('audio-route-status', !!connected, String(message).slice(0, 300)),
  invoke: (name, ...args) => { if (!operations.has(name)) return Promise.reject(Error('未対応の操作')); return ipcRenderer.invoke(name, ...args); },
  onState: callback => ipcRenderer.on('state', (_event, value) => callback(value)),
  onNotice: callback => ipcRenderer.on('notice', (_event, value) => callback(value))
});
